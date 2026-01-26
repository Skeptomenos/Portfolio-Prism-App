# PRD: Phase 2 — Validation Gates Integration

> **Project:** Pipeline Hardening  
> **Phase:** 2 of 5  
> **Status:** Ready for Implementation  
> **Estimated Effort:** 2-3 days  
> **Dependencies:** Phase 1 (Contracts) ✅ Complete

---

## Executive Summary

Phase 2 wires the contracts package (built in Phase 1) into the live pipeline. After completion, every pipeline run will:

1. **Validate data at each phase boundary** using `ValidationGates`
2. **Accumulate quality issues** into a `DataQuality` score
3. **Include quality summary** in `pipeline_health.json`
4. **Log validation issues** with appropriate severity
5. **Continue running** even with critical issues (never crash)

**User-Visible Outcome:** `pipeline_health.json` will contain a new `data_quality` section showing score, issues, and fix hints.

---

## Problem Statement

### Current State

The contracts package exists but is **completely isolated** from the pipeline:

```
pipeline.py                          core/contracts/
├── Uses PipelineError              ├── ValidationGates (unused)
├── No validation at boundaries     ├── DataQuality (unused)
├── No quality scoring              ├── ValidationIssue (unused)
└── Issues not actionable           └── 111 tests passing
```

### User Impact

- Pipeline completes but user doesn't know if results are trustworthy
- ISIN resolution failures are counted but not reported as issues
- Weight sum anomalies (e.g., 85% instead of 100%) go unnoticed
- No actionable fix hints for data quality problems

---

## Goals & Non-Goals

### Goals

1. **Integrate `ValidationGates`** into `Pipeline` class
2. **Validate after each phase** without blocking execution
3. **Add quality summary** to `pipeline_health.json`
4. **Log issues** at appropriate severity levels
5. **Preserve existing behavior** — pipeline must still complete

### Non-Goals (Deferred to Later Phases)

- ❌ GitHub issue creation (Phase 4)
- ❌ UI quality indicators (Phase 3)
- ❌ SSE broadcast of quality (Phase 3)
- ❌ Bug fixes for identified issues (Phase 5)

---

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Pipeline.run()                                                             │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   LOAD      │───▶│  DECOMPOSE  │───▶│   ENRICH    │───▶│  AGGREGATE  │  │
│  │  Phase 1    │    │   Phase 2   │    │   Phase 3   │    │   Phase 4   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      ValidationGates                                  │  │
│  │  validate_load_output() → validate_decompose_output() → ...          │  │
│  │                           ↓                                          │  │
│  │                    DataQuality (accumulates)                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│                         _write_health_report()                              │
│                         includes gates.get_summary()                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Integration Points

| Location | Line | Action |
|----------|------|--------|
| `Pipeline.__init__()` | ~130 | Add `self._validation_gates: Optional[ValidationGates] = None` |
| `Pipeline.run()` start | ~228 | Initialize `self._validation_gates = ValidationGates()` |
| After Phase 1 | ~265 | Convert + validate load output |
| After Phase 2 | ~325 | Convert + validate decompose output |
| After Phase 3 | ~362 | Convert + validate enrich output |
| After Phase 4 | ~385 | Convert + validate aggregate output |
| `_write_health_report()` | ~556 | Add `data_quality` section from `gates.get_summary()` |

---

## Implementation Plan

### Task 1: Add ValidationGates to Pipeline Class

**File:** `src-tauri/python/portfolio_src/core/pipeline.py`

```python
# Add import at top
from portfolio_src.core.contracts import (
    ValidationGates,
    LoadPhaseOutput,
    DecomposePhaseOutput,
    EnrichPhaseOutput,
    AggregatePhaseOutput,
    ETFDecomposition,
    dataframe_to_loaded_positions,
    dataframe_to_holdings,
)

# In Pipeline.__init__ (around line 130)
class Pipeline:
    def __init__(self, ...):
        ...
        self._validation_gates: Optional[ValidationGates] = None
```

### Task 2: Initialize Gates at Run Start

**File:** `src-tauri/python/portfolio_src/core/pipeline.py`

