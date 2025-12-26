# Phase 4: Decomposer Wiring

**Workstream:** hive-extension
**Owner:** OptiPie
**Status:** Blocked (requires Phase 3)
**Estimated Effort:** 2-3 hours

---

## Objective

Wire the refactored `ISINResolver` into the `Decomposer` service so that ETF holdings fetched from adapters are resolved to ISINs before being passed to the Enricher. This fixes the broken X-Ray analysis pipeline.

## Prerequisites

- Phase 3 complete (ISINResolver refactored with Hive + LocalCache)
- All Phase 3 unit tests passing

---

## Current State Analysis

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

### Current Flow (Broken)

```
Adapter.fetch_holdings(isin)
    ↓
Returns DataFrame with columns: [ticker, name, weight, ...]
    ↓
Decomposer passes raw DataFrame to caller
    ↓
Enricher receives holdings WITHOUT ISINs
    ↓
Enricher fails to lookup sector/geography metadata
    ↓
X-Ray analysis shows "Unknown" for everything
```

### Problem

The Decomposer's `_get_holdings()` method fetches holdings from:
1. Local cache
2. Hive Community (`get_etf_holdings`)
3. Adapter (scraper)

But it **never calls ISINResolver** to convert tickers → ISINs. The holdings DataFrame goes straight to the caller with raw ticker data.

---

## New Flow (Fixed)

```
Adapter.fetch_holdings(isin)
    ↓
Returns DataFrame with columns: [ticker, name, weight, ...]
    ↓
Decomposer calls ISINResolver.batch_resolve(holdings)
    ↓
ISINResolver resolves each holding:
  - LocalCache hit → ISIN
  - HiveClient hit → ISIN
  - API fallback → ISIN (+ push to Hive)
  - Miss → None (logged)
    ↓
DataFrame updated with 'isin' column
    ↓
Enricher receives holdings WITH ISINs
    ↓
Enricher looks up sector/geography successfully
    ↓
X-Ray analysis shows real data
```

---

## Task Breakdown

### HIVE-401: Inject ISINResolver into Decomposer

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

**Changes:**

1. Add import at top:
```python
from portfolio_src.data.resolution import ISINResolver
```

2. Modify `__init__` to accept optional resolver:
```python
def __init__(
    self, 
    holdings_cache, 
    adapter_registry,
    isin_resolver: Optional[ISINResolver] = None,
):
    """
    Initialize with dependencies.

    Args:
        holdings_cache: HoldingsCache instance for cached ETF data
        adapter_registry: AdapterRegistry for fetching live data
        isin_resolver: Optional ISINResolver for ticker→ISIN resolution.
                       If None, resolution is skipped (legacy behavior).
    """
    self.holdings_cache = holdings_cache
    self.adapter_registry = adapter_registry
    self.isin_resolver = isin_resolver
```

3. Update all Decomposer instantiation sites to pass resolver:

**File:** `src-tauri/python/portfolio_src/core/pipeline.py` (or wherever Decomposer is created)

```python
from portfolio_src.data.resolution import ISINResolver

# Create resolver with appropriate threshold
resolver = ISINResolver(tier1_threshold=0.5)

# Inject into Decomposer
decomposer = Decomposer(
    holdings_cache=holdings_cache,
    adapter_registry=adapter_registry,
    isin_resolver=resolver,
)
```

---

### HIVE-402: Call Resolver After Adapter Fetch

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

**Add new method for batch resolution:**

