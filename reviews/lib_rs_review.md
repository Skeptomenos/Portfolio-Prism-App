# Code Review: src-tauri/src/lib.rs

**Reviewer:** Automated  
**Date:** 2026-01-18  
**Status:** PASSED  
**Findings:** 0 critical, 0 high, 1 medium, 2 low, 1 info

---

## File Overview

This is the main Tauri application library (206 lines) that handles:
- Single-instance enforcement via file lock
- Python sidecar spawning and lifecycle
- Stdout/stderr event handling from sidecar
- IPC command registration with the frontend

---

## [MEDIUM] Potential Command Injection in osascript Dialog

> Error messages are interpolated into AppleScript shell commands without escaping

**File**: `src-tauri/src/lib.rs:75-80, 107-116`  
**Category**: Security  
**Severity**: Medium  

### Description

When displaying error dialogs on macOS, the code interpolates error messages directly into osascript commands. While these messages come from system errors (not user input), a malformed error message containing quotes or AppleScript commands could potentially escape the string and execute arbitrary AppleScript.

This is **low risk** because:
1. Error messages come from Rust's `std::io::Error` and `tauri_plugin_shell` - not user input
2. The error messages are controlled by system libraries
3. This only runs on fatal startup failures

However, defense-in-depth suggests escaping these strings.

### Current Code

```rust
let _ = Command::new("osascript")
    .args(["-e", &format!(
        "display dialog \"{}\" buttons {{\"OK\"}} default button \"OK\" with icon stop with title \"Portfolio Prism\"",
        msg  // Unescaped error message
    )])
    .output();
```

### Suggested Fix

```rust
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

let escaped_msg = escape_applescript(&msg);
let _ = Command::new("osascript")
    .args(["-e", &format!(
        "display dialog \"{}\" buttons {{\"OK\"}} default button \"OK\" with icon stop with title \"Portfolio Prism\"",
        escaped_msg
    )])
    .output();
```

### Verification

1. Trigger error with message containing: `" buttons {"Hack"}`
2. Verify dialog displays the literal string, not parsed as AppleScript

---

## [LOW] Legacy greet Command Should Be Removed

> Dead code explicitly marked for removal

**File**: `src-tauri/src/lib.rs:27-31`  
**Category**: Maintainability  
**Severity**: Low  

### Description

A legacy `greet` command exists with a comment indicating it should be removed. Dead code increases maintenance burden and slightly increases attack surface.

### Current Code

```rust
// Legacy greet command (can be removed later)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
```

### Suggested Fix

Remove the function and its registration in `generate_handler![]`:

```rust
// Delete lines 27-31 entirely

// And remove from generate_handler (line 185):
.invoke_handler(tauri::generate_handler![
    // greet,  // Remove this line
    get_engine_health,
    // ... rest unchanged
])
```

### Verification

1. Remove command
2. Run `npm run tauri build`
3. Verify no frontend code calls `greet`

---

## [LOW] Stderr Filtering May Suppress Important Errors

> Aggressive filtering patterns could hide unexpected error types

**File**: `src-tauri/src/lib.rs:150-166`  
**Category**: Correctness  
**Severity**: Low  

### Description

The stderr handling code filters out several message patterns:
- Empty lines
- PRISM log lines
- "possibly delisted" / "No historical data found"
- DEBUG messages

While this reduces noise, there's a risk that important errors matching these patterns could be silently dropped. The patterns are specific enough to be reasonably safe, but the filtering happens before any logging.

### Current Code

```rust
if trimmed.contains("possibly delisted") || trimmed.contains("No historical data found") {
    continue;  // Silently dropped
}
```

### Suggested Fix

Consider logging filtered messages at trace level for debugging, or create an explicit allowlist of known benign patterns:

```rust
// Option 1: Log at trace level instead of dropping entirely
if trimmed.contains("possibly delisted") || trimmed.contains("No historical data found") {
    log::trace!("Filtered sidecar message: {}", trimmed);
    continue;
}

// Option 2: Explicit allowlist with comment documentation
const BENIGN_PATTERNS: &[&str] = &[
    "possibly delisted",      // Known yfinance warning for inactive tickers
    "No historical data found", // Expected for new positions
];
```

### Verification

1. Review Python sidecar logs during normal operation
2. Confirm no unexpected errors match filtered patterns
3. Consider adding integration test that verifies error visibility

---

## [INFO] No Graceful Sidecar Shutdown on App Close

> Python sidecar process may orphan on rapid quit scenarios

**File**: `src-tauri/src/lib.rs:86-126`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The sidecar process is spawned and stored in `PythonEngine`, but there's no explicit shutdown handler to terminate it when the Tauri app closes. Tauri's shell plugin typically handles this automatically when the parent process terminates, but edge cases (crash, force quit, SIGKILL) could leave orphaned Python processes.

This is informational because:
1. Tauri's default behavior should handle normal shutdown
2. macOS process cleanup handles most cases
3. The lock file mechanism prevents issues from orphaned processes

### Current Behavior

```rust
let (mut rx, child) = sidecar_result.unwrap();
engine_clone.set_child(child).await;  // Child stored but no explicit cleanup
```

### Suggested Enhancement (Optional)

Add a window close handler that signals graceful shutdown:

```rust
app.on_window_event(|window, event| {
    if let WindowEvent::CloseRequested { .. } = event {
        // Send shutdown signal to Python
        if let Some(engine) = window.try_state::<Arc<PythonEngine>>() {
            tauri::async_runtime::block_on(async {
                let _ = engine.send_command("shutdown", json!({})).await;
            });
        }
    }
});
```

### Verification

1. Start app, note Python PID from logs
2. Force quit app
3. Check if Python process is still running: `ps aux | grep prism-headless`

---

## Review Summary

| Category        | Findings |
|-----------------|----------|
| Security        | 1 Medium (osascript escaping) |
| Correctness     | 1 Low (stderr filtering) |
| Performance     | 0 |
| Maintainability | 1 Low (dead code), 1 Info (shutdown) |
| Testing         | 0 |

### Positive Observations

1. **Excellent error handling**: Fatal errors show user-friendly dialogs before exiting
2. **Proper async patterns**: Good use of `Arc<Mutex>` for shared state
3. **Single-instance enforcement**: Robust file-locking prevents race conditions
4. **Clean separation**: Sidecar management properly delegated to `PythonEngine`
5. **No panics**: All errors handled gracefully with Result types

### Verdict

**PASSED** - No critical or high severity findings. The medium severity osascript escaping issue is low risk in practice since error messages come from system libraries, not user input. Recommend addressing in a future cleanup pass.
