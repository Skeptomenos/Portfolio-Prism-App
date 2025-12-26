# Phase 3: ISINResolver Refactor

**Workstream:** hive-extension
**Owner:** OptiPie
**Status:** Blocked (requires Phase 1 + Phase 2)
**Estimated Effort:** 3-4 hours

---

## Objective

Refactor `ISINResolver` to use Hive + LocalCache instead of the deprecated `asset_universe.csv`, with a feature flag for safe rollback.

## Prerequisites

- Phase 1 complete (HiveClient read methods)
- Phase 2 complete (LocalCache infrastructure)

---

## Current State Analysis

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

Current resolution chain:
1. Provider ISIN (if valid)
2. Manual enrichments
3. `AssetUniverse.lookup_by_ticker()` ← **Uses CSV**
4. `AssetUniverse.lookup_by_alias()` ← **Uses CSV**
5. Cache lookup
6. API fallbacks (Finnhub → Wikidata → YFinance)

**Problem:** Steps 3-4 depend on `asset_universe.csv` which is deprecated.

---

## New Resolution Chain

```
1. Provider ISIN (if valid)
2. Manual enrichments
3. LocalCache.get_isin_by_ticker()     ← NEW (backed by Hive sync)
4. LocalCache.get_isin_by_alias()      ← NEW
5. HiveClient.resolve_ticker()         ← NEW (live query if cache miss)
6. HiveClient.lookup_by_alias()        ← NEW
7. API fallbacks (Finnhub → Wikidata → YFinance)
8. On success → Push to Hive + LocalCache
```

---

## Task Breakdown

### HIVE-301: Add `USE_LEGACY_CSV` Feature Flag

**File:** `src-tauri/python/portfolio_src/config.py`

**Add near other feature flags:**

```python
# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Hive Extension: Use legacy CSV for ISIN resolution
# Set to False to use Hive + LocalCache instead
# Default: True (safe - uses existing behavior)
USE_LEGACY_CSV = True
```

**Usage pattern:**
```python
from portfolio_src.config import USE_LEGACY_CSV

if USE_LEGACY_CSV:
    # Old path: use AssetUniverse (CSV)
    isin = self.universe.lookup_by_ticker(ticker)
else:
    # New path: use LocalCache + HiveClient
    isin = self._resolve_via_hive(ticker)
```

---

### HIVE-302: Refactor ISINResolver with Dual Path

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

**Changes:**

1. Add imports at top:
```python
from portfolio_src.config import USE_LEGACY_CSV
from portfolio_src.data.local_cache import get_local_cache
from portfolio_src.data.hive_client import get_hive_client
```

2. Modify `__init__` to initialize new dependencies:
```python
def __init__(self, tier1_threshold: float = 1.0):
    """
    Initialize resolver.

    Args:
        tier1_threshold: Weight threshold for Tier 1 resolution (default 1.0%)
    """
    self.tier1_threshold = tier1_threshold
    self.cache = self._load_cache()
    self.newly_resolved: List[Dict[str, Any]] = []
    self.stats = {
        "total": 0,
        "resolved": 0,
        "unresolved": 0,
        "skipped": 0,
        "by_source": {},
    }
    
    # Initialize based on feature flag
    if USE_LEGACY_CSV:
        self.universe = AssetUniverse.load()
        self._local_cache = None
        self._hive_client = None
    else:
        self.universe = None  # Not used in new path
        self._local_cache = get_local_cache()
        self._hive_client = get_hive_client()
        
        # Sync cache if stale
        if self._local_cache.is_stale():
            try:
                self._local_cache.sync_from_hive(self._hive_client)
            except Exception as e:
                logger.warning(f"Failed to sync LocalCache: {e}")
```