```python
def _resolve_holdings_isins(
    self, 
    holdings: pd.DataFrame,
    etf_isin: str,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Resolve tickers in holdings DataFrame to ISINs.
    
    Args:
        holdings: DataFrame with 'ticker' and 'name' columns
        etf_isin: Parent ETF ISIN (for logging context)
    
    Returns:
        Tuple of (updated_holdings, resolution_stats)
    """
    if self.isin_resolver is None:
        # Legacy behavior: no resolution
        logger.debug(f"No ISINResolver configured, skipping resolution for {etf_isin}")
        return holdings, {"skipped": True}
    
    if holdings.empty:
        return holdings, {"total": 0, "resolved": 0, "unresolved": 0}
    
    # Ensure required columns exist
    if 'ticker' not in holdings.columns:
        logger.warning(f"Holdings for {etf_isin} missing 'ticker' column, skipping resolution")
        return holdings, {"skipped": True, "reason": "no_ticker_column"}
    
    # Initialize ISIN column if not present
    if 'isin' not in holdings.columns:
        holdings = holdings.copy()
        holdings['isin'] = None
    
    # Get weight column for tiered resolution
    weight_col = None
    for col in ['weight', 'Weight', 'weight_pct', 'Weight_Pct']:
        if col in holdings.columns:
            weight_col = col
            break
    
    resolved_count = 0
    unresolved_count = 0
    resolution_sources = {}
    
    for idx, row in holdings.iterrows():
        ticker = str(row.get('ticker', '')).strip()
        name = str(row.get('name', '')).strip()
        weight = float(row.get(weight_col, 0)) if weight_col else 0.0
        
        # Skip if already has valid ISIN
        existing_isin = row.get('isin')
        if existing_isin and isinstance(existing_isin, str) and len(existing_isin) == 12:
            resolved_count += 1
            resolution_sources['existing'] = resolution_sources.get('existing', 0) + 1
            continue
        
        # Skip empty tickers
        if not ticker:
            unresolved_count += 1
            continue
        
        # Resolve ticker to ISIN
        result = self.isin_resolver.resolve(
            ticker=ticker,
            name=name,
            provider_isin=existing_isin,
            weight=weight,
        )
        
        if result.status == "resolved" and result.isin:
            holdings.at[idx, 'isin'] = result.isin
            resolved_count += 1
            source = result.source or result.detail or 'unknown'
            resolution_sources[source] = resolution_sources.get(source, 0) + 1
        elif result.status == "skipped":
            # Tiered resolution: holding below threshold
            resolution_sources['tier2_skipped'] = resolution_sources.get('tier2_skipped', 0) + 1
        else:
            unresolved_count += 1
            logger.debug(f"Failed to resolve {ticker} ({name}): {result.detail}")
    
    stats = {
        "total": len(holdings),
        "resolved": resolved_count,
        "unresolved": unresolved_count,
        "by_source": resolution_sources,
    }
    
    logger.info(
        f"Resolution for {etf_isin}: {resolved_count}/{len(holdings)} resolved, "
        f"{unresolved_count} unresolved"
    )
    
    return holdings, stats
```

**Modify `_get_holdings()` to call resolver:**

```python
def _get_holdings(
    self, isin: str
) -> Tuple[Optional[pd.DataFrame], Optional[PipelineError]]:
    """
    Try cache first, then Hive, then adapter.
    After fetching, resolve tickers to ISINs.

    Args:
        isin: ETF ISIN to look up

    Returns:
        Tuple of (holdings_df, error)
        Exactly one will be None.
    """
    holdings = None
    source = None
    
    # 1. Try Local Cache first
    try:
        cached = self.holdings_cache.get_holdings(
            isin, adapter_registry=self.adapter_registry
        )
        if cached is not None and not cached.empty:
            holdings = cached
            source = "cache"
    except Exception as e:
        logger.warning(f"Local cache lookup failed for {isin}: {e}")

    # 2. Try Hive Community
    if holdings is None:
        try:
            hive_client = get_hive_client()
            if hive_client.is_configured:
                hive_holdings = hive_client.get_etf_holdings(isin)
                if hive_holdings is not None and not hive_holdings.empty:
                    logger.info(f"Resolved {isin} via Hive Community")
                    # Save to local cache for future offline use
                    self.holdings_cache._save_to_local_cache(
                        isin, hive_holdings, source="hive"
                    )
                    holdings = hive_holdings
                    source = "hive"
        except Exception as e:
            logger.warning(f"Hive lookup failed for {isin}: {e}")

    # 3. Try Adapter (Scraper)
    if holdings is None:
        try:
            adapter = self.adapter_registry.get_adapter(isin)
            if not adapter:
                return None, PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.NO_ADAPTER,
                    item=isin,
                    message="No adapter registered for this ISIN",
                    fix_hint=f"Add adapter or upload to manual_holdings/{isin}.csv",
                )

            adapter_holdings = adapter.fetch_holdings(isin)
            if adapter_holdings is not None and not adapter_holdings.empty:
                # Cache the result locally
                try:
                    self.holdings_cache._save_to_local_cache(
                        isin, adapter_holdings, source="adapter"
                    )
                except Exception as e:
                    logger.warning(f"Failed to cache result for {isin}: {e}")

                # Contribute to Hive for the community
                try:
                    hive_client = get_hive_client()
                    if hive_client.is_configured:
                        hive_client.contribute_etf_holdings(isin, adapter_holdings)
                except Exception as e:
                    logger.debug(f"Failed to contribute discovery to Hive: {e}")

                holdings = adapter_holdings
                source = "adapter"
            else:
                return None, PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.API_FAILURE,
                    item=isin,
                    message="Adapter returned empty holdings",
                    fix_hint="Check provider website or API limits",
                )

        except Exception as e:
            logger.warning(f"Adapter failed for {isin}: {e}")
            return None, PipelineError(
                phase=ErrorPhase.ETF_DECOMPOSITION,
                error_type=ErrorType.API_FAILURE,
                item=isin,
                message=f"Adapter fetch failed: {str(e)}",
                fix_hint="Check network connectivity",
            )
    
    # 4. Resolve tickers to ISINs (NEW STEP)
    if holdings is not None and not holdings.empty:
        holdings, resolution_stats = self._resolve_holdings_isins(holdings, isin)
        
        # Store resolution stats for later analysis
        if not hasattr(self, '_resolution_stats'):
            self._resolution_stats = {}
        self._resolution_stats[isin] = resolution_stats
    
    return holdings, None
```

