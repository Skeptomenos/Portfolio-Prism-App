# Identity Resolution Phase 3: Persistent Negative Cache

> **Purpose:** Move negative cache from in-memory to SQLite, remove legacy JSON cache, add TTL tracking.
> **Status:** Draft
> **Created:** 2025-12-27
> **Estimated Effort:** 3-4 hours
> **Priority:** HIGH
> **Depends On:** Phase 2 (API Cascade Reorder) - DONE
> **Related:**
> - `keystone/specs/identity_resolution.md` (Section 8.1: Negative Caching)
> - `keystone/strategy/identity-resolution.md` (Section 8.1: Negative Caching)
> - `keystone/architecture/identity-resolution.md` (Section 4.1: Local Cache Schema)
> - `keystone/plans/identity_resolution_cascade_implementation.md` (Phase 2 - DONE)

---

## 1. Executive Summary

### Current State

| Component | Status | Problem |
|-----------|--------|---------|
| In-memory negative cache | ✅ Exists | Resets on app restart, 5-min TTL too short |
| Legacy `enrichment_cache.json` | ⚠️ Still loaded | Outdated, should be replaced by SQLite + Hive |
| SQLite `isin_cache` table | ❌ Missing | Spec requires persistent cache with TTL |

### Target State (per specs)

| Component | Target |
|-----------|--------|
| Persistent negative cache | SQLite `isin_cache` table with `expires_at` |
| TTL for unresolved | 24 hours |
| TTL for rate-limited | 1 hour |
| Legacy JSON cache | Removed |

### Deliverables

1. Add `isin_cache` table to `LocalCache` schema
2. Add methods: `get_isin_cache()`, `set_isin_cache()`, `is_negative_cached()`, `cleanup_expired_cache()`
3. Replace in-memory `_api_negative_cache` with SQLite-backed cache
4. Remove legacy `enrichment_cache.json` loading and lookup
5. Add unit tests for persistent negative cache

---

## 2. Requirements Traceability

### From `keystone/specs/identity_resolution.md` Section 8.1

> "Cache failed lookups to prevent repeated API calls for the same unknown identifier."

### From `keystone/strategy/identity-resolution.md` Section 8.1

> | Cache Entry | TTL | Purpose |
> |-------------|-----|---------|
> | `{alias} → UNRESOLVED` | 24 hours | Prevent API quota burn on repeated failures |
> | `{alias} → RATE_LIMITED` | 1 hour | Back off from rate-limited APIs |
>
> **Implementation:** Store in local SQLite cache with `resolution_status = 'unresolved'` and `expires_at` timestamp.

### From `keystone/architecture/identity-resolution.md` Section 4.1

```sql
CREATE TABLE isin_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL,              -- Normalized identifier
    alias_type TEXT NOT NULL,         -- "ticker" or "name"
    isin TEXT NOT NULL,               -- Resolved ISIN
    confidence REAL NOT NULL,         -- Resolution confidence
    source TEXT NOT NULL,             -- Where it was resolved
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(alias, alias_type)
);
```

**Note:** The architecture spec shows `isin TEXT NOT NULL`, but for negative caching we need `isin TEXT` (nullable) to store failed lookups.

---

## 3. Current Implementation Analysis

### 3.1 In-Memory Negative Cache

**File:** `src-tauri/python/portfolio_src/data/resolution.py` (lines 89-119)

```python
class ISINResolver:
    def __init__(self, tier1_threshold: float = 1.0):
        # ...
        self._api_negative_cache: Dict[str, float] = {}  # ticker -> timestamp
        self._negative_cache_ttl = 300  # 5 minutes

    def _is_negative_cached(self, ticker: str) -> bool:
        """Check if ticker is in negative cache and not expired."""
        if not ticker or ticker not in self._api_negative_cache:
            return False
        cached_time = self._api_negative_cache[ticker]
        if time.time() - cached_time > self._negative_cache_ttl:
            del self._api_negative_cache[ticker]
            return False
        return True

    def _add_negative_cache(self, ticker: str) -> None:
        """Add ticker to negative cache."""
        if ticker:
            self._api_negative_cache[ticker] = time.time()
```

**Problems:**
1. Resets on app restart (in-memory only)
2. 5-minute TTL is too short (spec says 24 hours for unresolved)
3. No distinction between "unresolved" and "rate_limited"
4. Only caches by ticker, not by alias type