```python
# In run() method, after line 228 (after monitor = PipelineMonitor())
self._validation_gates = ValidationGates()
```

### Task 3: Validate Phase 1 (Load) Output

**Location:** After line 265 (after `monitor.record_phase("data_loading", ...)`)

```python
# Phase 1 Validation
load_output = self._build_load_phase_output(direct_positions, etf_positions)
load_result = self._validation_gates.validate_load_output(load_output)
if not load_result.passed:
    self._log_validation_issues(load_result.quality, "DATA_LOADING")
```

**New helper method:**

```python
def _build_load_phase_output(
    self,
    direct_positions: pd.DataFrame,
    etf_positions: pd.DataFrame,
) -> LoadPhaseOutput:
    """Convert DataFrames to LoadPhaseOutput for validation."""
    from portfolio_src.core.contracts import dataframe_to_loaded_positions
    
    direct_list, direct_quality = dataframe_to_loaded_positions(
        direct_positions, phase="DATA_LOADING"
    )
    etf_list, etf_quality = dataframe_to_loaded_positions(
        etf_positions, phase="DATA_LOADING"
    )
    
    # Merge conversion issues into gates
    for issue in direct_quality.issues + etf_quality.issues:
        self._validation_gates._pipeline_quality.add_issue(issue)
    
    return LoadPhaseOutput(
        direct_positions=direct_list,
        etf_positions=etf_list,
    )
```

### Task 4: Validate Phase 2 (Decompose) Output

**Location:** After line 325 (after `monitor.record_phase("etf_decomposition", ...)`)

```python
# Phase 2 Validation
decompose_output = self._build_decompose_phase_output(
    holdings_map, etf_positions, decompose_errors
)
decompose_result = self._validation_gates.validate_decompose_output(decompose_output)
if not decompose_result.passed:
    self._log_validation_issues(decompose_result.quality, "ETF_DECOMPOSITION")
```

**New helper method:**

```python
def _build_decompose_phase_output(
    self,
    holdings_map: Dict[str, pd.DataFrame],
    etf_positions: pd.DataFrame,
    errors: List[PipelineError],
) -> DecomposePhaseOutput:
    """Convert holdings_map to DecomposePhaseOutput for validation."""
    from portfolio_src.core.contracts import dataframe_to_holdings, ETFDecomposition
    
    decompositions = []
    for etf_isin, holdings_df in holdings_map.items():
        holdings_list, quality = dataframe_to_holdings(
            holdings_df, phase="ETF_DECOMPOSITION"
        )
        
        # Merge conversion issues
        for issue in quality.issues:
            self._validation_gates._pipeline_quality.add_issue(issue)
        
        etf_name = self._get_etf_name(etf_positions, etf_isin)
        etf_value = self._get_etf_value(etf_positions, etf_isin)
        source = self._decomposer.get_etf_sources().get(etf_isin, "unknown") if self._decomposer else "unknown"
        
        decompositions.append(ETFDecomposition(
            etf_isin=etf_isin,
            etf_name=etf_name,
            etf_value=etf_value,
            holdings=holdings_list,
            source=source,
        ))
    
    return DecomposePhaseOutput(
        decompositions=decompositions,
        etfs_failed=len(errors),
    )

def _get_etf_value(self, etf_positions: pd.DataFrame, isin: str) -> float:
    """Get ETF market value from positions DataFrame."""
    if etf_positions.empty:
        return 0.0
    match = etf_positions[etf_positions["isin"] == isin]
    if match.empty:
        return 0.0
    row = match.iloc[0]
    qty = row.get("quantity", 0)
    price = row.get("current_price") or row.get("price") or row.get("tr_price") or 0
    return float(qty) * float(price)
```

### Task 5: Validate Phase 3 (Enrich) Output

**Location:** After line 362 (after `monitor.record_phase("enrichment", ...)`)

```python
# Phase 3 Validation
enrich_output = self._build_enrich_phase_output(
    enriched_holdings, direct_positions
)
enrich_result = self._validation_gates.validate_enrich_output(enrich_output)
if not enrich_result.passed:
    self._log_validation_issues(enrich_result.quality, "ENRICHMENT")
```

