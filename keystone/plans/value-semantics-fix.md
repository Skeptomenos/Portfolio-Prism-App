# Fix Plan: Value Semantics & Data Integrity

> **Related Bug:** `keystone/specs/value-calculation-bug.md`
> **Strategy:** `keystone/strategy/data-integrity-architecture.md`
> **GitHub Issues:** #36, #37
> **Created:** 2025-12-28
> **Status:** Approved for Implementation

---

## Problem Statement

The function `get_value_column()` conflates two semantically different concepts:
- **Total value** (e.g., `market_value`) — quantity already factored in
- **Per-unit price** (e.g., `price`) — requires multiplication by quantity

This causes position values to be displayed incorrectly (Bitcoin shows €74k instead of €17).

---

## Solution: Three-Phase Defense

### Confidence Definition

| Level | Meaning | Measurement |
|-------|---------|-------------|
| 70% | Manual testing only | Current state |
| 85% | Unit tests cover happy path + edge cases | Phase 1 complete |
| 90% | Adapters validated, schema enforced at ingestion | Phase 2 complete |
| 95% | Database constraints + integration tests + real data | Phase 3 complete |

### Confidence Progression

| Phase | Scope | Confidence | Timeline |
|-------|-------|------------|----------|
| Phase 1 | Semantic function split (vectorized) | 70% → 85% | This week |
| Phase 2 | Canonical position model + adapters | 85% → 90% | Next week |
| Phase 3 | SQLite storage with constraints | 90% → 95% | Week 3 |

---

## Phase 1: Immediate Fix + Semantic Split (Vectorized)

**Goal:** Fix the bug using vectorized Pandas operations. No row-by-row iteration.

### 1.1 New Functions in `utils.py`

```python
def get_total_value_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find column containing TOTAL position value (quantity already factored in).
    
    Use this when you need the full monetary value of a position.
    Examples: market_value, net_value, tr_value
    
    NOT for per-unit prices - use get_unit_price_column() for that.
    
    NOTE: Call this ONCE per DataFrame, not per row.
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    for col in ["market_value", "net_value", "tr_value", "total_value"]:
        if col in normalized_df.columns:
            return col
    return None


def get_unit_price_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find column containing PER-UNIT price.
    
    Use this when you need to calculate value as: quantity × price
    Examples: price, current_price, unit_price
    
    NOT for total values - use get_total_value_column() for that.
    
    NOTE: Call this ONCE per DataFrame, not per row.
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    # Check both "price" and "current_price" to unify pipeline/aggregator logic
    for col in ["price", "current_price", "unit_price"]:
        if col in normalized_df.columns:
            return col
    return None


def calculate_position_values(df: pd.DataFrame) -> pd.Series:
    """
    Calculate total values for ALL positions in a DataFrame (VECTORIZED).
    
    Priority:
    1. If market_value column exists → use it directly
    2. Else if quantity AND price columns exist → compute quantity × price
    3. Else → return zeros with warning
    
    This is the SINGLE SOURCE OF TRUTH for position value calculation.
    
    Args:
        df: DataFrame with position data (must be normalized first)
        
    Returns:
        pd.Series of total values, indexed same as input DataFrame
    """
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
        return qty * price
    
    # Priority 3: No valid columns found
    logger.warning(
        f"Cannot calculate position values. "
        f"Available columns: {list(df.columns)}. "
        f"Need market_value OR (quantity + price/current_price)."
    )
    return pd.Series(0.0, index=df.index)
```

### 1.2 Deprecate Old Function

```python
def get_value_column(df: pd.DataFrame) -> Optional[str]:
    """
    DEPRECATED: Use get_total_value_column() or get_unit_price_column().
    
    This function conflates total value and per-unit price semantics.
    Keeping for backward compatibility but will be removed in v2.0.
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

### 1.3 Update Pipeline (Vectorized)

**Before (pipeline.py ~line 620):**
```python
value_col = get_value_column(direct_positions)
for _, row in direct_positions.iterrows():
    if value_col and value_col in direct_positions.columns:
        value = float(row.get(value_col, 0.0))  # BUG: uses price directly
    # ... rest of loop
