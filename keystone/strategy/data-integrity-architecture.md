# Strategy: Data Integrity Architecture

> **Created:** 2025-12-28
> **Status:** Draft → Pending Approval
> **Scope:** Pipeline data flow, storage, and multi-source ingestion

---

## Executive Summary

This document addresses two critical concerns:

1. **Immediate Bug:** Position values calculated incorrectly (Bitcoin €74k instead of €17)
2. **Architectural Weakness:** No enforced data contracts between pipeline stages

The solution is a **three-layer defense** that increases confidence from 70% to 95%+ for preventing future calculation bugs.

---

## Problem Analysis

### Current State

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Data Sources   │     │    Pipeline     │     │     Storage     │
│                 │     │                 │     │                 │
│ • Trade Republic│────►│ • Column sniff  │────►│ • CSV files     │
│ • Manual CSV    │     │ • Guess semantics│    │ • JSON files    │
│ • Future brokers│     │ • Hope it works │     │ • No validation │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                       ▲                       ▲
        │                       │                       │
   No contract            No contract              No contract
```

**Problems:**
1. Each data source has different column names/semantics
2. Pipeline guesses what columns mean (e.g., `price` vs `market_value`)
3. CSV storage has no schema enforcement
4. Bugs only discovered when user sees wrong numbers in UI

### The 5% Uncertainty (Edge Cases)

| Scenario | Risk | Current Handling |
|----------|------|------------------|
| Manual CSV with `value` column | Is it total or per-unit? | Guessed |
| New broker with `amount` column | Quantity or value? | Guessed |
| Crypto with fractional quantities | 0.000231 BTC | Works, but fragile |
| Currency conversion | EUR vs USD values | Implicit assumption |
| Missing price data | What's the value? | Silent 0 or crash |

---

## Solution: Three-Layer Defense

### Layer 1: Canonical Position Model (Ingestion Gate)

**Every data source MUST be normalized to a canonical model BEFORE entering the pipeline.**

```python
@dataclass
class CanonicalPosition:
    """The ONE TRUE representation of a position.
    
    All data sources must be transformed to this format.
    The pipeline ONLY accepts CanonicalPosition objects.
    """
    isin: str                    # Required, validated format
    name: str                    # Required
    quantity: Decimal            # Required, >= 0
    unit_price: Decimal          # Required, >= 0, in EUR
    currency: str = "EUR"        # Source currency (for audit)
    source: str = "unknown"      # Data provenance
    timestamp: datetime          # When this data was captured
    
    @property
    def market_value(self) -> Decimal:
        """Computed property - CANNOT be set directly."""
        return self.quantity * self.unit_price
    
    def validate(self) -> List[str]:
        """Returns list of validation errors, empty if valid."""
        errors = []
        if not self._valid_isin(self.isin):
            errors.append(f"Invalid ISIN format: {self.isin}")
        if self.quantity < 0:
            errors.append(f"Negative quantity: {self.quantity}")
        if self.unit_price < 0:
            errors.append(f"Negative price: {self.unit_price}")
        return errors
```

**Key Insight:** `market_value` is a COMPUTED PROPERTY, not a stored field. It's impossible to set it incorrectly.

### Layer 2: Source Adapters (Normalization)

**Each data source gets a dedicated adapter that transforms raw data → CanonicalPosition.**

```python
class TradeRepublicAdapter:
    """Transforms TR API response to canonical positions."""
    
    def normalize(self, raw_positions: List[dict]) -> List[CanonicalPosition]:
        result = []
        for pos in raw_positions:
            canonical = CanonicalPosition(
                isin=pos["instrumentId"],
                name=pos["name"],
                quantity=Decimal(str(pos["netSize"])),
                unit_price=Decimal(str(pos["currentPrice"])),
                currency="EUR",
                source="trade_republic",
                timestamp=datetime.now(),
            )
            errors = canonical.validate()
            if errors:
                logger.warning(f"Validation errors for {pos}: {errors}")
                continue
            result.append(canonical)
        return result


