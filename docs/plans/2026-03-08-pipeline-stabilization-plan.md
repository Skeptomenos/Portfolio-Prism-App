# X-Ray Pipeline & Hive Stabilization Plan

> **Branch:** `pipeline/stabilize-xray-hive`
> **Created:** 2026-03-08
> **Status:** investigation_complete — ready for execution
> **Predecessor:** Session restore fixes on `codex/stabilize-ipc-xray` (completed)

---

## Goal

Systematically test, dogfood, and fix the X-Ray analysis pipeline end-to-end, including Hive contribution, so that every pipeline stage produces truthful, visible results and failures are never silent.

## Architecture Summary (from investigation)

The pipeline is a 6-phase linear orchestrator in `core/pipeline.py`:

```
LOAD → DECOMPOSE → ENRICH → AGGREGATE → REPORT → HARVEST
```

| Phase | Service | What it does | Key dependency |
|-------|---------|-------------|----------------|
| 1. Load | `_load_portfolio()` | Reads positions from SQLite, splits into direct (stocks) vs ETFs | `data/database.py` |
| 2. Decompose | `Decomposer` | X-rays ETFs into underlying holdings via adapter → cache → Hive cascade | `adapters/registry.py`, `holdings_cache`, `ISINResolver` |
| 3. Enrich | `Enricher` | Adds sector/geography metadata via `HiveEnrichmentService` | `HiveClient`, Finnhub/Wikidata/yFinance fallbacks |
| 4. Aggregate | `Aggregator` | Fuses direct + ETF holdings, normalizes weights, groups by sector/region | Pure computation |
| 5. Report | `_write_reports()` | Writes exposure CSV, holdings breakdown, health report, error log | `SnapshotRepository` |
| 6. Harvest | `harvest_cache()` | Auto-contributes new securities to Hive (non-fatal) | `HiveClient` |

### Hive Contribution Flow

Hive contribution happens at two points:
1. **During decomposition**: When an adapter fetches ETF holdings and resolves ISINs, successful resolutions are contributed back to the Hive community database (`_contribute_to_hive_async`, fire-and-forget daemon thread).
2. **During harvest**: After all phases complete, `harvest_cache()` contributes newly-discovered securities.

The Hive itself is a Supabase PostgreSQL database with:
- `assets` (ISIN → name, asset_class)
- `listings` (ticker/exchange → ISIN)
- `aliases` (name → ISIN)
- `etf_holdings` (ETF ISIN → holdings + weights)
- `contributions` (audit log)

### Known Issues (from investigation report)

| Issue | Severity | Details |
|-------|----------|---------|
| 44% of holdings are `tier2_skipped` | Medium | Below 0.5% weight threshold, have tickers but no resolved ISINs |
| 2 Amundi ETFs always fail | Medium | Different adapter format, requires manual upload |
| Geography coverage 4.2% | High | Critical gap — enrichment APIs don't return geography consistently |
| Sector coverage 55.9% | Medium | Matches ISIN resolution rate — unresolved holdings can't be enriched |
| `is_trustworthy=true` despite gaps | High | Quality score 1.0 despite 44% skipped — may mislead users |

### Key Contracts

- **Pipeline result**: `PipelineResult(success, etfs_processed, etfs_failed, total_value, errors, warnings, harvested_count)`
- **Pipeline report envelope**: `PipelineReportEnvelope` with statuses `missing | invalid | ready`
- **Run status convention**: `success` (all ETFs decomposed), `degraded` (some failed), `failed` (critical failure). Pipeline `is_trustworthy=false` must NEVER be reported as `success` (AGENTS.md anti-pattern).
- **Health report**: Written to `outputs/pipeline_health.json` — consumed by Health route and X-Ray UI

---

## Test & Dogfood Plan

### Phase A: Pipeline Trigger & Basic Execution