3. Modify `resolve()` method to use dual path:
```python
def resolve(
    self,
    ticker: str,
    name: str,
    provider_isin: Optional[str] = None,
    weight: float = 0.0,
) -> ResolutionResult:
    """
    Resolve ticker/name to ISIN using priority order.
    """
    self.stats["total"] += 1

    # Normalize inputs
    ticker_clean = (ticker or "").strip()
    name_clean = (name or "").strip()

    # 1. Provider ISIN (highest priority)
    if provider_isin and is_valid_isin(provider_isin):
        result = ResolutionResult(
            isin=provider_isin,
            status="resolved",
            detail="provider",
            source="provider",
        )
        self._record_resolution(ticker_clean, name_clean, result)
        return result

    # 1b. Manual enrichments (user-provided ISINs)
    manual_mappings = load_manual_enrichments()
    if ticker_clean.upper() in manual_mappings:
        manual_isin = manual_mappings[ticker_clean.upper()]
        if is_valid_isin(manual_isin):
            result = ResolutionResult(
                isin=manual_isin,
                status="resolved",
                detail="manual",
                source="manual",
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

    # 2-4. Local resolution (CSV or Hive based on flag)
    if USE_LEGACY_CSV:
        result = self._resolve_via_csv(ticker_clean, name_clean)
    else:
        result = self._resolve_via_hive(ticker_clean, name_clean)
    
    if result.status == "resolved":
        self._record_resolution(ticker_clean, name_clean, result)
        return result

    # 5. Cache lookup (enrichment cache)
    cache_entry = self.cache.get(ticker_clean.upper())
    if cache_entry:
        cache_isin = cache_entry.get("isin")
        if cache_isin and is_valid_isin(cache_isin):
            result = ResolutionResult(
                isin=cache_isin, status="resolved", detail="cache", source=None
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

    # 6. Tier check - skip API for minor holdings
    if weight <= self.tier1_threshold:
        result = ResolutionResult(
            isin=None, status="skipped", detail="tier2_skipped"
        )
        self._record_resolution(ticker_clean, name_clean, result)
        return result

    # 7. API resolution (Tier 1 only)
    result = self._resolve_via_api(ticker_clean, name_clean)
    self._record_resolution(ticker_clean, name_clean, result)
    
    # 8. Push to Hive on API success (new path only)
    if not USE_LEGACY_CSV and result.status == "resolved" and result.isin:
        self._push_to_hive(ticker_clean, name_clean, result.isin, result.source)
    
    return result
```

---

### HIVE-303: Implement Hive-first Resolution Chain

**Add new methods to `ISINResolver`:**

```python
def _resolve_via_csv(self, ticker: str, name: str) -> ResolutionResult:
    """Legacy path: resolve via AssetUniverse CSV."""
    # Ticker lookup
    universe_isin = self.universe.lookup_by_ticker(ticker)
    if universe_isin:
        return ResolutionResult(
            isin=universe_isin,
            status="resolved",
            detail="universe_ticker",
            source=None,
        )
    
    # Alias lookup
    universe_isin = self.universe.lookup_by_alias(name)
    if universe_isin:
        return ResolutionResult(
            isin=universe_isin,
            status="resolved",
            detail="universe_alias",
            source=None,
        )
    
    return ResolutionResult(isin=None, status="unresolved", detail="csv_miss")


def _resolve_via_hive(self, ticker: str, name: str) -> ResolutionResult:
    """New path: resolve via LocalCache + HiveClient."""
    
    # 1. Try LocalCache first (fast, offline-capable)
    isin = self._local_cache.get_isin_by_ticker(ticker)
    if isin:
        return ResolutionResult(
            isin=isin,
            status="resolved",
            detail="local_cache_ticker",
            source=None,
        )
    
    # 2. Try LocalCache alias lookup
    if name:
        isin = self._local_cache.get_isin_by_alias(name)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="local_cache_alias",
                source=None,
            )
    
    # 3. Try HiveClient live query (cache miss)
    if self._hive_client and self._hive_client.is_configured:
        isin = self._hive_client.resolve_ticker(ticker)
        if isin:
            # Update local cache for next time
            self._local_cache.upsert_listing(ticker, "UNKNOWN", isin, "USD")
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="hive_ticker",
                source=None,
            )
        
        # 4. Try HiveClient alias lookup
        if name:
            isin = self._hive_client.lookup_by_alias(name)
            if isin:
                self._local_cache.upsert_alias(name, isin)
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="hive_alias",
                    source=None,
                )
    
    return ResolutionResult(isin=None, status="unresolved", detail="hive_miss")
```

---

### HIVE-304: Implement Push-to-Hive on API Success

**Add method to `ISINResolver`:**

```python
def _push_to_hive(
    self, 
    ticker: str, 
    name: str, 
    isin: str, 
    source: Optional[str]
) -> None:
    """Push successful API resolution to Hive and LocalCache."""
    if not self._hive_client or not self._hive_client.is_configured:
        return
    
    try:
        # Contribute listing to Hive
        self._hive_client.contribute_listing(
            isin=isin,
            ticker=ticker,
            exchange="UNKNOWN",  # We don't always know the exchange
            currency="USD",
        )
        
        # Update local cache
        self._local_cache.upsert_listing(ticker, "UNKNOWN", isin, "USD")
        
        # Contribute alias if name is meaningful
        if name and len(name) > 2:
            self._hive_client.contribute_alias(
                p_alias=name,
                p_isin=isin,
                p_alias_type="name",
            )
            self._local_cache.upsert_alias(name, isin)
        
        logger.debug(f"Pushed to Hive: {ticker} -> {isin} (source: {source})")
        
    except Exception as e:
        logger.warning(f"Failed to push to Hive: {e}")
```

