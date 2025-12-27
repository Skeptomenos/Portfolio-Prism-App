# Identity Resolution Phase 4: Per-Holding Provenance

> **Purpose:** Store resolution source and confidence per holding in the DataFrame, enabling UI visibility into resolution quality.
> **Status:** Draft
> **Created:** 2025-12-27
> **Estimated Effort:** 2-3 hours
> **Priority:** MEDIUM
> **Depends On:** Phase 3 (Persistent Negative Cache) - DONE
> **Related:**
> - `keystone/specs/identity_resolution.md` (Section 8: Confidence Scoring)
> - `keystone/strategy/identity-resolution.md` (Section 7: Confidence Scoring)
> - `keystone/plans/identity_resolution_persistent_cache_implementation.md` (Phase 3 - DONE)

---

## 1. Executive Summary

### Current State

| Component | Status | Problem |
|-----------|--------|---------|
| `ResolutionResult` dataclass | Has `source`, `confidence` | Data exists but not stored in DataFrame |
| Holdings DataFrame | Has `isin`, `resolution_status`, `resolution_detail` | Missing `resolution_source`, `resolution_confidence` |
| Decomposer | Calls `resolve()`, stores only `isin` | Discards `source` and `confidence` |
| Enrichment | Stores `resolution_status`, `resolution_detail` | Missing `resolution_source`, `resolution_confidence` |
| UI | No visibility into resolution quality | Cannot show confidence or source to user |

### Target State

| Component | Target |
|-----------|--------|
| Holdings DataFrame | Add `resolution_source`, `resolution_confidence` columns |
| Decomposer | Store all resolution metadata from `ResolutionResult` |
| Enrichment | Store all resolution metadata from `ResolutionResult` |
| Aggregator | Preserve provenance columns through aggregation |
| UI (future) | Can display resolution confidence badges/indicators |

### Deliverables

1. Add `resolution_source` and `resolution_confidence` columns to holdings DataFrame
2. Update `Decomposer._resolve_holdings_isins()` to store provenance
3. Update `enrich_etf_holdings()` to store provenance
4. Ensure provenance columns survive aggregation
5. Add unit tests for provenance storage
6. Update CHANGELOG.md

---

## 2. Requirements Traceability

### From `keystone/specs/identity_resolution.md` Section 8

> | Score | Meaning | Action |
> |-------|---------|--------|
> | >=0.80 | High confidence | Auto-accept |
> | 0.50-0.79 | Medium confidence | Use but flag for review |
> | <0.50 | Low confidence | Reject, log as unresolved |

### From `keystone/strategy/identity-resolution.md` Section 7

> **Confidence Scoring:**
> - Provider ISIN: 1.0
> - Local cache: 0.95
> - Hive: 0.90
> - Manual enrichments: 0.85
> - Wikidata: 0.80
> - Finnhub: 0.75
> - yFinance: 0.70

### User Story

> As a portfolio analyst, I want to see which holdings have low-confidence ISIN resolutions so I can manually verify or correct them.

---

## 3. Current Implementation Analysis

### 3.1 ResolutionResult Dataclass

**File:** `src-tauri/python/portfolio_src/data/resolution.py` (lines 53-68)

```python
@dataclass
class ResolutionResult:
    isin: Optional[str]
    status: Literal["resolved", "unresolved", "skipped"]
    detail: str
    source: Optional[str] = None      # <-- EXISTS but not stored in DataFrame
    confidence: float = 0.0           # <-- EXISTS but not stored in DataFrame
```

### 3.2 Decomposer._resolve_holdings_isins()

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py` (lines 300-318)

```python
result = self.isin_resolver.resolve(
    ticker=ticker,
    name=name,
    provider_isin=existing_isin if isinstance(existing_isin, str) else None,
    weight=weight,
)

if result.status == "resolved" and result.isin:
    holdings.at[idx, "isin"] = result.isin  # <-- Only stores ISIN
    resolved_count += 1
    source = result.source or result.detail or "unknown"
    resolution_sources[source] = resolution_sources.get(source, 0) + 1
    # NOTE: source and confidence are tracked in stats but NOT stored in DataFrame
```

**Problem:** `result.source` and `result.confidence` are used for stats but discarded.

### 3.3 enrich_etf_holdings()

**File:** `src-tauri/python/portfolio_src/core/aggregation/enrichment.py` (lines 148-161)

```python
result = resolver.resolve(
    ticker=str(ticker).strip(),
    name=str(name).strip() if name else "",
    provider_isin=str(provider_isin) if provider_isin else None,
    weight=weight,
)