### 3.2 Legacy JSON Cache

**File:** `src-tauri/python/portfolio_src/data/resolution.py` (lines 39, 121-150, 219-232)

```python
CACHE_PATH = Path("data/working/cache/enrichment_cache.json")

def _load_cache(self) -> Dict[str, Dict]:
    if not CACHE_PATH.exists():
        return {}
    # ... loads and filters cache ...

# In resolve() method:
cache_entry = self.cache.get(ticker_clean.upper())
if cache_entry:
    cache_isin = cache_entry.get("isin")
    if cache_isin and is_valid_isin(cache_isin):
        result = ResolutionResult(
            isin=cache_isin,
            status="resolved",
            detail="cache",
            source=None,
            confidence=CONFIDENCE_LEGACY_CACHE,
        )
```

**Problems:**
1. Outdated format (contains invalid entries like `|` separators)
2. No TTL or expiration
3. Duplicates functionality of LocalCache + Hive
4. Should be replaced entirely

### 3.3 LocalCache Schema

**File:** `src-tauri/python/portfolio_src/data/local_cache.py` (lines 79-129)

Current tables:
- `cache_assets` - Mirrors Hive assets
- `cache_listings` - Mirrors Hive listings
- `cache_aliases` - Mirrors Hive aliases
- `cache_metadata` - Sync timestamps

**Missing:** `isin_cache` table for resolution caching (both positive and negative)

---

## 4. Target Schema

### 4.1 New `isin_cache` Table

```sql
-- Resolution cache (positive and negative)
CREATE TABLE IF NOT EXISTS isin_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL,                    -- Normalized identifier
    alias_type TEXT NOT NULL,               -- "ticker" or "name"
    isin TEXT,                              -- NULL for negative cache entries
    resolution_status TEXT NOT NULL,        -- "resolved", "unresolved", "rate_limited"
    confidence REAL DEFAULT 0.0,            -- Resolution confidence (0.0 for negative)
    source TEXT,                            -- API source or NULL for negative
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,                   -- NULL for positive cache (never expires)
    
    UNIQUE(alias, alias_type)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_isin_cache_alias ON isin_cache (UPPER(alias));
CREATE INDEX IF NOT EXISTS idx_isin_cache_expires ON isin_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_isin_cache_status ON isin_cache (resolution_status);
```

### 4.2 Resolution Status Values

| Status | Meaning | TTL | ISIN |
|--------|---------|-----|------|
| `resolved` | Successfully resolved | Never expires | NOT NULL |
| `unresolved` | All APIs failed | 24 hours | NULL |
| `rate_limited` | API rate limit hit | 1 hour | NULL |

---

## 5. Implementation Details

### 5.1 TTL Constants

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

```python
# Negative cache TTL (per spec Section 8.1)
NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS = 24  # All APIs failed
NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS = 1  # API rate limit hit
```

### 5.2 LocalCache Methods

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

