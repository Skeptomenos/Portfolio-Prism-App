//! Python Engine IPC Manager
//!
//! Manages communication with the Python headless sidecar process.
//! Uses stdin/stdout for JSON-based command/response protocol.
//!
//! # Thread Safety & Race Condition Invariants
//!
//! This module is designed for safe concurrent access from multiple Tauri command handlers.
//! The following invariants ensure race-free operation:
//!
//! ## Command ID Generation
//! - `next_id: AtomicU64` uses `fetch_add` with `SeqCst` ordering
//! - Guarantees unique IDs even under concurrent `send_command` calls
//! - Overflow is theoretically possible but practically unreachable (2^64 commands)
//!
//! ## Mutex-Protected State
//! All mutable state is protected by `tokio::sync::Mutex` (async-aware):
//! - `child`: Exclusive access to child process stdin writes
//! - `pending`: Maps command IDs to response channels
//! - `connected`: Engine connection status flag
//! - `version`: Engine version from ready signal
//!
//! ## Request/Response Matching
//! The pending request pattern ensures correct response routing:
//! 1. `send_command` generates unique ID, creates oneshot channel, inserts into `pending`
//! 2. Command is written to stdin (under `child` lock)
//! 3. `handle_response` extracts ID, removes from `pending`, sends response
//! 4. `send_command` awaits on channel with timeout
//!
//! **Critical invariant**: Response IDs MUST match request IDs. The Python engine
//! echoes the request ID in responses. Mismatched IDs would cause orphaned channels.
//!
//! ## Lock Ordering
//! When acquiring multiple locks, always follow this order to prevent deadlock:
//! 1. `child` (if writing to stdin)
//! 2. `pending` (for channel management)
//! 3. `connected`/`version` (status checks)
//!
//! ## Cleanup on Failure
//! All error paths in `send_command` remove the pending entry before returning,
//! preventing memory leaks from orphaned oneshot channels.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::async_runtime::Mutex;
use tauri_plugin_shell::process::CommandChild;
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};

/// Timeout for command responses
const COMMAND_TIMEOUT_SECS: u64 = 30;

/// Maximum payload size in bytes (10MB)
const MAX_PAYLOAD_SIZE: usize = 10 * 1024 * 1024;

/// Maximum command name length
const MAX_COMMAND_LEN: usize = 64;

/// Ready signal from Python engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadySignal {
    pub status: String,
    pub version: String,
    pub pid: u32,
}

/// Response from Python engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineResponse {
    pub id: u64,
    pub status: String,
    #[serde(default)]
    pub data: Option<Value>,
    #[serde(default)]
    pub error: Option<EngineError>,
}

/// Error details from Python engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineError {
    pub code: String,
    pub message: String,
}

/// Manages communication with Python sidecar
pub struct PythonEngine {
    /// Child process for writing to stdin
    child: Mutex<Option<CommandChild>>,
    /// Pending requests waiting for responses
    pending: Mutex<HashMap<u64, oneshot::Sender<EngineResponse>>>,
    /// Next command ID
    next_id: AtomicU64,
    /// Whether engine is connected
    connected: Mutex<bool>,
    /// Engine version (from ready signal)
    version: Mutex<Option<String>>,
}

impl PythonEngine {
    /// Create a new Python engine manager
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            connected: Mutex::new(false),
            version: Mutex::new(None),
        }
    }

    /// Set the child process (called when sidecar is spawned)
    pub async fn set_child(&self, child: CommandChild) {
        let mut guard = self.child.lock().await;
        *guard = Some(child);
    }

    /// Mark engine as connected with version
    pub async fn set_connected(&self, version: String) {
        let mut connected = self.connected.lock().await;
        *connected = true;
        let mut ver = self.version.lock().await;
        *ver = Some(version);
    }

    /// Check if engine is connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().await
    }

    /// Get engine version
    pub async fn get_version(&self) -> Option<String> {
        self.version.lock().await.clone()
    }

    /// Send a command to the Python engine
    ///
    /// # Validation
    /// - Command must be 1-64 lowercase chars (letters, digits, underscores)
    /// - Command must start with a lowercase letter
    /// - Payload must serialize to <= 10MB JSON
    pub async fn send_command(
        &self,
        command: &str,
        payload: Value,
    ) -> Result<EngineResponse, String> {
        // === Command name validation ===
        if command.is_empty() || command.len() > MAX_COMMAND_LEN {
            return Err(format!(
                "Invalid command name length: {} (must be 1-{} chars)",
                command.len(),
                MAX_COMMAND_LEN
            ));
        }
        if !command
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        {
            return Err(
                "Invalid command name format: must be lowercase alphanumeric with underscores"
                    .to_string(),
            );
        }
        if !command
            .chars()
            .next()
            .map_or(false, |c| c.is_ascii_lowercase())
        {
            return Err("Command must start with lowercase letter".to_string());
        }

        // === Payload size validation ===
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| format!("Failed to serialize payload: {}", e))?;
        if payload_str.len() > MAX_PAYLOAD_SIZE {
            return Err(format!(
                "Payload too large: {} bytes (max {} bytes)",
                payload_str.len(),
                MAX_PAYLOAD_SIZE
            ));
        }

        // Check if connected
        if !self.is_connected().await {
            return Err("Python engine not connected".to_string());
        }

        // Generate command ID
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        // Create response channel
        let (tx, rx) = oneshot::channel();

        // Register pending request
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, tx);
        }

        // Build command JSON
        let cmd = json!({
            "id": id,
            "command": command,
            "payload": payload
        });

        // Send to stdin via child.write()
        {
            let mut child_guard = self.child.lock().await;
            if let Some(ref mut child) = *child_guard {
                let msg = format!("{}\n", cmd);
                if let Err(e) = child.write(msg.as_bytes()) {
                    // Remove pending request
                    self.pending.lock().await.remove(&id);
                    return Err(format!("Failed to write to stdin: {}", e));
                }
            } else {
                self.pending.lock().await.remove(&id);
                return Err("Child process not available".to_string());
            }
        }

        // Wait for response with timeout
        match timeout(Duration::from_secs(COMMAND_TIMEOUT_SECS), rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&id);
                Err("Response channel closed".to_string())
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(format!(
                    "Command timed out after {} seconds",
                    COMMAND_TIMEOUT_SECS
                ))
            }
        }
    }

    /// Handle a response from the Python engine
    pub async fn handle_response(&self, response: EngineResponse) {
        let mut pending = self.pending.lock().await;
        if let Some(tx) = pending.remove(&response.id) {
            let _ = tx.send(response);
        }
    }

    /// Parse a line of stdout from Python
    pub fn parse_stdout(line: &str) -> Option<StdoutMessage> {
        let json: Value = serde_json::from_str(line).ok()?;

        // Check if it's a ready signal
        if json.get("status").and_then(|v| v.as_str()) == Some("ready") {
            let signal: ReadySignal = serde_json::from_value(json).ok()?;
            return Some(StdoutMessage::Ready(signal));
        }

        // Otherwise it's a response
        let response: EngineResponse = serde_json::from_value(json).ok()?;
        Some(StdoutMessage::Response(response))
    }
}

/// Types of messages from Python stdout
#[derive(Debug)]
pub enum StdoutMessage {
    Ready(ReadySignal),
    Response(EngineResponse),
}

impl Default for PythonEngine {
    fn default() -> Self {
        Self::new()
    }
}
