# Code Review: prism_headless.py

**File**: `src-tauri/python/prism_headless.py`  
**Category**: Core Logic - Entry Point  
**Date**: 2026-01-18  
**Reviewer**: Automated  

---

## Summary

The entry point for the Prism Headless Engine is well-structured with clear separation between the thin entry point and business logic in the `portfolio_src.headless` package. The code handles both production (stdin/stdout IPC) and development (HTTP Echo-Bridge) modes appropriately.

**Findings**: 0 Critical, 0 High, 2 Medium, 3 Low, 2 Info

---

## [MEDIUM] Default Host Binding to 0.0.0.0 in HTTP Mode

> HTTP server binds to all interfaces by default, potentially exposing development server to network

**File**: `src-tauri/python/prism_headless.py:60`  
**Category**: Security  
**Severity**: Medium  

### Description

The `--host` argument defaults to `0.0.0.0`, which binds to all network interfaces. While this is marked as a development-only feature (Echo-Bridge), if accidentally run in production or on a shared network, it could expose the engine to unauthorized access.

### Current Code

```python
parser.add_argument("--host", type=str, default="0.0.0.0", help="HTTP server port")
```

### Suggested Fix

```python
parser.add_argument("--host", type=str, default="127.0.0.1", help="HTTP server host (use 0.0.0.0 for network access)")
```

### Verification

1. Verify development workflow still works with localhost binding
2. Document explicit `--host 0.0.0.0` for cases where network access is needed

---

## [MEDIUM] Silent Exception Swallowing in certifi Import

> ImportError during SSL cert setup is silently ignored with bare `pass`

**File**: `src-tauri/python/prism_headless.py:24-25`  
**Category**: Correctness  
**Severity**: Medium  

### Description

When `certifi` is not available in a PyInstaller bundle, the ImportError is caught and silently ignored. This could lead to SSL certificate verification failures later that would be difficult to debug because there's no indication the setup failed.

### Current Code

```python
try:
    import certifi

    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    pass
```

### Suggested Fix

```python
try:
    import certifi

    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    # certifi not bundled - will use system certificates
    # This is expected in some deployment configurations
    import sys
    print("  PRISM INFO: certifi not available, using system SSL certificates", file=sys.stderr)
```

### Verification

1. Build PyInstaller bundle without certifi
2. Verify warning is printed to stderr
3. Confirm HTTPS requests still work with system certificates

---

## [LOW] Silent Exception Swallowing in stdout reconfigure

> Exception during stdout reconfiguration is silently ignored

**File**: `src-tauri/python/prism_headless.py:28-33`  
**Category**: Correctness  
**Severity**: Low  

### Description

The stdout reconfiguration catches all exceptions silently. While this is defensive programming for edge cases where `reconfigure` might not be available or might fail, it would be helpful to log when this happens for debugging purposes.

### Current Code

```python
try:
    reconfig = getattr(sys.stdout, "reconfigure", None)
    if reconfig:
        reconfig(line_buffering=True)
except Exception:
    pass
```

### Suggested Fix

```python
try:
    reconfig = getattr(sys.stdout, "reconfigure", None)
    if reconfig:
        reconfig(line_buffering=True)
except Exception as e:
    # stdout reconfigure not supported - buffering may be suboptimal
    # This can happen on some Python builds or when stdout is redirected
    import sys
    print(f"  PRISM INFO: stdout reconfigure failed: {e}", file=sys.stderr)
```

### Verification

1. Test on various Python versions (3.8, 3.9, 3.10, 3.11)
2. Verify IPC still works correctly when reconfigure is unavailable

---

## [LOW] Argparse help text typo

> Argument `--host` has incorrect help text

**File**: `src-tauri/python/prism_headless.py:60`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The `--host` argument's help text says "HTTP server port" but should say "HTTP server host".

### Current Code

```python
parser.add_argument("--host", type=str, default="0.0.0.0", help="HTTP server port")
```

### Suggested Fix

```python
parser.add_argument("--host", type=str, default="127.0.0.1", help="HTTP server host")
```

### Verification

1. Run `python prism_headless.py --help` and verify help text is correct

