# Phase 1 Implementation Plan: Semantic Function Split

> **Parent Plan:** `keystone/plans/value-semantics-fix.md`
> **Status:** Ready for Implementation
> **Estimated Time:** 3 hours

---

## Objective

Fix the value calculation bug by introducing vectorized semantic functions that correctly distinguish between total value and per-unit price columns.

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `portfolio_src/core/utils.py` | Modify | Add 3 new functions, deprecate 1 |
| `portfolio_src/core/pipeline.py` | Modify | Use vectorized helper |
| `tests/test_utils.py` | Create/Modify | Add unit tests |

---

## Step-by-Step Implementation

### Step 1: Add `get_total_value_column()` to utils.py

**Location:** After existing `get_value_column()` function (~line 31)

```python
def get_total_value_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find column containing TOTAL position value (quantity already factored in).
    
    Use this when you need the full monetary value of a position.
    Examples: market_value, net_value, tr_value
    
    NOT for per-unit prices - use get_unit_price_column() for that.
    
    NOTE: Call this ONCE per DataFrame, not per row.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for total value, or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    for col in ["market_value", "net_value", "tr_value", "total_value"]:
        if col in normalized_df.columns:
            return col
    return None
```

### Step 2: Add `get_unit_price_column()` to utils.py

**Location:** After `get_total_value_column()`

```python
def get_unit_price_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find column containing PER-UNIT price.
    
    Use this when you need to calculate value as: quantity × price
    Examples: price, current_price, unit_price
    
    NOT for total values - use get_total_value_column() for that.
    
    NOTE: Call this ONCE per DataFrame, not per row.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for unit price, or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    # Check both "price" and "current_price" to unify pipeline/aggregator logic
    for col in ["price", "current_price", "unit_price"]:
        if col in normalized_df.columns:
            return col
    return None
```

### Step 3: Add `calculate_position_values()` to utils.py

**Location:** After `get_unit_price_column()`

```python
def calculate_position_values(df: pd.DataFrame) -> pd.Series:
    """
    Calculate total values for ALL positions in a DataFrame (VECTORIZED).
    
    Priority:
    1. If market_value column exists → use it directly
    2. Else if quantity AND price columns exist → compute quantity × price
    3. Else → return zeros with warning
    
    This is the SINGLE SOURCE OF TRUTH for position value calculation.
    
    Args:
        df: DataFrame with position data
        
    Returns:
        pd.Series of total values, indexed same as input DataFrame
    """
    if df.empty:
        return pd.Series(dtype=float)
    
    # Priority 1: Direct total value column
    value_col = get_total_value_column(df)
    if value_col and value_col in df.columns:
        return pd.to_numeric(df[value_col], errors="coerce").fillna(0.0)
    
    # Priority 2: Compute from quantity × price
    qty_col = "quantity" if "quantity" in df.columns else None
    price_col = get_unit_price_column(df)
    
    if qty_col and price_col and price_col in df.columns:
        qty = pd.to_numeric(df[qty_col], errors="coerce").fillna(0.0)
        price = pd.to_numeric(df[price_col], errors="coerce").fillna(0.0)
        
        # Warn about negative quantities (short positions)
        neg_qty_count = (qty < 0).sum()
        if neg_qty_count > 0:
            logger.warning(
                f"Found {neg_qty_count} positions with negative quantity (short positions). "
                f"Values will be negative."
            )
        
        # Warn about non-EUR currency if detected
        if "currency" in df.columns:
            non_eur = df[df["currency"].fillna("EUR").str.upper() != "EUR"]
            if not non_eur.empty:
                logger.warning(
                    f"Found {len(non_eur)} positions with non-EUR currency. "
                    f"Values may be incorrect. Currency conversion not implemented."
                )
        
        return qty * price
    
    # Priority 3: No valid columns found
    logger.warning(
        f"Cannot calculate position values. "
        f"Available columns: {list(df.columns)}. "
        f"Need market_value OR (quantity + price/current_price)."
    )
    return pd.Series(0.0, index=df.index)
```

### Step 4: Deprecate `get_value_column()`

**Location:** Modify existing function (~line 17-31)

```python
def get_value_column(df: pd.DataFrame) -> Optional[str]:
    """
    DEPRECATED: Use get_total_value_column() or get_unit_price_column().
    
    This function conflates total value and per-unit price semantics.
    Keeping for backward compatibility but will be removed in v2.0.
    
    Args:
        df: DataFrame to search
        
    Returns:
        Column name for value, or None if not found
    """
    import warnings
    warnings.warn(
        "get_value_column() is deprecated. Use get_total_value_column() "
        "or get_unit_price_column() instead.",
        DeprecationWarning,
        stacklevel=2
    )
    return get_total_value_column(df)
```

### Step 5: Update pipeline.py

**Location:** `_write_breakdown_report()` method (~line 615-670)

**Current code (buggy):**
```python
value_col = get_value_column(direct_positions)
for _, row in direct_positions.iterrows():
    # ...
    if value_col and value_col in direct_positions.columns:
        val = row.get(value_col, 0.0)
        value = float(val) if pd.notnull(val) else 0.0
    elif "quantity" in direct_positions.columns and "current_price" in direct_positions.columns:
        # fallback logic
```

**New code (fixed):**
```python
# Calculate ALL values vectorized ONCE (not per row)
position_values = calculate_position_values(direct_positions)

for idx, row in direct_positions.iterrows():
    # ...
    value = position_values[idx]  # Already computed correctly
```

