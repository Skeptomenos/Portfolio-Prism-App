# PRD: Phase 1 - Pipeline Contracts

> **Project:** Contract-First Pipeline Hardening  
> **Phase:** 1 of 5  
> **Goal:** Define explicit schemas and validation rules for pipeline phase boundaries  
> **Duration:** 2-3 days  
> **Priority:** P0 - Foundation for all subsequent phases

---

## Executive Summary

This phase creates the **contracts package** (`core/contracts/`) - the single source of truth for what "correct" data looks like at each pipeline boundary. Without contracts, we cannot measure accuracy, verify fixes, or provide meaningful quality feedback to users.

### Why This Matters

- **Trust is broken if depot value is wrong** - Users need to know when calculations are reliable
- **Can't fix bugs without defining "correct"** - Contracts are the specification
- **Community contributions need validation** - Contracts catch bad data before it corrupts results

### Deliverables

| File | Purpose | Lines (est.) |
|------|---------|--------------|
| `core/contracts/__init__.py` | Package exports | ~30 |
| `core/contracts/schemas.py` | Pydantic models for phase I/O | ~350 |
| `core/contracts/quality.py` | DataQuality class + ValidationIssue | ~200 |
| `core/contracts/validation.py` | Validation functions per phase | ~400 |
| `core/contracts/gates.py` | Validation gate orchestration | ~200 |
| `core/contracts/converters.py` | DataFrame ↔ Pydantic utilities | ~150 |
| `tests/contracts/__init__.py` | Test package | ~5 |
| `tests/contracts/factories.py` | Test fixture factories | ~150 |
| `tests/contracts/test_schemas.py` | Schema validation tests | ~200 |
| `tests/contracts/test_quality.py` | Quality score tests | ~150 |
| `tests/contracts/test_validation.py` | Validation function tests | ~250 |
| `tests/contracts/test_gates.py` | Gate orchestration tests | ~150 |
| `tests/contracts/test_converters.py` | Converter tests | ~100 |

**Total:** ~2,340 lines across 13 files

---

## Architecture Context

### Pipeline Phases (What We're Validating)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   PHASE 1   │    │   PHASE 2   │    │   PHASE 3   │    │   PHASE 4   │    │   PHASE 5   │
│    LOAD     │───►│  DECOMPOSE  │───►│   ENRICH    │───►│  AGGREGATE  │───►│   REPORT    │
│             │    │             │    │             │    │             │    │             │
│ SQLite →    │    │ ETF → Hold- │    │ Add sector/ │    │ Combine all │    │ CSV/JSON    │
│ Positions   │    │ ings list   │    │ geography   │    │ exposures   │    │ output      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
  LoadPhaseOutput   DecomposePhase    EnrichPhaseOutput  AggregatePhase
                      Output                               Output
```

### Existing Infrastructure (DO NOT DUPLICATE)

| Component | Location | Relationship to Contracts |
|-----------|----------|---------------------------|
| `ExposureRecord` | `models/exposure.py` | Keep as runtime model; contracts validate at boundaries |
| `AggregatedExposure` | `models/exposure.py` | Keep; add `from_contract()`/`to_contract()` methods later |
| Pandera schemas | `core/schema.py` | Keep for DataFrame structure; Pydantic for business rules |
| IPC contracts | `models/contracts.py` | Separate concern (Rust↔Python); don't modify |

### Design Principles

1. **Always Run, Never Crash** - Validation returns issues, never raises exceptions
2. **Additive, Not Replacement** - New contracts complement existing code
3. **Gradual Migration** - Old code continues working; new code uses contracts
4. **100% Test Coverage** - Every validation rule has explicit tests

---

## Task Breakdown

### Task Naming Convention

Tasks are numbered `T1.X.Y` where:
- `1` = Phase 1
- `X` = Major component (1=quality, 2=schemas, 3=validation, 4=gates, 5=converters, 6=tests)
- `Y` = Subtask within component

---

## T1.1: Quality Module

### T1.1.1: Create `core/contracts/quality.py`

**Objective:** Implement the quality tracking system that propagates through the pipeline.

**File to create:** `src-tauri/python/portfolio_src/core/contracts/quality.py`

**Dependencies:** None (first task)

**Specification:**

```python
"""
Data Quality Tracking - Propagates quality scores through the pipeline.

Quality degrades as issues are encountered. User sees final score
and can drill into specific issues.

Design:
- Score starts at 1.0 (perfect)
- Each issue applies a penalty based on severity
- Score never goes below 0.0
- is_trustworthy = score >= 0.95
"""
```

**Required Classes:**

#### 1. `IssueSeverity(Enum)`
```python
class IssueSeverity(str, Enum):
    """Severity levels for data quality issues."""
    CRITICAL = "critical"  # Calculation WILL be wrong
    HIGH = "high"          # Calculation MAY be wrong
    MEDIUM = "medium"      # Data is incomplete
    LOW = "low"            # Cosmetic issue
```

#### 2. `IssueCategory(Enum)`
```python
class IssueCategory(str, Enum):
    """Categories for grouping issues."""
    SCHEMA = "schema"           # Missing/invalid columns
    WEIGHT = "weight"           # Weight sum issues
    RESOLUTION = "resolution"   # ISIN resolution failures
    ENRICHMENT = "enrichment"   # Missing metadata
    CURRENCY = "currency"       # Currency conversion issues
    VALUE = "value"             # Value calculation issues
