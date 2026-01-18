# Code Review: tr_bridge.py

**File**: `src-tauri/python/portfolio_src/core/tr_bridge.py`  
**Reviewed**: 2026-01-18  
**Reviewer**: Automated Code Review  
**Focus Areas**: Trade Republic API integration, auth state, subprocess security

---

## Summary

| Category | Findings |
|----------|----------|
| Security | 1 Medium |
| Correctness | 1 Medium |
| Performance | 1 Low |
| Maintainability | 0 |
| Testing | 0 |

**Overall**: Well-structured subprocess bridge with proper synchronization, but has minor security and correctness issues.

---

## [MEDIUM] Credentials Passed Plaintext via Subprocess Stdin

> Phone and PIN are transmitted as plaintext JSON via stdin pipe to the daemon subprocess.

**File**: `src-tauri/python/portfolio_src/core/tr_bridge.py:245-247`  
**Category**: Security  
**Severity**: Medium  

### Description

The `login()` method passes phone number and PIN to the daemon process as plaintext JSON via stdin. While stdin is not externally accessible like network traffic, the credentials could be:
1. Visible in process memory dumps
2. Logged if debug logging is ever added to the serialization
3. Exposed if the subprocess pipe is somehow tapped by malware with process inspection capabilities

This is a defense-in-depth concern rather than an immediate vulnerability, as the subprocess isolation is a valid security pattern.

### Current Code

```python
def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
    """Initiate login process."""
    return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)
```

Which serializes to:
```python
request_json = json.dumps(
    {"method": request.method, "params": request.params, "id": request.id}
)
# params contains {"phone": "actual_phone", "pin": "actual_pin"}
```

### Suggested Fix

The current design is acceptable for a desktop application where both processes run under the same user. However, for defense-in-depth:

Option 1 (Minimal): Add a comment documenting this is intentional and acceptable:
```python
def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
    """
    Initiate login process.
    
    Note: Credentials are sent via stdin pipe to daemon subprocess.
    This is acceptable as both processes run under the same user context
    and stdin is not externally accessible.
    """
    return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)
```

Option 2 (Enhanced): Use a session key exchange if future requirements demand it.

### Verification

1. Confirm both processes always run under the same user context
2. Verify no debug logging of request params exists
3. Consider adding memory clearing for sensitive params after use

### References

- Subprocess IPC Security: stdin/stdout pipes are protected by OS process isolation
- Trade Republic credentials: Already stored locally (per tr_auth.py review)

---

## [MEDIUM] Response ID Not Validated Against Request ID

> Response ID is not checked to match the request ID, risking response mismatch.

**File**: `src-tauri/python/portfolio_src/core/tr_bridge.py:226-232`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `_send_command` method generates a unique request ID but never validates that the response ID matches. While the `_command_lock` prevents concurrent requests, if the daemon ever sends an out-of-order or stale response (e.g., due to a bug or buffer issue), it would be processed as the response to the current request.

### Current Code

```python
request_id = f"{method}_{int(time.time() * 1000)}"
request = TRRequest(method=method, params=params, id=request_id)

# ... send request ...

# Parse response
response_data = json.loads(response_line.strip())
response = TRResponse(
    result=response_data.get("result"),
    error=response_data.get("error"),
    id=response_data.get("id"),  # Captured but never verified
)

if response.error:
    raise RuntimeError(f"Daemon error: {response.error}")

return response.result or {}  # ID match not checked
```

### Suggested Fix

```python
# Parse response
response_data = json.loads(response_line.strip())
response = TRResponse(
    result=response_data.get("result"),
    error=response_data.get("error"),
    id=response_data.get("id"),
)

# Validate response matches request
if response.id != request_id:
    logger.error(
        f"Response ID mismatch: expected {request_id}, got {response.id}"
    )
    raise RuntimeError(
        f"Protocol desync: response ID mismatch. Resetting daemon."
    )
    
if response.error:
    raise RuntimeError(f"Daemon error: {response.error}")

return response.result or {}
```