---

### HIVE-403: Add Resolution Stats Logging

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

**Add method to get aggregated stats:**

```python
def get_resolution_stats(self) -> Dict[str, Any]:
    """
    Get aggregated resolution statistics across all decomposed ETFs.
    
    Returns:
        Dict with total counts and per-ETF breakdown.
    """
    if not hasattr(self, '_resolution_stats') or not self._resolution_stats:
        return {"total": 0, "resolved": 0, "unresolved": 0, "etfs": {}}
    
    total = 0
    resolved = 0
    unresolved = 0
    all_sources = {}
    
    for etf_isin, stats in self._resolution_stats.items():
        if stats.get("skipped"):
            continue
        total += stats.get("total", 0)
        resolved += stats.get("resolved", 0)
        unresolved += stats.get("unresolved", 0)
        
        for source, count in stats.get("by_source", {}).items():
            all_sources[source] = all_sources.get(source, 0) + count
    
    return {
        "total": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "resolution_rate": f"{(resolved / total * 100):.1f}%" if total > 0 else "N/A",
        "by_source": all_sources,
        "etfs": self._resolution_stats,
    }
```

**Emit stats as pipeline progress event:**

**File:** `src-tauri/python/portfolio_src/core/pipeline.py` (or wherever pipeline orchestration happens)

```python
# After decomposition completes
holdings_map, decompose_errors = decomposer.decompose(etf_positions)

# Log resolution stats
resolution_stats = decomposer.get_resolution_stats()
logger.info(f"Resolution stats: {resolution_stats['resolved']}/{resolution_stats['total']} "
            f"({resolution_stats['resolution_rate']})")

# Emit progress event for UI
emit_progress_event(
    phase="decomposition",
    status="complete",
    details={
        "etfs_decomposed": len(holdings_map),
        "resolution_stats": resolution_stats,
    }
)
```

---

### HIVE-404: Integration Test for X-Ray Pipeline

**File:** `src-tauri/python/tests/test_xray_integration.py`