```

#### 3. `ValidationIssue` (dataclass)

Fields:
- `severity: IssueSeverity`
- `category: IssueCategory`
- `code: str` - Machine-readable code (e.g., "WEIGHT_SUM_LOW")
- `message: str` - Human-readable description
- `fix_hint: str` - What user/community can do to fix
- `item: str` - ISIN or identifier (safe to share publicly)
- `phase: str` - Pipeline phase where detected
- `timestamp: str` - ISO format, default to now
- `expected: Optional[str]` - What was expected
- `actual: Optional[str]` - What was found

Methods:
- `to_dict() -> Dict[str, Any]` - For JSON serialization
- `to_telemetry() -> Dict[str, Any]` - For GitHub issue creation (anonymized)

#### 4. `DataQuality` (dataclass)

Fields:
- `score: float = 1.0`
- `issues: List[ValidationIssue] = field(default_factory=list)`

Class constants:
```python
PENALTIES = {
    IssueSeverity.CRITICAL: 0.25,  # One critical = 75%
    IssueSeverity.HIGH: 0.10,      # One high = 90%
    IssueSeverity.MEDIUM: 0.03,    # Accumulates slowly
    IssueSeverity.LOW: 0.01,       # Cosmetic
}
```

Methods:
- `add_issue(issue: ValidationIssue) -> None` - Add issue and degrade score
- `merge(other: DataQuality) -> None` - Merge another DataQuality into this one
- `is_trustworthy: bool` (property) - True if score >= 0.95
- `has_critical_issues: bool` (property) - True if any CRITICAL issues
- `issue_count_by_severity: Dict[str, int]` (property)
- `issue_count_by_category: Dict[str, int]` (property)
- `get_issues_for_phase(phase: str) -> List[ValidationIssue]`
- `to_summary() -> Dict[str, Any]` - For UI display
- `to_user_message() -> str` - Human-friendly status message

**Acceptance Criteria:**
- [ ] All classes implemented with full type hints
- [ ] Docstrings on all public methods
- [ ] Score correctly degrades with each issue
- [ ] Score never goes below 0.0
- [ ] `is_trustworthy` returns False when score < 0.95
- [ ] `merge()` correctly recalculates score from all issues
- [ ] `to_summary()` returns valid JSON-serializable dict
- [ ] `to_user_message()` returns appropriate message for each state

**Estimated tokens to complete:** ~15,000

---

### T1.1.2: Create `core/contracts/__init__.py`

**Objective:** Create package with clean exports.

**File to create:** `src-tauri/python/portfolio_src/core/contracts/__init__.py`

**Dependencies:** T1.1.1

**Content:**
```python
"""
Pipeline Contracts - Data validation at phase boundaries.

This package defines:
- Schemas: Pydantic models for phase inputs/outputs
- Quality: Score tracking and issue management
- Validation: Functions that check data and return issues
- Gates: Orchestration of validation at phase boundaries
- Converters: DataFrame ↔ Pydantic utilities
"""

from .quality import (
    IssueSeverity,
    IssueCategory,
    ValidationIssue,
    DataQuality,
)

# Schemas will be added in T1.2
# Validation will be added in T1.3
# Gates will be added in T1.4
# Converters will be added in T1.5