| # | Test | How | Expected |
|---|------|-----|----------|
| A1 | Trigger pipeline from X-Ray UI | Click "Run Analysis" in browser | Progress bar 0→100%, no blank screen |
| A2 | Pipeline runs with 30 real positions | Engine has synced portfolio | Processes 10 ETFs, ~20 stocks |
| A3 | Pipeline result contract | Inspect `PipelineResult` return | `success` or `degraded`, never silent |
| A4 | SSE progress events reach frontend | Watch network tab during run | `pipeline_summary` SSE event received |
| A5 | Pipeline report written to disk | Check `outputs/pipeline_health.json` | Valid JSON, matches health report schema |
| A6 | Error handling on empty portfolio | Run with no positions | Explicit `failed` state with fix hint, not crash |

### Phase B: ETF Decomposition

| # | Test | How | Expected |
|---|------|-----|----------|
| B1 | Decompose all cached ETFs | Run pipeline | 8+ ETFs decomposed from cache |
| B2 | Decompose Amundi ETFs (known failure) | Check per_etf results | Explicit `failed` status, not silent skip |
| B3 | Adapter fallback cascade | Clear cache for one ETF, re-run | Hits Hive → adapter → reports source |
| B4 | Weight sum validation | Check per-ETF weight sums | All within 95-105% range |
| B5 | Resolution stats visibility | Check resolution summary in UI | Shows resolved/unresolved/skipped counts |
| B6 | Unresolved items list | Check X-Ray NeedsAttention section | Lists unresolved holdings with ticker, name, weight, reason |

### Phase C: ISIN Resolution & Identity

| # | Test | How | Expected |
|---|------|-----|----------|
| C1 | Resolution cascade order | Check resolution sources | local_cache → Hive → external APIs |
| C2 | Tier2 skipped holdings | Check `tier2_skipped` count | Reported in resolution stats, not hidden |
| C3 | Resolution confidence scores | Check resolution output | Scores match: direct=1.0, cache=0.95, hive=0.90, api=0.70-0.80 |
| C4 | ISINResolver respects threshold | Check `tier1_threshold` behavior | Holdings below threshold get ticker-only resolution |

### Phase D: Enrichment

| # | Test | How | Expected |
|---|------|-----|----------|
| D1 | Enrichment sources tracked | Check enrichment stats in health report | Shows hive_hits, api_calls, contributions counts |
| D2 | Sector coverage for resolved holdings | Check sector distribution in output | >50% of resolved holdings have sector |
| D3 | Geography coverage gap | Check geography in output | Document actual rate, flag if <10% |
| D4 | Enrichment failure handling | If Finnhub/Wikidata unavailable | Graceful degradation, not pipeline crash |

### Phase E: Aggregation & Reports

| # | Test | How | Expected |
|---|------|-----|----------|
| E1 | Exposure report written | Check `outputs/exposure_report.csv` | Valid CSV with ISIN, sector, weight, value columns |
| E2 | Holdings breakdown written | Check breakdown report | Contains both direct and indirect holdings |
| E3 | Total value matches portfolio | Compare pipeline total vs TR sync total | Within 1% of each other |
| E4 | Data quality score truthfulness | Check `data_quality.is_trustworthy` | `false` if >20% of holdings unresolved |

### Phase F: Hive Contribution & Community

| # | Test | How | Expected |
|---|------|-----|----------|
| F1 | Hive contributions logged | Check `monitor.contributions` | Non-zero if new ISINs resolved via API |
| F2 | Hive hit rate tracked | Check `hive_hit_rate` in metrics | Reports percentage correctly |
| F3 | Hive log visible in UI | Check X-Ray HiveLog component | Shows hits and contributions lists |
| F4 | Contribution failure handling | If Supabase unavailable | Pipeline continues, contribution logged as pending/failed |
| F5 | Harvest runs without crash | Check `harvested_count` in result | Returns count or 0, never crashes pipeline |
| F6 | Hive contribution visibility in Health | Check Health route | Shows freshness/trust/coverage for Hive data |

### Phase G: Frontend X-Ray UI