```python
"""Integration tests for X-Ray pipeline with ISIN resolution."""

import pytest
import pandas as pd
from unittest.mock import Mock, MagicMock, patch

from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.data.resolution import ISINResolver, ResolutionResult


class TestXRayIntegration:
    """Integration tests for full X-Ray pipeline."""
    
    @pytest.fixture
    def mock_holdings_cache(self):
        """Mock holdings cache that returns empty."""
        cache = Mock()
        cache.get_holdings.return_value = None
        cache._save_to_local_cache = Mock()
        return cache
    
    @pytest.fixture
    def mock_adapter_registry(self):
        """Mock adapter registry with sample ETF data."""
        registry = Mock()
        
        # Create mock adapter that returns holdings with tickers
        adapter = Mock()
        adapter.fetch_holdings.return_value = pd.DataFrame({
            'ticker': ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN'],
            'name': ['Apple Inc', 'Microsoft Corp', 'Alphabet Inc', 'NVIDIA Corp', 'Amazon.com Inc'],
            'weight': [5.0, 4.5, 4.0, 3.5, 3.0],
        })
        
        registry.get_adapter.return_value = adapter
        return registry
    
    @pytest.fixture
    def mock_resolver(self):
        """Mock ISINResolver that resolves known tickers."""
        resolver = Mock(spec=ISINResolver)
        
        # Known mappings
        mappings = {
            'AAPL': 'US0378331005',
            'MSFT': 'US5949181045',
            'GOOGL': 'US02079K3059',
            'NVDA': 'US67066G1040',
            'AMZN': 'US0231351067',
        }
        
        def mock_resolve(ticker, name, provider_isin=None, weight=0.0):
            isin = mappings.get(ticker.upper())
            if isin:
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="mock_cache",
                    source="mock",
                )
            return ResolutionResult(
                isin=None,
                status="unresolved",
                detail="not_found",
            )
        
        resolver.resolve.side_effect = mock_resolve
        return resolver
    
    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_decomposition_resolves_isins(
        self, 
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
        mock_resolver,
    ):
        """ETF decomposition should resolve tickers to ISINs."""
        # Setup
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive
        
        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=mock_resolver,
        )
        
        # Create ETF positions
        etf_positions = pd.DataFrame({
            'isin': ['IE00B4L5Y983'],  # iShares Core MSCI World
            'name': ['iShares Core MSCI World'],
            'weight': [100.0],
        })
        
        # Execute
        holdings_map, errors = decomposer.decompose(etf_positions)
        
        # Verify
        assert len(holdings_map) == 1
        assert 'IE00B4L5Y983' in holdings_map
        
        holdings = holdings_map['IE00B4L5Y983']
        assert 'isin' in holdings.columns
        
        # All 5 holdings should have ISINs
        resolved_isins = holdings['isin'].dropna()
        assert len(resolved_isins) == 5
        
        # Verify specific mappings
        aapl_row = holdings[holdings['ticker'] == 'AAPL'].iloc[0]
        assert aapl_row['isin'] == 'US0378331005'
    
    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_unresolved_holdings_handled_gracefully(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
    ):
        """Unresolved holdings should not break the pipeline."""
        # Setup resolver that fails for some tickers
        resolver = Mock(spec=ISINResolver)
        
        def partial_resolve(ticker, name, provider_isin=None, weight=0.0):
            if ticker.upper() in ['AAPL', 'MSFT']:
                return ResolutionResult(
                    isin=f"US{ticker}12345",
                    status="resolved",
                    detail="mock",
                    source="mock",
                )
            return ResolutionResult(
                isin=None,
                status="unresolved",
                detail="api_failed",
            )
        
        resolver.resolve.side_effect = partial_resolve
        
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive
        
        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=resolver,
        )
        
        etf_positions = pd.DataFrame({
            'isin': ['IE00B4L5Y983'],
            'name': ['Test ETF'],
            'weight': [100.0],
        })
        
        # Execute - should not raise
        holdings_map, errors = decomposer.decompose(etf_positions)
        
        # Verify partial resolution
        assert len(holdings_map) == 1
        holdings = holdings_map['IE00B4L5Y983']
        
        # 2 resolved, 3 unresolved
        resolved = holdings['isin'].notna().sum()
        assert resolved == 2
    
    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_resolution_stats_tracked(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
        mock_resolver,
    ):
        """Resolution statistics should be tracked and accessible."""
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive
        
        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=mock_resolver,
        )
        
        etf_positions = pd.DataFrame({
            'isin': ['IE00B4L5Y983'],
            'name': ['Test ETF'],
            'weight': [100.0],
        })
        
        # Execute
        holdings_map, errors = decomposer.decompose(etf_positions)
        
        # Get stats
        stats = decomposer.get_resolution_stats()
        
        assert stats['total'] == 5
        assert stats['resolved'] == 5
        assert stats['unresolved'] == 0
        assert 'mock' in stats['by_source']
    
    def test_no_resolver_legacy_behavior(
        self,
        mock_holdings_cache,
        mock_adapter_registry,
    ):
        """Without resolver, should use legacy behavior (no resolution)."""
        with patch("portfolio_src.core.services.decomposer.get_hive_client") as mock_hive_fn:
            mock_hive = MagicMock()
            mock_hive.is_configured = False
            mock_hive_fn.return_value = mock_hive
            
            # No resolver passed
            decomposer = Decomposer(
                holdings_cache=mock_holdings_cache,
                adapter_registry=mock_adapter_registry,
                isin_resolver=None,  # Legacy mode
            )
            
            etf_positions = pd.DataFrame({
                'isin': ['IE00B4L5Y983'],
                'name': ['Test ETF'],
                'weight': [100.0],
            })
            
            # Execute
            holdings_map, errors = decomposer.decompose(etf_positions)
            
            # Should still work, just without ISIN resolution
            assert len(holdings_map) == 1
            holdings = holdings_map['IE00B4L5Y983']
            
            # ISIN column may not exist or be all None
            if 'isin' in holdings.columns:
                assert holdings['isin'].isna().all()


class TestEnricherReceivesISINs:
    """Tests verifying Enricher receives resolved ISINs."""
    
    @pytest.fixture
    def decomposed_holdings_with_isins(self):
        """Sample decomposed holdings with ISINs."""
        return pd.DataFrame({
            'ticker': ['AAPL', 'MSFT', 'GOOGL'],
            'name': ['Apple Inc', 'Microsoft Corp', 'Alphabet Inc'],
            'weight': [5.0, 4.5, 4.0],
            'isin': ['US0378331005', 'US5949181045', 'US02079K3059'],
        })
    
    def test_enricher_can_lookup_by_isin(self, decomposed_holdings_with_isins):
        """Enricher should be able to use ISINs for metadata lookup."""
        holdings = decomposed_holdings_with_isins
        
        # Verify all holdings have valid ISINs
        assert holdings['isin'].notna().all()
        
        # Verify ISIN format (12 characters)
        for isin in holdings['isin']:
            assert len(isin) == 12
            assert isin[:2].isalpha()  # Country code
```