__all__ = [
    # Quality
    "IssueSeverity",
    "IssueCategory", 
    "ValidationIssue",
    "DataQuality",
]
```

**Acceptance Criteria:**
- [ ] Package imports work: `from portfolio_src.core.contracts import DataQuality`
- [ ] No circular imports
- [ ] `__all__` lists all public exports

**Estimated tokens to complete:** ~5,000

---

## T1.2: Schema Module

### T1.2.1: Create `core/contracts/schemas.py` - Enums and Base Types

**Objective:** Define enums and base types used across all phase schemas.

**File to create:** `src-tauri/python/portfolio_src/core/contracts/schemas.py`

**Dependencies:** T1.1.1

**Specification:**

```python
"""
Pipeline Phase Contracts - Pydantic models defining exact data shapes.

These schemas are the SINGLE SOURCE OF TRUTH for what data looks like
at each pipeline boundary. All validation derives from these.

Note: These are VALIDATION schemas, not runtime models. The existing
models in models/exposure.py continue to be used for business logic.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Literal, List, Any
from enum import Enum
```

**Required Enums:**

#### 1. `AssetClass(str, Enum)`
```python
class AssetClass(str, Enum):
    STOCK = "Stock"
    ETF = "ETF"
    BOND = "Bond"
    CASH = "Cash"
    CRYPTO = "Crypto"
    DERIVATIVE = "Derivative"
    UNKNOWN = "Unknown"
```

#### 2. `ResolutionStatus(str, Enum)`
```python
class ResolutionStatus(str, Enum):
    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"
    SKIPPED = "skipped"
```

**Acceptance Criteria:**
- [ ] Enums are JSON-serializable (inherit from `str, Enum`)
- [ ] All values match existing usage in codebase
- [ ] Docstrings explain each enum's purpose

**Estimated tokens to complete:** ~8,000

---

### T1.2.2: Add Phase 1 Schemas (Load)

**Objective:** Add schemas for the Load phase output.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/schemas.py`

**Dependencies:** T1.2.1

**Required Classes:**

#### 1. `LoadedPosition(BaseModel)`

Represents a single position loaded from the database.

Fields:
- `isin: str` - Field with pattern `^[A-Z]{2}[A-Z0-9]{10}$`, length 12
- `name: str` - Field with min_length=1
- `quantity: float` - Number of shares/units
- `current_price: Optional[float]` - ge=0, current market price
- `cost_basis: Optional[float]` - ge=0, average purchase price
- `asset_class: AssetClass` - default=UNKNOWN
- `symbol: Optional[str]` - Ticker symbol
- `sector: Optional[str]`
- `region: Optional[str]`
- `currency: str` - default="EUR"

Validators:
- `normalize_asset_class` - Convert None/"" to UNKNOWN, case-insensitive matching

Properties:
- `market_value: float` - quantity * (current_price or cost_basis or 0.0)

#### 2. `LoadPhaseOutput(BaseModel)`

Container for Load phase results.

Fields:
- `direct_positions: List[LoadedPosition]` - Non-ETF positions
- `etf_positions: List[LoadedPosition]` - ETF positions to decompose
- `total_positions: int` - Computed in model_post_init
- `total_value: float` - Computed in model_post_init

**Acceptance Criteria:**
- [ ] Invalid ISIN raises ValidationError
- [ ] Empty name raises ValidationError
- [ ] asset_class normalizes correctly (case-insensitive)
- [ ] market_value calculates correctly with fallback logic
- [ ] LoadPhaseOutput computes totals in model_post_init

**Estimated tokens to complete:** ~12,000

---

### T1.2.3: Add Phase 2 Schemas (Decompose)

**Objective:** Add schemas for the Decompose phase output.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/schemas.py`

**Dependencies:** T1.2.2

**Required Classes:**

#### 1. `HoldingRecord(BaseModel)`

Single holding within an ETF.

Fields:
- `ticker: Optional[str]`
- `raw_ticker: Optional[str]` - Original ticker before normalization
- `name: str` - min_length=1
- `weight_percentage: float` - ge=0, le=150 (allows leverage)
- `isin: Optional[str]` - If resolved, 12 chars
- `resolution_status: ResolutionStatus` - default=UNRESOLVED
- `resolution_source: Optional[str]` - Where ISIN came from
- `resolution_confidence: float` - ge=0, le=1, default=0.0
- `resolution_detail: Optional[str]` - Additional resolution info

Validators:
- `normalize_weight` - Handle None → 0.0, keep value as-is (validation catches decimal format)

#### 2. `ETFDecomposition(BaseModel)`

Decomposition result for a single ETF.

Fields:
- `etf_isin: str` - 12 chars
- `etf_name: str`
- `etf_value: float` - ge=0
- `holdings: List[HoldingRecord]`
- `source: str` - "cached", "hive", "adapter", "manual"
- `weight_sum: float` - Computed
- `holdings_count: int` - Computed
- `resolved_count: int` - Computed
- `unresolved_count: int` - Computed

model_post_init:
- Calculate weight_sum from holdings
- Calculate holdings_count, resolved_count, unresolved_count

#### 3. `DecomposePhaseOutput(BaseModel)`

Container for Decompose phase results.

Fields:
- `decompositions: List[ETFDecomposition]`
- `etfs_processed: int` - Computed
- `etfs_failed: int` - default=0
- `total_holdings: int` - Computed

**Acceptance Criteria:**
- [ ] HoldingRecord accepts weights 0-150 (for leveraged ETFs)
- [ ] ETFDecomposition correctly computes weight_sum
- [ ] Resolution counts are accurate
- [ ] Empty holdings list is valid (but will trigger validation warning)

**Estimated tokens to complete:** ~15,000

---

### T1.2.4: Add Phase 3 Schemas (Enrich)

**Objective:** Add schemas for the Enrich phase output.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/schemas.py`

**Dependencies:** T1.2.3

**Required Classes:**

#### 1. `EnrichedHolding(HoldingRecord)`

Holding with enrichment metadata added. Inherits from HoldingRecord.

Additional fields:
- `sector: str` - default="Unknown"
- `geography: str` - default="Unknown"
- `asset_class: AssetClass` - default=STOCK
- `enrichment_source: Optional[str]` - Where enrichment came from

#### 2. `EnrichPhaseOutput(BaseModel)`

Container for Enrich phase results.

Fields:
- `enriched_decompositions: List[ETFDecomposition]` - Note: holdings are EnrichedHolding
- `enriched_direct: List[LoadedPosition]`
- `total_enriched: int` - default=0
- `hive_hits: int` - default=0
- `api_calls: int` - default=0
- `enrichment_failures: int` - default=0

**Acceptance Criteria:**
- [ ] EnrichedHolding inherits all HoldingRecord fields
- [ ] Default values are "Unknown" not None (for display)
- [ ] Stats fields track enrichment sources

**Estimated tokens to complete:** ~10,000

---

### T1.2.5: Add Phase 4 Schemas (Aggregate)

**Objective:** Add schemas for the Aggregate phase output.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/schemas.py`

**Dependencies:** T1.2.4

**Required Classes:**

#### 1. `AggregatedExposureRecord(BaseModel)`

Single aggregated exposure record.

Fields:
- `isin: str` - Can be ISIN or "UNRESOLVED:..." pattern
- `name: str`
- `sector: str` - default="Unknown"
- `geography: str` - default="Unknown"
- `asset_class: AssetClass` - default=STOCK
- `total_exposure: float` - ge=0
- `portfolio_percentage: float` - ge=0, le=200 (allows leverage)
- `direct_exposure: float` - ge=0, default=0.0
- `indirect_exposure: float` - ge=0, default=0.0
- `source_count: int` - default=1, number of sources contributing
- `resolution_confidence: float` - ge=0, le=1, default=0.0
- `resolution_source: Optional[str]`

#### 2. `AggregatePhaseOutput(BaseModel)`

Container for Aggregate phase results.

Fields:
- `exposures: List[AggregatedExposureRecord]`
- `total_portfolio_value: float` - ge=0
- `unique_securities: int` - Computed
- `resolved_securities: int` - Computed
- `unresolved_securities: int` - Computed

model_post_init:
- Count unique_securities from exposures
- Count resolved (not starting with "UNRESOLVED:")
- Count unresolved

**Acceptance Criteria:**
- [ ] portfolio_percentage allows up to 200% (leveraged portfolios)
- [ ] UNRESOLVED: pattern correctly identified
- [ ] Computed counts are accurate

**Estimated tokens to complete:** ~12,000

---

### T1.2.6: Update `__init__.py` with Schema Exports

**Objective:** Export all schema classes from package.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/__init__.py`

**Dependencies:** T1.2.5

**Add to imports and __all__:**
```python
from .schemas import (
    AssetClass,
    ResolutionStatus,
    LoadedPosition,
    LoadPhaseOutput,
    HoldingRecord,
    ETFDecomposition,
    DecomposePhaseOutput,
    EnrichedHolding,
    EnrichPhaseOutput,
    AggregatedExposureRecord,
    AggregatePhaseOutput,
)

__all__ = [
    # Quality
    "IssueSeverity",
    "IssueCategory",
    "ValidationIssue",
    "DataQuality",
    # Schemas
    "AssetClass",
    "ResolutionStatus",
    "LoadedPosition",
    "LoadPhaseOutput",
    "HoldingRecord",
    "ETFDecomposition",
    "DecomposePhaseOutput",
    "EnrichedHolding",
    "EnrichPhaseOutput",
    "AggregatedExposureRecord",
    "AggregatePhaseOutput",
]
```

**Acceptance Criteria:**
- [ ] All schema classes importable from package root
- [ ] No circular imports

**Estimated tokens to complete:** ~5,000

---

## T1.3: Validation Module

### T1.3.1: Create `core/contracts/validation.py` - Load Phase

**Objective:** Implement validation functions for the Load phase.

**File to create:** `src-tauri/python/portfolio_src/core/contracts/validation.py`

**Dependencies:** T1.2.6

**Specification:**

```python
"""
Validation Functions - Check data at phase boundaries.

Each function returns a list of ValidationIssues. Empty list = valid.
Pipeline continues regardless, but issues are tracked.

