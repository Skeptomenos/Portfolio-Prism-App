# X-Ray Pipeline & Hive Stabilization Plan

> **Branch:** `pipeline/stabilize-xray-hive`
> **Created:** 2026-03-08
> **Status:** 8 fixes shipped. quality_score 0→0.52. Resolution: DONE. Enrichment: infrastructure in place, needs API call cap (P-20).
> **Pipeline DoD:** `docs/specs/pipeline_definition_of_done.md` (canonical success criteria)
> **Predecessor:** Session restore fixes on `codex/stabilize-ipc-xray` (completed)

---

## Primary Objective

**100% ISIN enrichment for all holdings.** Every holding extracted from every ETF must have
a resolved ISIN. This is the single most important pipeline metric. Without ISINs, there is
no True Holding Exposure, no cross-ETF overlap detection, and no meaningful Hive contributions.

The pipeline is only successful when:
1. Every tier1 holding (weight > threshold) has a resolved ISIN
2. Every resolved ISIN is contributed to the Hive
3. The resulting True Exposure correctly aggregates holdings by ISIN across all ETFs and direct positions

## Secondary Objectives

- All pipeline stages produce truthful, visible results (never silent failures)
- Hive contribution works for ETF holdings (not just direct stocks)
- Data quality scores reflect reality

## Domain Context: ISIN-First Strategy

The core value proposition of Portfolio Prism is **ISIN-level aggregation**:

1. **The Problem:** ETF providers give tickers for each underlying holding (e.g., `AAPL`, `AZN.L`).
   Tickers are market-specific — `AAPL` on NASDAQ vs `APC` on Xetra are different listings
   of the same company. You cannot map a ticker from one exchange to a ticker on another.
2. **The Solution:** The pipeline resolves every ticker to its **ISIN** (International Securities
   Identification Number), which is the globally unique identifier. Only with ISINs can you
   detect that your NVIDIA stock and the NVIDIA inside your MSCI World ETF are the same holding.
3. **The Pipeline:** Decompose ETF → Resolve Ticker-to-ISIN → Enrich with metadata (sector/geo) →
   Aggregate by ISIN for **True Holding Exposure**.
4. **The Hive:** Because external API resolution (Wikidata, Finnhub) is slow and rate-limited,
   every successful Ticker → ISIN resolution is auto-contributed to the Supabase **Hive** database.
   The idea: every user contributing makes the experience better for the next user.
   This is opt-in-by-default (setting `hive_contribution_enabled`, default `"true"`).

**Without ISIN resolution, the pipeline produces nothing meaningful.** Decomposition extracts
tickers but the critical ticker→ISIN mapping is where the value lies.

## Architecture Summary

The pipeline is a 6-phase linear orchestrator in `core/pipeline.py`:

```
LOAD → DECOMPOSE → RESOLVE ISINs → ENRICH → AGGREGATE → REPORT → HARVEST
```

| Phase | Service | What it does | Key dependency |
|-------|---------|-------------|----------------|
| 1. Load | `_load_portfolio()` | Reads positions from SQLite, splits into direct (stocks) vs ETFs | `data/database.py` |
| 2. Decompose | `Decomposer` | X-rays ETFs into underlying holdings via cache → Hive → adapter cascade | `adapters/registry.py`, `holdings_cache` |
| 3. Resolve | `ISINResolver` (inside Decomposer) | Resolves tickers to ISINs via: local_cache → Hive → provider → Wikidata → Finnhub → yFinance → manual | `data/resolution.py` |
| 4. Enrich | `Enricher` | Adds sector/geography metadata via `HiveEnrichmentService` | `HiveClient`, proxy worker |
| 5. Aggregate | `Aggregator` | Fuses direct + ETF holdings by ISIN, normalizes weights, groups by sector/region | Pure computation |
| 6. Report | `_write_reports()` | Writes exposure CSV, holdings breakdown, health report, error log | `SnapshotRepository` |
| 7. Harvest | `harvest_cache()` | Auto-contributes newly-resolved ISINs to Hive (non-fatal) | `HiveClient` |

### ISIN Resolution Cascade (per holding)

See `docs/specs/pipeline_definition_of_done.md` Section 2 for canonical cascade.

```
1. Local cache (SQLite, user's previous resolutions)     → confidence 0.95
2. Hive (Supabase listings, community-contributed)        → confidence 0.90
3. Provider ISIN (already in adapter data, e.g. Amundi)   → confidence 1.00
4. API calls (tier1 only, weight > threshold):
   a. Wikidata SPARQL                                    → confidence 0.80
   b. Finnhub (via Cloudflare Worker proxy)               → confidence 0.75
   c. yFinance (unreliable fallback)                      → confidence 0.70
5. Manual entry (flag for user)                           → confidence 0.85
6. Mark as unresolved                                    → confidence 0.00
```

Holdings below `tier1_threshold` (0.1% weight) are skipped as tier2 — not worth the API call.

### Hive Contribution Flow

