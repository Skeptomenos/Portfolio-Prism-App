# Code Review: src-tauri/src/python_engine.rs

**Reviewer:** Automated  
**Date:** 2026-01-18  
**Status:** PASSED  
**Findings:** 0 critical, 0 high, 2 medium, 2 low, 1 info

---

## File Overview

This is the Python Engine IPC Manager (193 lines) that handles:
- Communication with the Python headless sidecar process
- stdin/stdout JSON-based command/response protocol
- Request/response correlation via command IDs
- Timeout handling for command responses

---

## [MEDIUM] Potential Race Condition in Pending Request Cleanup

> Multiple async operations on `pending` HashMap could race under high load

**File**: `src-tauri/src/python_engine.rs:112-115, 130-131, 143-148`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `send_command` function acquires the `pending` mutex multiple times:
1. To insert the pending request (line 113-115)
2. To remove it on write failure (line 131)
3. To remove it on timeout/channel closed (lines 143-148)

Between acquiring the lock to insert and acquiring it later to remove, another task could potentially manipulate the same ID (though this is unlikely given sequential ID generation). More concerning is that if `handle_response` races with timeout cleanup, the response could be dropped silently.

This is **low risk** because:
1. Command IDs are atomic and sequential
2. Typical command frequency is low (user-initiated actions)
3. The 30-second timeout is generous

However, for correctness, consider holding the lock during the entire operation or using a more robust pattern.

### Current Code

```rust
// Insert with lock
{
    let mut pending = self.pending.lock().await;
    pending.insert(id, tx);
}  // Lock released here

// ... write to child ...

// Remove with new lock acquisition
self.pending.lock().await.remove(&id);
```

### Suggested Fix

Consider using a scoped lock pattern or documenting the safety invariants:

```rust
// Option 1: Document the safety invariant
/// # Safety Invariants
/// Command IDs are monotonically increasing and unique.
/// Only one task ever operates on a given ID, so racing is not possible.

// Option 2: Use try_remove pattern that's resilient to racing
match timeout(Duration::from_secs(COMMAND_TIMEOUT_SECS), rx).await {
    Ok(Ok(response)) => Ok(response),
    Ok(Err(_)) => {
        // Channel sender was dropped - might be normal shutdown
        let _ = self.pending.lock().await.remove(&id);
        Err("Response channel closed".to_string())
    }
    Err(_) => {
        let _ = self.pending.lock().await.remove(&id);
        Err(format!("Command timed out after {} seconds", COMMAND_TIMEOUT_SECS))
    }
}
```

### Verification

1. Create stress test sending many concurrent commands
2. Force timeouts by simulating slow Python responses
3. Verify no pending requests leak (check HashMap size after test)

---

## [MEDIUM] No Validation on Command Names or Payload Structure

> Command strings and JSON payloads passed through without validation

**File**: `src-tauri/src/python_engine.rs:94-123`  
**Category**: Security  
**Severity**: Medium  

### Description

The `send_command` function accepts arbitrary command strings and JSON payloads without validation. While the frontend is trusted (same-origin Tauri context), defense-in-depth suggests validating inputs:

1. Command names should be alphanumeric with underscores (valid identifiers)
2. Payloads should be validated against known schemas
3. Payload size should be bounded

This is **medium risk** because:
1. A compromised frontend could send malformed commands to Python
2. Large payloads could cause memory issues
3. Commands with special characters could confuse Python's dispatcher

### Current Code

```rust
pub async fn send_command(
    &self,
    command: &str,  // No validation
    payload: Value,  // No size limit
) -> Result<EngineResponse, String> {
    // ... directly used without checks ...
    let cmd = json!({
        "id": id,
        "command": command,
        "payload": payload
    });
```

### Suggested Fix

```rust
// Add validation constants
const MAX_PAYLOAD_SIZE: usize = 10 * 1024 * 1024; // 10MB max payload
const VALID_COMMAND_PATTERN: &str = r"^[a-z][a-z0-9_]*$";

pub async fn send_command(
    &self,
    command: &str,
    payload: Value,
) -> Result<EngineResponse, String> {
    // Validate command name
    if command.is_empty() || command.len() > 64 {
        return Err("Invalid command name length".to_string());
    }
    if !command.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("Invalid command name format".to_string());
    }
    if !command.chars().next().unwrap_or('0').is_ascii_lowercase() {
        return Err("Command must start with lowercase letter".to_string());
    }

    // Validate payload size
    let payload_str = serde_json::to_string(&payload)
        .map_err(|e| format!("Failed to serialize payload: {}", e))?;
    if payload_str.len() > MAX_PAYLOAD_SIZE {
        return Err(format!("Payload too large: {} bytes (max {})", payload_str.len(), MAX_PAYLOAD_SIZE));
    }

    // ... rest of function
}
```

### Verification

1. Test with empty command name - should error
2. Test with special characters in command - should error
3. Test with 100MB payload - should error
4. Verify existing commands still work

---

## [LOW] Orphaned Pending Requests on Engine Disconnect

> If engine disconnects, pending requests wait until timeout instead of failing fast

**File**: `src-tauri/src/python_engine.rs:100-103, 140-154`  
**Category**: Correctness  
**Severity**: Low  

### Description

When a command is sent and the engine subsequently disconnects (sidecar crashes, exits), pending requests will wait the full 30-second timeout before failing. This could lead to poor user experience during error scenarios.