Design:
- Functions are pure (no side effects)
- Functions never raise exceptions
- Functions return List[ValidationIssue]
- Each function validates one specific aspect
"""

from typing import List
from .quality import ValidationIssue, IssueSeverity, IssueCategory
from .schemas import (
    LoadedPosition, LoadPhaseOutput,
    HoldingRecord, ETFDecomposition, DecomposePhaseOutput,
    EnrichedHolding, EnrichPhaseOutput,
    AggregatedExposureRecord, AggregatePhaseOutput,
    AssetClass, ResolutionStatus,
)
```

**Required Functions:**

#### 1. `validate_loaded_positions(positions: List[LoadedPosition], phase: str = "DATA_LOADING") -> List[ValidationIssue]`

Checks:
- Empty list → HIGH issue (NO_POSITIONS)
- Zero/negative market_value → MEDIUM issue (ZERO_VALUE_POSITIONS)
- Unknown asset_class → LOW issue (UNKNOWN_ASSET_CLASS)
- Non-EUR currency → HIGH issue (NON_EUR_CURRENCY)

#### 2. `validate_load_phase_output(output: LoadPhaseOutput) -> List[ValidationIssue]`

Wrapper that validates both direct_positions and etf_positions.

**Acceptance Criteria:**
- [ ] Empty positions list returns HIGH issue
- [ ] Zero value positions counted correctly
- [ ] Non-EUR currencies detected and listed
- [ ] All issues have appropriate fix_hint

**Estimated tokens to complete:** ~15,000

---

### T1.3.2: Add Decompose Phase Validation

**Objective:** Implement validation functions for the Decompose phase.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/validation.py`

**Dependencies:** T1.3.1

**Required Functions:**

#### 1. `validate_holdings_weights(decomposition: ETFDecomposition, phase: str = "ETF_DECOMPOSITION") -> List[ValidationIssue]`

Checks:
- No holdings → HIGH issue (NO_HOLDINGS)
- Weight sum 0.5-1.5 → CRITICAL issue (WEIGHT_DECIMAL_FORMAT) - likely decimal format
- Weight sum < 50 → CRITICAL issue (WEIGHT_SUM_VERY_LOW)
- Weight sum < 90 → HIGH issue (WEIGHT_SUM_LOW)
- Weight sum > 110 → MEDIUM issue (WEIGHT_SUM_HIGH)
- Negative weights → MEDIUM issue (NEGATIVE_WEIGHTS)

#### 2. `validate_resolution_rate(decomposition: ETFDecomposition, min_rate: float = 0.80, phase: str = "ETF_DECOMPOSITION") -> List[ValidationIssue]`

Checks:
- Resolution rate < 50% → HIGH issue (LOW_RESOLUTION_RATE)
- Resolution rate < min_rate → MEDIUM issue (MODERATE_RESOLUTION_RATE)

#### 3. `validate_decompose_phase_output(output: DecomposePhaseOutput) -> List[ValidationIssue]`

Wrapper that validates all decompositions.

**Acceptance Criteria:**
- [ ] Decimal format detection works (0.5-1.5 range)
- [ ] Weight thresholds match specification
- [ ] Resolution rate calculated correctly
- [ ] All issues include etf_isin as item

**Estimated tokens to complete:** ~18,000

---

### T1.3.3: Add Enrich Phase Validation

**Objective:** Implement validation functions for the Enrich phase.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/validation.py`

**Dependencies:** T1.3.2

**Required Functions:**

#### 1. `validate_enrichment_coverage(holdings: List[HoldingRecord], etf_isin: str, phase: str = "ENRICHMENT") -> List[ValidationIssue]`

Checks:
- Sector coverage < 50% → MEDIUM issue (LOW_SECTOR_COVERAGE)
- Geography coverage < 50% → MEDIUM issue (LOW_GEOGRAPHY_COVERAGE)

Note: Use `getattr(h, 'sector', 'Unknown')` to handle both HoldingRecord and EnrichedHolding.

#### 2. `validate_enrich_phase_output(output: EnrichPhaseOutput) -> List[ValidationIssue]`

Wrapper that validates all enriched decompositions.

**Acceptance Criteria:**
- [ ] Coverage calculated correctly (1 - unknown/total)
- [ ] Works with both HoldingRecord and EnrichedHolding
- [ ] Empty holdings list returns no issues (already caught earlier)

**Estimated tokens to complete:** ~12,000

---

### T1.3.4: Add Aggregate Phase Validation

**Objective:** Implement validation functions for the Aggregate phase.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/validation.py`

**Dependencies:** T1.3.3

**Required Functions:**

#### 1. `validate_aggregation_totals(calculated_total: float, expected_total: float, tolerance: float = 0.01, phase: str = "AGGREGATION") -> List[ValidationIssue]`

Checks:
- Expected total <= 0 → CRITICAL issue (ZERO_PORTFOLIO_VALUE)
- Difference > 10% → CRITICAL issue (TOTAL_MISMATCH_LARGE)
- Difference > tolerance → HIGH issue (TOTAL_MISMATCH)

#### 2. `validate_percentage_sum(exposures: List[AggregatedExposureRecord], phase: str = "AGGREGATION") -> List[ValidationIssue]`

Checks:
- Sum < 95% → HIGH issue (PERCENTAGE_SUM_LOW)
- Sum > 105% → MEDIUM issue (PERCENTAGE_SUM_HIGH)

#### 3. `validate_aggregate_phase_output(output: AggregatePhaseOutput, expected_total: float) -> List[ValidationIssue]`

Wrapper that validates totals and percentage sum.

**Acceptance Criteria:**
- [ ] Zero portfolio value detected
- [ ] Percentage difference calculated correctly
- [ ] Tolerance parameter works
- [ ] Expected/actual values included in issues

**Estimated tokens to complete:** ~15,000

---

### T1.3.5: Update `__init__.py` with Validation Exports

**Objective:** Export all validation functions from package.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/__init__.py`

**Dependencies:** T1.3.4

**Add to imports and __all__:**
```python
from .validation import (
    validate_loaded_positions,
    validate_load_phase_output,
    validate_holdings_weights,
    validate_resolution_rate,
    validate_decompose_phase_output,
    validate_enrichment_coverage,
    validate_enrich_phase_output,
    validate_aggregation_totals,
    validate_percentage_sum,
    validate_aggregate_phase_output,
)
```

**Acceptance Criteria:**
- [ ] All validation functions importable from package root
- [ ] No circular imports

**Estimated tokens to complete:** ~5,000

---

## T1.4: Gates Module

### T1.4.1: Create `core/contracts/gates.py`

**Objective:** Implement the ValidationGates class that orchestrates validation at phase boundaries.

**File to create:** `src-tauri/python/portfolio_src/core/contracts/gates.py`

**Dependencies:** T1.3.5

**Specification:**

```python
"""
Validation Gates - Orchestrates validation at phase boundaries.

Gates validate data and collect issues without stopping the pipeline.
Each gate returns a GateResult with pass/fail status and quality metrics.

Usage:
    gates = ValidationGates()
    result = gates.validate_load_output(output)
    if not result.passed:
        logger.warning(f"Load phase has issues: {result.quality.issues}")
    # Continue anyway - pipeline always runs