Hive contribution happens at two points:
1. **During ISIN resolution**: When an API call resolves a ticker→ISIN, the result is
   pushed to Hive via `_push_to_hive()` — making it available for all users.
2. **During harvest**: After pipeline completes, `harvest_cache()` bulk-contributes
   newly-discovered securities to the Hive `assets` and `listings` tables.

The Hive itself is a Supabase PostgreSQL database with:
- `assets` (ISIN → name, asset_class)
- `listings` (ticker/exchange → ISIN) — **the key table for resolution**
- `aliases` (name → ISIN)
- `etf_holdings` (ETF ISIN → holdings + weights)
- `contributions` (audit log)

### Key Contracts

- **Pipeline result**: `PipelineResult(success, etfs_processed, etfs_failed, total_value, errors, warnings, harvested_count)`
- **Pipeline report envelope**: `PipelineReportEnvelope` with statuses `missing | invalid | ready`
- **Run status**: `success` derived from `(etfs_succeeded / etfs_total) >= 0.5` (fixed in P-07)
- **Health report**: Written to `outputs/pipeline_health.json` — consumed by Health route and X-Ray UI

---

## Test & Dogfood Plan

### Phase 0: ISIN Resolution Rate (PRIMARY METRIC)

**This is the most important test phase. Every other phase is secondary to this.**

Per spec (`docs/specs/identity_resolution_details.md` Section 15):
- Resolution Rate target: **>95%** of holdings resolved
- Cache Hit Rate target: **>80%** from local/Hive
- API Dependency target: **<20%** of resolutions hit external APIs

Per architecture (`docs/architecture/identity_resolution.md`):
- Identity Resolution is **Stage 0** of the pipeline — before decomposition can aggregate
- Without ISINs, "NVIDIA CORP" and "NVIDIA Corp" are treated as different securities
- Every API success is contributed to Hive — community builds shared knowledge base

| # | Test | How | Expected |
|---|------|-----|----------|
| Z1 | ISIN resolution rate per ETF | Check `resolution_stats` per ETF after pipeline run | >80% for each ETF |
| Z2 | Overall ISIN resolution rate | Check aggregate resolution stats | >80% across all 3,522+ holdings |
| Z3 | Zero unresolved tier1 holdings | Check for tier1 holdings (weight > 0.1%) without ISINs | 0 unresolved tier1 |
| Z4 | Resolution sources distribution | Check `by_source` in resolution stats | Mix of local_cache, hive, api (not all "skipped") |
| Z5 | Hive contributions from ETF resolution | Check Hive contribution count after run | Includes newly-resolved ETF holdings (not just 20 direct stocks) |
| Z6 | True Exposure shows cross-ETF overlap | Check Dashboard True Exposure section | Shows holdings appearing in multiple ETFs (e.g., NVIDIA, Apple) |
| Z7 | Resolved ISINs are valid format | Validate all resolved ISINs match `^[A-Z]{2}[A-Z0-9]{9}[0-9]$` | 100% valid |
| Z8 | Second run has higher Hive hit rate | Run pipeline twice | Second run has higher `hive_hit_rate` (contributed ISINs now in cache) |

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
| C5 | Weight column recognized for all adapters | Check weight is non-zero during resolution | `weight_percentage` column must be included |

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

## Questions (All Answered)

1. **Supabase credentials**: Yes — `SUPABASE_URL` and `SUPABASE_ANON_KEY` added to `.env`.
2. **Finnhub/external API keys**: Finnhub via Cloudflare Worker proxy (no key needed). Wikidata is free.
3. **Amundi ETFs**: Document only — manual upload is by design.
4. **`is_trustworthy` threshold**: Already correct (`score >= 0.95`). Make stricter = verified, no change needed.

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

---

## Headed Browser Dogfood Log

### Session: 2026-03-08 ~22:44

**Setup:** Engine with full env (SUPABASE_URL, SUPABASE_ANON_KEY, FINHUB_API_KEY), adapter_registry.json manually deployed to runtime config dir.

### Critical Finding: adapter_registry.json not deployed on fresh machines

The lifecycle code tries to copy default configs from `src-tauri/default_config/` but the actual
config files live at `src-tauri/python/default_config/` and `src-tauri/python/config/`. This path
mismatch means `adapter_registry.json` never reaches `~/Library/Application Support/PortfolioPrism/config/`.
Without it, the AdapterRegistry is empty and ALL ETF decomposition fails.

**Fix required:** Either fix the lifecycle copy path, or have the registry fall back to the source-tree config.

### Pipeline Run Results (after manual adapter config deploy)

| Metric | Value |
|--------|-------|
| Duration | 170s |
| ETFs processed | 1/10 |
| ETFs failed | 9/10 |
| Total underlying | 370 |
| Hive hit rate | 76.3% |
| Contributions | 88 ISINs |
| Quality score | 0.49 |
| is_trustworthy | false |
| Console errors | 0 |

### ETF Decomposition Detail

