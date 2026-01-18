# Code Review: dispatcher.py

**File**: `src-tauri/python/portfolio_src/headless/dispatcher.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Status**: PASSED

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 2 |
| Info | 1 |

The dispatcher is a well-structured routing layer with good async/sync handler support. Primary concerns are around input validation and error message exposure.

---

## [MEDIUM] Exception Details Exposed in Error Response

> Internal exception messages are returned to the client, potentially leaking implementation details

**File**: `src-tauri/python/portfolio_src/headless/dispatcher.py:55-57`  
**Category**: Security  
**Severity**: Medium  

### Description

When a handler throws an exception, the full exception message is returned to the client via `str(e)`. This could expose internal implementation details, file paths, or stack trace information that aids attackers in understanding the system.

### Current Code

```python
except Exception as e:
    logger.error(f"Handler error for '{command}': {e}", exc_info=True)
    return error_response(cmd_id, "HANDLER_ERROR", str(e))
```

### Suggested Fix

```python
except Exception as e:
    logger.error(f"Handler error for '{command}': {e}", exc_info=True)
    # Return generic message to client, full error is in logs
    return error_response(
        cmd_id, 
        "HANDLER_ERROR", 
        "An internal error occurred. Check logs for details."
    )
```

Alternatively, distinguish between expected errors (validation) and unexpected errors:

```python
from portfolio_src.headless.exceptions import HandlerValidationError

try:
    # ... handler invocation
except HandlerValidationError as e:
    # Expected validation errors - safe to expose message
    return error_response(cmd_id, e.code, str(e))
except Exception as e:
    logger.error(f"Handler error for '{command}': {e}", exc_info=True)
    return error_response(cmd_id, "HANDLER_ERROR", "Internal error occurred")
```

### Verification

1. Trigger an exception in a handler
2. Verify client receives generic message
3. Verify full exception is in server logs

---

## [MEDIUM] No Input Type Validation for Command Structure

> Dispatcher accepts any dict without validating expected structure

**File**: `src-tauri/python/portfolio_src/headless/dispatcher.py:17-37`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `dispatch()` function has type hint `cmd: dict[str, Any]` but performs no runtime validation. If malformed input reaches the dispatcher (e.g., `payload` is a string instead of dict), it could cause unexpected errors in handlers that assume correct types.

While the transport layer (`stdin_loop.py`) parses JSON, the dispatcher should validate the command structure to:
1. Provide clear error messages for malformed commands
2. Ensure type safety for downstream handlers
3. Act as a defensive boundary

### Current Code

```python
async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})
```

### Suggested Fix

Add a validation function or use TypedDict:

```python
from typing import TypedDict, NotRequired

class IPCCommand(TypedDict):
    command: str
    id: int
    payload: NotRequired[dict[str, Any]]


def validate_command(cmd: Any) -> tuple[str, int, dict[str, Any]]:
    """Validate and extract command components.
    
    Raises:
        ValueError: If command structure is invalid.
    """
    if not isinstance(cmd, dict):
        raise ValueError("Command must be a dict")
    
    command = cmd.get("command")
    if not isinstance(command, str):
        raise ValueError("Command 'command' field must be a string")
    
    cmd_id = cmd.get("id", 0)
    if not isinstance(cmd_id, int):
        raise ValueError("Command 'id' field must be an integer")
    
    payload = cmd.get("payload", {})
    if not isinstance(payload, dict):
        raise ValueError("Command 'payload' field must be a dict")
    
    return command, cmd_id, payload


async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    try:
        command, cmd_id, payload = validate_command(cmd)
    except ValueError as e:
        return error_response(0, "INVALID_COMMAND", str(e))
    
    # ... rest of dispatch logic