```python
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Literal

ResolutionStatus = Literal["resolved", "unresolved", "rate_limited"]


class LocalCache:
    # ... existing code ...

    def get_isin_cache(
        self,
        alias: str,
        alias_type: str = "ticker",
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached resolution result.
        
        Returns None if:
        - Not found
        - Entry is expired (negative cache with passed expires_at)
        
        Returns dict with keys:
        - isin: Optional[str]
        - resolution_status: str
        - confidence: float
        - source: Optional[str]
        - created_at: str
        - expires_at: Optional[str]
        """
        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT isin, resolution_status, confidence, source, created_at, expires_at
            FROM isin_cache
            WHERE UPPER(alias) = UPPER(?) AND alias_type = ?
            LIMIT 1
            """,
            (alias, alias_type),
        )
        
        row = cursor.fetchone()
        if not row:
            return None
        
        # Check expiration for negative cache entries
        if row["expires_at"]:
            expires_at = datetime.fromisoformat(row["expires_at"])
            if datetime.now() > expires_at:
                # Entry expired, delete it
                self._delete_isin_cache(alias, alias_type)
                return None
        
        return {
            "isin": row["isin"],
            "resolution_status": row["resolution_status"],
            "confidence": row["confidence"],
            "source": row["source"],
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
        }

    def set_isin_cache(
        self,
        alias: str,
        alias_type: str,
        isin: Optional[str],
        resolution_status: ResolutionStatus,
        confidence: float = 0.0,
        source: Optional[str] = None,
        ttl_hours: Optional[int] = None,
    ) -> bool:
        """
        Cache a resolution result.
        
        Args:
            alias: Normalized identifier
            alias_type: "ticker" or "name"
            isin: Resolved ISIN or None for negative cache
            resolution_status: "resolved", "unresolved", or "rate_limited"
            confidence: Resolution confidence (0.0 for negative)
            source: API source or None
            ttl_hours: Hours until expiration (None = never expires)
        
        Returns:
            True if successful, False otherwise
        """
        conn = self._get_connection()
        
        expires_at = None
        if ttl_hours is not None:
            expires_at = (datetime.now() + timedelta(hours=ttl_hours)).isoformat()
        
        try:
            conn.execute(
                """
                INSERT INTO isin_cache (
                    alias, alias_type, isin, resolution_status, 
                    confidence, source, created_at, expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(alias, alias_type) DO UPDATE SET
                    isin = excluded.isin,
                    resolution_status = excluded.resolution_status,
                    confidence = excluded.confidence,
                    source = excluded.source,
                    created_at = CURRENT_TIMESTAMP,
                    expires_at = excluded.expires_at
                """,
                (alias, alias_type, isin, resolution_status, confidence, source, expires_at),
            )
            conn.commit()
            return True
        except Exception as e:
            logger.warning(f"Failed to cache resolution for {alias}: {e}")
            return False

    def is_negative_cached(
        self,
        alias: str,
        alias_type: str = "ticker",
    ) -> bool:
        """
        Check if alias has unexpired negative cache entry.
        
        Returns True if:
        - Entry exists with resolution_status in ("unresolved", "rate_limited")
        - Entry has not expired (expires_at > now)
        """
        entry = self.get_isin_cache(alias, alias_type)
        if not entry:
            return False
        return entry["resolution_status"] in ("unresolved", "rate_limited")

    def cleanup_expired_cache(self) -> int:
        """
        Delete expired cache entries.
        
        Returns count of deleted entries.
        """
        conn = self._get_connection()
        cursor = conn.execute(
            """
            DELETE FROM isin_cache
            WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
            """
        )
        conn.commit()
        deleted = cursor.rowcount
        if deleted > 0:
            logger.debug(f"Cleaned up {deleted} expired cache entries")
        return deleted

    def _delete_isin_cache(self, alias: str, alias_type: str) -> None:
        """Delete a single cache entry."""
        conn = self._get_connection()
        conn.execute(
            "DELETE FROM isin_cache WHERE UPPER(alias) = UPPER(?) AND alias_type = ?",
            (alias, alias_type),
        )
        conn.commit()
```

### 5.3 Schema Update

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

Add to `_init_schema()` method:

```python
def _init_schema(self) -> None:
    """Initialize database schema."""
    conn = self._get_connection()

    conn.executescript(
        """
        -- ... existing tables ...

        -- Resolution cache (positive and negative)
        CREATE TABLE IF NOT EXISTS isin_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alias TEXT NOT NULL,
            alias_type TEXT NOT NULL,
            isin TEXT,
            resolution_status TEXT NOT NULL,
            confidence REAL DEFAULT 0.0,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            UNIQUE(alias, alias_type)
        );

        -- Indexes for isin_cache
        CREATE INDEX IF NOT EXISTS idx_isin_cache_alias
            ON isin_cache (UPPER(alias));
        CREATE INDEX IF NOT EXISTS idx_isin_cache_expires
            ON isin_cache (expires_at);
        CREATE INDEX IF NOT EXISTS idx_isin_cache_status
            ON isin_cache (resolution_status);
        """
    )

    conn.commit()
```

### 5.4 ISINResolver Updates

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

#### 5.4.1 Remove Legacy Cache

```python
# REMOVE these lines:
CACHE_PATH = Path("data/working/cache/enrichment_cache.json")

# In __init__:
# REMOVE: self.cache = self._load_cache()

# REMOVE entire method:
# def _load_cache(self) -> Dict[str, Dict]:

# In resolve():
# REMOVE cache lookup (lines 219-232):
# cache_entry = self.cache.get(ticker_clean.upper())
# if cache_entry:
#     ...
```

#### 5.4.2 Replace In-Memory Negative Cache