**New helper method:**

```python
def _build_enrich_phase_output(
    self,
    enriched_holdings: Dict[str, pd.DataFrame],
    direct_positions: pd.DataFrame,
) -> EnrichPhaseOutput:
    """Convert enriched data to EnrichPhaseOutput for validation."""
    from portfolio_src.core.contracts import (
        dataframe_to_holdings,
        dataframe_to_loaded_positions,
        ETFDecomposition,
    )
    
    decompositions = []
    for etf_isin, holdings_df in enriched_holdings.items():
        holdings_list, quality = dataframe_to_holdings(
            holdings_df, phase="ENRICHMENT"
        )
        for issue in quality.issues:
            self._validation_gates._pipeline_quality.add_issue(issue)
        
        decompositions.append(ETFDecomposition(
            etf_isin=etf_isin,
            etf_name="",  # Not needed for enrichment validation
            etf_value=0.0,
            holdings=holdings_list,
            source="enriched",
        ))
    
    direct_list, direct_quality = dataframe_to_loaded_positions(
        direct_positions, phase="ENRICHMENT"
    )
    for issue in direct_quality.issues:
        self._validation_gates._pipeline_quality.add_issue(issue)
    
    return EnrichPhaseOutput(
        enriched_decompositions=decompositions,
        enriched_direct=direct_list,
    )
```

### Task 6: Validate Phase 4 (Aggregate) Output

**Location:** After line 385 (after `monitor.record_phase("aggregation", ...)`)

```python
# Phase 4 Validation
aggregate_output = self._build_aggregate_phase_output(exposure_df)
expected_total = calculate_portfolio_total_value(direct_positions, etf_positions)
aggregate_result = self._validation_gates.validate_aggregate_output(
    aggregate_output, expected_total
)
if not aggregate_result.passed:
    self._log_validation_issues(aggregate_result.quality, "AGGREGATION")
```

**New helper method:**

```python
def _build_aggregate_phase_output(
    self,
    exposure_df: pd.DataFrame,
) -> AggregatePhaseOutput:
    """Convert exposure DataFrame to AggregatePhaseOutput for validation."""
    from portfolio_src.core.contracts import AggregatedExposureRecord, AggregatePhaseOutput
    
    exposures = []
    total_value = 0.0
    
    if not exposure_df.empty:
        for _, row in exposure_df.iterrows():
            try:
                record = AggregatedExposureRecord(
                    isin=str(row.get("isin", "UNKNOWN")),
                    name=str(row.get("name", "Unknown")),
                    sector=str(row.get("sector", "Unknown")),
                    geography=str(row.get("geography", "Unknown")),
                    total_exposure=float(row.get("total_exposure", 0)),
                    portfolio_percentage=float(row.get("portfolio_percentage", 0)),
                    resolution_confidence=float(row.get("resolution_confidence", 0)),
                    resolution_source=row.get("resolution_source"),
                )
                exposures.append(record)
                total_value += record.total_exposure
            except Exception as e:
                logger.warning(f"Failed to convert exposure row: {e}")
    
    return AggregatePhaseOutput(
        exposures=exposures,
        total_portfolio_value=total_value,
    )
```

### Task 7: Add Logging Helper

**New method in Pipeline class:**

```python
def _log_validation_issues(self, quality: "DataQuality", phase: str) -> None:
    """Log validation issues at appropriate severity levels."""
    from portfolio_src.core.contracts import IssueSeverity
    
    for issue in quality.issues:
        msg = f"[{phase}] {issue.code}: {issue.message}"
        if issue.severity == IssueSeverity.CRITICAL:
            logger.error(msg)
        elif issue.severity == IssueSeverity.HIGH:
            logger.warning(msg)
        elif issue.severity == IssueSeverity.MEDIUM:
            logger.info(msg)
        else:
            logger.debug(msg)
```

### Task 8: Add Quality to Health Report

**File:** `src-tauri/python/portfolio_src/core/pipeline.py`

