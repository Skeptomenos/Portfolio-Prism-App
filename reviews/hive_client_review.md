# Code Review: hive_client.py

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`  
**Reviewed:** 2026-01-18  
**Reviewer:** Automated  
**Result:** PASSED (0 Critical, 0 High, 3 Medium, 2 Low, 1 Info)

---

## [MEDIUM] Missing Input Validation for ISIN/Ticker Parameters

> User-provided identifiers are passed to Supabase RPCs without client-side validation

**File**: `src-tauri/python/portfolio_src/data/hive_client.py:329-342`  
**Category**: Security  
**Severity**: Medium  

### Description

Functions like `lookup()`, `batch_lookup()`, `resolve_ticker()`, and contribution functions accept user-provided ISINs, tickers, and aliases without validating their format before sending to Supabase. While the Supabase RPC functions should implement server-side validation, adding client-side validation would:
- Reduce unnecessary API calls for obviously invalid inputs
- Provide faster feedback to users
- Add defense-in-depth

ISINs follow a specific format: 2 letter country code + 9 alphanumeric characters + 1 check digit (12 characters total).

### Current Code

```python
def lookup(self, isin: str) -> Optional[AssetEntry]:
    """
    Look up an ISIN in the universe.
    Returns from cache if available, None otherwise.
    """
    # Ensure cache is populated
    if not self._universe_cache or not self._is_cache_valid():
        self.sync_universe()

    # Check cache
    if isin in self._universe_cache:
        return self._universe_cache[isin]

    return None
```

### Suggested Fix

```python
import re

ISIN_PATTERN = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$')

def _validate_isin(self, isin: str) -> bool:
    """Validate ISIN format (basic check, not checksum)."""
    return bool(isin and ISIN_PATTERN.match(isin.upper()))

def lookup(self, isin: str) -> Optional[AssetEntry]:
    """
    Look up an ISIN in the universe.
    Returns from cache if available, None otherwise.
    """
    if not self._validate_isin(isin):
        logger.debug(f"Invalid ISIN format: {isin}")
        return None
        
    # Ensure cache is populated
    if not self._universe_cache or not self._is_cache_valid():
        self.sync_universe()

    # Check cache
    if isin in self._universe_cache:
        return self._universe_cache[isin]

    return None
```

### Verification

1. Add unit tests for invalid ISIN formats
2. Test with edge cases: empty string, None, special characters
3. Verify existing functionality still works with valid ISINs

---

## [MEDIUM] Cache Expiry Timezone Mismatch

> Cache validation may fail due to timezone-naive vs timezone-aware datetime comparison

**File**: `src-tauri/python/portfolio_src/data/hive_client.py:196-199`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `_load_cache()` method compares `datetime.now()` (timezone-naive) with a datetime parsed from ISO format that may be timezone-aware (if it contains timezone info like `+00:00` or `Z`). This comparison can fail or behave unexpectedly.

### Current Code

```python
cached_at = data.get("cached_at")
if cached_at:
    cached_time = datetime.fromisoformat(cached_at)
    if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
        return False  # Cache expired
```

### Suggested Fix

```python
cached_at = data.get("cached_at")
if cached_at:
    cached_time = datetime.fromisoformat(cached_at)
    # Ensure both are timezone-naive for comparison
    if cached_time.tzinfo is not None:
        cached_time = cached_time.replace(tzinfo=None)
    if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
        return False  # Cache expired
```

### Verification

1. Test with cache files containing both timezone-aware and naive timestamps
2. Verify cache expiry works correctly across timezone changes

---

## [MEDIUM] Direct Table Access Fallback May Fail Silently

> Fallback to direct table queries after RPC failure may hit RLS restrictions

**File**: `src-tauri/python/portfolio_src/data/hive_client.py:881-887`  
**Category**: Correctness  
**Severity**: Medium  

### Description

In `sync_identity_domain()`, when the RPC fails, the code falls back to direct table queries. However, per the security model documentation, direct table access is blocked by RLS for anonymous users. The fallback will silently fail and return empty data without informing the caller of the issue.

### Current Code

```python
except Exception as e:
    logger.warning(f"Failed to sync assets: {e}")
    # Fallback: try direct query (may fail due to RLS)
    try:
        response = client.from_("assets").select("*").execute()
        if response.data:
            result["assets"] = response.data
    except Exception:
        pass  # Silent failure