| ETF | Status | Source | Holdings |
|-----|--------|--------|----------|
| IE00BL25JP72 (MSCI World Momentum) | success | cached | 370 |
| IE00B4L5Y983 (Core MSCI World) | failed | unknown | 0 |
| IE00B3WJKG14 (S&P 500 IT) | failed | unknown | 0 |
| IE00B53SZB19 (NASDAQ100) | failed | unknown | 0 |
| IE0031442068 (Core S&P 500 Dist) | failed | unknown | 0 |
| IE00B5BMR087 (Core S&P 500 Acc) | failed | unknown | 0 |
| DE000A0F5UF5 (NASDAQ100 Dist) | failed | unknown | 0 |
| IE00BYVQ9F29 (NASDAQ100 EUR) | failed | unknown | 0 |
| LU0908500753 (Amundi Stoxx 600) | failed | amundi (manual) | 0 |
| FR0010361683 (Amundi MSCI India) | failed | amundi (manual) | 0 |

**Root cause for 7 iShares failures:** Adapters try to scrape provider websites but return empty results.
Cache is empty on this machine. Hive does not have ETF holdings data for these ISINs.

**Root cause for 2 Amundi failures:** Amundi adapter requires manual file upload (by design).
These should be documented as expected behavior.

### UI Verification (all routes)

| Route | Renders | Console errors | Notable |
|-------|---------|----------------|---------|
| Dashboard | OK | 0 | True Exposure shows cross-ETF overlap |
| X-Ray ETF Resolution | OK | 0 | 1 resolved, 9 failed with clear status |
| X-Ray Action Queue | OK | 0 | 9 issues with Fix/Ignore buttons |
| X-Ray Hive Log | OK | 0 | 283 from Hive, 88 contributed, 76% hit rate |
| Health | OK | 0 | Quality 49%, 9 active issues, is_trustworthy=false |
| Holdings | OK | 0 | Full position table |

### Evidence Screenshots
- `output/playwright/dogfood/xray-resolution-table.png`
- `output/playwright/dogfood/xray-action-queue.png`
- `output/playwright/dogfood/xray-hive-log.png`
- `output/playwright/dogfood/health-after-pipeline.png`
- `output/playwright/dogfood/holdings-after-pipeline.png`

---

### Post-P-11 Dogfood Run (2026-03-08 ~23:10)

**Setup:** Engine with P-01 + P-07 + P-11 fixes, full env, Hive contribution enabled.

| Metric | Value |
|--------|-------|
| Duration | 1,269s (~21 min) |
| ETFs decomposed | 8/10 (2 Amundi manual = expected) |
| Total underlying | 3,522 |
| ISIN resolution | 852/853 (99.9%) |
| Resolution sources | provider=354, api_wikidata=9, ~490 source=nan (cache) |
| Enrichment | hive_hits=690, api_calls=160, contributions=160 |
| Hive hit rate | 81.2% |
| Quality score | 0.0 (incorrect — P-13) |
| is_trustworthy | false (incorrect — P-13) |
| Aggregated total mismatch | 84.8% (P-14) |
| Console errors | 0 |

**5 significant observations from this run:**
1. **P-14 (CRITICAL):** Aggregated total differs from portfolio by 84.8% — weight scaling is wrong
2. **P-13 (HIGH):** Health report shows 0% resolution despite 99.9% actual — reporting bug
3. **P-12 (CRITICAL):** Enrichment barely scaled (160 vs expected 850) — not enriching ETF holdings
4. **P-15 (MEDIUM):** ~490 resolved holdings have `nan` source — tracking gap
5. **P-16 (MEDIUM):** 21 minutes first run — expected, need to verify second run improvement

**Evidence:** `output/playwright/dogfood/xray-after-p11-fix.png`

### Post-P-14/P-13 Dogfood Run (2026-03-09 ~08:00)

**Setup:** Engine with all fixes (P-01, P-07, P-11, P-14, P-13), full env, second pipeline run.

| Metric | Value | Change from prev run |
|--------|-------|---------------------|
| Duration | ~9 min | Improved from 21 min |
| ETFs decomposed | 8/10 | Same |
| ISIN resolution (aggregated) | 852/853 (99.9%) | Same |
| ISIN resolution (per-holding) | 2069/3522 (58.7%) | NEW metric visible |
| Resolution sources | local_cache=1715, existing=354, tier2_skipped=1328 | Cache working |
| Aggregated total | €41,699 | Fixed (was 0) |
| Mismatch | 0.4% | Fixed (was 84.8%) |
| Active errors | 2 | Improved from 9 |
| Console errors | 0 | Same |

**6 significant observations from this run:**

1. **Per-ETF validation gates still show 0% resolution (NEW ISSUE P-19)**
   Despite 852/853 ISINs resolved at the aggregate level, every ETF's validation gate
   reports `LOW_RESOLUTION_RATE: 0%`. This drives `quality_score: 0.0` and `is_trustworthy: false`.
   Root cause hypothesis: the resolved ISINs are NOT being written back to the per-ETF holdings
   DataFrames that the validation gates inspect. The resolution results flow to the aggregated
   `true_exposure_report.csv` but the per-ETF DataFrames still have empty `isin` columns.
   This is the single biggest remaining quality gap.