### Verification

1. Add unit test that simulates ID mismatch
2. Test that daemon correctly echoes request ID in all responses
3. Verify `_command_lock` prevents concurrent request scenarios

---

## [LOW] Timeout Not Implemented on Windows

> `select.select()` doesn't work with pipes on Windows; timeout is effectively infinite.

**File**: `src-tauri/python/portfolio_src/core/tr_bridge.py:180-188`  
**Category**: Performance  
**Severity**: Low  

### Description

The `_read_response_with_timeout` method uses `select.select()` for timeout handling, but this only works on Unix. On Windows, the select call is skipped, making the readline call blocking with no timeout. If the daemon hangs, the caller will hang indefinitely.

### Current Code

```python
def _read_response_with_timeout(self, timeout: float = 30.0) -> str:
    if not self._daemon_process or not self._daemon_process.stdout:
        raise RuntimeError("Daemon process not available")

    if sys.platform != "win32":
        ready, _, _ = select.select([self._daemon_process.stdout], [], [], timeout)
        if not ready:
            raise RuntimeError(f"Daemon response timeout after {timeout}s")

    response_line = self._daemon_process.stdout.readline()  # Blocks forever on Windows
    if not response_line:
        raise RuntimeError("No response from daemon (EOF)")

    return response_line
```

### Suggested Fix

Option 1: Use threading for Windows timeout:
```python
def _read_response_with_timeout(self, timeout: float = 30.0) -> str:
    if not self._daemon_process or not self._daemon_process.stdout:
        raise RuntimeError("Daemon process not available")

    if sys.platform == "win32":
        # Windows: use thread-based timeout
        import queue
        result_queue = queue.Queue()
        
        def reader():
            try:
                line = self._daemon_process.stdout.readline()
                result_queue.put(("ok", line))
            except Exception as e:
                result_queue.put(("error", e))
        
        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        
        try:
            status, value = result_queue.get(timeout=timeout)
            if status == "error":
                raise value
            response_line = value
        except queue.Empty:
            raise RuntimeError(f"Daemon response timeout after {timeout}s")
    else:
        ready, _, _ = select.select([self._daemon_process.stdout], [], [], timeout)
        if not ready:
            raise RuntimeError(f"Daemon response timeout after {timeout}s")
        response_line = self._daemon_process.stdout.readline()

    if not response_line:
        raise RuntimeError("No response from daemon (EOF)")

    return response_line
```

Option 2: Document Windows limitation and accept it (if macOS is the primary target):
```python
# Note: On Windows, no timeout is applied. The daemon should always respond
# within reasonable time. If the daemon hangs, the process must be killed manually.
```

### Verification

1. Test on Windows with a simulated hanging daemon
2. Verify timeout behavior on macOS/Linux works correctly
3. Document platform-specific limitations if Option 2 is chosen

---

## Positive Findings

1. **Thread-Safe Singleton** (lines 40-47): Double-checked locking pattern correctly implemented with `_lock`.

2. **Command Lock Protection** (lines 196-197): The `_command_lock` prevents stream corruption from concurrent commands, with a clear warning comment.

3. **Graceful Daemon Restart** (lines 58-65): Dead processes are properly cleaned up before starting a new one, with timeout and force-kill fallback.

4. **Platform-Aware Sidecar Resolution** (lines 115-160): Handles both frozen (PyInstaller) and dev mode, with platform-specific binary suffixes.

5. **Daemon Ready Handshake** (lines 80-92): Proper startup validation - waits for JSON ready signal before proceeding.

6. **Error Recovery** (lines 220-223): Protocol desync detection triggers daemon reset to recover from corruption.

7. **Environment Isolation** (line 77): `os.environ.copy()` ensures daemon gets a snapshot, not a live reference.

---

## Verdict

**Result**: PASSED - No critical or high severity findings. Medium findings are defense-in-depth improvements that can be addressed in a follow-up iteration.
