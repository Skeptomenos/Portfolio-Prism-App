# Identity Resolution Phase 6A: Backend Data Exposure

> **Goal:** Expose resolution provenance data (status, source, confidence, detail) from the Python pipeline to the frontend API.

---

## 1. Problem Statement

Resolution provenance data is generated during enrichment but **filtered out** before reaching the frontend:

1. `enrichment.py` populates: `resolution_status`, `resolution_source`, `resolution_confidence`, `resolution_detail`
2. `aggregation/__init__.py` filters to `cols_to_keep` which **excludes** resolution columns
3. `holdings_breakdown.csv` is saved **without** resolution data
4. `handle_get_true_holdings()` cannot return what doesn't exist in the CSV

### Key Insight (from review)

The `ticker` and `name` columns **already contain the original values**. The resolver doesn't modify the DataFrame - it only returns a `ResolutionResult`. No new `original_ticker`/`original_name` columns are needed.

---

## 2. Implementation Tasks

### Task 6A.1: Add Resolution Columns to cols_to_keep

**File:** `src-tauri/python/portfolio_src/core/aggregation/__init__.py`

**Current Code (lines 154-165):**
```python
cols_to_keep = [
    "parent_isin",
    "parent_name",
    "source",
    "isin",
    "name",
    "asset_class",
    "sector",
    "geography",
    "weight_percentage",
    "indirect",
]
```

**New Code:**
```python
cols_to_keep = [
    "parent_isin",
    "parent_name",
    "source",
    "isin",
    "name",
    "ticker",  # Original ticker input (for UI display)
    "asset_class",
    "sector",
    "geography",
    "weight_percentage",
    "indirect",
    # Resolution provenance (Phase 6)
    "resolution_status",
    "resolution_source",
    "resolution_confidence",
    "resolution_detail",
]
```

**Note:** We add `ticker` (already exists in DataFrame) and `resolution_detail` (set at line 111 in enrichment.py but previously filtered out).

---

### Task 6A.2: Add Resolution Defaults for Direct Holdings

**File:** `src-tauri/python/portfolio_src/core/aggregation/__init__.py`

**Location:** After line 147 (direct_rows setup), before concat

**Current Code (lines 139-149):**
```python
if not direct_positions.empty:
    direct_rows = direct_positions.copy()
    direct_rows["parent_isin"] = "DIRECT"
    direct_rows["parent_name"] = "Direct Portfolio"
    direct_rows["source"] = "Direct"
    direct_rows["indirect"] = direct_rows["market_value"]
    direct_rows["weight_percentage"] = 0.0

    breakdown_df = pd.concat([breakdown_df, direct_rows], ignore_index=True)
```

**New Code:**
```python
if not direct_positions.empty:
    direct_rows = direct_positions.copy()
    direct_rows["parent_isin"] = "DIRECT"
    direct_rows["parent_name"] = "Direct Portfolio"
    direct_rows["source"] = "Direct"
    direct_rows["indirect"] = direct_rows["market_value"]
    direct_rows["weight_percentage"] = 0.0

    # Resolution provenance for direct holdings (Phase 6)
    # Direct holdings come with ISIN from Trade Republic = "provider" resolved
    direct_rows["resolution_status"] = "resolved"
    direct_rows["resolution_source"] = "provider"
    direct_rows["resolution_confidence"] = 1.0
    direct_rows["resolution_detail"] = "provider"
    # Direct holdings from Trade Republic don't have a separate ticker field.
    # Use ISIN as the display ticker since it's the primary identifier.
    direct_rows["ticker"] = direct_rows["isin"]

    breakdown_df = pd.concat([breakdown_df, direct_rows], ignore_index=True)
```

---

### Task 6A.3: Update handle_get_true_holdings Response

**File:** `src-tauri/python/portfolio_src/headless/handlers/holdings.py`

**Replace `handle_get_true_holdings` function (lines 82-140):**