**Modify `_write_health_report()` signature:**

```python
def _write_health_report(
    self,
    errors,
    direct_positions,
    etf_positions,
    holdings_map,
    monitor: PipelineMonitor,
    decomposer: Optional[Decomposer] = None,
    validation_gates: Optional[ValidationGates] = None,  # NEW
):
```

**Add to `health_data` dict (before `write_json_atomic`):**

```python
# Add data quality section
if validation_gates:
    health_data["data_quality"] = validation_gates.get_summary()
else:
    health_data["data_quality"] = {
        "quality_score": 1.0,
        "is_trustworthy": True,
        "total_issues": 0,
        "by_severity": {},
        "by_category": {},
        "issues": [],
    }
```

**Update call site in `run()` finally block:**

```python
self._write_health_report(
    errors,
    direct_positions,
    etf_positions,
    holdings_map,
    monitor,
    self._decomposer,
    self._validation_gates,  # NEW
)
```

---

## Output Schema

### New `data_quality` Section in `pipeline_health.json`

```json
{
  "timestamp": "2026-01-10T14:30:00",
  "data_quality": {
    "quality_score": 0.85,
    "is_trustworthy": false,
    "total_issues": 3,
    "by_severity": {
      "critical": 0,
      "high": 1,
      "medium": 2,
      "low": 0
    },
    "by_category": {
      "schema": 0,
      "weight": 1,
      "resolution": 1,
      "enrichment": 1,
      "currency": 0,
      "value": 0
    },
    "issues": [
      {
        "severity": "high",
        "category": "weight",
        "code": "WEIGHT_SUM_LOW",
        "message": "Weight sum is 85.2%, below expected ~100%",
        "fix_hint": "Holdings data may be incomplete - some positions missing",
        "item": "IE00B4L5Y983",
        "phase": "ETF_DECOMPOSITION",
        "timestamp": "2026-01-10T14:30:00",
        "expected": "90-110",
        "actual": "85.2"
      }
    ]
  },
  "metrics": { ... },
  "performance": { ... },
  "decomposition": { ... },
  "enrichment": { ... },
  "failures": [ ... ]
}
```

---

## Testing Strategy

### Unit Tests

Add to `tests/contracts/test_integration.py`:

```python
"""Integration tests for ValidationGates in Pipeline."""

import pytest
import pandas as pd
from unittest.mock import MagicMock, patch

from portfolio_src.core.pipeline import Pipeline
from portfolio_src.core.contracts import ValidationGates, LoadPhaseOutput


class TestPipelineValidationIntegration:
    """Test ValidationGates integration with Pipeline."""
    
    def test_gates_initialized_on_run(self):
        """ValidationGates should be created at run start."""
        pipeline = Pipeline()
        # Mock to prevent actual execution
        with patch.object(pipeline, '_init_services'):
            with patch.object(pipeline, '_load_portfolio', return_value=(pd.DataFrame(), pd.DataFrame())):
                pipeline.run()
        
        assert pipeline._validation_gates is not None
    
    def test_load_phase_validation_called(self):
        """Load phase should trigger validation."""
        pipeline = Pipeline()
        pipeline._validation_gates = ValidationGates()
        
        direct = pd.DataFrame({
            'isin': ['US0378331005'],
            'name': ['Apple Inc'],
            'quantity': [10.0],
            'current_price': [150.0],
            'asset_class': ['Stock'],
        })
        
        output = pipeline._build_load_phase_output(direct, pd.DataFrame())
        result = pipeline._validation_gates.validate_load_output(output)
        
        assert result.passed is True
        assert len(output.direct_positions) == 1
    
    def test_quality_in_health_report(self):
        """Health report should include data_quality section."""
        # Test that get_summary() output is included
        gates = ValidationGates()
        summary = gates.get_summary()
        
        assert 'quality_score' in summary
        assert 'is_trustworthy' in summary
        assert 'issues' in summary
```

### Integration Tests

Add to `tests/test_pipeline_e2e.py`:

```python
def test_pipeline_produces_quality_report():
    """End-to-end: pipeline_health.json contains data_quality."""
    import json
    from portfolio_src.config import PIPELINE_HEALTH_PATH
    
    pipeline = Pipeline()
    result = pipeline.run()
    
    with open(PIPELINE_HEALTH_PATH) as f:
        health = json.load(f)
    
    assert 'data_quality' in health
    assert 'quality_score' in health['data_quality']
    assert isinstance(health['data_quality']['issues'], list)
```

---

## Acceptance Criteria

### Must Have

- [ ] `ValidationGates` instantiated at pipeline run start
- [ ] `validate_load_output()` called after Phase 1
- [ ] `validate_decompose_output()` called after Phase 2
- [ ] `validate_enrich_output()` called after Phase 3
- [ ] `validate_aggregate_output()` called after Phase 4
- [ ] `pipeline_health.json` contains `data_quality` section
- [ ] Validation issues logged at appropriate severity
- [ ] Pipeline completes even with critical validation issues
- [ ] All existing tests still pass

### Should Have

- [ ] Conversion errors tracked as validation issues
- [ ] Quality score reflects accumulated issues
- [ ] Fix hints included in issue output

### Nice to Have

- [ ] Per-phase quality breakdown in health report
- [ ] Timing metrics for validation overhead

---

## Rollback Plan

If issues arise:

1. **Quick disable:** Set `self._validation_gates = None` at run start
2. **Full revert:** Remove all validation calls, revert `_write_health_report` signature
3. **Partial:** Keep gates but skip specific phase validations

Validation is additive and non-blocking — it cannot break existing functionality.

---

## Files to Modify

| File | Changes |
|------|---------|
| `core/pipeline.py` | Add imports, gates initialization, 4 validation calls, 5 helper methods, health report update |
| `tests/contracts/test_integration.py` | New file with integration tests |
| `tests/test_pipeline_e2e.py` | Add quality report assertion |

**Estimated Lines Changed:** ~200 additions, ~5 modifications

---

## Dependencies

### Required (Phase 1 — Complete)

- `core/contracts/__init__.py` — Exports all needed classes
- `core/contracts/gates.py` — `ValidationGates` class
- `core/contracts/schemas.py` — All phase output models
- `core/contracts/converters.py` — DataFrame conversion utilities
- `core/contracts/validation.py` — Validation functions

### No External Dependencies

All required code exists in the codebase.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Pipeline still completes | 100% of runs |
| Health report has quality section | 100% of runs |
| Validation overhead | < 500ms per run |
| Test coverage for new code | > 90% |

---

## Open Questions

1. **Should validation issues also be added to `errors` list?**
   - Recommendation: No, keep them separate. `errors` = blocking issues, `issues` = quality observations.

2. **Should we validate on empty DataFrames?**
   - Recommendation: Yes, but return early with appropriate issue (already handled in contracts).

3. **What if conversion fails for all rows?**
   - Recommendation: Log error, continue with empty output, add CRITICAL issue.

---

## Appendix: Existing Contract APIs

### ValidationGates Methods

```python
class ValidationGates:
    def validate_load_output(self, output: LoadPhaseOutput) -> GateResult
    def validate_decompose_output(self, output: DecomposePhaseOutput) -> GateResult
    def validate_enrich_output(self, output: EnrichPhaseOutput) -> GateResult
    def validate_aggregate_output(self, output: AggregatePhaseOutput, expected_total: float) -> GateResult
    def get_pipeline_quality(self) -> DataQuality
    def get_summary(self) -> Dict[str, Any]
    def reset(self) -> None
```

### Converter Functions

```python
def dataframe_to_loaded_positions(df, phase) -> Tuple[List[LoadedPosition], DataQuality]
def dataframe_to_holdings(df, phase) -> Tuple[List[HoldingRecord], DataQuality]
def loaded_positions_to_dataframe(positions) -> pd.DataFrame
def holdings_to_dataframe(holdings) -> pd.DataFrame
```

### GateResult Structure

```python
@dataclass
class GateResult:
    passed: bool          # True if no critical issues
    quality: DataQuality  # Issues found in this gate
    data: Any             # The validated output
```