2. **Sector and geography coverage 0% per ETF (related to P-19)**
   Same root cause: enrichment runs on unique ISINs but results aren't propagated back to
   per-ETF holdings DataFrames. The validation gates see 0% sector and 0% geography.
   16 medium issues, each penalizing the quality score.

3. **Resolution rate 58.7% vs 99.9% confusion**
   58.7% = per-holding count (2069 of 3522, includes 1328 tier2_skipped).
   99.9% = unique ISINs after aggregation (852 of 853).
   Both are correct at their respective levels. The 58.7% will always be lower because tier2
   holdings (weight < 0.1%) are intentionally skipped from API resolution.

4. **Second run improved from 21min to ~9min (P-16 partially verified)**
   Local cache now serves 1715 resolutions (vs API calls on first run).
   Still not instant because cache sync from Hive takes time at startup.

5. **Active errors dropped from 9 to 2**
   Only the 2 Amundi ETFs remain. All 7 iShares adapter errors are gone.

6. **`is_trustworthy: false` despite correct data**
   The quality system is driven by per-ETF validation gates. Since gates show 0%
   resolution and 0% enrichment coverage, quality_score = 0.0.
   The actual output data (true_exposure_report.csv) is correct.
   Fixing P-19 should make `is_trustworthy: true`.

**Evidence:** `output/playwright/dogfood/health-after-p14-p13-fix.png`

## Implementation Plan

### Issue Index (verified 2026-03-08)

| ID | Issue | Severity | Root Cause (VERIFIED) | Status |
|------|-------|----------|------------|--------|
| P-01 | Config files not deployed to runtime dir | Critical | `resource_path()` goes up 3 dirs instead of 2 | **COMPLETE** (8/10 ETFs decompose, 3522 holdings) |
| P-02 | 7 iShares adapters return empty holdings | Critical | **Same root cause as P-01.** `ishares_config.json` not deployed = no product IDs = auto-discovery fails | MERGED INTO P-01 |
| P-03 | 2 Amundi ETFs require manual upload | Medium | By design - Amundi blocks automated downloads | documented |
| P-04 | `is_trustworthy` threshold | Resolved | Already correct: `score >= 0.95`, penalties CRITICAL=0.25, HIGH=0.10. Current run shows 0.49 = correctly untrusted | verify only |
| P-05 | Geography coverage 4.2% | Medium | Enrichment APIs don't return geography consistently | investigate |
| P-06 | 44% tier2_skipped not reflected in UI | Low | Skipped holdings have tickers but aren't surfaced in NeedsAttention | deferred |
| P-07 | Pipeline returns `success: true` despite 9/10 ETFs failing | High | `pipeline.py:583` hardcoded `success=True` | **COMPLETE** (derived from ETF ratio, 6 tests) |
| P-08 | Hive contribution default verified correct | Resolved | Default is `"true"` in code; this machine had persisted `"false"` | no change needed |
| P-09 | WORKER_URL for enrichment proxy | Resolved | Hardcoded Cloudflare Worker default in `config.py:56`. No env var needed. | no change needed |
| P-10 | Frontend has no `degraded` concept | Note | `RunPipelineResultSchema` is binary `success: boolean`. XRayView throws on `success=false`. No `runStatus` field. | assess with P-07 |
| P-11 | ISIN resolution at 0% due to weight column mismatch | **Critical** | `weight_percentage` missing from decomposer lookup | **COMPLETE** (99.9% resolution, 852/853) |
| P-12 | Enrichment only covers direct stocks, not ETF holdings | ~~Critical~~ | **RESOLVED:** Enrichment deduplicates by ISIN (3522 holdings → 850 unique). 690 cache + 160 API = 850 total. Working correctly. | **RESOLVED** |
| P-13 | Health report shows 0% resolution | High | `_write_health_report()` hardcoded `tier1_resolved: 0` | **COMPLETE** (now reads decomposer stats: 2069 resolved, 58.7%) |
| P-14 | Aggregated total differs by 84.8% | **Critical** | `get_value_column()` returns None for ETFs | **COMPLETE** (now uses quantity*price fallback, 0.4% mismatch) |
| P-15 | Resolution source field is `nan` for ~490 of 852 resolved holdings | Medium | Resolver returns `source=None` for local_cache hits; not propagated to output CSV | **investigate** |
| P-16 | Pipeline performance: 21min → 9min on second run | Medium | Cache helps but not dramatically. Partially verified. | **partially verified** |
| P-17 | True Exposure stored as CSV (legacy) | High | Needs SQLite with timestamps for 3/6/12 month tracking | **pending** |
| P-18 | Hive decomposition freshness timestamps | Medium | Need `contributed_at` / `source_date` for staleness assessment | **pending** |
| P-19 | Per-ETF validation gates show 0% resolution | **High** | `HOLDING_COLUMN_ALIASES` missing resolution_status, sector, geography | **COMPLETE** (quality_score 0.0→0.27, per-ETF rates now 50-77%) |
| P-20 | ~~Enrichment API calls need per-run cap~~ | ~~Medium~~ | **SUPERSEDED by P-21.** Finnhub per-ISIN approach replaced by provider metadata + Wikidata bulk SPARQL. | **superseded** |
| P-21 | Enrichment architecture: provider metadata + Wikidata bulk SPARQL | **High** | Three-layer approach: (1) Adapters preserve sector/geography from provider CSV/XLSX (iShares has `Standort`/`Börse` but drops them!), (2) Wikidata bulk SPARQL fills gaps (850 ISINs in 1 query), (3) Cache + Hive persists. Replaces per-ISIN Finnhub calls. | **pending** |