```

**After:**
```python
# Normalize ONCE at the start
normalized_positions = SchemaNormalizer.normalize_columns(direct_positions)

# Calculate ALL values vectorized (no loop needed for value calculation)
position_values = calculate_position_values(normalized_positions)

# Use in loop (value already computed)
for idx, row in normalized_positions.iterrows():
    value = position_values[idx]
    # ... rest of loop
```

### 1.4 Currency Warning

Add to `calculate_position_values()`:
```python
# Warn if non-EUR currency detected
if "currency" in df.columns:
    non_eur = df[df["currency"].str.upper() != "EUR"]
    if not non_eur.empty:
        logger.warning(
            f"Found {len(non_eur)} positions with non-EUR currency. "
            f"Values may be incorrect. Currency conversion not implemented."
        )
```

---

## Phase 1 Test Specification

### Unit Tests for `calculate_position_values()`

| Test Case | Input DataFrame | Expected Output | Notes |
|-----------|-----------------|-----------------|-------|
| Bitcoin fractional | `qty=0.000231, price=74372.29` | `17.18` | Core bug fix |
| NVIDIA whole shares | `qty=10.506795, price=159.84` | `1679.37` | Core bug fix |
| Zero quantity | `qty=0, price=100` | `0.0` | Edge case |
| Zero price | `qty=10, price=0` | `0.0` | Edge case |
| Missing price column | `qty=10, price=None` | `0.0` | Graceful degradation |
| Missing quantity column | `qty=None, price=100` | `0.0` | Graceful degradation |
| Both market_value AND price | `market_value=100, price=10, qty=5` | `100.0` | market_value wins |
| Only market_value | `market_value=500` | `500.0` | Direct value |
| Negative quantity | `qty=-5, price=100` | `-500.0` | Allow (short positions); log warning |
| NaN values | `qty=NaN, price=100` | `0.0` | fillna behavior |
| String values | `qty="10", price="100"` | `1000.0` | pd.to_numeric coercion |
| Empty DataFrame | `pd.DataFrame()` | Empty Series | No crash |
| Non-EUR currency | `qty=10, price=100, currency="USD"` | `1000.0` + warning | Log warning |

### Unit Tests for Column Finders

| Test Case | Input Columns | Function | Expected |
|-----------|---------------|----------|----------|
| Has market_value | `["isin", "market_value", "price"]` | `get_total_value_column` | `"market_value"` |
| Has net_value | `["isin", "net_value"]` | `get_total_value_column` | `"net_value"` |
| Only price | `["isin", "price", "quantity"]` | `get_total_value_column` | `None` |
| Has price | `["isin", "price", "quantity"]` | `get_unit_price_column` | `"price"` |
| Has current_price | `["isin", "current_price"]` | `get_unit_price_column` | `"current_price"` |
| No price columns | `["isin", "name"]` | `get_unit_price_column` | `None` |

---

## Rollback Plan

If Phase 1 breaks something:

1. **Immediate:** `git revert <commit-sha>` on `fix/pipeline-tuning` branch
2. **Redeploy:** Previous working version
3. **Re-open:** GitHub issues #36, #37
4. **Post-mortem:** Document what broke and why

**Rollback triggers:**
- Pipeline crashes on startup
- Test suite fails (existing tests, not new ones)
- User reports new incorrect values
- Build fails

---

## Phase 1 Tasks

| Task ID | Title | Priority | Estimate | Status |
|---------|-------|----------|----------|--------|
| TASK-801 | Add `get_total_value_column()` to utils.py | High | 15 min | Open |
| TASK-802 | Add `get_unit_price_column()` to utils.py | High | 15 min | Open |
| TASK-803 | Add `calculate_position_values()` (vectorized) | High | 30 min | Open |
| TASK-804 | Deprecate `get_value_column()` with warning | Medium | 10 min | Open |
| TASK-805 | Update pipeline.py to use vectorized helper | High | 45 min | Open |
| TASK-806 | Add unit tests (see test spec above) | High | 60 min | Open |
| TASK-807 | Verify fix with real data (Bitcoin, NVIDIA) | High | 15 min | Open |
| TASK-808 | Close GitHub issues #36, #37 | High | 5 min | Open |

**Total estimate:** ~3 hours

**Dependency order:** 801 + 802 → 803 → 805 → 806 → 807 → 808 (804 can be parallel)

### Implementation Notes

Code snippets in this plan show logic, not boilerplate. When implementing, add:

```python
# Required imports for utils.py additions
from typing import Optional
import pandas as pd
from portfolio_src.core.utils import SchemaNormalizer
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)
```

**Decisions made:**
- Negative quantity: **Allow** (returns negative value, logs warning) — supports short positions
- Both market_value AND price present: **market_value wins** (priority 1)
- Missing columns: **Return 0.0 with warning** (graceful degradation)

---

## Phase 2: Canonical Position Model

**Goal:** Single source of truth for position representation. All data sources normalized before pipeline.

### Key Design Decision

> **Use CanonicalPosition as Ingestion DTO only.**
> 
> Convert: `Source → [CanonicalPosition] → DataFrame`
> 
> The pipeline continues to operate on DataFrames for performance (vectorized operations).
> The CanonicalPosition guarantees the DataFrame adheres to canonical schema.

### 2.1 Canonical Position Dataclass

```python
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime
from typing import List, Optional