| # | Test | How | Expected |
|---|------|-----|----------|
| G1 | X-Ray view renders pipeline stepper | Navigate to X-Ray | Shows PipelineStepper component |
| G2 | Action queue shows pending actions | Before pipeline run | Shows "Run Analysis" or stale indicator |
| G3 | Resolution table shows per-ETF results | After pipeline run | Table with ISIN, status, source, holdings count |
| G4 | Resolution health card | After pipeline run | Shows resolution rate, confidence distribution |
| G5 | Needs attention section | After pipeline run | Lists unresolved holdings with reasons |
| G6 | Hive log section | After pipeline run | Shows community hits and contributions |
| G7 | Error boundary catches crashes | If pipeline component throws | XRayErrorBoundary shows recovery UI, not blank screen |

### Phase H: Pipeline Report Envelope Contract

| # | Test | How | Expected |
|---|------|-----|----------|
| H1 | Report envelope before pipeline run | Call `getPipelineReport()` | Returns `{status: 'missing'}` or `{status: 'ready', report: {...}}` |
| H2 | Report envelope after pipeline run | Call `getPipelineReport()` | Returns `{status: 'ready', report: {...}}` with valid health data |
| H3 | Report envelope with corrupted file | Corrupt `pipeline_health.json` | Returns `{status: 'invalid'}`, not crash |
| H4 | Frontend renders each envelope state | Check Health/X-Ray routes | Each state has intentional UI, never blank |

---

## Execution Order

1. **A1-A5**: Start with basic pipeline trigger — confirms the engine can run the pipeline
2. **B1-B6**: Decomposition is the core — most issues will surface here
3. **F1-F6**: Hive contribution is integral to decomposition — test alongside
4. **C1-C4**: Resolution drives everything downstream
5. **D1-D4**: Enrichment coverage determines final quality
6. **E1-E4**: Reports are the output contract
7. **G1-G7**: Frontend rendering (we already have 4 E2E specs for route-level checks)
8. **H1-H4**: Envelope contract (already tested in `tests/integration/ipc.test.ts`)

## Questions Before Execution

1. **Supabase credentials**: Does this machine have `SUPABASE_URL` and `SUPABASE_ANON_KEY` configured? Hive tests (Phase F) require these. If not, contribution tests will verify graceful degradation only.

2. **Finnhub/external API keys**: Are Finnhub, Wikidata, or other enrichment API keys configured? Enrichment tests (Phase D) depend on this. Without them, we test cache-only enrichment.

3. **Amundi ETFs**: The investigation report shows 2 Amundi ETFs (LU0908500753, FR0010361683) always fail. Is fixing these in scope, or should we document and move on?

4. **`is_trustworthy` threshold**: The pipeline currently reports `quality_score=1.0` and `is_trustworthy=true` even with 44% skipped holdings. Should we fix this to be stricter, or is tier2_skipped intentionally excluded from the trust calculation?

## Files to Read Before Code Changes

Per AGENTS.md workflow, load these rules before implementing:
- `rules/testing.md`
- `rules/architecture.md`
- `rules/logging.md`

## Key Implementation Files

| File | Role |
|------|------|
| `src-tauri/python/portfolio_src/core/pipeline.py` | Pipeline orchestrator (1082 lines) |
| `src-tauri/python/portfolio_src/core/services/decomposer.py` | ETF decomposition service |
| `src-tauri/python/portfolio_src/core/services/enricher.py` | Metadata enrichment service |
| `src-tauri/python/portfolio_src/core/services/aggregator.py` | Exposure aggregation service |
| `src-tauri/python/portfolio_src/data/hive_client.py` | Supabase Hive client |
| `src-tauri/python/portfolio_src/data/resolution.py` | ISINResolver |
| `src-tauri/python/portfolio_src/data/holdings_cache.py` | Local ETF holdings cache |
| `src-tauri/python/portfolio_src/adapters/registry.py` | Adapter registry |
| `src-tauri/python/portfolio_src/adapters/*.py` | Provider-specific adapters |
| `src-tauri/python/portfolio_src/core/contracts/` | Validation gates and contracts |
| `src-tauri/python/portfolio_src/core/harvesting.py` | Auto-harvest to Hive |
| `src/features/xray/*.tsx` | Frontend X-Ray components |
| `src/lib/schemas/ipc.ts` | Pipeline report Zod schemas |
| `src/lib/ipc.ts` | Pipeline IPC wrappers |