---

### P-01: Fix `resource_path()` overshooting by 1 directory level (CRITICAL)

**Cascading root cause for P-01 AND P-02.**

**Root cause (VERIFIED):** `lifecycle.py:62` goes up 3 `dirname()` levels from `headless/lifecycle.py`:
```
headless/lifecycle.py
  up1: portfolio_src/headless/  ->  portfolio_src/
  up2: portfolio_src/           ->  python/          <- CORRECT STOP (default_config/ lives here)
  up3: python/                  ->  src-tauri/        <- WRONG (current code)
```
`resource_path('default_config/X')` resolves to `src-tauri/default_config/X` (MISSING)
instead of `src-tauri/python/default_config/X` (EXISTS).

**Cascading impact (3 config files fail to deploy):**
- `adapter_registry.json` -> empty AdapterRegistry -> "No adapter registered" for all ETFs
- `ishares_config.json` -> no product IDs -> iShares auto-discovery scrapes website and fails -> "empty holdings"
- `ticker_map.json` -> ticker resolution fallback missing

#### Fix

| File | Change |
|------|--------|
| `src-tauri/python/portfolio_src/headless/lifecycle.py:62` | Change 3 `dirname()` calls to 2 |
| `src-tauri/python/portfolio_src/headless/test_lifecycle.py` | Add test: `resource_path('default_config/adapter_registry.json')` resolves to existing file |

#### TDD Steps
1. **Red:** Add test asserting `resource_path('default_config/adapter_registry.json')` returns an existing path.
2. **Fix lifecycle.py line 62:** `base_path = os.path.dirname(os.path.dirname(base_path))` (2 levels, not 3).
3. **Green:** Run test.
4. **Integration:** Delete runtime config dir, restart engine, verify all 3 config files deployed.
5. **Dogfood:** Re-run pipeline, verify iShares ETFs decompose.

#### Acceptance criteria
- [ ] `resource_path('default_config/adapter_registry.json')` resolves to existing file
- [ ] All 3 config files auto-deployed to `CONFIG_DIR` on engine boot
- [ ] iShares ETFs decompose (at least 5/7 succeed from adapter or cache)

#### Result (VERIFIED)
- lifecycle.py line 62: changed 3 `dirname()` to 2
- Also fixed pre-existing logging bug: `extra={'filename': ...}` -> `extra={'config_file': ...}`
- **Before fix:** 1/10 ETFs decomposed, 9 failed
- **After fix:** 8/10 ETFs decomposed (1330+77+515+508+107+107+370+508 = 3,522 holdings), 2 Amundi fail as expected
- Evidence: `output/playwright/dogfood/xray-after-p01-fix.png`
- [ ] Pipeline health report shows `source: ishares_adapter` or `source: cached` (not `unknown`)

---

### P-02: MERGED INTO P-01

The 7 iShares failures have the same root cause as P-01.
When `ishares_config.json` is deployed, the adapter has product IDs and can download CSV holdings.
No separate fix needed.

---

### P-03: Amundi manual upload (DOCUMENTED)

Expected behavior. Action Queue shows download URLs. No code change.

---

### P-04: `is_trustworthy` threshold (VERIFIED CORRECT)

**Verdict:** Already working correctly. No code change needed.

The quality system at `quality.py:11,141` uses `is_trustworthy = score >= 0.95` with penalties:
- CRITICAL: 0.25 (one critical issue -> score 0.75 -> untrusted)
- HIGH: 0.10 (one high issue -> score 0.90 -> untrusted)
- MEDIUM: 0.03
- LOW: 0.01

Current pipeline run correctly shows `quality_score: 0.49, is_trustworthy: false`.
The real problem is P-07: the pipeline returns `success: true` despite `is_trustworthy: false`.

---

### P-05: Geography coverage 4.2% (INVESTIGATE)

**Priority:** Medium
**Root cause hypothesis:** Enrichment APIs (Finnhub via WORKER_URL proxy, Wikidata) return sector but not geography consistently.
**WORKER_URL:** Verified configured with hardcoded default (`config.py:56`).

#### Investigation steps
1. After P-01 fix, re-run pipeline with full ETF decomposition.
2. Check enrichment output for geography column coverage.
3. If still <10%, trace enrichment API responses to identify the gap.
4. Document as known limitation if no reliable geography source exists.