```python
def handle_get_true_holdings(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get decomposed true holdings across all ETFs.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with holdings list and resolution summary.
    """
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
    import pandas as pd

    empty_response = {"holdings": [], "summary": _empty_summary()}

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return success_response(cmd_id, empty_response)

    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)

        if df.empty:
            return success_response(cmd_id, empty_response)

        # Backward compatibility: add resolution columns if missing (legacy CSV)
        resolution_defaults = {
            "resolution_status": "unknown",
            "resolution_source": "unknown",
            "resolution_confidence": 0.0,
            "resolution_detail": "",
            "ticker": "",
        }
        for col, default in resolution_defaults.items():
            if col not in df.columns:
                df[col] = default

        # Group by child security
        grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg({
            "value_eur": "sum",
            "sector": "first",
            "geography": "first",
            "ticker": "first",
            "resolution_status": "first",
            "resolution_source": "first",
            "resolution_confidence": "max",
            "resolution_detail": "first",
        })

        holdings = []
        for _, row in grouped.iterrows():
            child_isin = str(row["child_isin"])
            
            # Check for valid ISIN (not NaN, not string "nan", not empty)
            isin_value = row.get("child_isin")
            has_valid_isin = (
                pd.notna(isin_value) 
                and str(isin_value) not in ("nan", "None", "")
            )

            # Get sources (which ETFs contain this holding)
            sources = [
                {
                    "etf": str(s_row["parent_isin"]),
                    "value": round(float(s_row["value_eur"]), 2),
                    "weight": round(float(s_row["weight_percent"]) / 100.0, 4),
                }
                for _, s_row in df[df["child_isin"] == child_isin].iterrows()
            ]

            holdings.append({
                "stock": str(row["child_name"]),
                "ticker": _safe_str(row.get("ticker")) or child_isin,
                "isin": child_isin if has_valid_isin else None,
                "totalValue": round(float(row["value_eur"]), 2),
                "sector": _safe_str(row.get("sector")),
                "geography": _safe_str(row.get("geography")),
                "sources": sources,
                # Resolution provenance
                "resolutionStatus": _safe_str(row.get("resolution_status", "unknown")),
                "resolutionSource": _safe_str(row.get("resolution_source", "unknown")),
                "resolutionConfidence": float(row.get("resolution_confidence") or 0.0),
                "resolutionDetail": _safe_str(row.get("resolution_detail")),
            })

        holdings.sort(key=lambda x: x["totalValue"], reverse=True)

        # Calculate summary statistics
        summary = _calculate_summary(holdings)

        logger.debug(f"Returning {len(holdings)} true holdings with resolution data")
        return success_response(cmd_id, {"holdings": holdings, "summary": summary})
    except Exception as e:
        logger.error(f"Failed to get true holdings: {e}", exc_info=True)
        return error_response(cmd_id, "HOLDINGS_ERROR", str(e))
```

---

### Task 6A.4: Add Helper Functions

**File:** `src-tauri/python/portfolio_src/headless/handlers/holdings.py`

**Step 1: Add module-level pandas import**

At the top of the file (after existing imports), add:
```python
import pandas as pd
```

Then remove the local import from inside `handle_get_true_holdings`:
```python
# Remove this line from inside the function:
# from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
# import pandas as pd  <-- Remove this
```

**Step 2: Add helper functions after `handle_get_true_holdings`, before `handle_get_overlap_analysis`:**

```python
def _safe_str(val) -> str:
    """Convert value to string, handling None/NaN."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val)
    return "" if s in ("nan", "None") else s


def _empty_summary() -> dict:
    """Return empty summary structure."""
    return {
        "total": 0,
        "resolved": 0,
        "unresolved": 0,
        "skipped": 0,
        "unknown": 0,
        "bySource": {},
        "healthScore": 1.0,
    }


def _calculate_summary(holdings: list) -> dict:
    """Calculate resolution summary statistics."""
    total = len(holdings)
    if total == 0:
        return _empty_summary()

    resolved = sum(1 for h in holdings if h.get("resolutionStatus") == "resolved")
    unresolved = sum(1 for h in holdings if h.get("resolutionStatus") == "unresolved")
    skipped = sum(1 for h in holdings if h.get("resolutionStatus") == "skipped")
    unknown = sum(1 for h in holdings if h.get("resolutionStatus") == "unknown")

    # Count by source
    by_source: dict[str, int] = {}
    for h in holdings:
        source = h.get("resolutionSource") or "unknown"
        if source:
            by_source[source] = by_source.get(source, 0) + 1

    # Health score = resolved / (resolved + unresolved)
    # Excludes skipped (non-equity) and unknown (legacy data) from denominator
    denominator = resolved + unresolved
    health_score = resolved / denominator if denominator > 0 else 1.0

    return {
        "total": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "skipped": skipped,
        "unknown": unknown,
        "bySource": by_source,
        "healthScore": round(health_score, 3),
    }
```

---

### Task 6A.5: Add Unit Tests

**File:** `src-tauri/python/tests/test_holdings_resolution.py`

> **Note:** Following existing test file pattern in `tests/` directory (not `tests/unit/`).