```python
# REMOVE these lines from __init__:
# self._api_negative_cache: Dict[str, float] = {}
# self._negative_cache_ttl = 300

# REMOVE these methods:
# def _is_negative_cached(self, ticker: str) -> bool:
# def _add_negative_cache(self, ticker: str) -> None:

# ADD new methods:
def _is_negative_cached(self, alias: str, alias_type: str = "ticker") -> bool:
    """Check if alias has unexpired negative cache entry in SQLite."""
    if not self._local_cache:
        return False
    return self._local_cache.is_negative_cached(alias, alias_type)

def _add_negative_cache(
    self,
    alias: str,
    alias_type: str = "ticker",
    status: str = "unresolved",
) -> None:
    """Add alias to negative cache in SQLite."""
    if not self._local_cache:
        return
    
    ttl_hours = (
        NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS
        if status == "rate_limited"
        else NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS
    )
    
    self._local_cache.set_isin_cache(
        alias=alias,
        alias_type=alias_type,
        isin=None,
        resolution_status=status,
        confidence=0.0,
        source=None,
        ttl_hours=ttl_hours,
    )
```

#### 5.4.3 Update _resolve_via_api()

```python
def _resolve_via_api(
    self,
    ticker: str,
    name: str,
    ticker_variants: Optional[List[str]] = None,
    name_variants: Optional[List[str]] = None,
) -> ResolutionResult:
    """
    Resolve via external APIs in priority order.
    
    Order (per spec):
    1. Wikidata (free, 0.80) - batch query with all name variants
    2. Finnhub (rate-limited, 0.75) - primary ticker only
    3. yFinance (unreliable, 0.70) - top 2 variants
    """
    names = name_variants or ([name] if name else [])
    tickers = ticker_variants or ([ticker] if ticker else [])
    primary_ticker = tickers[0] if tickers else ticker

    # Check persistent negative cache first
    if self._is_negative_cached(primary_ticker, "ticker"):
        return ResolutionResult(
            isin=None,
            status="unresolved",
            detail="negative_cached",
            confidence=0.0,
        )

    # Track if we hit rate limits
    rate_limited = False

    # 1. Wikidata - batch query with all name variants (FREE, no limit)
    isin = self._call_wikidata_batch(names)
    if isin:
        # Cache positive result
        self._cache_positive_result(primary_ticker, "ticker", isin, "api_wikidata", CONFIDENCE_WIKIDATA)
        return ResolutionResult(
            isin=isin,
            status="resolved",
            detail="api_wikidata",
            source="api_wikidata",
            confidence=CONFIDENCE_WIKIDATA,
        )

    # 2. Finnhub - PRIMARY TICKER ONLY (rate-limited 60/min)
    if primary_ticker:
        isin, was_rate_limited = self._call_finnhub_with_status(primary_ticker)
        if was_rate_limited:
            rate_limited = True
        if isin:
            self._cache_positive_result(primary_ticker, "ticker", isin, "api_finnhub", CONFIDENCE_FINNHUB)
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_finnhub",
                source="api_finnhub",
                confidence=CONFIDENCE_FINNHUB,
            )

    # 3. yFinance - top 2 variants only (unreliable)
    for t in tickers[:2]:
        isin = self._call_yfinance(t)
        if isin:
            self._cache_positive_result(t, "ticker", isin, "api_yfinance", CONFIDENCE_YFINANCE)
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_yfinance",
                source="api_yfinance",
                confidence=CONFIDENCE_YFINANCE,
            )

    # Cache this failure to prevent repeated calls
    status = "rate_limited" if rate_limited else "unresolved"
    self._add_negative_cache(primary_ticker, "ticker", status)

    return ResolutionResult(
        isin=None,
        status="unresolved",
        detail="api_all_failed",
        confidence=0.0,
    )

def _cache_positive_result(
    self,
    alias: str,
    alias_type: str,
    isin: str,
    source: str,
    confidence: float,
) -> None:
    """Cache a successful resolution (never expires)."""
    if not self._local_cache:
        return
    self._local_cache.set_isin_cache(
        alias=alias,
        alias_type=alias_type,
        isin=isin,
        resolution_status="resolved",
        confidence=confidence,
        source=source,
        ttl_hours=None,  # Never expires
    )
```

#### 5.4.4 Update _call_finnhub() to Return Rate Limit Status