"""

from dataclasses import dataclass
from typing import Any

from .quality import DataQuality
from .validation import (
    validate_load_phase_output,
    validate_decompose_phase_output,
    validate_enrich_phase_output,
    validate_aggregate_phase_output,
)
from .schemas import (
    LoadPhaseOutput,
    DecomposePhaseOutput,
    EnrichPhaseOutput,
    AggregatePhaseOutput,
)
```

**Required Classes:**

#### 1. `GateResult` (dataclass)

Fields:
- `passed: bool` - True if no CRITICAL issues
- `quality: DataQuality` - Quality metrics for this gate
- `data: Any` - The validated data (pass-through)

#### 2. `ValidationGates`

State:
- `pipeline_quality: DataQuality` - Accumulated quality across all gates

Methods:
- `__init__()` - Initialize with fresh DataQuality
- `validate_load_output(output: LoadPhaseOutput) -> GateResult`
- `validate_decompose_output(output: DecomposePhaseOutput) -> GateResult`
- `validate_enrich_output(output: EnrichPhaseOutput) -> GateResult`
- `validate_aggregate_output(output: AggregatePhaseOutput, expected_total: float) -> GateResult`
- `get_pipeline_quality() -> DataQuality` - Get accumulated quality
- `get_summary() -> dict` - Get summary for pipeline_health.json
- `reset()` - Reset for new pipeline run

**Gate Implementation Pattern:**
```python
def validate_load_output(self, output: LoadPhaseOutput) -> GateResult:
    quality = DataQuality()
    
    issues = validate_load_phase_output(output)
    for issue in issues:
        quality.add_issue(issue)
    
    self.pipeline_quality.merge(quality)
    
    return GateResult(
        passed=not quality.has_critical_issues,
        quality=quality,
        data=output,
    )
```

**get_summary() output format:**
```python
{
    "quality_score": 0.87,
    "is_trustworthy": False,
    "total_issues": 5,
    "by_severity": {"critical": 0, "high": 2, "medium": 2, "low": 1},
    "by_category": {"weight": 2, "enrichment": 2, "resolution": 1, ...},
    "issues": [...]  # List of issue dicts
}
```

**Acceptance Criteria:**
- [ ] Each gate validates and returns GateResult
- [ ] Pipeline quality accumulates across gates
- [ ] `passed` is False only for CRITICAL issues
- [ ] `get_summary()` returns JSON-serializable dict
- [ ] `reset()` clears all accumulated state

**Estimated tokens to complete:** ~20,000

---

### T1.4.2: Update `__init__.py` with Gates Exports

**Objective:** Export gates classes from package.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/__init__.py`

**Dependencies:** T1.4.1

**Add to imports and __all__:**
```python
from .gates import GateResult, ValidationGates
```

**Acceptance Criteria:**
- [ ] GateResult and ValidationGates importable from package root

**Estimated tokens to complete:** ~3,000

---

## T1.5: Converters Module

### T1.5.1: Create `core/contracts/converters.py`

**Objective:** Implement utilities for converting between DataFrames and Pydantic models.

**File to create:** `src-tauri/python/portfolio_src/core/contracts/converters.py`

**Dependencies:** T1.4.2

**Specification:**

```python
"""
DataFrame ↔ Pydantic Converters

Utilities for converting between pandas DataFrames (used in pipeline)
and Pydantic models (used for validation).

Design:
- Converters handle missing columns gracefully
- Converters normalize column names (lowercase)
- Converters return validation errors as issues, not exceptions
"""

from typing import List, Tuple, Optional, Type, TypeVar
import pandas as pd
from pydantic import BaseModel, ValidationError

from .quality import DataQuality, ValidationIssue, IssueSeverity, IssueCategory
from .schemas import (
    LoadedPosition, LoadPhaseOutput,
    HoldingRecord, ETFDecomposition,
    AggregatedExposureRecord, AggregatePhaseOutput,
    AssetClass,
)

T = TypeVar('T', bound=BaseModel)
```

**Required Functions:**

#### 1. `dataframe_to_loaded_positions(df: pd.DataFrame, phase: str = "DATA_LOADING") -> Tuple[List[LoadedPosition], DataQuality]`

Converts a DataFrame to list of LoadedPosition, collecting any validation errors.

Column mapping (case-insensitive):
- isin, ISIN → isin
- name, Name → name
- quantity, Quantity, qty → quantity
- current_price, price, tr_price → current_price
- cost_basis, avg_cost, averageBuyIn → cost_basis
- asset_type, asset_class → asset_class
- symbol, ticker → symbol
- sector → sector
- region → region
- currency → currency

Returns tuple of (valid_positions, quality_with_conversion_errors).

#### 2. `dataframe_to_holdings(df: pd.DataFrame, phase: str = "ETF_DECOMPOSITION") -> Tuple[List[HoldingRecord], DataQuality]`

Converts a DataFrame to list of HoldingRecord.

Column mapping:
- ticker, Ticker → ticker
- name, Name, holding_name → name
- weight, weight_percentage, Weight → weight_percentage
- isin, ISIN → isin

#### 3. `loaded_positions_to_dataframe(positions: List[LoadedPosition]) -> pd.DataFrame`

Converts list of LoadedPosition back to DataFrame.

#### 4. `holdings_to_dataframe(holdings: List[HoldingRecord]) -> pd.DataFrame`

Converts list of HoldingRecord back to DataFrame.

#### 5. `safe_convert_row(row: dict, model_class: Type[T], phase: str) -> Tuple[Optional[T], Optional[ValidationIssue]]`

Helper that converts a single row, returning either the model or an issue.

**Acceptance Criteria:**
- [ ] Column name mapping is case-insensitive
- [ ] Missing required columns create SCHEMA issues
- [ ] Invalid values create appropriate issues
- [ ] Valid rows are converted correctly
- [ ] Round-trip conversion preserves data

**Estimated tokens to complete:** ~25,000

---

### T1.5.2: Update `__init__.py` with Converter Exports

**Objective:** Export converter functions from package.

**File to modify:** `src-tauri/python/portfolio_src/core/contracts/__init__.py`

**Dependencies:** T1.5.1

**Add to imports and __all__:**
```python
from .converters import (
    dataframe_to_loaded_positions,
    dataframe_to_holdings,
    loaded_positions_to_dataframe,
    holdings_to_dataframe,
    safe_convert_row,
)
```

**Acceptance Criteria:**
- [ ] All converter functions importable from package root

**Estimated tokens to complete:** ~3,000

---

## T1.6: Test Suite

### T1.6.1: Create Test Package Structure

**Objective:** Create the test package structure with factories.

**Files to create:**
- `src-tauri/python/tests/contracts/__init__.py`
- `src-tauri/python/tests/contracts/factories.py`

**Dependencies:** T1.5.2

**factories.py Specification:**

```python
"""
Test Fixture Factories for Contracts

Factory functions create valid objects with sensible defaults.
Override specific fields to test edge cases.

Usage:
    # Valid position
    pos = make_loaded_position()
    
    # Position with specific ISIN
    pos = make_loaded_position(isin="US0378331005")
    
    # Invalid position (for testing validation)
    pos = make_loaded_position(quantity=-10)  # Will fail validation