```

### Verification

1. Add test: `dispatch({"command": 123, "id": 1, "payload": {}})` should return INVALID_COMMAND
2. Add test: `dispatch({"command": "x", "id": "1", "payload": {}})` should return INVALID_COMMAND
3. Add test: `dispatch({"command": "x", "id": 1, "payload": "not a dict"})` should return INVALID_COMMAND

---

## [LOW] Command Name Logged Without Sanitization

> User-controlled command name is logged directly

**File**: `src-tauri/python/portfolio_src/headless/dispatcher.py:42`  
**Category**: Security  
**Severity**: Low  

### Description

The command name is logged without sanitization. While not directly exploitable, if logs are displayed in a web interface, this could enable log injection attacks with newlines or control characters.

### Current Code

```python
logger.warning(f"Unknown command received: {command}")
```

### Suggested Fix

Truncate and sanitize for logging:

```python
safe_command = command[:50].replace('\n', '\\n').replace('\r', '\\r')
logger.warning(f"Unknown command received: {safe_command}")
```

### Verification

1. Send command with newline: `{"command": "test\nINJECTED: fake log", ...}`
2. Verify log shows escaped version

---

## [LOW] Default Command ID Could Collide with Legitimate IDs

> Using 0 as default ID may collide with client-sent ID 0

**File**: `src-tauri/python/portfolio_src/headless/dispatcher.py:36`  
**Category**: Correctness  
**Severity**: Low  

### Description

If the client sends a command with `id: 0` and a separate malformed command (missing id) returns an error, both responses will have `id: 0`, making it ambiguous which request failed.

### Current Code

```python
cmd_id = cmd.get("id", 0)
```

### Suggested Fix

Use `None` or a sentinel value, then validate:

```python
cmd_id = cmd.get("id")
if cmd_id is None:
    return error_response(-1, "INVALID_COMMAND", "Command 'id' field is required")
if not isinstance(cmd_id, int):
    return error_response(-1, "INVALID_COMMAND", "Command 'id' must be an integer")
```

Or document that `id: 0` is reserved for internal errors.

### Verification

1. Review IPC contract documentation
2. Decide if `id` is required or optional
3. Update accordingly

---

## [INFO] Test Coverage Could Be Expanded

> Edge cases for malformed input types are not tested

**File**: `src-tauri/python/tests/headless/test_dispatcher.py`  
**Category**: Testing  
**Severity**: Info  

### Description

Current tests cover happy paths and basic error cases but don't test:
- Malformed `payload` type (string instead of dict)
- Malformed `id` type (string instead of int)
- `None` values in command dict
- Non-dict input to dispatch

### Suggested Tests

```python
@pytest.mark.asyncio
async def test_dispatch_with_string_payload(self):
    """Should handle non-dict payload gracefully."""
    result = await dispatch({
        "command": "get_health",
        "id": 1,
        "payload": "not a dict"
    })
    # Current behavior: would pass to handler and potentially fail there
    # Expected: INVALID_COMMAND error

@pytest.mark.asyncio
async def test_dispatch_with_string_id(self):
    """Should handle non-int id gracefully."""
    result = await dispatch({
        "command": "get_health",
        "id": "not an int",
        "payload": {}
    })
    # Expected: INVALID_COMMAND error or graceful handling

@pytest.mark.asyncio
async def test_dispatch_with_none_command(self):
    """Should handle None command."""
    result = await dispatch({
        "command": None,
        "id": 1,
        "payload": {}
    })
    assert result["error"]["code"] == "UNKNOWN_COMMAND"
```

---

## Summary Assessment

The dispatcher is a clean, well-structured routing layer. The findings are primarily defensive improvements rather than critical issues:

1. **Exception exposure** (Medium) - Should sanitize error messages to prevent information leakage
2. **Input validation** (Medium) - Should validate command structure at the boundary
3. **Log sanitization** (Low) - Minor defensive improvement
4. **ID collision** (Low) - Edge case documentation/handling
5. **Test coverage** (Info) - Suggestions for more thorough testing

No blocking issues for merge. The medium-severity items should be addressed in a follow-up task.