# Update holdings
holdings.at[idx, "isin"] = result.isin
holdings.at[idx, "resolution_status"] = result.status
holdings.at[idx, "resolution_detail"] = result.detail
# NOTE: Missing resolution_source and resolution_confidence
```

**Problem:** Stores `status` and `detail` but not `source` and `confidence`.

### 3.4 Current DataFrame Columns

After resolution, holdings DataFrame has:

| Column | Type | Source |
|--------|------|--------|
| `isin` | str/None | `result.isin` |
| `resolution_status` | str | `result.status` |
| `resolution_detail` | str | `result.detail` |

**Missing:**

| Column | Type | Source |
|--------|------|--------|
| `resolution_source` | str/None | `result.source` |
| `resolution_confidence` | float | `result.confidence` |

---

## 4. Target Schema

### 4.1 New DataFrame Columns

| Column | Type | Description | Example Values |
|--------|------|-------------|----------------|
| `resolution_source` | str/None | API or cache that provided the ISIN | `"provider"`, `"api_finnhub"`, `"hive_ticker"`, `None` |
| `resolution_confidence` | float | Confidence score (0.0 to 1.0) | `1.0`, `0.80`, `0.75`, `0.0` |

### 4.2 Column Semantics

| Status | Source | Confidence | Meaning |
|--------|--------|------------|---------|
| `resolved` | `provider` | 1.0 | Provider-supplied ISIN (highest trust) |
| `resolved` | `manual` | 0.85 | User-provided mapping |
| `resolved` | `local_cache_ticker` | 0.95 | Found in local SQLite cache |
| `resolved` | `hive_ticker` | 0.90 | Found in Hive community DB |
| `resolved` | `api_wikidata` | 0.80 | Resolved via Wikidata SPARQL |
| `resolved` | `api_finnhub` | 0.75 | Resolved via Finnhub API |
| `resolved` | `api_yfinance` | 0.70 | Resolved via yFinance (unreliable) |
| `unresolved` | None | 0.0 | All resolution attempts failed |
| `skipped` | None | 0.0 | Tier 2 holding, not attempted |

---

## 5. Implementation Details

### 5.1 Update Decomposer._resolve_holdings_isins()

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

```python
def _resolve_holdings_isins(
    self,
    holdings: pd.DataFrame,
    etf_isin: str,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    if self.isin_resolver is None:
        logger.debug(
            f"No ISINResolver configured, skipping resolution for {etf_isin}"
        )
        return holdings, {"skipped": True}

    if holdings.empty:
        return holdings, {"total": 0, "resolved": 0, "unresolved": 0}

    if "ticker" not in holdings.columns:
        logger.warning(
            f"Holdings for {etf_isin} missing 'ticker' column, skipping resolution"
        )
        return holdings, {"skipped": True, "reason": "no_ticker_column"}

    holdings = holdings.copy()
    
    # Initialize columns
    if "isin" not in holdings.columns:
        holdings["isin"] = None
    if "resolution_status" not in holdings.columns:
        holdings["resolution_status"] = None
    if "resolution_detail" not in holdings.columns:
        holdings["resolution_detail"] = None
    # NEW: Add provenance columns
    if "resolution_source" not in holdings.columns:
        holdings["resolution_source"] = None
    if "resolution_confidence" not in holdings.columns:
        holdings["resolution_confidence"] = 0.0

    weight_col = None
    for col in ["weight", "Weight", "weight_pct", "Weight_Pct"]:
        if col in holdings.columns:
            weight_col = col
            break

    resolved_count = 0
    unresolved_count = 0
    resolution_sources: Dict[str, int] = {}

    for idx, row in holdings.iterrows():
        ticker = str(row.get("ticker", "")).strip()
        name = str(row.get("name", "")).strip()
        try:
            weight = (
                float(row[weight_col]) if weight_col and weight_col in row else 0.0
            )
        except (ValueError, TypeError):
            weight = 0.0

        existing_isin = row.get("isin")
        if (
            existing_isin
            and isinstance(existing_isin, str)
            and is_valid_isin(existing_isin)
        ):
            resolved_count += 1
            resolution_sources["existing"] = (
                resolution_sources.get("existing", 0) + 1
            )
            # Mark existing ISINs with provider confidence
            holdings.at[idx, "resolution_status"] = "resolved"
            holdings.at[idx, "resolution_detail"] = "existing"
            holdings.at[idx, "resolution_source"] = "provider"
            holdings.at[idx, "resolution_confidence"] = 1.0
            continue

        if not ticker:
            unresolved_count += 1
            holdings.at[idx, "resolution_status"] = "skipped"
            holdings.at[idx, "resolution_detail"] = "no_ticker"
            holdings.at[idx, "resolution_source"] = None
            holdings.at[idx, "resolution_confidence"] = 0.0
            continue

        result = self.isin_resolver.resolve(
            ticker=ticker,
            name=name,
            provider_isin=existing_isin if isinstance(existing_isin, str) else None,
            weight=weight,
        )

        # Store ALL resolution metadata
        holdings.at[idx, "isin"] = result.isin
        holdings.at[idx, "resolution_status"] = result.status
        holdings.at[idx, "resolution_detail"] = result.detail
        holdings.at[idx, "resolution_source"] = result.source  # NEW
        holdings.at[idx, "resolution_confidence"] = result.confidence  # NEW

        if result.status == "resolved" and result.isin:
            resolved_count += 1
            source = result.source or result.detail or "unknown"
            resolution_sources[source] = resolution_sources.get(source, 0) + 1
        elif result.status == "skipped":
            resolution_sources["tier2_skipped"] = (
                resolution_sources.get("tier2_skipped", 0) + 1
            )
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

### 5.2 Update enrich_etf_holdings()

**File:** `src-tauri/python/portfolio_src/core/aggregation/enrichment.py`

```python
def enrich_etf_holdings(
    holdings: pd.DataFrame,
    etf_market_value: float,
    threshold: float = ENRICHMENT_THRESHOLD,
    etf_isin: str = "",
    etf_name: str = "",
    etf_portfolio_weight: float = 0.0,
) -> pd.DataFrame:
    """
    Enrich equity holdings with ISIN data using tiered resolution.
    ...
    Returns:
        Holdings DataFrame with 'isin', 'resolution_status', 'resolution_detail',
        'resolution_source', 'resolution_confidence' columns
    """
    holdings = holdings.copy()
    resolver = get_resolver()

    # Check if already has valid ISIN column
    if "isin" in holdings.columns:
        has_valid = holdings["isin"].apply(
            lambda x: is_valid_isin(str(x)) if pd.notna(x) else False
        )
        if bool(has_valid.all()):
            holdings["resolution_status"] = "resolved"
            holdings["resolution_detail"] = "provider"
            holdings["resolution_source"] = "provider"  # NEW
            holdings["resolution_confidence"] = 1.0  # NEW
            return holdings

    logger.info("    - 'isin' column not found or incomplete. Running resolution...")

    # Initialize new columns
    if "isin" not in holdings.columns:
        holdings["isin"] = None
    holdings["resolution_status"] = "unresolved"
    holdings["resolution_detail"] = ""
    holdings["resolution_source"] = None  # NEW
    holdings["resolution_confidence"] = 0.0  # NEW

    # Only process equities
    if "asset_class" not in holdings.columns:
        logger.warning("    - 'asset_class' column missing. Skipping resolution.")
        return holdings

    # Process each holding
    equity_mask = holdings["asset_class"] == "Equity"

    tier1_count = 0
    tier2_count = 0
    resolved_count = 0

    for idx in holdings.index:
        row = holdings.loc[idx]

        # Skip non-equities
        if row.get("asset_class") != "Equity":
            holdings.at[idx, "resolution_status"] = "skipped"
            holdings.at[idx, "resolution_detail"] = "non_equity"
            holdings.at[idx, "resolution_source"] = None
            holdings.at[idx, "resolution_confidence"] = 0.0
            continue

        ticker = row.get("ticker", "")
        name = row.get("name", "")
        provider_isin = row.get("isin") if pd.notna(row.get("isin")) else None
        weight = float(row.get("weight_percentage", 0) or 0)

        # Skip invalid tickers
        if not ticker or not isinstance(ticker, str) or len(ticker.strip()) == 0:
            holdings.at[idx, "resolution_status"] = "skipped"
            holdings.at[idx, "resolution_detail"] = "invalid_ticker"
            holdings.at[idx, "resolution_source"] = None
            holdings.at[idx, "resolution_confidence"] = 0.0
            continue

        # Track tier stats
        if weight > threshold:
            tier1_count += 1
        else:
            tier2_count += 1

        # Resolve
        result = resolver.resolve(
            ticker=str(ticker).strip(),
            name=str(name).strip() if name else "",
            provider_isin=str(provider_isin) if provider_isin else None,
            weight=weight,
        )

        # Update holdings with ALL resolution metadata
        holdings.at[idx, "isin"] = result.isin
        holdings.at[idx, "resolution_status"] = result.status
        holdings.at[idx, "resolution_detail"] = result.detail
        holdings.at[idx, "resolution_source"] = result.source  # NEW
        holdings.at[idx, "resolution_confidence"] = result.confidence  # NEW

        if result.status == "resolved":
            resolved_count += 1

    # Log summary
    logger.info(
        f"    - Resolution: {tier1_count} Tier1 (>{threshold}%), "
        f"{tier2_count} Tier2 (<={threshold}%)"
    )
    logger.info(f"    - Resolved: {resolved_count} holdings with valid ISIN")

    # Record health metrics
    health.record_metric("tier1_holdings", tier1_count)
    health.record_metric("tier2_holdings", tier2_count)
    health.record_metric("resolved_holdings", resolved_count)

    # Log failures for Tier 1 and record gaps
    _log_tier1_failures(holdings, threshold, etf_isin, etf_name, etf_portfolio_weight)

    return holdings
```

### 5.3 Verify Aggregation Preserves Columns

**File:** `src-tauri/python/portfolio_src/core/aggregation/aggregator.py`

Check that aggregation logic preserves provenance columns. If aggregating multiple holdings with the same ISIN, use the **highest confidence** value.

```python
# In aggregation logic, when combining holdings with same ISIN:
def _aggregate_by_isin(holdings_list: List[pd.DataFrame]) -> pd.DataFrame:
    """Aggregate holdings by ISIN, preserving highest-confidence provenance."""
    combined = pd.concat(holdings_list, ignore_index=True)
    
    # Group by ISIN and aggregate
    aggregated = combined.groupby("isin", as_index=False).agg({
        "weight_percentage": "sum",
        "name": "first",
        "ticker": "first",
        "sector": "first",
        "country": "first",
        "resolution_status": "first",
        "resolution_detail": "first",
        # For provenance, take the row with highest confidence
        "resolution_source": lambda x: x.iloc[x.map(
            lambda v: combined.loc[x.index, "resolution_confidence"]
        ).idxmax()] if len(x) > 0 else None,
        "resolution_confidence": "max",  # Take highest confidence
    })
    
    return aggregated
```

**Note:** The actual aggregation logic may vary. The key requirement is that `resolution_source` and `resolution_confidence` columns are preserved through aggregation.

---

## 6. Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src-tauri/python/portfolio_src/core/services/decomposer.py` | MODIFY | Add `resolution_source`, `resolution_confidence` columns; store all `ResolutionResult` fields |
| `src-tauri/python/portfolio_src/core/aggregation/enrichment.py` | MODIFY | Add `resolution_source`, `resolution_confidence` columns; store all `ResolutionResult` fields |
| `src-tauri/python/portfolio_src/core/aggregation/aggregator.py` | VERIFY | Ensure provenance columns survive aggregation |
| `src-tauri/python/tests/test_resolution_phase4.py` | NEW | Unit tests for provenance storage |
| `CHANGELOG.md` | MODIFY | Document changes |

---

## 7. Implementation Order

```
1. Update Decomposer._resolve_holdings_isins()
   |-- Initialize resolution_source, resolution_confidence columns
   |-- Store result.source and result.confidence for each holding
   |-- Handle existing ISINs (set source="provider", confidence=1.0)
   |-- Handle skipped holdings (set source=None, confidence=0.0)

2. Update enrich_etf_holdings()
   |-- Initialize resolution_source, resolution_confidence columns
   |-- Store result.source and result.confidence for each holding
   |-- Handle all edge cases (non-equity, invalid ticker, etc.)

3. Verify aggregation preserves columns
   |-- Check aggregator.py for column handling
   |-- Ensure highest confidence is preserved when combining

4. Add unit tests
   |-- Test provenance stored for resolved holdings
   |-- Test provenance stored for unresolved holdings
   |-- Test provenance stored for skipped holdings
   |-- Test confidence values match expected per source
   |-- Test aggregation preserves provenance

5. Run full test suite
   |-- Verify no regressions
   |-- Verify Phase 2 and Phase 3 tests still pass

6. Update CHANGELOG.md
```

---

## 8. Test Plan

### 8.1 Unit Tests

**File:** `src-tauri/python/tests/test_resolution_phase4.py`

```python
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock

from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.aggregation.enrichment import enrich_etf_holdings
from portfolio_src.data.resolution import (
    ISINResolver,
    ResolutionResult,
    CONFIDENCE_PROVIDER,
    CONFIDENCE_FINNHUB,
    CONFIDENCE_WIKIDATA,
)


class TestDecomposerProvenance:
    """Test provenance storage in Decomposer."""

    def test_provenance_columns_created(self):
        """Holdings should have resolution_source and resolution_confidence columns."""
        holdings = pd.DataFrame({
            "ticker": ["NVDA", "AAPL"],
            "name": ["NVIDIA", "Apple"],
            "weight": [5.0, 3.0],
        })
        
        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US67066G1040",
            status="resolved",
            detail="api_finnhub",
            source="api_finnhub",
            confidence=0.75,
        )
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )
        
        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")
        
        assert "resolution_source" in result.columns
        assert "resolution_confidence" in result.columns

    def test_resolved_holding_has_provenance(self):
        """Resolved holdings should have source and confidence stored."""
        holdings = pd.DataFrame({
            "ticker": ["NVDA"],
            "name": ["NVIDIA"],
            "weight": [5.0],
        })
        
        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US67066G1040",
            status="resolved",
            detail="api_finnhub",
            source="api_finnhub",
            confidence=0.75,
        )
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )
        
        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")
        
        assert result.loc[0, "resolution_source"] == "api_finnhub"
        assert result.loc[0, "resolution_confidence"] == 0.75

    def test_existing_isin_has_provider_confidence(self):
        """Holdings with existing valid ISIN should have provider confidence."""
        holdings = pd.DataFrame({
            "ticker": ["NVDA"],
            "name": ["NVIDIA"],
            "isin": ["US67066G1040"],
            "weight": [5.0],
        })
        
        mock_resolver = MagicMock(spec=ISINResolver)
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )
        
        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")
        
        # Should not call resolver for existing valid ISIN
        mock_resolver.resolve.assert_not_called()
        
        assert result.loc[0, "resolution_source"] == "provider"
        assert result.loc[0, "resolution_confidence"] == 1.0

    def test_unresolved_holding_has_zero_confidence(self):
        """Unresolved holdings should have confidence 0.0."""
        holdings = pd.DataFrame({
            "ticker": ["UNKNOWN"],
            "name": ["Unknown Corp"],
            "weight": [5.0],
        })
        
        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin=None,
            status="unresolved",
            detail="api_all_failed",
            source=None,
            confidence=0.0,
        )
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )
        
        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")
        
        assert result.loc[0, "resolution_source"] is None
        assert result.loc[0, "resolution_confidence"] == 0.0

    def test_skipped_holding_has_zero_confidence(self):
        """Skipped holdings (no ticker) should have confidence 0.0."""
        holdings = pd.DataFrame({
            "ticker": [""],
            "name": ["No Ticker Corp"],
            "weight": [5.0],
        })
        
        mock_resolver = MagicMock(spec=ISINResolver)
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )
        
        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")
        
        assert result.loc[0, "resolution_status"] == "skipped"
        assert result.loc[0, "resolution_source"] is None
        assert result.loc[0, "resolution_confidence"] == 0.0


class TestEnrichmentProvenance:
    """Test provenance storage in enrichment."""

    @patch("portfolio_src.core.aggregation.enrichment.get_resolver")
    def test_enrichment_stores_provenance(self, mock_get_resolver):
        """enrich_etf_holdings should store source and confidence."""
        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US67066G1040",
            status="resolved",
            detail="api_wikidata",
            source="api_wikidata",
            confidence=0.80,
        )
        mock_get_resolver.return_value = mock_resolver
        
        holdings = pd.DataFrame({
            "ticker": ["NVDA"],
            "name": ["NVIDIA"],
            "weight_percentage": [5.0],
            "asset_class": ["Equity"],
        })
        
        result = enrich_etf_holdings(holdings, etf_market_value=1000000)
        
        assert "resolution_source" in result.columns
        assert "resolution_confidence" in result.columns
        assert result.loc[0, "resolution_source"] == "api_wikidata"
        assert result.loc[0, "resolution_confidence"] == 0.80

    @patch("portfolio_src.core.aggregation.enrichment.get_resolver")
    def test_non_equity_has_zero_confidence(self, mock_get_resolver):
        """Non-equity holdings should have confidence 0.0."""
        holdings = pd.DataFrame({
            "ticker": ["CASH"],
            "name": ["Cash"],
            "weight_percentage": [5.0],
            "asset_class": ["Cash"],
        })
        
        result = enrich_etf_holdings(holdings, etf_market_value=1000000)
        
        assert result.loc[0, "resolution_status"] == "skipped"
        assert result.loc[0, "resolution_source"] is None
        assert result.loc[0, "resolution_confidence"] == 0.0


class TestConfidenceValues:
    """Test that confidence values match spec."""

    def test_provider_confidence_is_1_0(self):
        """Provider-supplied ISIN should have confidence 1.0."""
        from portfolio_src.data.resolution import CONFIDENCE_PROVIDER
        assert CONFIDENCE_PROVIDER == 1.0

    def test_local_cache_confidence_is_0_95(self):
        """Local cache should have confidence 0.95."""
        from portfolio_src.data.resolution import CONFIDENCE_LOCAL_CACHE
        assert CONFIDENCE_LOCAL_CACHE == 0.95

    def test_hive_confidence_is_0_90(self):
        """Hive should have confidence 0.90."""
        from portfolio_src.data.resolution import CONFIDENCE_HIVE
        assert CONFIDENCE_HIVE == 0.90

    def test_wikidata_confidence_is_0_80(self):
        """Wikidata should have confidence 0.80."""
        from portfolio_src.data.resolution import CONFIDENCE_WIKIDATA
        assert CONFIDENCE_WIKIDATA == 0.80

    def test_finnhub_confidence_is_0_75(self):
        """Finnhub should have confidence 0.75."""
        from portfolio_src.data.resolution import CONFIDENCE_FINNHUB
        assert CONFIDENCE_FINNHUB == 0.75

    def test_yfinance_confidence_is_0_70(self):
        """yFinance should have confidence 0.70."""
        from portfolio_src.data.resolution import CONFIDENCE_YFINANCE
        assert CONFIDENCE_YFINANCE == 0.70
```

### 8.2 Integration Tests

```python
class TestProvenanceEndToEnd:
    """End-to-end tests for provenance flow."""

    def test_provenance_survives_full_pipeline(self):
        """Provenance should be preserved through full pipeline."""
        # This would be a larger integration test that:
        # 1. Creates mock ETF positions
        # 2. Runs decomposition with resolution
        # 3. Runs enrichment
        # 4. Runs aggregation
        # 5. Verifies provenance columns exist in final output
        pass

    def test_aggregation_preserves_highest_confidence(self):
        """When aggregating same ISIN, highest confidence should be preserved."""
        # Test that if NVDA appears in two ETFs with different confidence,
        # the aggregated result has the higher confidence value
        pass
```

---

## 9. Verification Checklist

After implementation, verify:

- [ ] `resolution_source` column added to holdings DataFrame
- [ ] `resolution_confidence` column added to holdings DataFrame
- [ ] Decomposer stores `result.source` for each holding
- [ ] Decomposer stores `result.confidence` for each holding
- [ ] Enrichment stores `result.source` for each holding
- [ ] Enrichment stores `result.confidence` for each holding
- [ ] Existing valid ISINs get `source="provider"`, `confidence=1.0`
- [ ] Unresolved holdings get `source=None`, `confidence=0.0`
- [ ] Skipped holdings get `source=None`, `confidence=0.0`
- [ ] Aggregation preserves provenance columns
- [ ] All Phase 2 and Phase 3 tests still pass
- [ ] All new Phase 4 tests pass

---

## 10. Future UI Integration

Once provenance is stored, the UI can:

1. **Show confidence badges:**
   - Green badge for confidence >= 0.80
   - Yellow badge for confidence 0.50-0.79
   - Red badge for confidence < 0.50

2. **Filter by resolution quality:**
   - "Show only low-confidence resolutions"
   - "Show only unresolved holdings"

3. **Display resolution source:**
   - Tooltip showing "Resolved via Finnhub API"
   - Icon indicating source type (API, cache, manual)

4. **Manual override workflow:**
   - User can click low-confidence holding
   - Provide correct ISIN manually
   - System stores as manual enrichment with confidence 0.85

---

## 11. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Provenance stored per holding | No | Yes |
| Confidence visible in DataFrame | No | Yes |
| Source visible in DataFrame | No | Yes |
| UI can filter by confidence | No | Enabled |

---

## 12. Next Steps After Implementation

1. **Phase 5:** Add format learning with persistence (IR-501 to IR-503)
2. **UI Integration:** Add confidence badges to holdings table
3. **Manual Override:** Allow users to correct low-confidence resolutions