```python
def _call_finnhub_with_status(self, ticker: str) -> tuple[Optional[str], bool]:
    """
    Call Finnhub API and return (isin, was_rate_limited).
    
    Returns:
        Tuple of (ISIN or None, True if rate limited)
    """
    if not ticker:
        return None, False

    try:
        proxy_client = get_proxy_client()
        response = proxy_client.get_company_profile(ticker)

        if response.success and response.data:
            isin = response.data.get("isin")
            if isin and is_valid_isin(isin):
                logger.debug(f"Finnhub proxy resolved {ticker} -> {isin}")
                return isin, False
        elif not response.success:
            if "rate" in str(response.error).lower():
                logger.debug(f"Finnhub rate limit for {ticker}")
                return None, True
            logger.debug(f"Finnhub proxy error for {ticker}: {response.error}")

        time.sleep(0.5)

    except Exception as e:
        logger.debug(f"Finnhub API error for {ticker}: {e}")

    # Try direct API if proxy failed
    if FINNHUB_API_KEY:
        try:
            response = requests.get(
                f"{FINNHUB_API_URL}/stock/profile2",
                params={"symbol": ticker},
                headers={"X-Finnhub-Token": FINNHUB_API_KEY},
                timeout=10,
            )

            if response.status_code == 200:
                data = response.json()
                isin = data.get("isin")
                if isin and is_valid_isin(isin):
                    logger.debug(f"Finnhub direct resolved {ticker} -> {isin}")
                    return isin, False
            elif response.status_code == 429:
                logger.debug(f"Finnhub direct rate limit for {ticker}")
                return None, True

            time.sleep(1.1)

        except Exception as e:
            logger.debug(f"Finnhub direct API error for {ticker}: {e}")

    return None, False
```

---

## 6. Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src-tauri/python/portfolio_src/data/local_cache.py` | MODIFY | Add `isin_cache` table schema, add `get_isin_cache()`, `set_isin_cache()`, `is_negative_cached()`, `cleanup_expired_cache()` methods |
| `src-tauri/python/portfolio_src/data/resolution.py` | MODIFY | Remove `CACHE_PATH`, `_load_cache()`, `self.cache`; replace in-memory negative cache with SQLite; add TTL constants; update `_resolve_via_api()` |
| `src-tauri/python/tests/test_resolution_phase3.py` | NEW | Unit tests for persistent negative cache |
| `CHANGELOG.md` | MODIFY | Document changes |

---

## 7. Implementation Order

```
1. Add isin_cache table to LocalCache schema
   └── Update _init_schema() in local_cache.py
   └── Add UNIQUE constraint on (alias, alias_type)
   └── Add indexes for performance

2. Add LocalCache methods
   └── get_isin_cache()
   └── set_isin_cache()
   └── is_negative_cached()
   └── cleanup_expired_cache()
   └── _delete_isin_cache() (private helper)

3. Add TTL constants to resolution.py
   └── NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS = 24
   └── NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS = 1

4. Replace in-memory negative cache in ISINResolver
   └── Remove _api_negative_cache dict
   └── Remove _negative_cache_ttl constant
   └── Update _is_negative_cached() to use LocalCache
   └── Update _add_negative_cache() to use LocalCache with TTL

5. Remove legacy enrichment_cache.json
   └── Remove CACHE_PATH constant
   └── Remove _load_cache() method
   └── Remove self.cache dict from __init__
   └── Remove cache lookup in resolve() method

6. Update _resolve_via_api() for rate limit tracking
   └── Add _call_finnhub_with_status() method
   └── Track rate_limited flag
   └── Use appropriate TTL based on failure type
   └── Add _cache_positive_result() for successful resolutions

7. Add unit tests
   └── Test cache persistence across resolver instances
   └── Test TTL expiration for unresolved (24h)
   └── Test TTL expiration for rate_limited (1h)
   └── Test cleanup_expired_cache()
   └── Test positive cache never expires

8. Run full test suite
   └── Verify no regressions
   └── Verify Phase 2 tests still pass
```

---

## 8. Test Plan

### 8.1 Unit Tests

**File:** `src-tauri/python/tests/test_resolution_phase3.py`

