# Code Review: tr_protocol.py

**File**: `src-tauri/python/portfolio_src/core/tr_protocol.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Verdict**: PASSED (0 critical, 0 high, 3 medium, 2 low, 1 info)

---

## Summary

This module defines the JSON-RPC protocol for communication between the Tauri app and the TR daemon subprocess. The code is clean, well-structured, and has good test coverage. No critical or high severity issues found.

---

## [MEDIUM] Type Annotation Mismatch in TRError

> `method` parameter defaults to `None` but is annotated as `str`

**File**: `src-tauri/python/portfolio_src/core/tr_protocol.py:46`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `TRError.__init__` method has a type annotation mismatch. The `method` parameter is annotated as `str` but has a default value of `None`. This violates type safety and can confuse type checkers.

### Current Code

```python
class TRError(Exception):
    """TR daemon specific error."""

    def __init__(self, message: str, method: str = None):
        super().__init__(message)
        self.method = method
        self.message = message
```

### Suggested Fix

```python
class TRError(Exception):
    """TR daemon specific error."""

    def __init__(self, message: str, method: Optional[str] = None):
        super().__init__(message)
        self.method = method
        self.message = message
```

### Verification

1. Run mypy: `mypy src-tauri/python/portfolio_src/core/tr_protocol.py`
2. Existing tests should continue to pass

---

## [MEDIUM] No Type Validation in deserialize_response

> Response fields accept any JSON type without validation

**File**: `src-tauri/python/portfolio_src/core/tr_protocol.py:57-62`  
**Category**: Correctness  
**Severity**: Medium  

### Description

`deserialize_response` accepts any JSON value for `result` without validating it matches the expected `Optional[dict]` type. If the daemon sends a malformed response with a non-dict `result`, this will silently create an invalid `TRResponse` object.

### Current Code

```python
def deserialize_response(json_str: str) -> TRResponse:
    """Deserialize JSON string to response."""
    data = json.loads(json_str)
    return TRResponse(
        result=data.get("result"), error=data.get("error"), id=data.get("id")
    )
```

### Suggested Fix

```python
def deserialize_response(json_str: str) -> TRResponse:
    """Deserialize JSON string to response."""
    data = json.loads(json_str)
    result = data.get("result")
    if result is not None and not isinstance(result, dict):
        raise ValueError(f"Expected result to be dict or None, got {type(result).__name__}")
    return TRResponse(
        result=result, 
        error=data.get("error"), 
        id=data.get("id", "unknown")
    )
```

### Verification

1. Add test case: `deserialize_response('{"result": "string", "id": "1"}')` should raise `ValueError`
2. Run existing tests to ensure no regression

---

## [MEDIUM] Missing ID Validation in deserialize_response

> Missing `id` field silently returns None, breaking request/response matching

**File**: `src-tauri/python/portfolio_src/core/tr_protocol.py:57-62`  
**Category**: Correctness  
**Severity**: Medium  

### Description

If the daemon sends a response without an `id` field, `deserialize_response` returns `TRResponse` with `id=None`. Consumers like `tr_bridge.py` don't validate this, which could cause request/response matching failures in edge cases.

### Current Code

```python
return TRResponse(
    result=data.get("result"), error=data.get("error"), id=data.get("id")
)
```

### Suggested Fix

```python
response_id = data.get("id")
if response_id is None:
    raise ValueError("Response missing required 'id' field")
return TRResponse(
    result=data.get("result"), 
    error=data.get("error"), 
    id=response_id
)
```

### Verification

1. Add test case for missing `id` field
2. Verify `tr_bridge.py` handles the exception appropriately

---

## [LOW] Sensitive Data May Be Logged via serialize_request

> Phone and PIN could appear in logs if request is logged

**File**: `src-tauri/python/portfolio_src/core/tr_protocol.py:52-54`  
**Category**: Security  
**Severity**: Low  

### Description

The `serialize_request` function converts the full request to JSON, including sensitive `params` like `phone` and `pin`. If this output is logged anywhere (e.g., debug logging), credentials could leak to log files.

Note: Current usage in `tr_bridge.py` does NOT log the serialized request, so this is a preventive concern rather than an active vulnerability.

### Current Code

```python
def serialize_request(request: TRRequest) -> str:
    """Serialize request to JSON string."""
    return json.dumps(asdict(request))
```

### Suggested Fix

Consider adding a `safe_serialize_request` function for debug logging that masks sensitive fields:

```python
def serialize_request_safe(request: TRRequest) -> str:
    """Serialize request with sensitive params masked (for logging)."""
    data = asdict(request)
    if "pin" in data.get("params", {}):
        data["params"]["pin"] = "****"
    if "phone" in data.get("params", {}):
        phone = data["params"]["phone"]
        data["params"]["phone"] = f"***{phone[-4:]}" if len(phone) > 4 else "****"
    return json.dumps(data)
```

### Verification

1. Audit logging calls in `tr_bridge.py` and `tr_daemon.py`
2. Ensure no request logging includes credentials

---

## [LOW] Missing Test for TRError Default Method

> Test coverage gap for TRError with default method=None

**File**: `src-tauri/python/tests/test_tr_protocol.py`  
**Category**: Testing  
**Severity**: Low  

### Description

The test suite doesn't explicitly verify that `TRError` works correctly when `method` is omitted (uses default `None`). While current tests pass, explicit coverage would catch the type annotation issue.

### Suggested Fix

Add test to `TestTRError`:

```python
def test_error_without_method(self):
    error = TRError("Connection failed")
    assert error.method is None
    assert error.message == "Connection failed"
```

### Verification

Run `pytest tests/test_tr_protocol.py -v`

---

## [INFO] Consider Adding Function Docstrings

> `serialize_request` and `deserialize_response` lack docstrings

**File**: `src-tauri/python/portfolio_src/core/tr_protocol.py:52-62`  
**Category**: Maintainability  
**Severity**: Info  

### Description

While the code is self-explanatory, adding docstrings would improve API documentation and IDE hints.

### Suggested Fix

```python
def serialize_request(request: TRRequest) -> str:
    """Serialize a TRRequest to a JSON string for transmission.
    
    Args:
        request: The TRRequest to serialize.
        
    Returns:
        JSON string representation of the request.
    """
    return json.dumps(asdict(request))


def deserialize_response(json_str: str) -> TRResponse:
    """Deserialize a JSON string into a TRResponse.
    
    Args:
        json_str: JSON string received from the daemon.
        
    Returns:
        TRResponse object.
        
    Raises:
        json.JSONDecodeError: If json_str is not valid JSON.
    """
    data = json.loads(json_str)
    return TRResponse(
        result=data.get("result"), error=data.get("error"), id=data.get("id")
    )
```

---

## Review Checklist Summary

| Category | Status | Notes |
|----------|--------|-------|
| Security - Input Validation | PASS | JSON parsing handles malformed input |
| Security - Injection | N/A | No SQL/shell/XSS vectors |
| Security - Secrets | PASS (Low) | No hardcoded secrets; logging concern noted |
| Correctness - Logic | PASS (Medium) | Type validation gaps noted |
| Correctness - Edge Cases | PASS (Medium) | Missing ID handling noted |
| Performance | PASS | O(1) operations |
| Maintainability | PASS | Clean, well-structured code |
| Test Coverage | PASS (Low) | Good coverage, minor gaps noted |

---

## Approval Status

**PASSED** - No blocking issues. Medium/Low findings are improvements, not blockers.