**Also update imports at top of pipeline.py:**
```python
from portfolio_src.core.utils import (
    calculate_portfolio_total_value,
    calculate_position_values,  # ADD THIS
    get_weight_column,
    get_isin_column,
    get_name_column,
    get_value_column,  # Keep for now (deprecated)
    write_json_atomic,
)
```

### Step 6: Add Unit Tests

**Location:** `tests/test_utils.py` (create if doesn't exist)

```python
import pytest
import pandas as pd
import numpy as np
from portfolio_src.core.utils import (
    get_total_value_column,
    get_unit_price_column,
    calculate_position_values,
)


class TestGetTotalValueColumn:
    def test_has_market_value(self):
        df = pd.DataFrame({"isin": ["A"], "market_value": [100], "price": [10]})
        assert get_total_value_column(df) == "market_value"
    
    def test_has_net_value(self):
        df = pd.DataFrame({"isin": ["A"], "net_value": [100]})
        assert get_total_value_column(df) == "net_value"
    
    def test_only_price(self):
        df = pd.DataFrame({"isin": ["A"], "price": [10], "quantity": [5]})
        assert get_total_value_column(df) is None
    
    def test_empty_df(self):
        df = pd.DataFrame()
        assert get_total_value_column(df) is None


class TestGetUnitPriceColumn:
    def test_has_price(self):
        df = pd.DataFrame({"isin": ["A"], "price": [10], "quantity": [5]})
        assert get_unit_price_column(df) == "price"
    
    def test_has_current_price(self):
        df = pd.DataFrame({"isin": ["A"], "current_price": [10]})
        assert get_unit_price_column(df) == "current_price"
    
    def test_no_price_columns(self):
        df = pd.DataFrame({"isin": ["A"], "name": ["Test"]})
        assert get_unit_price_column(df) is None


class TestCalculatePositionValues:
    def test_bitcoin_fractional(self):
        """Core bug fix: Bitcoin 0.000231 × 74372.29 = 17.18"""
        df = pd.DataFrame({"quantity": [0.000231], "price": [74372.29]})
        result = calculate_position_values(df)
        assert abs(result.iloc[0] - 17.18) < 0.01
    
    def test_nvidia_whole_shares(self):
        """Core bug fix: NVIDIA 10.506795 × 159.84 = 1679.37"""
        df = pd.DataFrame({"quantity": [10.506795], "price": [159.84]})
        result = calculate_position_values(df)
        assert abs(result.iloc[0] - 1679.37) < 0.01
    
    def test_zero_quantity(self):
        df = pd.DataFrame({"quantity": [0], "price": [100]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 0.0
    
    def test_zero_price(self):
        df = pd.DataFrame({"quantity": [10], "price": [0]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 0.0
    
    def test_missing_price_column(self):
        df = pd.DataFrame({"quantity": [10]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 0.0
    
    def test_missing_quantity_column(self):
        df = pd.DataFrame({"price": [100]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 0.0
    
    def test_market_value_wins(self):
        """market_value takes priority over quantity × price"""
        df = pd.DataFrame({"market_value": [100], "price": [10], "quantity": [5]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 100.0  # Not 50
    
    def test_only_market_value(self):
        df = pd.DataFrame({"market_value": [500]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 500.0
    
    def test_negative_quantity(self):
        """Short positions: allow negative values"""
        df = pd.DataFrame({"quantity": [-5], "price": [100]})
        result = calculate_position_values(df)
        assert result.iloc[0] == -500.0
    
    def test_nan_values(self):
        df = pd.DataFrame({"quantity": [np.nan], "price": [100]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 0.0
    
    def test_string_values(self):
        """pd.to_numeric coercion"""
        df = pd.DataFrame({"quantity": ["10"], "price": ["100"]})
        result = calculate_position_values(df)
        assert result.iloc[0] == 1000.0
    
    def test_empty_dataframe(self):
        df = pd.DataFrame()
        result = calculate_position_values(df)
        assert len(result) == 0
    
    def test_multiple_positions(self):
        """Vectorized: all positions calculated at once"""
        df = pd.DataFrame({
            "quantity": [0.000231, 10.506795, 5],
            "price": [74372.29, 159.84, 100]
        })
        result = calculate_position_values(df)
        assert len(result) == 3
        assert abs(result.iloc[0] - 17.18) < 0.01
        assert abs(result.iloc[1] - 1679.37) < 0.01
        assert result.iloc[2] == 500.0
```

---

## Verification Steps

After implementation:

1. **Run unit tests:**
   ```bash
   cd src-tauri/python && python -m pytest tests/test_utils.py -v
   ```

2. **Run full test suite:**
   ```bash
   cd src-tauri/python && python -m pytest tests/ -v
   ```

3. **Verify with real data:**
   - Run pipeline
   - Check `holdings_breakdown.csv` for:
     - Bitcoin: `value_eur ≈ 17.18` (not 74372)
     - NVIDIA: `value_eur ≈ 1679.37` (not 159.84)

4. **Check for deprecation warnings:**
   - Grep logs for "get_value_column() is deprecated"
   - Should only appear if old code paths are hit

---

## Rollback Procedure

If something breaks:

```bash
git checkout HEAD -- src-tauri/python/portfolio_src/core/utils.py
git checkout HEAD -- src-tauri/python/portfolio_src/core/pipeline.py
```

---

## Success Criteria

- [ ] All 16 unit tests pass
- [ ] Existing test suite still passes
- [ ] Bitcoin value: €17.18 (not €74,372)
- [ ] NVIDIA value: €1,679.37 (not €159.84)
- [ ] No runtime errors in pipeline
- [ ] Deprecation warning works correctly