### Current Code

```rust
// Check connection before sending
if !self.is_connected().await {
    return Err("Python engine not connected".to_string());
}

// But no check if connection drops during wait
match timeout(Duration::from_secs(COMMAND_TIMEOUT_SECS), rx).await {
    // Waits full timeout even if engine died
```

### Suggested Fix

Consider adding a disconnect signal that cancels pending requests:

```rust
impl PythonEngine {
    /// Mark engine as disconnected and fail all pending requests
    pub async fn disconnect(&self) {
        let mut connected = self.connected.lock().await;
        *connected = false;
        
        let mut pending = self.pending.lock().await;
        for (_, tx) in pending.drain() {
            let _ = tx.send(EngineResponse {
                id: 0,
                status: "error".to_string(),
                data: None,
                error: Some(EngineError {
                    code: "DISCONNECTED".to_string(),
                    message: "Engine disconnected".to_string(),
                }),
            });
        }
    }
}
```

Then call `disconnect()` from `lib.rs` when the sidecar process exits.

### Verification

1. Start app and send a long-running command
2. Kill the Python process manually
3. Verify the pending command fails immediately, not after 30s

---

## [LOW] Silent Failure When Response Sender is Dropped

> `handle_response` ignores send failures without logging

**File**: `src-tauri/src/python_engine.rs:157-163`  
**Category**: Maintainability  
**Severity**: Low  

### Description

When a response arrives, `handle_response` attempts to send it to the waiting task. If the receiver was dropped (e.g., task cancelled due to timeout), the send fails silently. While this is expected behavior, it should be logged for debugging.

### Current Code

```rust
pub async fn handle_response(&self, response: EngineResponse) {
    let mut pending = self.pending.lock().await;
    if let Some(tx) = pending.remove(&response.id) {
        let _ = tx.send(response);  // Silent failure
    }
    // Also silent if response.id not found
}
```

### Suggested Fix

```rust
pub async fn handle_response(&self, response: EngineResponse) {
    let mut pending = self.pending.lock().await;
    match pending.remove(&response.id) {
        Some(tx) => {
            if tx.send(response).is_err() {
                // Expected if request timed out before response arrived
                log::debug!("Response receiver dropped for command ID {}", response.id);
            }
        }
        None => {
            // Unexpected - might indicate protocol issue
            log::warn!("Received response for unknown command ID: {}", response.id);
        }
    }
}
```

### Verification

1. Enable debug logging
2. Send command that times out
3. Verify log shows "Response receiver dropped" when late response arrives

---

## [INFO] Static Timeout Not Configurable Per-Command

> All commands use the same 30-second timeout regardless of expected duration

**File**: `src-tauri/src/python_engine.rs:16`  
**Category**: Performance  
**Severity**: Info  

### Description

The `COMMAND_TIMEOUT_SECS` constant (30 seconds) is used for all commands. Some commands (health check) complete in milliseconds, while others (portfolio sync) may legitimately take longer. A one-size-fits-all timeout means:

1. Short commands can't fail fast
2. Long commands might timeout prematurely under load

### Current Code

```rust
const COMMAND_TIMEOUT_SECS: u64 = 30;

// Used for all commands:
match timeout(Duration::from_secs(COMMAND_TIMEOUT_SECS), rx).await {
```

### Suggested Enhancement (Optional)

Allow per-command timeout specification:

```rust
const DEFAULT_TIMEOUT_SECS: u64 = 30;

pub async fn send_command(
    &self,
    command: &str,
    payload: Value,
) -> Result<EngineResponse, String> {
    self.send_command_with_timeout(command, payload, DEFAULT_TIMEOUT_SECS).await
}

pub async fn send_command_with_timeout(
    &self,
    command: &str,
    payload: Value,
    timeout_secs: u64,
) -> Result<EngineResponse, String> {
    // ... same logic but use timeout_secs ...
}
```

Then callers can use appropriate timeouts:
- Health check: 5 seconds
- Sync portfolio: 120 seconds
- Simple queries: 30 seconds

### Verification

1. Implement per-command timeouts
2. Verify short commands fail within their timeout
3. Verify long operations don't timeout prematurely

---

## Review Summary

| Category        | Findings |
|-----------------|----------|
| Security        | 1 Medium (input validation) |
| Correctness     | 1 Medium (race condition), 1 Low (disconnect handling) |
| Performance     | 1 Info (timeout configurability) |
| Maintainability | 1 Low (silent failures) |
| Testing         | 0 |

### Positive Observations

1. **Clean async patterns**: Proper use of `tokio::sync` primitives
2. **Good timeout handling**: 30-second timeout prevents indefinite hangs
3. **Request correlation**: Atomic ID generation ensures unique command tracking
4. **Clean JSON protocol**: Well-structured command/response format
5. **Proper resource cleanup**: Pending requests removed on all error paths
6. **Default implementation**: Implements `Default` trait for ergonomic construction

### Verdict

**PASSED** - No critical or high severity findings. The medium severity issues around race conditions and input validation are low risk in practice due to:
1. Sequential command IDs prevent ID collisions
2. Low command frequency (user-initiated)
3. Frontend is trusted same-origin context
4. Python dispatcher performs its own validation

Recommend addressing the input validation in a future security hardening pass.