```python
import pytest
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

from portfolio_src.data.local_cache import LocalCache
from portfolio_src.data.resolution import ISINResolver


class TestISINCacheSchema:
    """Test isin_cache table schema."""

    def test_isin_cache_table_created(self, tmp_path):
        """isin_cache table should be created on init."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        conn = cache._get_connection()
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='isin_cache'"
        )
        assert cursor.fetchone() is not None

    def test_isin_cache_unique_constraint(self, tmp_path):
        """(alias, alias_type) should be unique."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata")
        # Second insert should update, not fail
        cache.set_isin_cache("NVDA", "ticker", "US67066G1040", "resolved", 0.9, "finnhub")
        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry["confidence"] == 0.9
        assert entry["source"] == "finnhub"


class TestPositiveCache:
    """Test positive (resolved) cache entries."""

    def test_positive_cache_stored(self, tmp_path):
        """Resolved entries should be stored."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata")
        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry is not None
        assert entry["isin"] == "US67066G1040"
        assert entry["resolution_status"] == "resolved"
        assert entry["confidence"] == 0.8

    def test_positive_cache_never_expires(self, tmp_path):
        """Resolved entries should not have expires_at."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata", ttl_hours=None)
        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry["expires_at"] is None

    def test_positive_cache_case_insensitive(self, tmp_path):
        """Lookup should be case-insensitive."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata")
        entry = cache.get_isin_cache("nvda", "ticker")
        assert entry is not None
        assert entry["isin"] == "US67066G1040"


class TestNegativeCache:
    """Test negative (unresolved/rate_limited) cache entries."""

    def test_negative_cache_stored(self, tmp_path):
        """Unresolved entries should be stored with TTL."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("UNKNOWN", "ticker", None, "unresolved", 0.0, None, ttl_hours=24)
        entry = cache.get_isin_cache("UNKNOWN", "ticker")
        assert entry is not None
        assert entry["isin"] is None
        assert entry["resolution_status"] == "unresolved"
        assert entry["expires_at"] is not None

    def test_is_negative_cached_true(self, tmp_path):
        """is_negative_cached should return True for unexpired negative entry."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("UNKNOWN", "ticker", None, "unresolved", 0.0, None, ttl_hours=24)
        assert cache.is_negative_cached("UNKNOWN", "ticker") is True

    def test_is_negative_cached_false_for_positive(self, tmp_path):
        """is_negative_cached should return False for resolved entry."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata")
        assert cache.is_negative_cached("NVDA", "ticker") is False

    def test_is_negative_cached_false_for_missing(self, tmp_path):
        """is_negative_cached should return False for missing entry."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        assert cache.is_negative_cached("MISSING", "ticker") is False

    def test_rate_limited_cache_stored(self, tmp_path):
        """Rate-limited entries should be stored with shorter TTL."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("RATELIMITED", "ticker", None, "rate_limited", 0.0, None, ttl_hours=1)
        entry = cache.get_isin_cache("RATELIMITED", "ticker")
        assert entry is not None
        assert entry["resolution_status"] == "rate_limited"


class TestCacheExpiration:
    """Test cache expiration behavior."""

    def test_expired_entry_returns_none(self, tmp_path):
        """Expired entries should return None and be deleted."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        
        # Insert with past expiration
        conn = cache._get_connection()
        past_time = (datetime.now() - timedelta(hours=1)).isoformat()
        conn.execute(
            """
            INSERT INTO isin_cache (alias, alias_type, isin, resolution_status, confidence, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("EXPIRED", "ticker", None, "unresolved", 0.0, past_time),
        )
        conn.commit()
        
        # Should return None for expired entry
        entry = cache.get_isin_cache("EXPIRED", "ticker")
        assert entry is None

    def test_cleanup_expired_cache(self, tmp_path):
        """cleanup_expired_cache should delete expired entries."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        
        # Insert expired and non-expired entries
        conn = cache._get_connection()
        past_time = (datetime.now() - timedelta(hours=1)).isoformat()
        future_time = (datetime.now() + timedelta(hours=1)).isoformat()
        
        conn.execute(
            "INSERT INTO isin_cache (alias, alias_type, resolution_status, expires_at) VALUES (?, ?, ?, ?)",
            ("EXPIRED1", "ticker", "unresolved", past_time),
        )
        conn.execute(
            "INSERT INTO isin_cache (alias, alias_type, resolution_status, expires_at) VALUES (?, ?, ?, ?)",
            ("EXPIRED2", "ticker", "unresolved", past_time),
        )
        conn.execute(
            "INSERT INTO isin_cache (alias, alias_type, resolution_status, expires_at) VALUES (?, ?, ?, ?)",
            ("VALID", "ticker", "unresolved", future_time),
        )
        conn.commit()
        
        deleted = cache.cleanup_expired_cache()
        assert deleted == 2
        
        # Valid entry should still exist
        entry = cache.get_isin_cache("VALID", "ticker")
        assert entry is not None


class TestResolverIntegration:
    """Test ISINResolver integration with persistent cache."""

    @patch("portfolio_src.data.resolution.get_local_cache")
    def test_negative_cache_prevents_api_calls(self, mock_get_cache, tmp_path):
        """Negative cached ticker should not trigger API calls."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache("UNKNOWN", "ticker", None, "unresolved", 0.0, None, ttl_hours=24)
        mock_get_cache.return_value = cache
        
        resolver = ISINResolver()
        resolver._local_cache = cache
        
        with patch.object(resolver, "_call_wikidata_batch") as mock_wiki:
            with patch.object(resolver, "_call_finnhub") as mock_finnhub:
                result = resolver._resolve_via_api("UNKNOWN", "", ["UNKNOWN"], [])
                
                # APIs should not be called
                mock_wiki.assert_not_called()
                mock_finnhub.assert_not_called()
                
                # Result should indicate negative cache hit
                assert result.status == "unresolved"
                assert result.detail == "negative_cached"

    @patch("portfolio_src.data.resolution.get_local_cache")
    def test_cache_persists_across_instances(self, mock_get_cache, tmp_path):
        """Cache should persist across resolver instances."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        mock_get_cache.return_value = cache
        
        # First resolver caches a failure
        resolver1 = ISINResolver()
        resolver1._local_cache = cache
        resolver1._add_negative_cache("UNKNOWN", "ticker", "unresolved")
        
        # Second resolver should see the cached failure
        resolver2 = ISINResolver()
        resolver2._local_cache = cache
        assert resolver2._is_negative_cached("UNKNOWN", "ticker") is True
```