@dataclass
class CanonicalPosition:
    """Ingestion DTO - validates and normalizes source data.
    
    Convert to DataFrame immediately after validation for pipeline processing.
    """
    isin: str
    name: str
    quantity: Decimal
    unit_price: Decimal
    currency: str = "EUR"
    source: str = "unknown"
    timestamp: Optional[datetime] = None
    
    @property
    def market_value(self) -> Decimal:
        """Computed property - CANNOT be set directly."""
        return self.quantity * self.unit_price
    
    def validate(self) -> List[str]:
        """Returns list of validation errors, empty if valid."""
        errors = []
        if len(self.isin) != 12:
            errors.append(f"Invalid ISIN length: {len(self.isin)}")
        if not self.isin[:2].isalpha():
            errors.append(f"ISIN must start with 2 letters: {self.isin}")
        if self.quantity < 0:
            errors.append(f"Negative quantity: {self.quantity}")
        if self.unit_price < 0:
            errors.append(f"Negative price: {self.unit_price}")
        return errors
    
    def to_dict(self) -> dict:
        """Convert to dict for DataFrame construction."""
        return {
            "isin": self.isin,
            "name": self.name,
            "quantity": float(self.quantity),
            "price": float(self.unit_price),  # Canonical name
            "market_value": float(self.market_value),
            "currency": self.currency,
            "source": self.source,
        }


def positions_to_dataframe(positions: List[CanonicalPosition]) -> pd.DataFrame:
    """Convert validated positions to DataFrame for pipeline processing."""
    if not positions:
        return pd.DataFrame()
    return pd.DataFrame([p.to_dict() for p in positions])
```

### 2.2 Source Adapters

```python
class TradeRepublicAdapter:
    """Transforms TR API response to canonical positions."""
    
    def normalize(self, raw_positions: List[dict]) -> List[CanonicalPosition]:
        result = []
        for pos in raw_positions:
            try:
                canonical = CanonicalPosition(
                    isin=pos["instrumentId"],
                    name=pos.get("name", "Unknown"),
                    quantity=Decimal(str(pos["netSize"])),
                    unit_price=Decimal(str(pos["currentPrice"])),
                    currency="EUR",
                    source="trade_republic",
                    timestamp=datetime.now(),
                )
                errors = canonical.validate()
                if errors:
                    logger.warning(f"Validation errors for {pos['instrumentId']}: {errors}")
                    continue
                result.append(canonical)
            except (KeyError, ValueError, InvalidOperation) as e:
                logger.error(f"Failed to parse TR position: {e}")
                continue
        return result