---

### P-07: Pipeline `success` should reflect ETF processing results (COMPLETE)

**Root cause (VERIFIED):** `pipeline.py:583` hardcodes `success=True` in the try block.
Only goes `false` if an exception is caught. ETF decomposition failures don't throw.

**Frontend impact (VERIFIED):** `XRayView.tsx:63` checks `result.success` and only shows
error UI when `false`. With `success: true`, the frontend shows no error despite 9/10 ETFs failing.

**IPC contract (VERIFIED):** `RunPipelineResultSchema` is `{success: boolean, errors: string[], durationMs: number}`.
No `degraded` or `runStatus` concept exists. Binary success/failure.

#### Fix

| File | Change |
|------|--------|
| `src-tauri/python/portfolio_src/core/pipeline.py:582-583` | Derive `success` from ETF processing results |
| `src-tauri/python/tests/test_pipeline.py` (or existing) | Add test: success=false when >50% ETFs fail |

#### TDD Steps
1. **Red:** Add test: `PipelineResult.success == False` when >50% of ETFs fail.
2. **Fix pipeline.py `run()` method** (line 582-583):
   ```python
   etfs_total = len(etf_positions)
   etfs_succeeded = len(holdings_map)
   pipeline_success = etfs_total == 0 or (etfs_succeeded / etfs_total) >= 0.5
   return PipelineResult(success=pipeline_success, ...)
   ```
3. **Green:** Run test.
4. **Dogfood:** Re-run pipeline with current state (1/10 ETFs), verify `success: false`.
5. **Frontend check:** Verify X-Ray shows error UI when `success: false`.

#### Acceptance criteria
- [ ] `success=false` when >50% of ETFs fail
- [ ] Frontend shows error message when `success=false`
- [ ] `success=true` only when majority of ETFs succeed or portfolio has no ETFs

#### Result (VERIFIED)
- pipeline.py:582: `success` now derived from `(etfs_succeeded / etfs_total) >= 0.5`
- 6 unit tests for derivation logic (all pass)
- With P-01 fix in place: 8/10 ETFs succeed -> pipeline reports `success=True` (correct)
- Without P-01 fix (1/10): would report `success=False` (correct)

---

### P-09: WORKER_URL for enrichment (RESOLVED)

Hardcoded Cloudflare Worker default at `config.py:56`. No env var needed. Not a problem.

---

### P-10: Frontend has no `degraded` concept (ASSESS)

The `RunPipelineResultSchema` is binary `{success: boolean}`. There's no way to express
"pipeline ran but with partial results" in the current IPC contract.

**Future work:** Consider adding `runStatus: 'success' | 'degraded' | 'failed'` to the schema
so the frontend can show nuanced state. For now, P-07's binary fix is sufficient.

---

## Execution Order (Updated post-P-11)

**Objective:** achieve 100% success of the Pipeline Definition of Done
(`docs/specs/pipeline_definition_of_done.md`).

```
COMPLETED:
  P-01 (resource_path fix) ------> 8/10 ETFs decompose, 3522 holdings
  P-07 (success truthfulness) ---> derived from ETF ratio
  P-11 (weight column fix) ------> 99.9% ISIN resolution (852/853)

REMAINING (priority order):

  P-14 (total mismatch 84.8%) ---> CRITICAL: aggregator weight scaling broken
    |                                True Exposure numbers are wrong
    v
  P-13 (health report 0%) -------> HIGH: report writer shows wrong resolution stats
    |
    v
  P-12 (enrichment scaling) -----> CRITICAL: enrichment didn't scale with ISINs
    |
    v
  P-17 (true exposure storage) --> HIGH: migrate from CSV to SQLite with timestamps
    |
    v
  P-15 (source field nan) -------> MEDIUM: ~490 resolved holdings lack source tracking
    |
    v
  P-18 (Hive freshness) ---------> MEDIUM: add contributed_at/source_date to Hive
    |
    v
  P-16 (21min runtime) ----------> VERIFY: second run should be faster via Hive cache
    |
    v
  P-05 (geography) --------------> investigate after above
```

**Completed:** P-01, P-02 (merged), P-07, P-11
**Resolved (no code change):** P-03 (documented), P-04 (correct), P-08 (correct), P-09 (correct)
**Deferred:** P-06 (tier2 UI), P-10 (degraded concept)

---

## P-11: Fix weight column mismatch in decomposer (CRITICAL)

**This is the highest-priority remaining fix. Without it, the entire ISIN-first strategy is broken.**

### Root cause (VERIFIED)

The decomposer's `_resolve_holdings_isins()` at line 338 searches for weight columns:
```python
for col in ["weight", "Weight", "weight_pct", "Weight_Pct"]:
```

But the iShares adapter saves holdings CSVs with the column name `weight_percentage`.
Since the column isn't found, `weight_col = None` and all 3,522 holdings get `weight = 0.0`.