---

## Instantiation Sites to Update

Find all places where `Decomposer` is instantiated and update to pass resolver:

### Search Pattern

```bash
grep -rn "Decomposer(" src-tauri/python/portfolio_src/
```

### Expected Files

1. **`core/pipeline.py`** - Main pipeline orchestration
2. **`core/services/__init__.py`** - Service factory (if exists)
3. **Tests** - Update test fixtures

### Update Template

```python
# Before
decomposer = Decomposer(
    holdings_cache=holdings_cache,
    adapter_registry=adapter_registry,
)

# After
from portfolio_src.data.resolution import ISINResolver

resolver = ISINResolver(tier1_threshold=0.5)
decomposer = Decomposer(
    holdings_cache=holdings_cache,
    adapter_registry=adapter_registry,
    isin_resolver=resolver,
)
```

---

## Rollback Procedure

If issues occur after deploying Phase 4:

1. Pass `isin_resolver=None` to Decomposer (reverts to legacy behavior)
2. Or set `USE_LEGACY_CSV=True` in config (reverts ISINResolver to CSV)
3. Restart application
4. Pipeline works as before (without ISIN resolution)

---

## Success Criteria

- [ ] Decomposer accepts optional `ISINResolver` in constructor
- [ ] Holdings DataFrame has `isin` column after decomposition
- [ ] Resolution stats tracked and accessible via `get_resolution_stats()`
- [ ] Unresolved holdings don't break pipeline (graceful degradation)
- [ ] All unit tests pass
- [ ] Integration test: ETF with 5 holdings → 5 ISINs resolved
- [ ] Legacy behavior preserved when `isin_resolver=None`

---

## Files Modified

| File | Changes |
|------|---------|
| `core/services/decomposer.py` | Add resolver injection, resolution logic, stats tracking |
| `core/pipeline.py` | Pass resolver to Decomposer, emit stats event |
| `tests/test_xray_integration.py` | NEW - Integration tests |
| `tests/test_decomposer.py` | Update existing tests for new parameter |
