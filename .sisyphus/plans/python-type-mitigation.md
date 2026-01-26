# Python Type Mitigation Plan

## Context

### Original Request
Fix 170 mypy errors in the Python sidecar to ensure type safety and stability.

### Interview Summary
**Key Discussions**:
- Total Errors: 170
- Critical Runtime Bugs: `name-defined` errors in `telemetry.py` and `sync.py`.
- Missing Stubs: `requests` library.
- Bulk Issue: 115 `no-untyped-def` errors.

**Research Findings**:
- **Risk**: Bulk annotation can mask bugs if `Any` is overused.
- **Dependency**: `telemetry.py` needs `DataQuality` from `contracts`.
- **Complexity**: `object` errors in `resolution.py` are likely `Any` type erasure in pandas operations.
- **Missing**: `pandas-stubs` and `types-requests`.

### Metis Review
**Identified Gaps**:
- Need to distinguish between simple `Any` fixes and complex container typing.
- Decorators need `@functools.wraps` preservation.
- Test files should be excluded or ignored if not critical.
- `yfinance` and `pytr` lack stubs, requiring pragmatic `Any` usage.

---

## Work Objectives

### Core Objective
Eliminate 170 mypy errors and establish a type-safe foundation for the Python sidecar.

### Concrete Deliverables
- `pyproject.toml` updated with `types-requests` and `pandas-stubs`.
- `portfolio_src/prism_utils/telemetry.py` fixed (runtime bug).
- `portfolio_src/headless/handlers/sync.py` fixed (runtime bug).
- `portfolio_src/data/resolution.py` fully typed (13 errors).
- `portfolio_src/core/pipeline.py` fully typed (13 errors).
- All 115 functions with missing annotations typed.

### Definition of Done
- [ ] `uv run mypy portfolio_src` returns **0 errors**.
- [ ] `uv run pytest` passes (16 existing failures allowed, 0 new failures).

### Must Have
- Fix runtime bugs (`name-defined`) first.
- Install necessary stubs.
- Use `TypedDict` for dictionary structures, not `Dict[str, Any]`.

### Must NOT Have (Guardrails)
- **NO** using `-> Any` for public API return types.
- **NO** suppressing errors with `# type: ignore` unless absolutely necessary (documented).
- **NO** breaking existing tests.

---

## Verification Strategy

**Test Decision**:
- **Infrastructure exists**: YES (`pytest` + `mypy`).
- **User wants tests**: YES (Regression testing).
- **Framework**: `pytest`.

**Verification Procedure**:
1. **Pre-Check**: Run `uv run mypy portfolio_src` to confirm error count.
2. **Implementation**: Apply fixes.
3. **Type Check**: Run `uv run mypy portfolio_src` to verify reduction.
4. **Regression Check**: Run `uv run pytest` to ensure no runtime breakage.

---

## Task Flow

```
Task 1 (Setup) → Task 2 (Runtime Bugs) → Task 3 (Core Logic) 
                                              ↘ Task 4 (Structural) 
                                              ↘ Task 5 (Bulk Annotations)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 3, 4 | Independent files |
| B | 5 | Can be split by module |

---

## TODOs

- [ ] 1. Setup & Dependencies
  **What to do**:
  - Add `types-requests` and `pandas-stubs` to `pyproject.toml` dev dependencies.
  - Run `uv sync`.
  - Verify `import-untyped` errors (8) are resolved.

  **Acceptance Criteria**:
  - [ ] `uv run mypy portfolio_src` shows 8 fewer errors.

- [ ] 2. Fix Critical Runtime Bugs
  **What to do**:
  - `portfolio_src/prism_utils/telemetry.py`: Import `DataQuality` from `core.contracts.quality`.
  - `portfolio_src/headless/handlers/sync.py`: Import/define `STOCK_ENTITY_TYPES`.
  - `portfolio_src/core/services/aggregator.py`: Fix `cols` redefinition.

  **Acceptance Criteria**:
  - [ ] `uv run mypy` shows 0 `name-defined` and `no-redef` errors.
  - [ ] `uv run pytest` passes.

- [ ] 3. Fix Core Logic Type Safety
  **What to do**:
  - **`data/resolution.py` (13 errors)**:
    - Add explicit types for `prices`, `holdings_map`.
    - Fix `object` operations by casting or validating types.
  - **`core/pipeline.py` (13 errors)**:
    - Annotate `warnings`, `holdings_map`.
    - Fix function signatures.

  **Acceptance Criteria**:
  - [ ] `resolution.py` has 0 errors.
  - [ ] `pipeline.py` has 0 errors.

- [ ] 4. Structural Fixes (Decorators & Assignments)
  **What to do**:
  - **`models/holdings.py`, `models/exposure.py`**: Move decorators below `@property`.
  - **`adapters/ishares.py`**: Update return types to `Optional[str]`.
  - **`headless/dispatcher.py`**: Fix async return type.
  - **`headless/handlers/telemetry.py`**: Fix `success_response` args.

  **Acceptance Criteria**:
  - [ ] 0 `prop-decorator` errors.
  - [ ] 0 `return-value` errors.
  - [ ] 0 `arg-type` errors.

- [ ] 5. Bulk Annotation (115 errors)
  **What to do**:
  - Systematically add type hints to all functions in:
    - `prism_utils/logging_config.py`
    - `prism_utils/metrics.py`
    - `core/health.py`
    - `data/caching.py`
    - `data/normalization.py`
    - `data/pipeline_db.py`
    - `data/enrichment.py`
    - `core/tr_daemon.py`
    - `pdf_parser/parser.py`
  - Use `TypedDict` for complex dicts.
  - Use `Optional[T]` instead of `T | None` (Python < 3.10) or `T | None` (3.10+).

  **Acceptance Criteria**:
  - [ ] `uv run mypy portfolio_src` returns **0 errors**.