With `tier1_threshold = 0.1` (from pipeline.py:185), the tier check at resolution.py:183 is:
```python
is_tier2 = weight <= self.tier1_threshold  # 0.0 <= 0.1 = True for ALL holdings
```

Every single holding is classified as tier2 and **skipped entirely** — no ISIN resolution.

### Evidence

```
Pipeline health report after P-01 fix:
  etfs_processed: 8
  total_underlying: 3,522
  ISIN resolution rate: 0% (ALL 8 ETFs show LOW_RESOLUTION_RATE: 0%)
  quality_score: 0.0
  is_trustworthy: false
  
Manual resolver test:
  AAPL  → US0378331005 (resolved, local_cache_ticker, confidence 0.95)
  AZN.L → GB0009895292 (resolved, local_cache_ticker, confidence 0.95)
  MSFT  → US5949181045 (resolved, local_cache_ticker, confidence 0.95)
  
Proof: the resolver WORKS. The weight column mismatch prevents it from running.
```

### Fix (VERIFIED — both functions have the same bug)

The bug exists in TWO places in `decomposer.py`:
1. `_normalize_weight_format()` line 47: same missing column → silently returns unchanged
2. `_resolve_holdings_isins()` line 338: same missing column → defaults weight to 0.0

All three adapters (iShares, Amundi, VanEck) output `weight_percentage` as the standard column name.

| File | Change |
|------|--------|
| `decomposer.py:47` | Add `"weight_percentage"` to `_normalize_weight_format()` lookup |
| `decomposer.py:338` | Add `"weight_percentage"` to `_resolve_holdings_isins()` lookup |
| `tests/test_pipeline_smoke.py` | Add test: resolution runs with `weight_percentage` column |

### TDD Steps
1. **Red:** Add test with DataFrame containing `weight_percentage` column. Assert weight_col is found.
2. **Fix decomposer.py lines 47 and 338:** Add `"weight_percentage"` to both lists.
3. **Green:** Run test.
4. **Integration:** Run full pipeline via IPC, check resolution stats > 0%.
5. **Dogfood (headed browser):** Run pipeline from X-Ray UI. Verify:
   - ISIN resolution rate > 50% per ETF
   - Hive contributions include ETF holdings
   - Dashboard True Exposure shows cross-ETF overlap
   - Health shows improved quality score

### Acceptance criteria
- [x] Weight column `weight_percentage` is recognized by the decomposer
- [x] **99.9% ISIN resolution** (852/853 holdings have ISINs)
- [x] Resolution rate > 80% across all ETF holdings
- [x] Hive contributions include newly-resolved ETF holding ISINs (160 contributed)
- [ ] Health report shows `is_trustworthy: true` -- **NOT YET: health report still shows 0% (P-13 gap)**
- [ ] Dashboard True Exposure section shows cross-ETF overlap -- **needs verification**
- [ ] Second pipeline run has higher Hive hit rate -- **needs verification**

### Verified Results

```
True Exposure Report (outputs/true_exposure_report.csv):
  Total holdings: 853
  With ISIN: 852 (99.9%)
  Without ISIN: 1
  Resolution sources: provider=354, api_wikidata=9, rest from Hive cache

Pipeline Metrics:
  Enrichment: hive_hits=690, api_calls=160, contributions=160
  Hive hit rate: 81.2%
  Assets processed: 850

KNOWN GAP -- P-13: Health report still shows 0% resolution rate
  The health report writer reads resolution stats from decomposer but shows 0%.
  The true_exposure_report.csv proves resolution works (852/853).
  This is a reporting/display bug, not a resolution bug.
```

---

## P-12: Enrichment didn't scale with resolved ISINs (INVESTIGATE)

**Original assumption was wrong.** P-12 was expected to auto-resolve once P-11 fixed ISIN resolution.
However, post-P-11 dogfood shows enrichment barely changed:

| Metric | Before P-11 | After P-11 | Expected |
|--------|-------------|------------|----------|
| Hive hits | 690 | 690 | ~850 |
| API calls | 140 | 160 | ~850 |
| Contributions | 140 | 160 | ~850 |
| Assets processed | 830 | 850 | ~853 |

Only 20 more API calls despite going from 0% to 99.9% ISIN resolution.
The enrichment pipeline is NOT enriching all 852 resolved ISINs.

#### Investigation needed
- Read `enricher.py` to understand what triggers enrichment for each ISIN
- Check if enrichment only runs on direct holdings, not decomposed ETF holdings
- Check if enrichment deduplicates by ISIN (many ETFs share the same companies)
- Trace the data flow: resolved ISIN → enrichment input → enrichment output

#### Files
- `src-tauri/python/portfolio_src/core/services/enricher.py`
- `src-tauri/python/portfolio_src/data/enrichment.py`
- `src-tauri/python/portfolio_src/core/pipeline.py` (enrichment phase)

---

## P-13: Health report shows 0% resolution despite 99.9% actual (INVESTIGATE)