```

### Suggested Fix

```python
except Exception as e:
    logger.warning(f"Failed to sync assets via RPC: {e}")
    # Note: Direct table access will fail due to RLS for anon users
    # This fallback is only useful for service role connections
    try:
        response = client.from_("assets").select("*").execute()
        if response.data:
            result["assets"] = response.data
            logger.info(f"Fallback direct query succeeded for assets: {len(response.data)} rows")
    except Exception as fallback_error:
        logger.debug(f"Direct table fallback also failed (expected with anon key): {fallback_error}")
```

### Verification

1. Confirm RPC functions exist and work with anon key
2. Test behavior when Supabase is unreachable
3. Verify appropriate log messages are generated

---

## [LOW] Unused Parameter in sync_identity_domain

> The `page_size` parameter is defined but never used

**File**: `src-tauri/python/portfolio_src/data/hive_client.py:851-852`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The `page_size` parameter is accepted but the function fetches all data in a single RPC call without pagination.

### Current Code

```python
def sync_identity_domain(
    self,
    page_size: int = 1000,
) -> Dict[str, List[Dict[str, Any]]]:
    # ... page_size is never used
```

### Suggested Fix

Either implement pagination or remove the unused parameter:

```python
def sync_identity_domain(self) -> Dict[str, List[Dict[str, Any]]]:
    """
    Pull full identity domain (assets, listings, aliases) from Hive.
    ...
    """
```

### Verification

1. Check if pagination is actually needed (data volume)
2. Remove parameter or implement pagination

---

## [LOW] Generic Exception Handling Masks Specific Errors

> Broad exception catches make debugging harder

**File**: `src-tauri/python/portfolio_src/data/hive_client.py` (multiple locations)  
**Category**: Maintainability  
**Severity**: Low  

### Description

The code uses `except Exception:` throughout, which catches all exceptions including programming errors. While this is appropriate for a resilient client, it could make debugging harder when specific exceptions should be handled differently.

### Current Code

```python
except Exception as e:
    logger.error(f"Failed to create Supabase client: {e}")
    return None
```

### Suggested Fix

Consider catching more specific exceptions where possible:

```python
from supabase.lib.client_options import ClientOptions
from httpx import HTTPError

try:
    self._client = create_client(self.supabase_url, self.supabase_key)
except (ValueError, HTTPError) as e:
    logger.error(f"Failed to create Supabase client: {e}")
    return None
except Exception as e:
    logger.error(f"Unexpected error creating Supabase client: {e}")
    return None
```

### Verification

1. Review Supabase SDK documentation for specific exception types
2. Add exception type information to logs

---

## [INFO] Confidence Score Algorithm is Well-Documented

> Good practice: confidence calculation is transparent and documented

**File**: `src-tauri/python/portfolio_src/data/hive_client.py:68-101`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `calculate_confidence()` method has clear documentation explaining the algorithm weights. This is a good practice for community-contributed data where trust metrics are important.

The algorithm:
- Contributor Count: 40% (logarithmic scale)
- Freshness: 30% (linear decay over 180 days)
- Enrichment Status: 30% (verified > active > stub)

No action required - this is a positive observation.

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 3 | Security (1), Correctness (2) |
| Low | 2 | Maintainability (2) |
| Info | 1 | Maintainability (1) |

### Security Model Assessment

The `hive_client.py` follows the documented security model correctly:

1. **Supabase Anon Key** - Used as designed; anon key is safe to embed per Supabase security model
2. **RLS Protection** - All data access goes through `SECURITY DEFINER` RPC functions as required
3. **No Service Role Key** - The file correctly uses only the anon key, never the service role key
4. **Local-First** - Caching is implemented correctly for offline operation
5. **Contribution Control** - Contributions are gated by user preference via `is_hive_contribution_enabled()`

### Approval Criteria

- [x] No critical severity findings
- [x] No high severity findings
- [x] All security concerns documented
- [x] Follows project security model (anon key + RPC only)