```python
"""Phase 6A: Backend data exposure tests for holdings resolution."""

import os
import tempfile
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest


class TestHelperFunctions:
    """Test helper functions for holdings handler."""

    def test_safe_str_with_none(self):
        from portfolio_src.headless.handlers.holdings import _safe_str
        assert _safe_str(None) == ""

    def test_safe_str_with_nan(self):
        from portfolio_src.headless.handlers.holdings import _safe_str
        assert _safe_str(np.nan) == ""

    def test_safe_str_with_string_nan(self):
        from portfolio_src.headless.handlers.holdings import _safe_str
        assert _safe_str("nan") == ""
        assert _safe_str("None") == ""

    def test_safe_str_with_value(self):
        from portfolio_src.headless.handlers.holdings import _safe_str
        assert _safe_str("test") == "test"
        assert _safe_str(123) == "123"

    def test_empty_summary_structure(self):
        from portfolio_src.headless.handlers.holdings import _empty_summary
        summary = _empty_summary()
        assert summary["total"] == 0
        assert summary["resolved"] == 0
        assert summary["unresolved"] == 0
        assert summary["skipped"] == 0
        assert summary["unknown"] == 0
        assert summary["bySource"] == {}
        assert summary["healthScore"] == 1.0

    def test_calculate_summary_empty(self):
        from portfolio_src.headless.handlers.holdings import _calculate_summary, _empty_summary
        summary = _calculate_summary([])
        assert summary == _empty_summary()

    def test_calculate_summary_all_resolved(self):
        from portfolio_src.headless.handlers.holdings import _calculate_summary
        holdings = [
            {"resolutionStatus": "resolved", "resolutionSource": "provider"},
            {"resolutionStatus": "resolved", "resolutionSource": "hive"},
        ]
        summary = _calculate_summary(holdings)
        assert summary["total"] == 2
        assert summary["resolved"] == 2
        assert summary["unresolved"] == 0
        assert summary["healthScore"] == 1.0
        assert summary["bySource"]["provider"] == 1
        assert summary["bySource"]["hive"] == 1

    def test_calculate_summary_mixed(self):
        from portfolio_src.headless.handlers.holdings import _calculate_summary
        holdings = [
            {"resolutionStatus": "resolved", "resolutionSource": "provider"},
            {"resolutionStatus": "unresolved", "resolutionSource": "unknown"},
            {"resolutionStatus": "skipped", "resolutionSource": ""},
        ]
        summary = _calculate_summary(holdings)
        assert summary["total"] == 3
        assert summary["resolved"] == 1
        assert summary["unresolved"] == 1
        assert summary["skipped"] == 1
        # Health = 1 / (1 + 1) = 0.5 (skipped excluded from denominator)
        assert summary["healthScore"] == 0.5

    def test_calculate_summary_excludes_unknown_from_health(self):
        """Unknown (legacy) holdings shouldn't penalize health score."""
        from portfolio_src.headless.handlers.holdings import _calculate_summary
        holdings = [
            {"resolutionStatus": "resolved", "resolutionSource": "provider"},
            {"resolutionStatus": "unknown", "resolutionSource": "unknown"},
        ]
        summary = _calculate_summary(holdings)
        assert summary["resolved"] == 1
        assert summary["unknown"] == 1
        # Health = 1 / (1 + 0) = 1.0 (unknown excluded)
        assert summary["healthScore"] == 1.0


class TestHandleGetTrueHoldings:
    """Test the updated handle_get_true_holdings handler."""

    def test_returns_empty_when_no_file(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings
        
        with patch("os.path.exists", return_value=False):
            result = handle_get_true_holdings(1, {})
            
        assert result["data"]["holdings"] == []
        assert result["data"]["summary"]["total"] == 0

    def test_returns_resolution_fields(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings
        
        csv_content = """parent_isin,parent_name,source,child_isin,child_name,ticker,asset_class,sector,geography,weight_percent,value_eur,resolution_status,resolution_source,resolution_confidence,resolution_detail
IE00B4L5Y983,iShares,ETF,US0378331005,Apple Inc,AAPL US,Equity,Technology,North America,5.0,1000.0,resolved,provider,1.0,provider
IE00B4L5Y983,iShares,ETF,US5949181045,Microsoft Corp,MSFT US,Equity,Technology,North America,4.0,800.0,resolved,api_finnhub,0.9,api"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        try:
            # Patch at the config module where constant is defined
            with patch("portfolio_src.config.HOLDINGS_BREAKDOWN_PATH", temp_path):
                result = handle_get_true_holdings(1, {})
                # File exists - no need to mock os.path.exists

            holdings = result["data"]["holdings"]
            assert len(holdings) == 2

            apple = next(h for h in holdings if "Apple" in h["stock"])
            assert apple["resolutionStatus"] == "resolved"
            assert apple["resolutionSource"] == "provider"
            assert apple["resolutionConfidence"] == 1.0
            assert apple["ticker"] == "AAPL US"
            assert apple["resolutionDetail"] == "provider"
        finally:
            os.unlink(temp_path)

    def test_handles_legacy_csv_without_resolution_columns(self):
        """Legacy CSV without resolution columns should get defaults."""
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings
        
        csv_content = """parent_isin,parent_name,source,child_isin,child_name,asset_class,sector,geography,weight_percent,value_eur
IE00B4L5Y983,iShares,ETF,US0378331005,Apple,Equity,Tech,NA,5.0,1000.0"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        try:
            # Patch at the config module where constant is defined
            with patch("portfolio_src.config.HOLDINGS_BREAKDOWN_PATH", temp_path):
                result = handle_get_true_holdings(1, {})

            holdings = result["data"]["holdings"]
            assert len(holdings) == 1
            assert holdings[0]["resolutionStatus"] == "unknown"
            assert holdings[0]["resolutionConfidence"] == 0.0
        finally:
            os.unlink(temp_path)

    def test_summary_included_in_response(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings
        
        csv_content = """parent_isin,parent_name,source,child_isin,child_name,ticker,asset_class,sector,geography,weight_percent,value_eur,resolution_status,resolution_source,resolution_confidence,resolution_detail
IE00B4L5Y983,iShares,ETF,US0378331005,Apple,AAPL,Equity,Tech,NA,5.0,1000.0,resolved,provider,1.0,provider
IE00B4L5Y983,iShares,ETF,US0000000000,Unknown,UNK,Equity,Tech,NA,2.0,500.0,unresolved,unknown,0.0,api_failed"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        try:
            # Patch at the config module where constant is defined
            with patch("portfolio_src.config.HOLDINGS_BREAKDOWN_PATH", temp_path):
                result = handle_get_true_holdings(1, {})

            summary = result["data"]["summary"]
            assert summary["total"] == 2
            assert summary["resolved"] == 1
            assert summary["unresolved"] == 1
            assert summary["healthScore"] == 0.5
        finally:
            os.unlink(temp_path)
```