---

### HIVE-305: Implement Tiered Resolution

**Already exists** in current code (`tier1_threshold`). Verify it works with new path:

```python
# In resolve() method, this check already exists:
if weight <= self.tier1_threshold:
    result = ResolutionResult(
        isin=None, status="skipped", detail="tier2_skipped"
    )
    self._record_resolution(ticker_clean, name_clean, result)
    return result
```

**Enhancement:** Make threshold configurable via config:

```python
# In config.py
RESOLUTION_TIER1_THRESHOLD = 0.5  # Only resolve holdings > 0.5% weight via API
```

---

### HIVE-306: Unit Tests for ISINResolver Refactor

**File:** `src-tauri/python/tests/test_isin_resolver_hive.py`

```python
"""Unit tests for ISINResolver with Hive integration."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from portfolio_src.data.resolution import ISINResolver, ResolutionResult


class TestFeatureFlagBehavior:
    """Tests for USE_LEGACY_CSV feature flag."""
    
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", True)
    def test_legacy_flag_uses_csv(self):
        """When flag is True, should use AssetUniverse."""
        with patch("portfolio_src.data.resolution.AssetUniverse") as mock_universe:
            mock_instance = MagicMock()
            mock_instance.lookup_by_ticker.return_value = "US0378331005"
            mock_universe.load.return_value = mock_instance
            
            resolver = ISINResolver()
            result = resolver.resolve("AAPL", "Apple Inc")
            
            assert result.isin == "US0378331005"
            assert result.detail == "universe_ticker"
    
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_new_flag_uses_hive(self):
        """When flag is False, should use LocalCache + HiveClient."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache
                
                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive
                
                resolver = ISINResolver()
                result = resolver.resolve("AAPL", "Apple Inc")
                
                assert result.isin == "US0378331005"
                assert result.detail == "local_cache_ticker"


class TestHiveResolutionChain:
    """Tests for Hive-first resolution chain."""
    
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_local_cache_hit(self):
        """Should return from LocalCache without hitting Hive."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache
                
                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive
                
                resolver = ISINResolver()
                result = resolver.resolve("AAPL", "Apple Inc")
                
                # Should not call HiveClient
                mock_hive.resolve_ticker.assert_not_called()
    
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_cache_miss_hits_hive(self):
        """Should query Hive when LocalCache misses."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache
                
                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = "US0378331005"
                mock_hive_fn.return_value = mock_hive
                
                resolver = ISINResolver()
                result = resolver.resolve("AAPL", "Apple Inc")
                
                assert result.isin == "US0378331005"
                assert result.detail == "hive_ticker"
                mock_hive.resolve_ticker.assert_called_once_with("AAPL")


class TestPushToHive:
    """Tests for pushing API resolutions to Hive."""
    
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_api_success_pushes_to_hive(self):
        """Should push to Hive when API resolves successfully."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache
                
                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive
                
                resolver = ISINResolver()
                
                # Mock API resolution
                with patch.object(resolver, "_resolve_via_api") as mock_api:
                    mock_api.return_value = ResolutionResult(
                        isin="US0378331005",
                        status="resolved",
                        detail="api_finnhub",
                        source="api_finnhub",
                    )
                    
                    result = resolver.resolve("AAPL", "Apple Inc", weight=5.0)
                    
                    # Should have pushed to Hive
                    mock_hive.contribute_listing.assert_called()
```

---

## Rollback Procedure

If issues occur after deploying with `USE_LEGACY_CSV=False`:

1. Set `USE_LEGACY_CSV = True` in `config.py`
2. Restart application
3. System immediately reverts to CSV-based resolution
4. No data loss - LocalCache and Hive data remain intact

---

## Success Criteria

- [ ] Feature flag `USE_LEGACY_CSV` controls resolution path
- [ ] With flag=True: existing CSV behavior unchanged
- [ ] With flag=False: uses LocalCache → HiveClient → API chain
- [ ] API resolutions push to Hive and LocalCache
- [ ] All unit tests pass
- [ ] Integration test: resolve 10 tickers with flag=False