class ManualCSVAdapter:
    """Transforms user-uploaded CSV to canonical positions."""
    
    # Column mapping with explicit semantics
    COLUMN_MAP = {
        # Quantity columns (shares/units)
        "quantity": "quantity",
        "qty": "quantity", 
        "shares": "quantity",
        "units": "quantity",
        "amount": "quantity",  # EXPLICIT: amount = quantity, NOT value
        
        # Price columns (per-unit)
        "price": "unit_price",
        "unit_price": "unit_price",
        "share_price": "unit_price",
        "current_price": "unit_price",
        
        # Value columns (total) - MUST be decomposed
        "value": "_total_value",      # Special handling
        "market_value": "_total_value",
        "total": "_total_value",
    }
    
    def normalize(self, df: pd.DataFrame) -> List[CanonicalPosition]:
        # Normalize column names
        df = self._normalize_columns(df)
        
        result = []
        for _, row in df.iterrows():
            # Handle the tricky case: user provided total value, not unit price
            if "_total_value" in df.columns and "unit_price" not in df.columns:
                if row["quantity"] > 0:
                    unit_price = Decimal(str(row["_total_value"])) / Decimal(str(row["quantity"]))
                else:
                    unit_price = Decimal("0")
            else:
                unit_price = Decimal(str(row.get("unit_price", 0)))
            
            canonical = CanonicalPosition(
                isin=row["isin"],
                name=row.get("name", "Unknown"),
                quantity=Decimal(str(row["quantity"])),
                unit_price=unit_price,
                source="manual_csv",
                timestamp=datetime.now(),
            )
            result.append(canonical)
        return result
```

**Key Insight:** The adapter is the ONLY place where column semantics are interpreted. The pipeline never guesses.

### Layer 3: SQLite Storage (Schema Enforcement)

**Replace CSV outputs with SQLite tables that enforce the schema.**

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
    
    UNIQUE(isin, source)  -- One position per source per ISIN
);

-- holdings_breakdown table: Pipeline output
CREATE TABLE holdings_breakdown (
    id INTEGER PRIMARY KEY,
    parent_isin TEXT NOT NULL,  -- 'DIRECT' or ETF ISIN
    parent_name TEXT NOT NULL,
    child_isin TEXT NOT NULL,
    child_name TEXT NOT NULL,
    weight_percent REAL NOT NULL CHECK(weight_percent >= 0 AND weight_percent <= 100),
    -- For direct holdings: full position value
    -- For indirect: parent_value * (weight_percent / 100)
    value_eur REAL NOT NULL CHECK(value_eur >= 0),
    sector TEXT,
    geography TEXT,
    resolution_status TEXT DEFAULT 'pending',
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Audit trail
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
    errors_json TEXT,  -- JSON array of errors
    metrics_json TEXT  -- JSON object with timing, hit rates, etc.
);
```

**Key Insight:** The database ENFORCES constraints. Invalid data cannot be stored.

---

## Data Flow: Before vs After

### Before (Current)

```
TR API ──► Raw DataFrame ──► Pipeline (guesses columns) ──► CSV (no validation) ──► UI
                                    │
                                    └── BUG: uses price as value
```

### After (Proposed)

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐     ┌──────────┐
│ TR API      │────►│ TR Adapter      │────►│ Canonical   │────►│ SQLite   │
│ Manual CSV  │────►│ CSV Adapter     │────►│ Position    │────►│ positions│
│ Future API  │────►│ Future Adapter  │────►│ (validated) │────►│ table    │
└─────────────┘     └─────────────────┘     └─────────────┘     └──────────┘
                            │                      │                   │
                    Explicit column         market_value is      CHECK constraints
                    mapping per source      computed property    enforce validity
                                                   │
                                                   ▼
                                           ┌─────────────┐
                                           │  Pipeline   │
                                           │ (no guessing│
                                           │  needed)    │
                                           └─────────────┘
                                                   │
                                                   ▼
                                           ┌─────────────┐
                                           │ holdings_   │
                                           │ breakdown   │
                                           │ table       │
                                           └─────────────┘