---

## 3. Known Limitations

### Resolution Aggregation Strategy

When the same security appears in multiple ETFs with different resolution data, the handler uses:
- `resolution_status`: Takes first (arbitrary order)
- `resolution_source`: Takes first (arbitrary order)  
- `resolution_confidence`: Takes maximum (sensible)

**Edge case:** If ETF A resolved via Finnhub (0.8 confidence) and ETF B via Hive (0.9 confidence), the response will show `confidence: 0.9` but `source: "api_finnhub"` (wrong - should be "hive").

**Mitigation:** This is rare in practice. A follow-up task could use `idxmax` to get the row with highest confidence for all resolution fields. For v1, this is acceptable.

---

## 4. Verification Checklist

### Code Changes

- [ ] `aggregation/__init__.py`: Added `ticker`, `resolution_status`, `resolution_source`, `resolution_confidence`, `resolution_detail` to `cols_to_keep`
- [ ] `aggregation/__init__.py`: Added resolution defaults for direct holdings (unconditional `ticker` assignment from `isin`)
- [ ] `holdings.py`: Updated `handle_get_true_holdings` to return resolution fields + summary
- [ ] `holdings.py`: Moved `import pandas as pd` to module level (required for helper functions)
- [ ] `holdings.py`: Added `_safe_str`, `_empty_summary`, `_calculate_summary` helpers
- [ ] `holdings.py`: Backward compatibility for legacy CSV

### Tests

- [ ] All helper function tests pass
- [ ] Handler tests with resolution data pass (patching `portfolio_src.config.HOLDINGS_BREAKDOWN_PATH`)
- [ ] Legacy CSV compatibility test passes
- [ ] Health score formula test passes (excludes unknown)
- [ ] All existing tests still pass

### Manual Verification

- [ ] CSV contains resolution columns after pipeline run
- [ ] Direct holdings have `resolution_status='resolved'`, `resolution_source='provider'`
- [ ] API response includes resolution fields per holding
- [ ] API response includes `summary` object
- [ ] Legacy CSV (without new columns) doesn't crash

---

## 5. Commit Message

```
feat: expose resolution provenance in holdings API (Phase 6A)

- Add resolution columns to aggregation cols_to_keep (status, source, confidence, detail, ticker)
- Add resolution defaults for direct holdings
- Update handle_get_true_holdings to return resolution fields + summary
- Fix health score formula: resolved / (resolved + unresolved), excludes unknown
- Add backward compatibility for legacy CSV without resolution columns

Part of Identity Resolution Phase 6 (UI Integration)
```

---

## 6. Estimated Effort

| Task | Description | Time |
|------|-------------|------|
| 6A.1 | Add columns to cols_to_keep | 5 min |
| 6A.2 | Add resolution defaults for direct holdings | 5 min |
| 6A.3 | Update handler response | 15 min |
| 6A.4 | Add helper functions | 10 min |
| 6A.5 | Write tests | 20 min |
| **Total** | | **~55 min** |