```

**Required Factories:**

#### 1. `make_loaded_position(**overrides) -> LoadedPosition`

Defaults:
```python
{
    "isin": "US0378331005",
    "name": "Apple Inc",
    "quantity": 10.0,
    "current_price": 150.0,
    "cost_basis": 140.0,
    "asset_class": AssetClass.STOCK,
    "currency": "EUR",
}
```

#### 2. `make_holding_record(**overrides) -> HoldingRecord`

Defaults:
```python
{
    "name": "Test Holding",
    "weight_percentage": 5.0,
    "ticker": "TEST",
    "resolution_status": ResolutionStatus.UNRESOLVED,
}
```

#### 3. `make_etf_decomposition(holdings_count: int = 3, weight_sum: float = 100.0, **overrides) -> ETFDecomposition`

Creates ETF with specified number of holdings distributed to reach weight_sum.

Defaults:
```python
{
    "etf_isin": "IE00B4L5Y983",
    "etf_name": "iShares Core MSCI World",
    "etf_value": 10000.0,
    "source": "test",
}
```

#### 4. `make_aggregated_exposure(**overrides) -> AggregatedExposureRecord`

Defaults:
```python
{
    "isin": "US0378331005",
    "name": "Apple Inc",
    "total_exposure": 1500.0,
    "portfolio_percentage": 15.0,
    "direct_exposure": 1500.0,
    "indirect_exposure": 0.0,
}
```

#### 5. `make_validation_issue(**overrides) -> ValidationIssue`

Defaults:
```python
{
    "severity": IssueSeverity.MEDIUM,
    "category": IssueCategory.SCHEMA,
    "code": "TEST_ISSUE",
    "message": "Test issue message",
    "fix_hint": "Test fix hint",
    "item": "TEST",
    "phase": "TEST",
}
```

#### 6. `make_load_phase_output(direct_count: int = 2, etf_count: int = 1) -> LoadPhaseOutput`

Creates LoadPhaseOutput with specified number of positions.

#### 7. `make_decompose_phase_output(etf_count: int = 2, holdings_per_etf: int = 3) -> DecomposePhaseOutput`

Creates DecomposePhaseOutput with specified structure.

**Acceptance Criteria:**
- [ ] All factories create valid objects by default
- [ ] Overrides work correctly
- [ ] Factories are composable (e.g., make_decompose uses make_etf_decomposition)

**Estimated tokens to complete:** ~20,000

---

### T1.6.2: Create `test_schemas.py`

**Objective:** Test all schema validation rules.

**File to create:** `src-tauri/python/tests/contracts/test_schemas.py`

**Dependencies:** T1.6.1

**Required Test Classes:**

#### 1. `TestLoadedPosition`
- `test_valid_position` - Valid data passes
- `test_invalid_isin_too_short` - Raises ValidationError
- `test_invalid_isin_wrong_format` - Raises ValidationError
- `test_empty_name` - Raises ValidationError
- `test_asset_class_normalization_lowercase` - "etf" → ETF
- `test_asset_class_normalization_none` - None → UNKNOWN
- `test_market_value_calculation` - quantity * price
- `test_market_value_fallback_to_cost_basis` - Uses cost_basis if no price
- `test_market_value_fallback_to_zero` - Returns 0 if no price or cost

#### 2. `TestHoldingRecord`
- `test_valid_holding` - Valid data passes
- `test_weight_percentage_bounds` - 0-150 allowed
- `test_weight_percentage_negative_fails` - < 0 fails
- `test_optional_isin` - None is valid
- `test_isin_validation_when_present` - Invalid ISIN fails

#### 3. `TestETFDecomposition`
- `test_valid_decomposition` - Valid data passes
- `test_weight_sum_calculation` - Computed correctly
- `test_holdings_count_calculation` - Computed correctly
- `test_resolved_count_calculation` - Counts RESOLVED status
- `test_empty_holdings_valid` - Empty list is valid (validation catches it)

#### 4. `TestAggregatedExposureRecord`
- `test_valid_record` - Valid data passes
- `test_portfolio_percentage_allows_leverage` - Up to 200% allowed
- `test_unresolved_pattern` - "UNRESOLVED:..." is valid isin

**Acceptance Criteria:**
- [ ] 100% line coverage on schemas.py
- [ ] All validation rules have explicit tests
- [ ] Edge cases covered (empty, None, boundary values)

**Estimated tokens to complete:** ~25,000

---

### T1.6.3: Create `test_quality.py`

**Objective:** Test quality score tracking and issue management.

**File to create:** `src-tauri/python/tests/contracts/test_quality.py`

**Dependencies:** T1.6.1

**Required Test Classes:**

#### 1. `TestValidationIssue`
- `test_to_dict` - All fields serialized
- `test_to_telemetry` - Only safe fields included
- `test_timestamp_default` - Auto-generated

#### 2. `TestDataQuality`
- `test_initial_score` - Starts at 1.0
- `test_is_trustworthy_initial` - True at 1.0
- `test_critical_issue_penalty` - 0.25 penalty
- `test_high_issue_penalty` - 0.10 penalty
- `test_medium_issue_penalty` - 0.03 penalty
- `test_low_issue_penalty` - 0.01 penalty
- `test_score_never_below_zero` - Clamped at 0.0
- `test_is_trustworthy_threshold` - False below 0.95
- `test_has_critical_issues` - True when CRITICAL present
- `test_merge_combines_issues` - Issues from both
- `test_merge_recalculates_score` - Score recalculated
- `test_issue_count_by_severity` - Correct counts
- `test_issue_count_by_category` - Correct counts
- `test_get_issues_for_phase` - Filters correctly
- `test_to_summary` - JSON-serializable
- `test_to_user_message_trustworthy` - Positive message
- `test_to_user_message_critical` - Warning message
- `test_to_user_message_high` - Caution message

**Acceptance Criteria:**
- [ ] 100% line coverage on quality.py
- [ ] Penalty calculations verified
- [ ] Merge behavior verified
- [ ] All output formats tested

**Estimated tokens to complete:** ~20,000

---

### T1.6.4: Create `test_validation.py`

**Objective:** Test all validation functions.

**File to create:** `src-tauri/python/tests/contracts/test_validation.py`

**Dependencies:** T1.6.1

**Required Test Classes:**

#### 1. `TestValidateLoadedPositions`
- `test_empty_list` - Returns NO_POSITIONS issue
- `test_valid_positions` - Returns empty list
- `test_zero_value_positions` - Returns ZERO_VALUE_POSITIONS
- `test_unknown_asset_class` - Returns UNKNOWN_ASSET_CLASS
- `test_non_eur_currency` - Returns NON_EUR_CURRENCY
- `test_multiple_issues` - Returns all applicable issues

#### 2. `TestValidateHoldingsWeights`
- `test_valid_weights` - Returns empty list (sum ~100)
- `test_no_holdings` - Returns NO_HOLDINGS
- `test_decimal_format_detected` - Sum 0.5-1.5 → WEIGHT_DECIMAL_FORMAT
- `test_very_low_sum` - Sum < 50 → WEIGHT_SUM_VERY_LOW
- `test_low_sum` - Sum 50-90 → WEIGHT_SUM_LOW
- `test_high_sum` - Sum > 110 → WEIGHT_SUM_HIGH
- `test_negative_weights` - Returns NEGATIVE_WEIGHTS
- `test_boundary_90` - Exactly 90 is valid
- `test_boundary_110` - Exactly 110 is valid

#### 3. `TestValidateResolutionRate`
- `test_high_resolution` - > 80% returns empty
- `test_low_resolution` - < 50% returns LOW_RESOLUTION_RATE
- `test_moderate_resolution` - 50-80% returns MODERATE_RESOLUTION_RATE
- `test_custom_min_rate` - Parameter works

#### 4. `TestValidateEnrichmentCoverage`
- `test_good_coverage` - > 50% returns empty
- `test_low_sector_coverage` - Returns LOW_SECTOR_COVERAGE
- `test_low_geography_coverage` - Returns LOW_GEOGRAPHY_COVERAGE
- `test_empty_holdings` - Returns empty list

#### 5. `TestValidateAggregationTotals`
- `test_matching_totals` - Within tolerance returns empty
- `test_zero_expected` - Returns ZERO_PORTFOLIO_VALUE
- `test_large_mismatch` - > 10% returns TOTAL_MISMATCH_LARGE
- `test_small_mismatch` - > tolerance returns TOTAL_MISMATCH
- `test_custom_tolerance` - Parameter works

#### 6. `TestValidatePercentageSum`
- `test_valid_sum` - 95-105% returns empty
- `test_low_sum` - < 95% returns PERCENTAGE_SUM_LOW
- `test_high_sum` - > 105% returns PERCENTAGE_SUM_HIGH
- `test_empty_exposures` - Returns empty list

**Acceptance Criteria:**
- [ ] 100% line coverage on validation.py
- [ ] All issue codes tested
- [ ] Boundary conditions tested
- [ ] Severity levels verified

**Estimated tokens to complete:** ~30,000

---

### T1.6.5: Create `test_gates.py`

**Objective:** Test gate orchestration.

**File to create:** `src-tauri/python/tests/contracts/test_gates.py`

**Dependencies:** T1.6.1

**Required Test Classes:**

#### 1. `TestGateResult`
- `test_passed_true` - No critical issues
- `test_passed_false` - Has critical issues
- `test_data_passthrough` - Data preserved

#### 2. `TestValidationGates`
- `test_initial_state` - Fresh DataQuality
- `test_validate_load_output_valid` - Returns passed=True
- `test_validate_load_output_with_issues` - Accumulates issues
- `test_validate_decompose_output` - Works correctly
- `test_validate_enrich_output` - Works correctly
- `test_validate_aggregate_output` - Works correctly
- `test_pipeline_quality_accumulates` - Issues from all gates
- `test_get_summary_format` - Correct structure
- `test_reset` - Clears state

**Acceptance Criteria:**
- [ ] 100% line coverage on gates.py
- [ ] Accumulation behavior verified
- [ ] Summary format verified

**Estimated tokens to complete:** ~18,000

---

### T1.6.6: Create `test_converters.py`

**Objective:** Test DataFrame ↔ Pydantic conversion.

**File to create:** `src-tauri/python/tests/contracts/test_converters.py`

**Dependencies:** T1.6.1

**Required Test Classes:**

#### 1. `TestDataframeToLoadedPositions`
- `test_valid_dataframe` - Converts correctly
- `test_column_name_normalization` - Case-insensitive
- `test_column_name_mapping` - Aliases work
- `test_missing_required_column` - Returns issue
- `test_invalid_row_skipped` - Other rows still converted
- `test_empty_dataframe` - Returns empty list

#### 2. `TestDataframeToHoldings`
- `test_valid_dataframe` - Converts correctly
- `test_weight_column_aliases` - weight, Weight, weight_percentage

#### 3. `TestLoadedPositionsToDataframe`
- `test_round_trip` - Convert and back preserves data
- `test_empty_list` - Returns empty DataFrame with columns

#### 4. `TestSafeConvertRow`
- `test_valid_row` - Returns (model, None)
- `test_invalid_row` - Returns (None, issue)

**Acceptance Criteria:**
- [ ] 100% line coverage on converters.py
- [ ] Round-trip conversion verified
- [ ] Error handling verified

**Estimated tokens to complete:** ~18,000

---

## Verification & Completion

### T1.7.1: Run Full Test Suite

**Objective:** Verify all tests pass and coverage target met.

**Dependencies:** T1.6.6

**Commands:**
```bash
cd src-tauri/python
python -m pytest tests/contracts/ -v --cov=portfolio_src.core.contracts --cov-report=term-missing
```

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Coverage >= 100% on contracts package
- [ ] No import errors
- [ ] No circular dependencies

**Estimated tokens to complete:** ~10,000

---

### T1.7.2: Integration Smoke Test

**Objective:** Verify contracts work with existing pipeline code.

**Dependencies:** T1.7.1

**Test Script:**
```python
"""
Smoke test: Verify contracts integrate with existing code.
Run from src-tauri/python directory.
"""

