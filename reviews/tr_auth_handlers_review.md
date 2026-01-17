# Code Review: tr_auth.py (Handlers)

**File**: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py`  
**Reviewed**: 2026-01-18  
**Reviewer**: Automated Code Review  
**Focus Areas**: Credential handling, session management, 2FA flow

---

## Summary

| Category | Findings |
|----------|----------|
| Security | 1 High, 1 Medium |
| Correctness | 0 |
| Performance | 0 |
| Maintainability | 1 Low |
| Testing | 0 |

**Overall**: Handler layer is well-structured but delegates to core auth which has credential storage issues.

---

## [HIGH] Credentials Returned in Plaintext via IPC

> Stored credentials (phone + PIN) are returned to the frontend in plaintext.

**File**: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py:139-145`  
**Category**: Security  
**Severity**: High  

### Description

The `handle_tr_get_stored_credentials` function returns the full phone number and PIN to the frontend for form pre-fill. While this is convenient for UX, it exposes credentials to any code running in the WebView context.

If an XSS vulnerability existed in the frontend, or if a malicious Tauri plugin were loaded, the credentials could be exfiltrated.

### Current Code

```python
if phone and pin:
    masked = f"***{phone[-4:]}" if len(phone) > 4 else "****"
    logger.info(f"Returning stored credentials for phone ending {masked}")
    return success_response(
        cmd_id,
        {
            "hasCredentials": True,
            "phone": phone,        # Full phone number
            "pin": pin,            # Full PIN
        },
    )
```

### Suggested Fix

Option 1: Only return a flag that credentials exist, have backend use them directly on login:
```python
return success_response(
    cmd_id,
    {
        "hasCredentials": True,
        "maskedPhone": masked_phone,  # Display only
        # Do NOT return phone or pin to frontend
    },
)
```

Option 2: If pre-fill is required, require user confirmation (e.g., biometric) before returning credentials.

### Verification

1. Check if frontend actually needs raw credentials for pre-fill
2. If so, consider adding biometric confirmation before retrieval
3. Audit all IPC response handlers to ensure no credential leakage

### References

- OWASP: Secure Credential Handling
- Tauri Security Guidelines: minimize data sent to WebView

---

## [MEDIUM] Session Cookie File Path Not Validated

> Cookie file path constructed using environment variable without validation.

**File**: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py:76-80`  
**Category**: Security  
**Severity**: Medium  

### Description

The `PRISM_DATA_DIR` environment variable is used to construct the cookie file path without path traversal validation. While environment variables are typically trusted, this pattern could be exploited if an attacker can control environment variables.

### Current Code

```python
data_dir = os.environ.get(
    "PRISM_DATA_DIR",
    os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
)
cookies_file = os.path.join(data_dir, "tr_cookies.txt")
```

### Suggested Fix

```python
from pathlib import Path

default_dir = Path.home() / "Library" / "Application Support" / "PortfolioPrism"
data_dir = Path(os.environ.get("PRISM_DATA_DIR", str(default_dir)))

# Ensure it's a real directory (not a symlink attack) and within expected bounds
if not data_dir.is_absolute():
    data_dir = default_dir

cookies_file = data_dir / "tr_cookies.txt"

# Validate the resolved path is within expected directory
try:
    cookies_file.resolve().relative_to(data_dir.resolve())
except ValueError:
    logger.error("Invalid cookie file path - potential path traversal")
    cookies_file = default_dir / "tr_cookies.txt"
```

### Verification

1. Test with `PRISM_DATA_DIR=../../tmp` to verify path traversal is blocked
2. Test with symlinked directory

---

## [LOW] Inconsistent Phone Masking Format

> Phone masking uses different formats in different handlers.

**File**: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py:87-88, 137, 182`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Phone masking is done inline with slightly different formats across handlers. This should be centralized for consistency.

### Current Code

Line 87-88:
```python
if phone and len(phone) > 4:
    masked_phone = phone[:3] + "***" + phone[-4:]  # Shows first 3 + last 4
```

Line 137, 182:
```python
masked = f"***{phone[-4:]}" if len(phone) > 4 else "****"  # Shows only last 4
```

### Suggested Fix

Create a utility function:
```python
# In portfolio_src/prism_utils/masking.py
def mask_phone(phone: str) -> str:
    """Mask phone number for logging, showing only last 4 digits."""
    if not phone or len(phone) <= 4:
        return "****"
    return f"***{phone[-4:]}"
```

### Verification

1. Search for all phone masking in codebase
2. Replace with centralized function
3. Ensure logging output is consistent

---

## Positive Findings

1. **State Machine Enforcement** (lines 171-176): `verify_2fa` correctly checks that state is `WAITING_FOR_2FA` before proceeding.

2. **Error Logging Privacy**: Phone numbers are always masked in log messages (line 183).

3. **Clear Error Responses**: Error responses include specific error codes (`TR_AUTH_ERROR`, `TR_2FA_INVALID`, etc.) for frontend handling.

4. **Async Handling**: Blocking operations correctly delegated to `run_in_executor` to avoid blocking the event loop.

---

## Related Files Requiring Review

The HIGH finding above stems from the credential storage design in:
- `src-tauri/python/portfolio_src/core/tr_auth.py:316-336` - Base64 encoding (not encryption)

This will be covered in a separate review of the core auth module.

---

## Verdict

**Result**: NEEDS_ACTION - 1 High severity finding requires remediation before approval.