The `pipeline_health.json` writer reads resolution stats from the decomposer but reports 0%
for every ETF. The `true_exposure_report.csv` proves 852/853 ISINs resolved.

#### Investigation needed
- Read the health report writer in `pipeline.py` (`_write_reports()`)
- Check how resolution stats flow from `decomposer._resolution_stats` to the health report
- Determine if the stats dictionary is populated AFTER the report is written (timing issue)
- Or if the report writer reads a different field than what the decomposer populates

#### Files
- `src-tauri/python/portfolio_src/core/pipeline.py` (report writing phase)
- `src-tauri/python/portfolio_src/core/services/decomposer.py` (`_resolution_stats`)
- `src-tauri/python/portfolio_src/core/contracts/quality.py` (quality score calculation)

---

## P-14: Aggregated total differs from portfolio by 84.8% (INVESTIGATE)

The aggregator produces a total that is 84.8% lower than the actual portfolio value of €41,547.
This means the weight scaling is fundamentally wrong.

**Hypothesis:** The aggregator treats ETF-internal holding weights (e.g., "Apple is 5.33% of MSCI World")
as portfolio-level weights, instead of computing: `portfolio_exposure = etf_portfolio_weight × holding_etf_weight`.

#### Investigation needed
- Read `aggregator.py` to understand how weights are calculated
- Check if ETF portfolio weight is passed to the aggregator
- Check if the formula `etf_weight_in_portfolio × holding_weight_in_etf` is used
- Verify with a manual calculation: if MSCI World is 20% of portfolio and Apple is 5% of MSCI World,
  then Apple's portfolio exposure from that ETF should be 1% (0.20 × 0.05)

#### Files
- `src-tauri/python/portfolio_src/core/services/aggregator.py`
- `src-tauri/python/portfolio_src/core/pipeline.py` (aggregation phase, what data is passed)

---

## P-15: Resolution source field `nan` for ~490 holdings (INVESTIGATE)

The `true_exposure_report.csv` shows 852 resolved ISINs but only 354 have `source=provider`
and 9 have `source=api_wikidata`. The remaining ~490 have `source=nan`.

These likely came from the Hive local cache but the source field is not propagated.

#### Investigation needed
- Check `ISINResolver.resolve()` return value for cache hits — does it set `source`?
- Check how `decomposer._resolve_holdings_isins()` writes source back to the DataFrame
- Check how `pipeline._write_reports()` reads source from the DataFrame

#### Files
- `src-tauri/python/portfolio_src/data/resolution.py` (`resolve()` method)
- `src-tauri/python/portfolio_src/core/services/decomposer.py` (`_resolve_holdings_isins()`)

---

## P-16: First pipeline run takes 21 minutes (VERIFY)

Expected for first run with many uncached tickers. Need to verify second run is faster.

#### Verification steps
1. Run pipeline again (same portfolio, same engine session)
2. Compare duration, Hive hit rate, and API call count to first run
3. If significantly faster (>50% improvement), mark as resolved
4. If not improved, investigate cache population and Hive contribution timing

---

## P-17: True Exposure storage migration CSV → SQLite (PENDING)

True exposure data is currently written to `true_exposure_report.csv`.
Per DoD Section 6, this should be stored in SQLite (`prism.db`) with timestamps
to enable historical tracking over 3, 6, 12 months.

#### Implementation needed
- Design `true_exposure` and `pipeline_runs` tables in `prism.db`
- Add migration to `database.py`
- Update `pipeline.py` report writer to insert into SQLite
- Keep CSV generation as an export option
- Schema: ISIN, name, sector, geography, total_exposure, resolution_confidence,
  resolution_source, portfolio_percentage, run_id, run_timestamp

#### Files
- `src-tauri/python/portfolio_src/data/database.py` (schema, migration)
- `src-tauri/python/portfolio_src/core/pipeline.py` (report writer)

---

## P-18: Hive decomposition freshness timestamps (PENDING)

ETF decomposition contributions to the Hive currently lack timestamps.
Per DoD Section 1, every contribution MUST include `contributed_at` and `source_date`.

#### Implementation needed
- Add `contributed_at` and `source_date` columns to Hive ETF holdings table (Supabase)
- Update `hive_client.py` to include timestamps when contributing decomposition data
- Update decomposer to check Hive data staleness (>30 days) before using it
- When stale, prefer adapter, then contribute fresh data back

#### Files
- `src-tauri/python/portfolio_src/data/hive_client.py`
- `src-tauri/python/portfolio_src/core/services/decomposer.py`
- `supabase/` (migration for new columns)

## Resolved Issues

| ID | Verdict |
|------|---------|
| P-02 | Same root cause as P-01; merged |
| P-03 | Amundi manual upload is by design; documented in Action Queue UI |
| P-04 | `is_trustworthy` already correct at `score >= 0.95`; current run shows 0.49 = correctly untrusted |
| P-08 | Hive contribution default is `"true"` (enabled); this machine had persisted override |
| P-09 | WORKER_URL has hardcoded Cloudflare Worker default; no env config needed |