from portfolio_src.core.contracts import (
    DataQuality,
    ValidationGates,
    LoadPhaseOutput,
    LoadedPosition,
    dataframe_to_loaded_positions,
)
import pandas as pd

# Test 1: Create contracts from DataFrame
df = pd.DataFrame({
    "isin": ["US0378331005", "IE00B4L5Y983"],
    "name": ["Apple Inc", "iShares MSCI World"],
    "quantity": [10.0, 50.0],
    "current_price": [150.0, 80.0],
    "asset_type": ["Stock", "ETF"],
})

positions, quality = dataframe_to_loaded_positions(df)
print(f"Converted {len(positions)} positions, quality: {quality.score}")

# Test 2: Validate through gates
output = LoadPhaseOutput(
    direct_positions=[p for p in positions if p.asset_class.value == "Stock"],
    etf_positions=[p for p in positions if p.asset_class.value == "ETF"],
)

gates = ValidationGates()
result = gates.validate_load_output(output)
print(f"Gate passed: {result.passed}, issues: {len(result.quality.issues)}")

# Test 3: Get summary
summary = gates.get_summary()
print(f"Summary: {summary}")

print("Smoke test passed!")
```

**Acceptance Criteria:**
- [ ] Smoke test runs without errors
- [ ] Contracts work with real DataFrame data
- [ ] Gates produce expected output

**Estimated tokens to complete:** ~8,000

---

## Appendix A: File Locations

| File | Full Path |
|------|-----------|
| quality.py | `src-tauri/python/portfolio_src/core/contracts/quality.py` |
| schemas.py | `src-tauri/python/portfolio_src/core/contracts/schemas.py` |
| validation.py | `src-tauri/python/portfolio_src/core/contracts/validation.py` |
| gates.py | `src-tauri/python/portfolio_src/core/contracts/gates.py` |
| converters.py | `src-tauri/python/portfolio_src/core/contracts/converters.py` |
| __init__.py | `src-tauri/python/portfolio_src/core/contracts/__init__.py` |
| factories.py | `src-tauri/python/tests/contracts/factories.py` |
| test_schemas.py | `src-tauri/python/tests/contracts/test_schemas.py` |
| test_quality.py | `src-tauri/python/tests/contracts/test_quality.py` |
| test_validation.py | `src-tauri/python/tests/contracts/test_validation.py` |
| test_gates.py | `src-tauri/python/tests/contracts/test_gates.py` |
| test_converters.py | `src-tauri/python/tests/contracts/test_converters.py` |

---

## Appendix B: Issue Codes Reference

| Code | Severity | Category | Trigger |
|------|----------|----------|---------|
| NO_POSITIONS | HIGH | SCHEMA | Empty positions list |
| ZERO_VALUE_POSITIONS | MEDIUM | VALUE | market_value <= 0 |
| UNKNOWN_ASSET_CLASS | LOW | ENRICHMENT | asset_class == UNKNOWN |
| NON_EUR_CURRENCY | HIGH | CURRENCY | currency != EUR |
| NO_HOLDINGS | HIGH | SCHEMA | Empty holdings list |
| WEIGHT_DECIMAL_FORMAT | CRITICAL | WEIGHT | Sum 0.5-1.5 |
| WEIGHT_SUM_VERY_LOW | CRITICAL | WEIGHT | Sum < 50 |
| WEIGHT_SUM_LOW | HIGH | WEIGHT | Sum 50-90 |
| WEIGHT_SUM_HIGH | MEDIUM | WEIGHT | Sum > 110 |
| NEGATIVE_WEIGHTS | MEDIUM | WEIGHT | Any weight < 0 |
| LOW_RESOLUTION_RATE | HIGH | RESOLUTION | Rate < 50% |
| MODERATE_RESOLUTION_RATE | MEDIUM | RESOLUTION | Rate 50-80% |
| LOW_SECTOR_COVERAGE | MEDIUM | ENRICHMENT | Coverage < 50% |
| LOW_GEOGRAPHY_COVERAGE | MEDIUM | ENRICHMENT | Coverage < 50% |
| ZERO_PORTFOLIO_VALUE | CRITICAL | VALUE | Expected total <= 0 |
| TOTAL_MISMATCH_LARGE | CRITICAL | VALUE | Difference > 10% |
| TOTAL_MISMATCH | HIGH | VALUE | Difference > tolerance |
| PERCENTAGE_SUM_LOW | HIGH | VALUE | Sum < 95% |
| PERCENTAGE_SUM_HIGH | MEDIUM | VALUE | Sum > 105% |
| CONVERSION_ERROR | MEDIUM | SCHEMA | Row failed Pydantic validation |

---

## Appendix C: Penalty Weights

| Severity | Penalty | Example Impact |
|----------|---------|----------------|
| CRITICAL | 0.25 | 1 issue → 75%, 2 → 50%, 4 → 0% |
| HIGH | 0.10 | 1 issue → 90%, 2 → 80%, 5 → 50% |
| MEDIUM | 0.03 | 1 issue → 97%, 2 → 94%, 10 → 70% |
| LOW | 0.01 | 1 issue → 99%, 5 → 95%, 10 → 90% |

**Trustworthy threshold:** score >= 0.95

---

## Appendix D: Task Dependency Graph

```
T1.1.1 (quality.py)
    │
    ▼
