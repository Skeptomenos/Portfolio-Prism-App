# Code Review: caching.py

**File**: `src-tauri/python/portfolio_src/data/caching.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Status**: PASSED (2 Medium, 3 Low, 2 Info)

## Summary

The caching module provides JSON file-based caching for enrichment data and a decorator for caching adapter DataFrame results. While the core functionality is sound, there are opportunities to improve consistency with project conventions, add input validation to the decorator, and consider thread safety for concurrent operations.

**Risk Assessment**: Low risk in practice since ISINs are validated upstream in most code paths, but defense-in-depth would be beneficial.

---

## [MEDIUM] Missing ISIN Validation in cache_adapter_data Decorator

> The decorator uses ISIN in file path without validation, unlike the JSON cache functions

**File**: `src-tauri/python/portfolio_src/data/caching.py:156-158`  
**Category**: Security  
**Severity**: Medium  

### Description

The `cache_adapter_data` decorator constructs file paths using the `isin` parameter directly without validation:
- Lines 130-136 properly validate ISINs for `save_to_cache`
- Lines 62-68 properly validate ISINs in `auto_clean_cache`
- But the decorator at line 158 does not

While ISINs are typically validated upstream before reaching adapters, this breaks the defense-in-depth principle. An invalid or malicious ISIN could potentially be used for path traversal (e.g., `../../../etc/passwd`), though the ISIN format check (12 alphanumeric chars with checksum) makes exploitation unlikely in practice.

### Current Code

```python
def wrapper(self, isin: str, *args, **kwargs):
    class_name = self.__class__.__name__
    cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")
```

### Suggested Fix

```python
from portfolio_src.prism_utils.isin_validator import is_valid_isin

def wrapper(self, isin: str, *args, **kwargs):
    # Validate ISIN before using in file path
    if not is_valid_isin(isin):
        logger.warning(f"Invalid ISIN passed to adapter cache: {isin}")
        tracker.increment_system_metric("cache_invalid_key")
        return func(self, isin, *args, **kwargs)  # Skip caching, proceed with fetch
    
    class_name = self.__class__.__name__
    cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")
    # ... rest of logic
```

### Verification

1. Add unit test with invalid ISIN: `adapter.fetch_holdings("../../../etc/passwd")`
2. Verify no file created outside CACHE_DIR
3. Verify fetch still works (just uncached)

---

## [MEDIUM] Hardcoded Relative Paths Instead of Config

> Cache paths use hardcoded relative strings instead of centralized config

**File**: `src-tauri/python/portfolio_src/data/caching.py:13-16`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The module uses hardcoded relative paths:
```python
CACHE_DIR = "data/working/cache/adapter_cache"
ENRICHMENT_CACHE_FILE = "data/working/cache/enrichment_cache.json"
```

This is inconsistent with other data modules (e.g., `holdings_cache.py`, `database.py`) which use `config.WORKING_DIR`. This could cause issues:
- Paths resolve differently depending on working directory
- Bundled app vs dev mode may have different base paths
- Harder to configure cache location for testing

### Current Code

```python
CACHE_DIR = "data/working/cache/adapter_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

ENRICHMENT_CACHE_FILE = "data/working/cache/enrichment_cache.json"
```

### Suggested Fix

```python
from portfolio_src import config

# Use centralized config paths
CACHE_DIR = config.WORKING_DIR / "cache" / "adapter_cache"
ENRICHMENT_CACHE_FILE = config.WORKING_DIR / "cache" / "enrichment_cache.json"