### 8.2 Integration Tests

```python
class TestLegacyCacheRemoval:
    """Test that legacy cache is no longer used."""

    def test_no_cache_path_constant(self):
        """CACHE_PATH constant should not exist."""
        from portfolio_src.data import resolution
        assert not hasattr(resolution, "CACHE_PATH")

    def test_no_load_cache_method(self):
        """_load_cache method should not exist."""
        resolver = ISINResolver()
        assert not hasattr(resolver, "_load_cache")

    def test_no_cache_dict(self):
        """self.cache dict should not exist."""
        resolver = ISINResolver()
        assert not hasattr(resolver, "cache")
```

---

## 9. Verification Checklist

After implementation, verify:

- [ ] `isin_cache` table created with correct schema
- [ ] `get_isin_cache()` returns None for expired entries
- [ ] `set_isin_cache()` stores entries with correct TTL
- [ ] `is_negative_cached()` returns True only for unexpired negative entries
- [ ] `cleanup_expired_cache()` deletes expired entries
- [ ] `CACHE_PATH` constant removed from resolution.py
- [ ] `_load_cache()` method removed from ISINResolver
- [ ] `self.cache` dict removed from ISINResolver.__init__
- [ ] Cache lookup in resolve() removed
- [ ] In-memory `_api_negative_cache` replaced with SQLite
- [ ] Unresolved entries have 24-hour TTL
- [ ] Rate-limited entries have 1-hour TTL
- [ ] Positive cache entries never expire
- [ ] All Phase 2 tests still pass
- [ ] All new Phase 3 tests pass

---

## 10. Rollback Plan

If issues occur:

1. Revert `local_cache.py` to previous version
2. Revert `resolution.py` to previous version
3. SQLite schema change is additive (new table), no data loss
4. Legacy `enrichment_cache.json` file still exists on disk if needed

---

## 11. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Negative cache persistence | No (in-memory) | Yes (SQLite) |
| Negative cache TTL | 5 minutes | 24h unresolved, 1h rate-limited |
| Legacy cache dependency | Yes | No |
| Cache survives restart | No | Yes |
| Rate limit handling | No distinction | Separate TTL |

---

## 12. Next Steps After Implementation

1. **Phase 4:** Store per-holding provenance in DataFrame (IR-401)
2. **Phase 5:** Add format learning with persistence (IR-501 to IR-503)
3. **Cleanup:** Consider migrating data from `enrichment_cache.json` to SQLite before deleting