class ManualCSVAdapter:
    """Transforms user-uploaded CSV to canonical positions."""
    
    # Explicit column semantics
    QUANTITY_COLUMNS = ["quantity", "qty", "shares", "units", "amount"]
    PRICE_COLUMNS = ["price", "unit_price", "share_price", "current_price"]
    VALUE_COLUMNS = ["value", "market_value", "total", "total_value"]
    
    def normalize(
        self, 
        df: pd.DataFrame, 
        column_mapping: Optional[dict] = None
    ) -> List[CanonicalPosition]:
        """
        Normalize CSV to canonical positions.
        
        Args:
            df: Raw CSV DataFrame
            column_mapping: Optional explicit mapping from user (from UI)
                           e.g., {"Anzahl": "quantity", "Kurs": "price"}
        """
        # Apply user mapping if provided
        if column_mapping:
            df = df.rename(columns=column_mapping)
        
        # Normalize column names
        df.columns = [c.lower().strip() for c in df.columns]
        
        # Find columns
        qty_col = self._find_column(df, self.QUANTITY_COLUMNS)
        price_col = self._find_column(df, self.PRICE_COLUMNS)
        value_col = self._find_column(df, self.VALUE_COLUMNS)
        isin_col = self._find_column(df, ["isin"])
        name_col = self._find_column(df, ["name", "security", "instrument"])
        
        if not isin_col:
            raise ValueError("CSV must have an ISIN column")
        
        result = []
        for _, row in df.iterrows():
            try:
                isin = str(row[isin_col]).strip().upper()
                name = str(row.get(name_col, "Unknown")) if name_col else "Unknown"
                
                # Determine quantity and price
                if qty_col and price_col:
                    quantity = Decimal(str(row[qty_col]))
                    unit_price = Decimal(str(row[price_col]))
                elif qty_col and value_col:
                    # User provided total value, derive unit price
                    quantity = Decimal(str(row[qty_col]))
                    total_value = Decimal(str(row[value_col]))
                    unit_price = total_value / quantity if quantity > 0 else Decimal("0")
                elif value_col:
                    # Only value provided, assume quantity=1
                    quantity = Decimal("1")
                    unit_price = Decimal(str(row[value_col]))
                    logger.warning(f"No quantity for {isin}, assuming 1")
                else:
                    logger.error(f"Cannot determine value for {isin}")
                    continue
                
                canonical = CanonicalPosition(
                    isin=isin,
                    name=name,
                    quantity=quantity,
                    unit_price=unit_price,
                    source="manual_csv",
                    timestamp=datetime.now(),
                )
                errors = canonical.validate()
                if errors:
                    logger.warning(f"Validation errors for {isin}: {errors}")
                    continue
                result.append(canonical)
                
            except Exception as e:
                logger.error(f"Failed to parse CSV row: {e}")
                continue
        
        return result
    
    def _find_column(self, df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
        """Find first matching column from candidates."""
        for col in candidates:
            if col in df.columns:
                return col
        return None
```

### Phase 2 Tasks

| Task ID | Title | Priority | Estimate | Status |
|---------|-------|----------|----------|--------|
| TASK-810 | Define `CanonicalPosition` dataclass | High | 30 min | Open |
| TASK-811 | Implement `TradeRepublicAdapter` | High | 45 min | Open |
| TASK-812 | Implement `ManualCSVAdapter` | High | 60 min | Open |
| TASK-813 | Add `positions_to_dataframe()` converter | High | 15 min | Open |
| TASK-814 | Update pipeline entry point to use adapters | High | 45 min | Open |
| TASK-815 | Unit tests for adapters | High | 60 min | Open |
| TASK-816 | Interactive column mapping UI for CSV upload | Medium | 120 min | Open |

---

## Phase 3: SQLite Storage

**Goal:** Schema enforcement at storage layer. Database rejects invalid data.

### 3.1 Schema Design

```sql
-- positions table: Raw ingested data
CREATE TABLE positions (
    id INTEGER PRIMARY KEY,
    isin TEXT NOT NULL CHECK(length(isin) = 12),
    name TEXT NOT NULL,
    quantity REAL NOT NULL CHECK(quantity >= 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    -- Computed column: database enforces correct calculation
    market_value REAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
    currency TEXT DEFAULT 'EUR',
    source TEXT NOT NULL,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(isin, source)
);

-- holdings_breakdown table: Pipeline output
CREATE TABLE holdings_breakdown (
    id INTEGER PRIMARY KEY,
    parent_isin TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    child_isin TEXT NOT NULL,
    child_name TEXT NOT NULL,
    weight_percent REAL NOT NULL CHECK(weight_percent >= 0 AND weight_percent <= 100),
    value_eur REAL NOT NULL CHECK(value_eur >= 0),
    sector TEXT,
    geography TEXT,
    resolution_status TEXT DEFAULT 'pending',
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pipeline_run_id INTEGER REFERENCES pipeline_runs(id)
);

-- pipeline_runs table: Audit trail
CREATE TABLE pipeline_runs (
    id INTEGER PRIMARY KEY,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    status TEXT CHECK(status IN ('running', 'completed', 'failed')),
    positions_count INTEGER,
    holdings_count INTEGER,
    errors_json TEXT,
    metrics_json TEXT
);
```

### Phase 3 Tasks

| Task ID | Title | Priority | Estimate | Status |
|---------|-------|----------|----------|--------|
| TASK-820 | Design SQLite schema | High | 30 min | Open |
| TASK-821 | Implement `positions` table with computed column | High | 45 min | Open |
| TASK-822 | Implement `holdings_breakdown` table | High | 30 min | Open |
| TASK-823 | Implement `pipeline_runs` audit table | Medium | 30 min | Open |
| TASK-824 | Migrate pipeline to write to SQLite | High | 90 min | Open |
| TASK-825 | Update UI handlers to read from SQLite | High | 60 min | Open |
| TASK-826 | Parallel write (CSV + SQLite) during transition | Medium | 30 min | Open |
| TASK-827 | Integration tests | High | 60 min | Open |
| TASK-828 | Remove CSV output (keep as export-only) | Low | 15 min | Open |

---

## Verification Checklist

After each phase, verify:

| Check | Phase 1 | Phase 2 | Phase 3 |
|-------|---------|---------|---------|
| Bitcoin: 0.000231 × 74372.29 = €17.18 | ✓ | ✓ | ✓ |
| NVIDIA: 10.506795 × 159.84 = €1,679.37 | ✓ | ✓ | ✓ |
| Unit tests pass | ✓ | ✓ | ✓ |
| No deprecation warnings in logs | ✓ | ✓ | ✓ |
| Pipeline completes without error | ✓ | ✓ | ✓ |
| Adapters validate input | - | ✓ | ✓ |
| Database constraints enforced | - | - | ✓ |
| Audit trail populated | - | - | ✓ |

---

## Definition of Done

### Phase 1 Complete When:
- [ ] All TASK-80x marked Done
- [ ] Unit tests pass (see test spec)
- [ ] Real data verification passes (Bitcoin, NVIDIA)
- [ ] PR merged to main
- [ ] GitHub issues #36, #37 closed

### Phase 2 Complete When:
- [ ] All TASK-81x marked Done
- [ ] Adapter unit tests pass
- [ ] Pipeline accepts canonical positions
- [ ] Manual CSV upload works with column mapping

### Phase 3 Complete When:
- [ ] All TASK-82x marked Done
- [ ] SQLite schema deployed
- [ ] Pipeline writes to SQLite
- [ ] UI reads from SQLite
- [ ] Integration tests pass
- [ ] Audit trail verified

---

## Related Documents

- **Bug Report:** `keystone/specs/value-calculation-bug.md`
- **Strategy:** `keystone/strategy/data-integrity-architecture.md`
- **Workstream:** `keystone/project/workstreams/value-semantics.md`