# Don't create directories at import time - defer to first use
def _ensure_cache_dirs():
    """Create cache directories if needed."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ENRICHMENT_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
```

### Verification

1. Search for `WORKING_DIR` usage in other data modules
2. Verify paths resolve correctly in both dev and bundled mode
3. Run existing tests to ensure no path regressions

---

## [LOW] Missing Error Handling in _save_json_cache

> File write errors could crash the application

**File**: `src-tauri/python/portfolio_src/data/caching.py:105-109`  
**Category**: Correctness  
**Severity**: Low  

### Description

The `_save_json_cache` function doesn't handle I/O errors. If the disk is full, the file is locked, or permissions are wrong, this will raise an unhandled exception that could crash the caller.

### Current Code

```python
def _save_json_cache(cache_data):
    """Helper to save the entire JSON cache."""
    os.makedirs(os.path.dirname(ENRICHMENT_CACHE_FILE), exist_ok=True)
    with open(ENRICHMENT_CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=2)
```

### Suggested Fix

```python
def _save_json_cache(cache_data) -> bool:
    """Helper to save the entire JSON cache.
    
    Returns:
        True if saved successfully, False otherwise
    """
    try:
        os.makedirs(os.path.dirname(ENRICHMENT_CACHE_FILE), exist_ok=True)
        with open(ENRICHMENT_CACHE_FILE, "w") as f:
            json.dump(cache_data, f, indent=2)
        return True
    except (IOError, OSError) as e:
        logger.error(f"Failed to save cache: {e}")
        return False
```

### Verification

1. Test with read-only cache directory
2. Test with full disk (mock)
3. Verify callers handle False return appropriately

---

## [LOW] No File Locking for Concurrent Access

> Multiple processes could corrupt cache files

**File**: `src-tauri/python/portfolio_src/data/caching.py:140-143`  
**Category**: Performance  
**Severity**: Low  

### Description

The load-modify-save pattern in `save_to_cache` and the CSV caching in `cache_adapter_data` have race conditions:

```python
cache = _load_json_cache()  # T1 reads
# T2 reads same file here
cache[key] = data           # T1 modifies in memory
# T2 modifies in memory
_save_json_cache(cache)     # T1 writes
# T2 writes, overwriting T1's changes
```

In the current single-process desktop app architecture, this is unlikely to cause issues. However, if the Python sidecar ever runs multiple workers or if the app is opened twice, data loss could occur.

### Current Code

```python
def save_to_cache(key: str, data: dict) -> bool:
    # ... validation ...
    cache = _load_json_cache()
    cache[key] = data
    _save_json_cache(cache)
    return True
```

### Suggested Fix

For a more robust solution, consider:

```python
import fcntl  # Unix only, or use portalocker for cross-platform

def save_to_cache(key: str, data: dict) -> bool:
    # ... validation ...
    try:
        with open(ENRICHMENT_CACHE_FILE + ".lock", "w") as lock_file:
            fcntl.flock(lock_file, fcntl.LOCK_EX)
            cache = _load_json_cache()
            cache[key] = data
            _save_json_cache(cache)
            fcntl.flock(lock_file, fcntl.LOCK_UN)
        return True
    except Exception as e:
        logger.error(f"Failed to save cache with lock: {e}")
        return False
```

Or migrate to SQLite-based caching like `local_cache.py` which handles locking natively.

### Verification

1. Current single-instance lock prevents concurrent app instances
2. Document this limitation in code comments
3. Consider SQLite migration if multi-threading needed

---

## [LOW] Global Side Effect at Import Time

> Creating directories at module import can cause test issues

**File**: `src-tauri/python/portfolio_src/data/caching.py:14`  
**Category**: Maintainability  
**Severity**: Low  

### Description

```python
os.makedirs(CACHE_DIR, exist_ok=True)
```

This runs when the module is imported, which:
- Creates directories in tests even when not needed
- Can fail if running in a read-only context
- Makes it harder to mock/redirect the cache location

### Current Code

```python
CACHE_DIR = "data/working/cache/adapter_cache"
os.makedirs(CACHE_DIR, exist_ok=True)  # Side effect at import
```

### Suggested Fix

```python
CACHE_DIR = "data/working/cache/adapter_cache"
_cache_dir_created = False

def _ensure_cache_dir():
    """Lazy initialization of cache directory."""
    global _cache_dir_created
    if not _cache_dir_created:
        os.makedirs(CACHE_DIR, exist_ok=True)
        _cache_dir_created = True
```

Then call `_ensure_cache_dir()` in functions that need the directory.

### Verification

1. Import module in fresh Python session
2. Verify no directories created until first cache operation
3. Run tests in temp directory to verify isolation

---

## [INFO] Full Cache Reload on Every Operation

> O(n) file I/O for each cache access could become slow with large caches

**File**: `src-tauri/python/portfolio_src/data/caching.py:112-115`  
**Category**: Performance  
**Severity**: Info  

### Description

Every `load_from_cache` and `save_to_cache` call reads and parses the entire JSON file. For large caches, this could become slow. Current cache sizes are likely small enough that this isn't a practical issue.

### Current Code

```python
def load_from_cache(key: str):
    cache = _load_json_cache()  # Reads entire file
    return cache.get(key)
```

### Suggested Fix

For high-performance needs, consider:
1. In-memory cache with periodic flush
2. SQLite-based storage (like `local_cache.py`)
3. Memory-mapped file

For now, this is informational only - optimize if profiling shows this as a bottleneck.

---

## [INFO] No Dedicated Unit Tests

> The caching module lacks test coverage

**File**: `src-tauri/python/portfolio_src/data/caching.py`  
**Category**: Testing  
**Severity**: Info  

### Description

No test files exist for `caching.py`. While the module is relatively simple, tests would help ensure:
- `is_valid_cache_key` rejects invalid patterns correctly
- `auto_clean_cache` removes the right entries
- TTL expiration works correctly
- Corrupt JSON files are handled gracefully

### Suggested Fix

Create `tests/test_caching.py` with tests for:

```python
def test_is_valid_cache_key_rejects_pipe():
    assert not is_valid_cache_key("FOO|BAR")

def test_is_valid_cache_key_rejects_placeholder():
    assert not is_valid_cache_key("FALLBACK_123")

def test_save_to_cache_validates_isin():
    result = save_to_cache("KEY", {"isin": "INVALID"})
    assert result is False

def test_cache_adapter_data_ttl_expiration(tmp_path, monkeypatch):
    # Mock CACHE_DIR to tmp_path
    # Test that expired cache triggers refetch
    pass
```

### Verification

1. Create test file
2. Run `pytest tests/test_caching.py`
3. Check coverage report

---

## Summary Table

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 2 | Security, Maintainability |
| Low | 3 | Correctness, Performance, Maintainability |
| Info | 2 | Performance, Testing |

## Recommendations

1. **Should Fix**: Add ISIN validation to `cache_adapter_data` decorator for defense-in-depth
2. **Should Fix**: Migrate to `config.WORKING_DIR` for consistency with other data modules
3. **Nice to Have**: Add error handling to `_save_json_cache`
4. **Nice to Have**: Add basic unit tests
5. **Document**: Note single-instance assumption for concurrent access safety
