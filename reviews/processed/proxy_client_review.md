# Code Review: proxy_client.py

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py`  
**Date**: 2026-01-18  
**Reviewer**: Automated  
**Lines**: 207  

## Summary

| Category | Findings |
|----------|----------|
| Security | 1 Medium, 1 Low |
| Correctness | 1 Medium |
| Performance | 1 Low |
| Maintainability | 1 Info |
| Testing | 1 Low |

**Overall**: PASSED (0 critical, 0 high, 2 medium, 3 low, 1 info)

---

## [MEDIUM] Input Validation Missing on Symbol/Query Parameters

> User-provided ticker symbols and search queries are passed to the API without validation

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py:135-169`  
**Category**: Security  
**Severity**: Medium  

### Description

The `get_company_profile`, `get_quote`, and `search_symbol` methods accept string parameters that are passed directly to the proxy API without validation. While the proxy itself should validate inputs, defense-in-depth requires client-side validation to:
- Prevent sending malformed requests
- Avoid unnecessary API calls for obviously invalid data
- Reduce attack surface

The Finnhub API expects uppercase stock symbols (e.g., "AAPL", not "aapl" or "Apple Inc.").

### Current Code

```python
def get_company_profile(self, symbol: str) -> ProxyResponse:
    return self._request(ProxyEndpoint.FINNHUB_PROFILE, payload={"symbol": symbol})

def get_quote(self, symbol: str) -> ProxyResponse:
    return self._request(ProxyEndpoint.FINNHUB_QUOTE, payload={"symbol": symbol})

def search_symbol(self, query: str) -> ProxyResponse:
    return self._request(ProxyEndpoint.FINNHUB_SEARCH, payload={"q": query})
```

### Suggested Fix

```python
import re

SYMBOL_PATTERN = re.compile(r'^[A-Z0-9.\-]{1,10}$')

def _validate_symbol(self, symbol: str) -> str:
    """Validate and normalize stock symbol."""
    if not symbol or not isinstance(symbol, str):
        raise ValueError("Symbol must be a non-empty string")
    normalized = symbol.upper().strip()
    if not SYMBOL_PATTERN.match(normalized):
        raise ValueError(f"Invalid symbol format: {symbol}")
    return normalized

def get_company_profile(self, symbol: str) -> ProxyResponse:
    try:
        validated_symbol = self._validate_symbol(symbol)
    except ValueError as e:
        return ProxyResponse(success=False, data=None, error=str(e), status_code=400)
    return self._request(ProxyEndpoint.FINNHUB_PROFILE, payload={"symbol": validated_symbol})
```

### Verification

1. Add unit tests for invalid symbols: empty, None, too long, special chars
2. Verify uppercase normalization works correctly
3. Test with edge cases: "BRK.A", "BRK-B"

---

## [MEDIUM] Fallback to Direct API Call Bypasses Proxy Security

> Resolution.py falls back to direct Finnhub API calls, bypassing the proxy security model

**File**: `src-tauri/python/portfolio_src/data/resolution.py:476-498`  
**Category**: Security  
**Severity**: Medium  

### Description

The `_call_finnhub_with_status` method in `resolution.py` falls back to direct Finnhub API calls using `FINNHUB_API_KEY` from environment when the proxy fails. This:
1. Exposes the API key in the client environment (violates AGENTS.md constraint)
2. Bypasses proxy rate limiting
3. Creates inconsistent security posture

The design intent is "API keys MUST be proxied via Cloudflare Worker - never in client".

### Current Code

```python
# In resolution.py:476-498
if FINNHUB_API_KEY:
    try:
        response = requests.get(
            f"{FINNHUB_API_URL}/stock/profile2",
            params={"symbol": ticker},
            headers={"X-Finnhub-Token": FINNHUB_API_KEY},
            timeout=10,
        )
```

### Suggested Fix

Remove the direct API fallback entirely, or make it development-only:

```python
# Option 1: Remove fallback (recommended for production)
# Delete lines 476-498 in resolution.py

# Option 2: Development-only fallback
import os
DEV_MODE = os.getenv("PRISM_DEV_MODE", "").lower() == "true"

if DEV_MODE and FINNHUB_API_KEY:
    logger.warning("Using direct Finnhub API (dev mode only)")
    # ... existing fallback code
```

### Verification

1. Run with `FINNHUB_API_KEY` unset - should not crash
2. Verify proxy handles all production API calls
3. Check logs don't expose API key

### References

- AGENTS.md: "API keys MUST be proxied via Cloudflare Worker"

---

## [LOW] Sensitive Data May Be Logged in Error Messages

> Error responses from the proxy may contain sensitive information that gets logged

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py:104-118`  
**Category**: Security  
**Severity**: Low  

### Description

The error handling captures and returns full error messages from HTTP responses. While the proxy should sanitize responses, raw error text could potentially contain:
- Internal server paths
- Stack traces
- Request details

### Current Code

```python
except requests.exceptions.HTTPError as e:
    error_msg = str(e)
    if e.response is not None:
        try:
            error_data = e.response.json()
            error_msg = error_data.get("error", error_msg)
        except ValueError:
            error_msg = e.response.text or error_msg  # Raw response text
```

### Suggested Fix

```python
except requests.exceptions.HTTPError as e:
    status_code = e.response.status_code if e.response else 500
    # Sanitize error messages - don't expose raw server responses
    if status_code == 429:
        error_msg = "Rate limit exceeded"
    elif status_code == 401:
        error_msg = "Authentication failed"
    elif status_code == 404:
        error_msg = "Resource not found"
    else:
        error_msg = f"Server error (HTTP {status_code})"
    
    # Log detailed error for debugging, but don't return to caller
    logger.debug(f"Proxy error: {e.response.text if e.response else str(e)}")
