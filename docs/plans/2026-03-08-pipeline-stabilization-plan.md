# X-Ray Pipeline & Hive Stabilization Plan

> **Branch:** `pipeline/stabilize-xray-hive`
> **Created:** 2026-03-08
> **Status:** implementation_plan_ready
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

## Implementation Plan

### Issue Index

| ID | Issue | Severity | Root Cause | Status |
|------|-------|----------|------------|--------|
| P-01 | adapter_registry.json not deployed to runtime config dir | Critical | Lifecycle copy path is wrong (`src-tauri/default_config/` vs `src-tauri/python/default_config/`) | pending |
| P-02 | 7 iShares adapters return empty holdings | High | Adapter scraping fails; local cache is empty; Hive lacks ETF holdings | pending (investigate) |
| P-03 | 2 Amundi ETFs require manual upload | Medium | By design — Amundi blocks automated downloads | document only |
| P-04 | `is_trustworthy` threshold too lenient | High | Quality score and trust need stricter thresholds per user request | pending |
| P-05 | Geography coverage 4.2% | Medium | Enrichment APIs don't return geography consistently | investigate |
| P-06 | 44% tier2_skipped not reflected in UI | Low | Skipped holdings have tickers but aren't surfaced in NeedsAttention | pending (assess) |
| P-07 | Pipeline returns `success: true` despite 9/10 ETFs failing | High | `PipelineResult.success` only goes `false` on exception, not on ETF failures | pending |
| P-08 | Hive contribution default verified correct | Resolved | Default is `"true"` in code; this machine had persisted `"false"` | no change needed |

---

### P-01: Deploy adapter_registry.json to runtime config dir

**Priority:** Critical — without this, no ETFs decompose on fresh machines
**Root cause:** `lifecycle.py` tries to copy from `src-tauri/default_config/` but the file lives at `src-tauri/python/default_config/adapter_registry.json`.

#### Files to change

| File | Change |
|------|--------|
| `src-tauri/python/portfolio_src/headless/lifecycle.py` | Fix `_copy_default_configs()` source path |
| `src-tauri/python/portfolio_src/adapters/registry.py` | Add fallback to source-tree config if runtime config missing |
| `src-tauri/python/tests/test_lifecycle.py` | Add test: default config deployed to runtime dir on init |

#### TDD Steps
1. **Red:** Add test in `test_lifecycle.py` that asserts `adapter_registry.json` exists in `CONFIG_DIR` after lifecycle init.
2. **Fix lifecycle.py:** Correct the source path from `default_config/` to `python/default_config/` (or resolve relative to `__file__`).
3. **Belt-and-suspenders in registry.py:** If runtime config not found, fall back to source-tree `default_config/adapter_registry.json`.
4. **Green:** Run test.
5. **Dogfood:** Delete runtime config, restart engine, verify ETF decomposition works.

#### Acceptance criteria
- [ ] `adapter_registry.json` is automatically available at `CONFIG_DIR` after engine boot
- [ ] If runtime config is missing, registry falls back to bundled default
- [ ] Pipeline decomposes cached ETFs without manual config copy

---

### P-02: Investigate iShares adapter empty results

**Priority:** High — 7/10 ETFs fail decomposition
**Root cause hypothesis:** The iShares adapter scrapes the provider website. Either:
- (a) The scraper is broken / provider changed their page structure
- (b) Rate limiting / IP blocking
- (c) The adapter needs a URL update

#### Investigation steps
1. Read `src-tauri/python/portfolio_src/adapters/ishares.py` — understand what URL it hits and how it parses.
2. Try one adapter manually: `uv run python3 -c "from portfolio_src.adapters.ishares import ISharesAdapter; a = ISharesAdapter(); print(a.fetch('IE00B4L5Y983'))"` — see what happens.
3. Check engine logs during decomposition for HTTP errors or parse failures.
4. If scraper is broken, fix the URL/parser. If rate-limited, implement retry + backoff.
5. If provider no longer offers the data, switch to Hive-only + manual upload for that provider.

#### Files to read/change

| File | Role |
|------|------|
| `src-tauri/python/portfolio_src/adapters/ishares.py` | iShares adapter |
| `src-tauri/python/portfolio_src/adapters/base.py` | Base adapter class |
| `src-tauri/python/portfolio_src/core/services/decomposer.py` | Decomposition cascade (cache → Hive → adapter) |

#### Acceptance criteria
- [ ] At least 5/8 iShares ETFs decompose (from adapter or Hive)
- [ ] Failed ETFs show specific error (not generic "empty holdings")
- [ ] Adapter source is recorded in health report (`source` field)

---

### P-03: Document Amundi manual upload requirement

**Priority:** Medium — expected behavior, not a bug
**Action:** Document only, no code change.

#### Steps
1. Add a note in this plan (already done above in ETF Decomposition Detail).
2. Verify the UI shows the manual upload URL correctly (verified: Action Queue shows download links).
3. Consider adding an in-app tooltip or help text for Amundi ETFs in a future UI pass.

