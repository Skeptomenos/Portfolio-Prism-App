# Analytics Pipeline Refactoring Plan

> **Date:** 2024-12-07
> **Status:** Ready for Execution
> **Goal:** Port the 7-phase analytics pipeline with service-oriented architecture for MVP testing and future React migration.

---

## Executive Summary

**Scope:** Port complete pipeline with service-oriented architecture.

**Key Features:**
- **Service-oriented architecture** — thin orchestrator + separate services (React-ready)
- **Structured error reporting** — `PipelineError` type + automatic GitHub issue creation
- **Hybrid visualization** — pipeline generates data, UI renders charts on-demand
- **Auto-harvesting** — community asset learning (sync deferred to backlog)

**Timeline:** 18-25 hours over 1-2 weeks

**Related Documents:**
- [Part 2: Services & Pipeline](./PLAN_PART2_SERVICES.md) — Phase 2 implementation details
- [Part 3: UI & Integration](./PLAN_PART3_INTEGRATION.md) — Phases 2.5-4, architecture reference

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICES LAYER (UI-agnostic)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Decomposer   │  │ Enricher     │  │ Aggregator           │   │
│  │ - decompose()│  │ - enrich()   │  │ - aggregate()        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                   PIPELINE ORCHESTRATOR                         │
│  - Calls services in order                                      │
│  - Emits progress via callback                                  │
│  - Collects List[PipelineError]                                 │
│  - Auto-harvests (non-fatal)                                    │
│  - Writes outputs + error log                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ CSV Reports  │  │ Error Log    │  │ Metrics              │   │
│  │ (exposures)  │  │ (JSON)       │  │ (JSON)               │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Streamlit UI │  │ Chart Utils  │  │ Error Reporter       │   │
│  │ (current)    │  │ (on-demand)  │  │ (GitHub via proxy)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│         ↓                                                       │
│  ┌──────────────┐                                               │
│  │ React UI     │  ← Future: same services, different UI       │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Pipeline is a thin orchestrator** — calls services, contains no business logic
2. **Services are UI-agnostic** — no Streamlit imports, reusable with React
3. **Visualization is on-demand** — UI generates charts from CSV data, caches in session
4. **Errors are structured** — `PipelineError` objects, auto-reported to GitHub
5. **Harvesting is automatic** — runs at end of pipeline, non-fatal

---

## Phase Summary

| Phase | Name | Hours | Description |
|-------|------|-------|-------------|
| 0 | Pre-Flight Audit | 3-4 | Verify imports, dependencies, create mock data |
| 1 | Dependencies | 2-3 | Add missing deps, config constants, path fixes |
| 2 | Services & Pipeline | 5-7 | Create Decomposer, Enricher, Aggregator, Pipeline |
| 2.5 | Harvesting & Charts | 3-4 | Auto-harvest, on-demand charts, error reporter |
| 3 | UI Integration | 3-4 | Progress bar, error display, X-Ray tab |
| 4 | Validation | 2-3 | Service tests, E2E tests, error scenarios |

**Total: 18-25 hours**

---

## Phase 0: Pre-Flight Audit (3-4 hours)

**Goal:** Verify all dependencies, modules, environment, and create test data.

| Task | File | Action |
|------|------|--------|
| **0.1** | Audit | Verify all src.* imports using translation table below |
| **0.2** | Audit | Confirm external scripts exist: `visualize_portfolio.py`, `harvest_enrichment.py` |
| **0.3** | Audit | Verify dependencies against `requirements-build.txt` |
| **0.4** | Test | Create smoke test script to import all critical modules |
| **0.5** | Audit | Verify hardcoded paths using list below |
| **0.6** | Test Data | Create `tests/fixtures/mock_positions.csv` — 5 direct holdings + 3 ETFs |
| **0.7** | Test Data | Create `tests/fixtures/mock_etf_holdings/` — CSV per mock ETF |
| **0.8** | Test | Create `tests/test_pipeline_smoke.py` — imports Pipeline, runs on mock data |

**Success Criteria:** All modules importable, dependencies identified, mock data created.

---

## Phase 1: Dependencies & Configuration (2-3 hours)

**Goal:** Ensure safe runtime environment with all dependencies.