```

### Verification

1. Trigger various HTTP errors and verify sanitized messages
2. Check logs for appropriate detail level

---

## [MEDIUM] No Retry Logic for Transient Failures

> Network errors cause immediate failure without retry attempts

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py:69-131`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `_request` method makes a single attempt and returns failure on any error. Transient network issues (DNS resolution, connection drops, server 503) should be retried with exponential backoff.

### Current Code

```python
def _request(self, endpoint, method="POST", payload=None) -> ProxyResponse:
    # Single attempt, no retry
    try:
        response = self._session.post(...)
    except requests.exceptions.RequestException as e:
        return ProxyResponse(success=False, ...)  # Immediate failure
```

### Suggested Fix

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

class ProxyClient:
    MAX_RETRIES = 3
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((requests.exceptions.ConnectionError, 
                                        requests.exceptions.Timeout)),
        reraise=True
    )
    def _request_with_retry(self, url, method, payload):
        if method == "POST":
            return self._session.post(url, json=payload or {}, timeout=self.timeout)
        return self._session.get(url, params=payload or {}, timeout=self.timeout)
    
    def _request(self, endpoint, method="POST", payload=None) -> ProxyResponse:
        url = f"{self.proxy_url}{endpoint.value}"
        try:
            response = self._request_with_retry(url, method, payload)
            response.raise_for_status()
            return ProxyResponse(success=True, data=response.json(), ...)
        except Exception as e:
            # Handle after retries exhausted
            ...
```

### Verification

1. Test with network interruption simulation
2. Verify exponential backoff timing
3. Ensure rate limit errors (429) are NOT retried

---

## [LOW] Session Not Closed on Client Destruction

> The requests.Session is never explicitly closed

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py:62`  
**Category**: Performance  
**Severity**: Low  

### Description

The `requests.Session` is created in `__init__` but never closed. While Python's garbage collector will eventually clean up, explicit resource management is preferred for long-running processes.

### Suggested Fix

```python
class ProxyClient:
    def __init__(self, ...):
        self._session = requests.Session()
        ...
    
    def close(self):
        """Close the HTTP session."""
        if self._session:
            self._session.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
```

### Verification

1. Use context manager in tests
2. Verify connections are released

---

## [LOW] No Unit Tests for ProxyClient

> ProxyClient has no dedicated test file

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py`  
**Category**: Testing  
**Severity**: Low  

### Description

The proxy client is a critical integration point with no unit tests. This makes refactoring risky and bugs harder to catch.

### Suggested Fix

Create `tests/test_proxy_client.py`:

```python
import pytest
from unittest.mock import Mock, patch
from portfolio_src.data.proxy_client import ProxyClient, ProxyResponse

class TestProxyClient:
    def test_get_company_profile_success(self):
        with patch('requests.Session.post') as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {"isin": "US0378331005"}
            mock_post.return_value.raise_for_status = Mock()
            
            client = ProxyClient(proxy_url="http://test")
            response = client.get_company_profile("AAPL")
            
            assert response.success
            assert response.data["isin"] == "US0378331005"
    
    def test_get_company_profile_timeout(self):
        with patch('requests.Session.post') as mock_post:
            mock_post.side_effect = requests.exceptions.Timeout()
            
            client = ProxyClient(proxy_url="http://test")
            response = client.get_company_profile("AAPL")
            
            assert not response.success
            assert response.status_code == 408
    
    def test_invalid_symbol_rejected(self):
        client = ProxyClient()
        response = client.get_company_profile("")
        assert not response.success
```

### Verification

1. Run tests with `pytest tests/test_proxy_client.py`
2. Verify coverage > 80%

---

## [INFO] Singleton Pattern Could Use Locking

> Thread-safety of singleton getter is not guaranteed

**File**: `src-tauri/python/portfolio_src/data/proxy_client.py:198-206`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `get_proxy_client()` singleton getter is not thread-safe. In multi-threaded scenarios, multiple instances could be created.

### Current Code

```python
_client: Optional[ProxyClient] = None

def get_proxy_client() -> ProxyClient:
    global _client
    if _client is None:
        _client = ProxyClient()
    return _client
```

### Suggested Fix

```python
import threading

_client: Optional[ProxyClient] = None
_client_lock = threading.Lock()

def get_proxy_client() -> ProxyClient:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:  # Double-check locking
                _client = ProxyClient()
    return _client
```

### Verification

1. Run concurrent access test
2. Verify single instance created

---

## Review Checklist Summary

### Security (P0)
- [x] Input validation present and correct - **MEDIUM: Missing symbol validation**
- [x] No SQL injection, XSS, or command injection - N/A (no DB/HTML)
- [x] Authentication/authorization checks - N/A (proxy handles)
- [x] Secrets not hardcoded - PASS (uses env vars correctly)
- [x] Sensitive data properly handled - **LOW: Error messages may leak info**

### Correctness (P1)
- [x] Logic matches intended behavior - PASS
- [x] Edge cases handled - **MEDIUM: No retry for transient failures**
- [x] Error handling present - PASS (comprehensive try/except)
- [x] Types used correctly - PASS

### Performance (P2)
- [x] No unbounded loops - PASS
- [x] Appropriate data structures - PASS
- [x] No memory leaks - **LOW: Session not closed**
- [x] Caching considered - N/A (proxy handles)

### Maintainability (P3)
- [x] Code is readable - PASS
- [x] Functions are focused - PASS
- [x] No dead code - PASS
- [x] Consistent with project conventions - PASS

### Test Coverage (P4)
- [ ] Tests exist - **LOW: No tests**
- [ ] Tests cover happy path - N/A
- [ ] Tests cover error cases - N/A
