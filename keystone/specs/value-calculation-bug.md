# Bug Report: Position Value Calculation Error

> **Severity:** Critical
> **Reported:** 2025-12-28
> **GitHub Issues:** #36, #37
> **Status:** Root Cause Identified

---

## Summary

Direct holdings display incorrect values in the UI. Per-unit prices are being used as total position values instead of calculating `quantity × price`.

## Symptoms

| Asset | User Owns | Per-Unit Price | Expected Value | Displayed Value | Error |
|-------|-----------|----------------|----------------|-----------------|-------|
| Bitcoin | 0.000231 BTC | €74,372.29 | €17.18 | €74,372.29 | 4,330x overvalued |
| NVIDIA | 10.506795 shares | €159.84 | €1,679.37 | €159.84 | 10.5x undervalued |

## Root Cause Analysis

### The Bug Location

**File:** `src-tauri/python/portfolio_src/core/utils.py` (line 28)

```python
def get_value_column(df: pd.DataFrame) -> Optional[str]:
    normalized_df = SchemaNormalizer.normalize_columns(df)
    for col in ["market_value", "price"]:  # ← BUG: "price" is per-unit, not total
        if col in normalized_df.columns:
            return col
    return None
```

### The Problem

This function conflates two semantically different concepts:

| Column | Semantic Meaning | Unit |
|--------|------------------|------|
| `market_value` | Total position value | € (quantity already factored in) |
| `price` | Per-unit price | € per share/unit |

By returning `price` as a "value column", the function tells callers "this is the total value" when it's actually the per-unit price.

### The Cascade

1. `direct_holdings_report.csv` has columns: `quantity=0.000231, price=74372.29`
2. `get_value_column()` returns `"price"` as the value column
3. `pipeline.py` line 627 uses this directly: `value = row.get(value_col)`
4. `holdings_breakdown.csv` gets `value_eur=74372.29` (wrong!)
5. UI displays €74,372.29 instead of €17.18

### Why Fallback Logic Never Executes

The pipeline has correct fallback logic (lines 629-643):
```python
elif "quantity" in direct_positions.columns and "current_price" in direct_positions.columns:
    value = qty * price  # ← CORRECT calculation
```

But this **never executes** because `get_value_column()` returns `"price"` first, satisfying the `if` condition.

---

## Evidence

### Data from `direct_holdings_report.csv`:
```csv
isin,quantity,price,name
XF000BTC0017,0.000231,74372.29437229437,Bitcoin
US67066G1040,10.506795,159.8403699701003,NVIDIA
```

### Data from `holdings_breakdown.csv` (incorrect):
```csv
parent_isin,child_isin,child_name,value_eur
DIRECT,XF000BTC0017,Bitcoin,74372.29437229437  # Should be 17.18
DIRECT,US67066G1040,NVIDIA,159.8403699701003   # Should be 1679.37
```

---

## Affected Code Paths

| File | Line | Usage | Impact |
|------|------|-------|--------|
| `pipeline.py` | 618 | `value_col = get_value_column(direct_positions)` | **BROKEN** - uses price as value |
| `aggregator.py` | 182 | `value_col = get_value_column(direct_positions)` | OK - has explicit `market_value` check |
| `aggregator.py` | 253 | `value_col = get_value_column(etf_positions)` | OK - ETFs have different columns |

---

## Related Observations

1. **Inconsistent handling:** `aggregator.py` already knows `price` needs multiplication (lines 209-233)
2. **No formal schema contract:** Different data sources provide different columns
3. **Column sniffing pattern:** Each function guesses column semantics independently

---

## Recommended Fix

See: `keystone/plans/value-semantics-fix.md`