---

## [LOW] Global Exception Handler Doesn't Return

> The global exception handler calls the original hook but then continues

**File**: `src-tauri/python/prism_headless.py:39-47`  
**Category**: Correctness  
**Severity**: Low  

### Description

The global exception handler logs the exception and then calls `sys.__excepthook__`. This is correct behavior, but it would be clearer if the function explicitly didn't return a value or had a comment explaining the flow.

### Current Code

```python
def global_exception_handler(exctype, value, tb):
    """Log unhandled exceptions before crashing."""
    logger = get_logger("PrismHeadless")
    logger.critical(
        "Unhandled exception",
        exc_info=(exctype, value, tb),
        extra={"component": "pipeline", "category": "crash"},
    )
    sys.__excepthook__(exctype, value, tb)
```

### Suggested Fix

```python
def global_exception_handler(exctype, value, tb):
    """Log unhandled exceptions before crashing.
    
    This handler logs the exception to the SQLite database for crash analysis,
    then delegates to Python's default exception hook for normal handling.
    """
    logger = get_logger("PrismHeadless")
    logger.critical(
        "Unhandled exception",
        exc_info=(exctype, value, tb),
        extra={"component": "pipeline", "category": "crash"},
    )
    # Delegate to default handler - will print traceback and exit
    sys.__excepthook__(exctype, value, tb)
```

### Verification

1. Trigger an unhandled exception in the headless engine
2. Verify it's logged to the database
3. Verify the traceback is still printed to stderr

---

## [INFO] Consider Adding Version Constant

> Version is duplicated between entry point and transports

**File**: `src-tauri/python/prism_headless.py` (missing) vs `stdin_loop.py:21` and `echo_bridge.py:103`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The version string "0.1.0" is defined in both `stdin_loop.py` and `echo_bridge.py`. Consider defining it once in the entry point or a shared constants module to avoid drift.

### Suggested Fix

Create a version constant in the entry point or `__init__.py`:

```python
# In prism_headless.py or portfolio_src/headless/__init__.py
VERSION = "0.1.0"

# Then import in transports:
from portfolio_src.headless import VERSION
```

### Verification

1. Search for version strings across the codebase
2. Ensure all are updated together

---

## [INFO] Missing Type Hints

> Entry point lacks type hints for function signatures

**File**: `src-tauri/python/prism_headless.py:39, 53`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `global_exception_handler` and `main` functions lack type hints. While not critical for this small file, adding them would improve IDE support and documentation.

### Suggested Fix

```python
from types import TracebackType
from typing import Type

def global_exception_handler(
    exctype: Type[BaseException], 
    value: BaseException, 
    tb: TracebackType
) -> None:
    """Log unhandled exceptions before crashing."""
    ...

def main() -> None:
    """Main entry point."""
    ...
```

### Verification

1. Run mypy on the file
2. Verify no type errors

---

## Checklist Summary

### Security (P0)
- [x] Input validation: N/A (no user input in entry point)
- [x] No injection vulnerabilities: N/A
- [x] Authentication: Echo-Bridge has token auth
- [x] No hardcoded secrets: Correct (uses env vars)
- [ ] Default host binding: **MEDIUM** - binds to 0.0.0.0

### Correctness (P1)
- [x] Logic correct: Entry point properly delegates to packages
- [ ] Error handling: **MEDIUM** - silent exception swallowing
- [x] Types: No unsafe casts

### Performance (P2)
- [x] No N+1 queries: N/A
- [x] No memory leaks: Correct cleanup
- [x] Appropriate data structures: N/A

### Maintainability (P3)
- [x] Code is readable: Good docstrings and structure
- [x] Single responsibility: Entry point is thin
- [x] No dead code: Clean
- [ ] Consistent conventions: **LOW** - help text typo, version duplication

### Test Coverage (P4)
- [ ] Tests exist: No unit tests for entry point (acceptable for thin layer)

---

## Verdict

**PASSED** - No critical or high severity findings. The entry point is well-designed with appropriate separation of concerns. The medium-severity findings are defensive improvements that should be addressed but don't block the review.