**Status: documented.** The Action Queue already shows:
- `LU0908500753`: "Amundi ETF holdings require manual upload. Download from: https://www.amundietf.de/..."
- `FR0010361683`: Same pattern.

---

### P-04: Make is_trustworthy threshold stricter

**Priority:** High — user requested
**Root cause:** The validation gates may not account for ETF decomposition failures in the trust calculation.

#### Files to change

| File | Change |
|------|--------|
| `src-tauri/python/portfolio_src/core/contracts/validation_gates.py` | Adjust `is_trustworthy` calculation |
| `src-tauri/python/portfolio_src/core/contracts/pipeline_report.py` | Verify trust propagation to report |
| `src-tauri/python/tests/contracts/test_pipeline_report.py` | Add stricter threshold tests |

#### TDD Steps
1. **Red:** Add test: `is_trustworthy=false` when >50% of ETFs fail decomposition.
2. **Red:** Add test: `is_trustworthy=false` when aggregated total differs from expected by >20%.
3. **Read** current `ValidationGates` logic to understand existing thresholds.
4. **Fix:** Adjust thresholds — `is_trustworthy=false` when:
   - quality_score < 0.60 (currently may already do this)
   - >50% of ETFs fail decomposition
   - aggregated total differs by >20%
   - >30% of holdings are unresolved (excluding tier2_skipped)
5. **Green:** Run tests.
6. **Dogfood:** Re-run pipeline, verify Health view shows stricter trust.

#### Acceptance criteria
- [ ] `is_trustworthy=false` when majority of ETFs fail
- [ ] `is_trustworthy=false` when aggregated total diverges significantly
- [ ] Health UI reflects the stricter score
- [ ] Pipeline result `success` field is `false` when `is_trustworthy=false` (see P-07)

---

### P-05: Investigate geography coverage gap

**Priority:** Medium — 4.2% coverage is a data quality issue
**Root cause hypothesis:** Enrichment APIs (Finnhub, Wikidata) return sector but not geography consistently.

#### Investigation steps
1. Check what `HiveEnrichmentService.enrich()` returns for a known ISIN (e.g., US67066G1040 / NVIDIA).
2. Check if Hive has geography data in `assets.geography` column.
3. Check if Finnhub profile API returns country/geography.
4. If geography comes from a different API, add it to the enrichment cascade.
5. If no reliable source, document as known limitation.

#### Acceptance criteria
- [ ] Geography coverage >30% for resolved holdings (or documented as known limitation)
- [ ] Health report shows geography coverage stat

---

### P-07: Pipeline `success` should be `false` when majority of ETFs fail

**Priority:** High — `success: true` with 9/10 ETFs failed is misleading
**Root cause:** `pipeline.py` line 583: `success=True` is hardcoded in the happy path. It only goes `false` if an exception is caught.

#### Files to change

| File | Change |
|------|--------|
| `src-tauri/python/portfolio_src/core/pipeline.py` | Derive `success` from ETF processing results |
| `src-tauri/python/tests/test_pipeline.py` (or new) | Add test: success=false when >50% ETFs fail |

#### TDD Steps
1. **Red:** Add test: `PipelineResult.success == False` when >50% of ETFs fail decomposition.
2. **Fix pipeline.py `run()` method:** After phase 4 (aggregate), calculate:
   ```python
   etfs_total = len(etf_positions)
   etfs_succeeded = len(holdings_map)
   success = etfs_total == 0 or (etfs_succeeded / etfs_total) >= 0.5
   ```
3. **Green:** Run test.
4. **Dogfood:** Re-run pipeline with current state (1/10 ETFs), verify `success: false` returned.

#### Acceptance criteria
- [ ] `success=false` when >50% of ETFs fail
- [ ] `success=true` only when majority of ETFs succeed or portfolio has no ETFs
- [ ] Frontend interprets `success=false` as `degraded` run status

---

## Execution Order

Dependencies between fixes:
```
P-01 (adapter config) ──────┐
                             ├──> P-02 (iShares investigation, needs working adapters)
P-07 (success truthfulness) ─┤
                             ├──> P-04 (is_trustworthy, validates against pipeline results)
                             │
P-03 (Amundi docs)          independent
P-05 (geography)            independent
P-06 (tier2 UI)             deferred
```

**Recommended order:**
1. P-01 (Critical) — unblocks adapter-dependent ETF decomposition
2. P-07 (High) — pipeline success truthfulness, easy standalone fix
3. P-02 (High) — iShares adapter investigation, depends on P-01 being fixed
4. P-04 (High) — is_trustworthy strictness, benefits from P-07 being in place
5. P-05 (Medium) — geography coverage, independent investigation
6. P-03 (Medium) — already documented
7. P-06 (Low) — tier2 visibility, deferred

---

## Resolved Issues

### P-08: Hive contribution default (RESOLVED)
**Verdict:** No code change needed. The backend default is `"true"` (enabled). This machine had a persisted
`"false"` override which was re-enabled via IPC. The UI toggle correctly reflects the persisted state.