T1.1.2 (__init__.py v1)
    │
    ▼
T1.2.1 (schemas - enums) ──────────────────────────────────────┐
    │                                                          │
    ▼                                                          │
T1.2.2 (schemas - load) ───────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.2.3 (schemas - decompose) ──────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.2.4 (schemas - enrich) ─────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.2.5 (schemas - aggregate) ──────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.2.6 (__init__.py v2) ───────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.3.1 (validation - load) ────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.3.2 (validation - decompose) ───────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.3.3 (validation - enrich) ──────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.3.4 (validation - aggregate) ───────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.3.5 (__init__.py v3) ───────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.4.1 (gates.py) ─────────────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.4.2 (__init__.py v4) ───────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.5.1 (converters.py) ────────────────────────────────────────┤
    │                                                          │
    ▼                                                          │
T1.5.2 (__init__.py v5 - final) ───────────────────────────────┘
    │
    ▼
T1.6.1 (test factories)
    │
    ├──────────────┬──────────────┬──────────────┬──────────────┐
    ▼              ▼              ▼              ▼              ▼
T1.6.2         T1.6.3         T1.6.4         T1.6.5         T1.6.6
(test_schemas) (test_quality) (test_valid)   (test_gates)   (test_conv)
    │              │              │              │              │
    └──────────────┴──────────────┴──────────────┴──────────────┘
                                  │
                                  ▼
                              T1.7.1 (run tests)
                                  │
                                  ▼
                              T1.7.2 (smoke test)
```

---

## Appendix E: Estimated Token Budget per Task

| Task | Est. Tokens | Cumulative |
|------|-------------|------------|
| T1.1.1 | 15,000 | 15,000 |
| T1.1.2 | 5,000 | 20,000 |
| T1.2.1 | 8,000 | 28,000 |
| T1.2.2 | 12,000 | 40,000 |
| T1.2.3 | 15,000 | 55,000 |
| T1.2.4 | 10,000 | 65,000 |
| T1.2.5 | 12,000 | 77,000 |
| T1.2.6 | 5,000 | 82,000 |
| T1.3.1 | 15,000 | 97,000 |
| T1.3.2 | 18,000 | 115,000 |
| T1.3.3 | 12,000 | 127,000 |
| T1.3.4 | 15,000 | 142,000 |
| T1.3.5 | 5,000 | 147,000 |
| T1.4.1 | 20,000 | 167,000 ❌ |

**Issue:** T1.4.1 would exceed 160k context.

**Solution:** Tasks are designed to be executed independently. Each task:
1. Reads only the files it needs to modify
2. Has complete specification in the PRD
3. Does not require reading previous task outputs

An agent starting T1.4.1 fresh would read:
- This PRD section (~5k tokens)
- T1.3.5 output (__init__.py, ~1k tokens)
- Existing files for reference (~10k tokens)

**Actual per-task context:** ~30-50k tokens, well within 160k limit.

---

## Appendix F: Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test coverage | 100% | `pytest --cov` on contracts package |
| All tests pass | 100% | `pytest` exit code 0 |
| No type errors | 0 | `mypy portfolio_src/core/contracts/` |
| Import time | < 500ms | Time to `import portfolio_src.core.contracts` |
| Smoke test | Pass | Integration script runs without error |

---

## Appendix G: Out of Scope (Phase 2+)

The following are explicitly **NOT** part of Phase 1:

1. **Pipeline integration** - Modifying `core/pipeline.py` to use contracts
2. **UI changes** - Displaying quality scores in frontend
3. **Telemetry** - Reporting issues to GitHub
4. **Bug fixes** - Fixing the 16 identified issues
5. **Migration** - Updating existing code to use contracts
6. **Configuration** - User-adjustable penalty weights

These will be addressed in subsequent phases.