```

---

## Confidence Analysis

### Current State: 70% Confidence

| Risk | Probability | Impact |
|------|-------------|--------|
| Column semantic confusion | High | Critical (this bug) |
| New data source breaks pipeline | High | Critical |
| Invalid data stored | Medium | High |
| Silent calculation errors | Medium | Critical |

### After Layer 1 (Canonical Model): 85% Confidence

| Improvement | Risk Reduction |
|-------------|----------------|
| `market_value` is computed, not stored | Eliminates this bug class |
| Validation on ingestion | Catches bad data early |
| Explicit source adapters | No more guessing |

**Remaining 15%:** Runtime errors only, no compile-time safety, adapters could have bugs.

### After Layer 2 (Source Adapters): 90% Confidence

| Improvement | Risk Reduction |
|-------------|----------------|
| One adapter per source | Isolated, testable |
| Explicit column mapping | Documented semantics |
| Unit tests per adapter | Regression protection |

**Remaining 10%:** New sources need new adapters, edge cases in existing adapters.

### After Layer 3 (SQLite): 95% Confidence

| Improvement | Risk Reduction |
|-------------|----------------|
| CHECK constraints | Database rejects invalid data |
| GENERATED columns | Calculation enforced by DB |
| Foreign keys | Referential integrity |
| Audit trail | Debug and rollback capability |

**Remaining 5%:** 
- Logic bugs in adapters (mitigated by tests)
- Schema migration errors (mitigated by versioned migrations)
- Truly novel edge cases (mitigated by validation + logging)

---

## Implementation Plan

### Phase 1: Immediate Fix (This Week)
**Goal:** Fix the bug, establish semantic separation.

| Task | Description | Confidence Impact |
|------|-------------|-------------------|
| TASK-801 | `get_total_value_column()` | +5% |
| TASK-802 | `get_unit_price_column()` | +5% |
| TASK-803 | `calculate_position_value()` | +5% |
| TASK-805 | Update pipeline.py | Fixes bug |
| TASK-806 | Unit tests | +5% |

**Confidence after Phase 1:** 70% → 85%

### Phase 2: Canonical Model (Next Week)
**Goal:** Single source of truth for position representation.

| Task | Description | Confidence Impact |
|------|-------------|-------------------|
| TASK-810 | Define `CanonicalPosition` dataclass | +3% |
| TASK-811 | Implement `TradeRepublicAdapter` | +2% |
| TASK-812 | Implement `ManualCSVAdapter` | +2% |
| TASK-813 | Update pipeline to accept canonical positions | +3% |
| TASK-814 | Unit tests for adapters | +5% |

**Confidence after Phase 2:** 85% → 90%

### Phase 3: SQLite Storage (Week 3)
**Goal:** Schema enforcement at storage layer.

| Task | Description | Confidence Impact |
|------|-------------|-------------------|
| TASK-820 | Design SQLite schema | +1% |
| TASK-821 | Implement `positions` table with computed column | +2% |
| TASK-822 | Implement `holdings_breakdown` table | +1% |
| TASK-823 | Implement `pipeline_runs` audit table | +1% |
| TASK-824 | Migrate pipeline to write to SQLite | +2% |
| TASK-825 | Update UI handlers to read from SQLite | +1% |
| TASK-826 | Remove CSV output (or keep as export-only) | +1% |
| TASK-827 | Integration tests | +1% |

**Confidence after Phase 3:** 90% → 95%

---

## Edge Case Handling

### Manual CSV Upload

**Problem:** User uploads CSV with ambiguous columns.

**Solution:** Interactive column mapping UI + validation preview.

```
┌─────────────────────────────────────────────────────────────┐
│ Column Mapping                                              │
├─────────────────────────────────────────────────────────────┤
│ Your Column    │ Maps To           │ Sample Values         │
│ ─────────────  │ ─────────────     │ ─────────────         │
│ ISIN           │ ISIN ✓            │ US67066G1040          │
│ Anzahl         │ Quantity ✓        │ 10.5, 0.000231        │
│ Kurs           │ Unit Price ✓      │ 159.84, 74372.29      │
│ Wert           │ [Select...]       │ 1679.37, 17.18        │
│                │ ○ Total Value     │                       │
│                │ ○ Ignore          │                       │
├─────────────────────────────────────────────────────────────┤
│ Preview (first 3 rows):                                     │
│ NVIDIA: 10.5 × €159.84 = €1,679.37 ✓                       │
│ Bitcoin: 0.000231 × €74,372.29 = €17.18 ✓                  │
└─────────────────────────────────────────────────────────────┘
```

**Key:** User confirms the mapping, system validates the math.

### New Broker Integration

**Problem:** Future broker has different API structure.

**Solution:** Adapter template + validation contract.

```python
class BrokerAdapter(Protocol):
    """All broker adapters must implement this interface."""
    
    def normalize(self, raw_data: Any) -> List[CanonicalPosition]:
        """Transform broker-specific data to canonical positions."""
        ...
    
    def validate_source(self, raw_data: Any) -> List[str]:
        """Validate raw data before normalization. Returns errors."""
        ...