| Task | File | Action |
|------|------|--------|
| **1.1** | `requirements-build.txt` | Add `matplotlib>=3.7.0`, `yfinance>=0.2.0` |
| **1.2** | `prism.spec` | Add hidden_imports: `'matplotlib'`, `'matplotlib.backends.backend_agg'`, `'yfinance'` |
| **1.3** | `prism.spec` | Add `hidden_imports += collect_submodules('matplotlib')` |
| **1.4** | `config.py` | Add `ENRICHMENT_CACHE_PATH = WORKING_DIR / "cache" / "enrichment_cache.json"` |
| **1.5** | `config.py` | Add `PIPELINE_ERRORS_PATH = OUTPUTS_DIR / "pipeline_errors.json"` |
| **1.6** | `lib.rs` | Set `MPLBACKEND=Agg` in sidecar spawn environment |
| **1.7** | Pipeline code | Replace hardcoded paths with `config.*` constants |
| **1.8** | Test | Rebuild binary and run smoke test |

---

## Import Path Translation Table

Pipeline code uses POC-style imports (`src.*`). These must be translated:

| POC Import | Transplant Import |
|------------|-------------------|
| `src.utils.logging_config` | `portfolio_src.prism_utils.logging_config` |
| `src.utils.schemas` | `portfolio_src.prism_utils.schemas` |
| `src.utils.metrics` | `portfolio_src.prism_utils.metrics` |
| `src.config` | `portfolio_src.config` |
| `src.core.*` | `portfolio_src.core.*` |
| `src.data.*` | `portfolio_src.data.*` |
| `src.adapters.*` | `portfolio_src.adapters.*` |
| `scripts.visualize_portfolio` | `portfolio_src.dashboard.utils.charts` (new) |
| `scripts.harvest_enrichment` | `portfolio_src.core.harvesting` (new) |

---

## Hardcoded Paths to Fix

| File | Line(s) | Hardcoded | Replace With |
|------|---------|-----------|--------------|
| `run_pipeline.py` | 104, 305, 376 | `"outputs/pipeline_metrics.json"` | `config.OUTPUTS_DIR / "pipeline_metrics.json"` |
| `run_pipeline.py` | 117 | `"config/asset_universe.csv"` | `config.ASSET_UNIVERSE_PATH` |
| `run_pipeline.py` | 342 | `"outputs/true_exposure_report.csv"` | `config.TRUE_EXPOSURE_REPORT` |
| `run_pipeline.py` | 364 | `"outputs/data_quality_report.txt"` | `config.REPORTS_DIR / "data_quality_report.txt"` |
| `visualize_portfolio.py` | 7-8 | `OUTPUT_DIR = "outputs"` | `from config import OUTPUTS_DIR` |
| `harvest_enrichment.py` | 18 | `CACHE_PATH = "data/working/cache/..."` | `config.ENRICHMENT_CACHE_PATH` |

---

## Dependency Status

| Dependency | requirements-build.txt | prism.spec | Used By | Action |
|------------|------------------------|------------|---------|--------|
| `matplotlib` | Missing | Missing | On-demand charts | **Add to both** |
| `yfinance` | Missing | Missing | 5 data modules | **Add to both** |
| `pandera` | Present | Present | Pipeline validation | None |
| `numpy` | Present | Present | Multiple | None |
| `pandas` | Present | Present | Core | None |

---

## Success Criteria

1. Pipeline runs in bundled app without crashes
2. UI shows progress bar during execution
3. Structured errors written to `pipeline_errors.json`
4. Errors auto-reported to GitHub via Cloudflare proxy
5. Charts generated on-demand in X-Ray tab with session caching
6. Auto-harvesting updates `asset_universe.csv`
7. Services testable independently

---

## Rollback Points

- **Phase 0 Failure:** Stop and fix environment issues
- **Phase 1 Failure:** Rebuild binary iteratively until imports resolve
- **Phase 2 Failure:** Collapse services into single module (less ideal)
- **Phase 2.5 Failure:** Skip auto-reporting, use manual issue creation
- **Phase 3 Failure:** Skip on-demand charts, use simple data tables

---

## Next Steps

1. Read [Part 2: Services & Pipeline](./PLAN_PART2_SERVICES.md) for Phase 2 implementation
2. Read [Part 3: UI & Integration](./PLAN_PART3_INTEGRATION.md) for Phases 2.5-4