# New broker implementation
class ScalableCapitalAdapter(BrokerAdapter):
    def normalize(self, raw_data: dict) -> List[CanonicalPosition]:
        # Broker-specific logic here
        # MUST return CanonicalPosition objects
        ...
```

**Key:** The adapter contract ensures all brokers produce the same output format.

### Currency Handling

**Problem:** Some positions are in USD, GBP, etc.

**Solution:** Store original currency, convert to EUR at ingestion.

```python
@dataclass
class CanonicalPosition:
    # ... other fields ...
    unit_price_eur: Decimal      # Converted to EUR
    original_currency: str       # Original currency code
    original_unit_price: Decimal # Original price for audit
    fx_rate: Decimal             # Rate used for conversion
```

### Missing Price Data

**Problem:** Price not available for some assets.

**Solution:** Explicit handling with validation.

```python
def normalize(self, raw_positions: List[dict]) -> List[CanonicalPosition]:
    for pos in raw_positions:
        price = pos.get("currentPrice")
        if price is None or price <= 0:
            logger.warning(f"Missing price for {pos['isin']}, skipping")
            self.record_error(pos['isin'], "missing_price")
            continue  # Don't include in output
        # ... rest of normalization
```

---

## Migration Strategy

### CSV → SQLite Transition

1. **Parallel Write:** Write to both CSV and SQLite during transition
2. **Validation:** Compare outputs, ensure parity
3. **Switch Read:** Update UI to read from SQLite
4. **Deprecate CSV:** Keep CSV export as optional feature

### Backward Compatibility

- Existing CSV files remain readable
- Import tool can migrate historical data to SQLite
- No breaking changes to IPC API

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Value calculation bugs | 2 open (#36, #37) | 0 |
| Confidence in calculations | 70% | 95% |
| Time to add new broker | Unknown | < 1 day |
| Data validation coverage | 0% | 100% |
| Audit trail | None | Full |

---

## Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|-------------------------|
| Computed `market_value` property | Impossible to set incorrectly | Stored field with validation |
| SQLite over PostgreSQL | Local-first, no server needed | PostgreSQL, DuckDB |
| Adapter per source | Isolated, testable, explicit | Generic normalizer |
| Decimal over float | Financial precision | Float with rounding |

---

## Appendix: Existing Infrastructure

The codebase already has partial implementations:

| Component | Location | Status |
|-----------|----------|--------|
| `Position` model | `models/portfolio.py` | Exists, not used consistently |
| `PositionsSchema` | `core/schema.py` | Exists, not enforced |
| `SchemaNormalizer` | `core/schema.py` | Exists, limited mappings |
| `portfolio.db` | App Support dir | Exists, empty (0 bytes) |
| `hive_cache.db` | App Support dir | Working, good reference |

**Recommendation:** Build on existing infrastructure rather than replacing it.
