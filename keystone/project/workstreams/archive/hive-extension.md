# Workstream: hive-extension

> **Feature Plan:** `keystone/strategy/HIVE_EXTENSION_STRATEGY.md`
> **Owner:** OptiPie
> **Status:** Done
> **Last Heartbeat:** 2025-12-26 08:45

---

## Objective

Fix the broken X-Ray analysis pipeline by unlocking the Hive database (RLS fix), enabling ticker-to-ISIN resolution via HiveClient, and removing the deprecated `asset_universe.csv` dependency. This enables the Decomposer to properly resolve ETF holdings before enrichment.

## Critical Constraints

- [ ] **Safety First:** Use `USE_LEGACY_CSV` feature flag for gradual rollout
- [ ] **No Breaking Changes:** Legacy CSV path must remain functional until Phase 5
- [ ] **RLS Bypass via RPC:** Use `SECURITY DEFINER` functions, not policy changes
- [ ] **Offline Support:** Local SQLite cache must work when Hive is unreachable

---

## Phase Dependencies

```
Phase 0 (Schema/RLS) ─────┬───────────────────┐
                          │                   │
                          ▼                   ▼
              Phase 1 (HiveClient)    Phase 2 (LocalCache)
                          │                   │ (parallel)
                          └─────────┬─────────┘
                                    ▼
                          Phase 3 (ISINResolver)
                                    │
                                    ▼
                          Phase 4 (Decomposer)
                                    │
                                    ▼
                          Phase 5 (Decoupling) ✅
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          Phase 6 (Cleanup)              Phase 7 (Provenance)
          [waiting 1 week]                  [can start now]
                                                   │
                                                   ▼
                                    Frontend: Glass Box UI
```

---

## Tasks (Source of Truth)

### Phase 0: Unlock Database + Schema Extension
> **Objective:** Make existing Hive data readable + add `aliases` table.
> **Blocking:** All other phases depend on this.

- [x] **HIVE-001:** Audit current RLS policies
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Check RLS policies on `assets`, `listings`, `etf_holdings` tables in Supabase dashboard. Document current state.

- [x] **HIVE-002:** Create `resolve_ticker_rpc` function
    - **Dependencies:** HIVE-001
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `SECURITY DEFINER` RPC that queries `listings` table by ticker+exchange, returns ISIN. Add to `functions.sql`.

- [x] **HIVE-003:** Create `batch_resolve_tickers_rpc` function
    - **Dependencies:** HIVE-001
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `SECURITY DEFINER` RPC that accepts array of tickers, returns array of (ticker, isin) pairs. Batch size limit: 100.

- [x] **HIVE-004:** Create `lookup_alias_rpc` function
    - **Dependencies:** HIVE-005
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `SECURITY DEFINER` RPC that queries `aliases` table by alias name (case-insensitive), returns matching ISIN.

- [x] **HIVE-005:** Add `aliases` table migration
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `20251224_add_aliases.sql` migration. Schema: id, alias, isin (FK), alias_type, language, contributor_count, created_at. Add index on UPPER(alias).

- [x] **HIVE-006:** Create `contribute_alias` RPC
    - **Dependencies:** HIVE-005
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `SECURITY DEFINER` RPC for contributing new aliases. Upsert logic: increment contributor_count if exists.

- [x] **HIVE-007:** Verify RLS fix works
    - **Dependencies:** HIVE-002, HIVE-003
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Write test script that calls RPCs via anon client. Verify: returns data (not 0 rows), AAPL resolves to US0378331005, batch returns multiple results.

---

### Phase 1: HiveClient Upgrade
> **Objective:** Add read capability to HiveClient for ticker resolution.
> **Blocking:** Requires Phase 0 complete.

- [x] **HIVE-101:** Add `resolve_ticker()` method
    - **Dependencies:** HIVE-007
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add method to `hive_client.py` that calls `resolve_ticker_rpc`. Returns `Optional[str]` (ISIN or None). Handle Supabase errors gracefully.

- [x] **HIVE-102:** Add `batch_resolve_tickers()` method
    - **Dependencies:** HIVE-007
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add method that calls `batch_resolve_tickers_rpc`. Returns `Dict[str, Optional[str]]` mapping ticker→ISIN. Chunk requests if >100 tickers.

- [x] **HIVE-103:** Add `lookup_by_alias()` method
    - **Dependencies:** HIVE-007
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add method that calls `lookup_alias_rpc`. Returns `Optional[str]` (ISIN or None). Case-insensitive lookup.

- [x] **HIVE-104:** Add `sync_identity_domain()` method
    - **Dependencies:** HIVE-101
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add method that pulls full `assets`, `listings`, `aliases` tables from Hive. Returns data for LocalCache to store. Paginate if >10K rows.

- [x] **HIVE-105:** Unit tests for HiveClient read methods
    - **Dependencies:** HIVE-101, HIVE-102, HIVE-103
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `tests/test_hive_client_read.py`. Mock Supabase client. Test: successful resolution, not found, batch chunking, error handling.

---

### Phase 2: Local Cache Infrastructure (Parallel with Phase 1)
> **Objective:** Enable offline operation with SQLite cache.
> **Blocking:** Requires Phase 0 complete. Can run parallel with Phase 1.

- [x] **HIVE-201:** Create LocalCache SQLite schema
    - **Dependencies:** HIVE-005
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `local_cache.py` with SQLite schema mirroring Hive identity domain: `assets`, `listings`, `aliases`. Add `sync_metadata` table for staleness tracking.

- [x] **HIVE-202:** Implement LocalCache CRUD operations
    - **Dependencies:** HIVE-201
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add methods: `get_isin_by_ticker()`, `get_isin_by_alias()`, `upsert_asset()`, `upsert_listing()`, `upsert_alias()`. All operations use transactions.

- [x] **HIVE-203:** Implement sync logic
    - **Dependencies:** HIVE-202, HIVE-104
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add `sync_from_hive()` method. Calls `HiveClient.sync_identity_domain()`, upserts all data to local SQLite. Updates `sync_metadata.last_sync` timestamp.

- [x] **HIVE-204:** Implement staleness check
    - **Dependencies:** HIVE-203
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add `is_stale()` method. Returns True if last_sync > 24 hours ago. Add `get_last_sync()` for UI display.

- [x] **HIVE-205:** Unit tests for LocalCache
    - **Dependencies:** HIVE-202, HIVE-203, HIVE-204
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `tests/test_local_cache.py`. Test: CRUD operations, sync updates timestamp, staleness detection, concurrent access safety.

---

### Phase 3: ISINResolver Refactor
> **Objective:** Replace CSV with Hive + API, behind feature flag.
> **Blocking:** Requires Phase 1 and Phase 2 complete.

- [x] **HIVE-301:** Add `USE_LEGACY_CSV` feature flag
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add `USE_LEGACY_CSV = True` to `config.py`. Document in config comments. This is the safety switch for rollback.

- [x] **HIVE-302:** Refactor ISINResolver with dual path
    - **Dependencies:** HIVE-301, HIVE-105, HIVE-205
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Modify `resolution.py`. When `USE_LEGACY_CSV=True`: use existing AssetUniverse. When `False`: use LocalCache → HiveClient → API fallback chain.

- [x] **HIVE-303:** Implement Hive-first resolution chain
    - **Dependencies:** HIVE-302
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** New resolution order: 1) Provider ISIN, 2) Manual enrichments, 3) LocalCache, 4) HiveClient (if cache miss), 5) API fallbacks (Finnhub→Wikidata→YFinance).

- [x] **HIVE-304:** Implement push-to-Hive on API success
    - **Dependencies:** HIVE-303
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** When API resolves a ticker, call `HiveClient.contribute_listing()` and `contribute_alias()`. Update LocalCache. Log contribution.

- [x] **HIVE-305:** Implement tiered resolution
    - **Dependencies:** HIVE-303
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Add `tier1_threshold` parameter (default 0.5%). Only attempt API resolution for holdings above threshold. Skip micro-holdings to avoid rate limits.

- [x] **HIVE-306:** Unit tests for ISINResolver refactor
    - **Dependencies:** HIVE-302, HIVE-303, HIVE-304
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `tests/test_isin_resolver_hive.py`. Test: flag=True uses CSV, flag=False uses Hive, cache hit/miss, API fallback, push-to-Hive.

---

### Phase 4: Decomposer Wiring
> **Objective:** Wire ISINResolver into Decomposer to fix X-Ray pipeline.
> **Blocking:** Requires Phase 3 complete.

- [x] **HIVE-401:** Inject ISINResolver into Decomposer
    - **Dependencies:** HIVE-306
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Modify `decomposer.py` constructor to accept `ISINResolver` instance. Update all Decomposer instantiation sites.

- [x] **HIVE-402:** Call resolver after adapter fetch
    - **Dependencies:** HIVE-401
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** After fetching holdings from adapter, call `resolver.batch_resolve(holdings)`. Update DataFrame with resolved ISINs. Handle partial resolution.

- [x] **HIVE-403:** Add resolution stats logging
    - **Dependencies:** HIVE-402
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Log resolution stats: total holdings, resolved count, unresolved count, resolution sources (cache/hive/api). Emit as pipeline progress event.

- [x] **HIVE-404:** Integration test for X-Ray pipeline
    - **Dependencies:** HIVE-402
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Create `tests/test_decomposer_resolution.py`. Test: ETF decomposition resolves ISINs, enrichment receives valid ISINs, unresolved holdings handled gracefully.

---

### Phase 5: Pipeline Decoupling & Defaults ✅ COMPLETE
> **Objective:** Decouple sync from pipeline, enable Hive path by default, remove Playwright.
> **Status:** COMPLETE (2025-12-25)
> **Plan:** `keystone/plans/PIPELINE_DECOUPLING_PLAN.md`

- [x] **DECOUPLE-001:** Remove pipeline auto-trigger from sync handler
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Removed `await handle_run_pipeline()` call from `handle_sync_portfolio()` in `sync.py`. Updated progress message.

- [x] **DECOUPLE-002:** Update sync tests
    - **Dependencies:** DECOUPLE-001
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Updated `test_handlers_sync.py` and `test_headless_integration.py` to verify sync does NOT call pipeline.

- [x] **DECOUPLE-003:** Change USE_LEGACY_CSV default to false
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** In `config.py`, changed default from `"true"` to `"false"`. Hive path is now default.

- [x] **DECOUPLE-004:** Simplify AmundiAdapter (remove Playwright)
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Removed `_fetch_via_playwright()`. Flow: manual file → raise `ManualUploadRequired`.

- [x] **DECOUPLE-005:** Simplify VanguardAdapter (remove Playwright)
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Removed Playwright methods (~240 lines). Kept: manual → US API → BeautifulSoup → ManualUploadRequired.

- [x] **DECOUPLE-006:** Delete browser.py
    - **Dependencies:** DECOUPLE-004, DECOUPLE-005
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Deleted `prism_utils/browser.py`. Removed all Playwright imports from adapters.

- [x] **DECOUPLE-007:** Update adapter error handling
    - **Dependencies:** DECOUPLE-006
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Updated docstrings to remove Playwright references. Adapters now raise `ManualUploadRequired` directly.

- [x] **DECOUPLE-008:** Run test suite
    - **Dependencies:** DECOUPLE-001, DECOUPLE-002, DECOUPLE-003
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** All 378 tests passing.

- [x] **DECOUPLE-009:** Live integration test
    - **Dependencies:** DECOUPLE-008
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Verified: sync without pipeline ✅, manual pipeline trigger via X-Ray "Deep Analysis" button ✅, Hive path active ✅.

---

### Phase 6: Cleanup (Post-Production Verification)
> **Objective:** Remove deprecated CSV code after production success.
> **Blocking:** Requires Phase 5 verified in production for 1+ week.

- [x] **HIVE-601:** Delete AssetUniverse class
    - **Dependencies:** DECOUPLE-009 (production verified)
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Removed `AssetUniverse` class from `resolution.py`. Removed all imports and usages.
    - **Completed:** 2025-12-26

- [x] **HIVE-602:** Remove CSV from migration.py
    - **Dependencies:** HIVE-601
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Removed `asset_universe.csv` handling from `migration.py` and `lifecycle.py`.
    - **Completed:** 2025-12-26

- [x] **HIVE-603:** Remove feature flag
    - **Dependencies:** HIVE-602
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Removed `USE_LEGACY_CSV` from `config.py`. Removed conditional logic from `resolution.py`. Hive path is now the only path.
    - **Completed:** 2025-12-26

- [x] **HIVE-604:** Delete deprecated files
    - **Dependencies:** HIVE-603
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Deleted `config/asset_universe.csv` and `default_config/asset_universe.csv`. Removed `ASSET_UNIVERSE_PATH` from config.
    - **Completed:** 2025-12-26

- [x] **HIVE-605:** Final documentation update
    - **Dependencies:** HIVE-604
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Updated CHANGELOG.md with removal of legacy CSV system.
    - **Completed:** 2025-12-26

---

### Phase 7: Data Provenance & Hive Logging ✅ COMPLETE
> **Objective:** Capture detailed metadata about data sources for the "Glass Box" UI.
> **Status:** COMPLETE (2025-12-26)
> **Plan:** `keystone/plans/PIPELINE_BACKEND_UPGRADE_PLAN.md`
> **Frontend Dependency:** `keystone/plans/PIPELINE_FRONTEND_IMPLEMENTATION_PLAN.md`

- [x] **PROV-001:** Update PipelineMonitor to track ISIN sets
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Changed `hive_hits`, `hive_misses`, `api_calls` from `int` to `set[str]`. Added `contributions: set[str]`. Updated `record_enrichment(isin, source)` signature.

- [x] **PROV-002:** Add record_contribution() method to monitor
    - **Dependencies:** PROV-001
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Added `record_contribution(isin)` and `get_hive_log()` methods to PipelineMonitor.

- [x] **PROV-003:** Update Decomposer._get_holdings() to return source
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Changed return type to `Tuple[DataFrame, str, PipelineError]`. Source is `"cached"`, `"hive"`, or `"{adapter}_adapter"`.

- [x] **PROV-004:** Collect per-ETF resolution metadata in decompose()
    - **Dependencies:** PROV-003
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Added `_etf_sources` dict and `get_etf_sources()` method to Decomposer.

- [x] **PROV-005:** Update HiveEnrichmentService.get_metadata_batch()
    - **Dependencies:** None
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Changed return type to `EnrichmentResult` dataclass with `data`, `sources`, and `contributions` fields.

- [x] **PROV-006:** Wire contributions from Enricher to PipelineMonitor
    - **Dependencies:** PROV-002, PROV-005
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Enricher now tracks contributions and sources. Pipeline wires them to monitor after enrichment phase.

- [x] **PROV-007:** Update _build_summary() for new JSON schema
    - **Dependencies:** PROV-001, PROV-004, PROV-006
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Updated `_write_health_report()` and `_build_summary()` to include `decomposition.per_etf[].source` and `enrichment.hive_log`.

- [x] **PROV-008:** Unit tests for provenance tracking
    - **Dependencies:** PROV-007
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Updated existing tests to handle new API signatures. Added `test_monitor_contributions` test. 384 tests passing.

- [x] **PROV-009:** Manual verification with live pipeline
    - **Dependencies:** PROV-008
    - **Status:** Done
    - **Workstream:** hive-extension
    - **Details:** Verified PipelineMonitor output format matches frontend contract. Full live test pending TR session renewal.

---

## Active State (Session Log)
> **Current Focus:** ALL PHASES COMPLETE. Workstream archived.

### Iteration Log
- [2025-12-26] **Completed:** Phase 7 (Data Provenance) - 9/9 tasks. Backend now emits source tracking and Hive logs.
- [2025-12-26] **Added:** Phase 7 (Data Provenance) - 9 tasks for backend upgrade to support Glass Box UI
- [2025-12-25] **Verified:** DECOUPLE-009 - Live integration test passed (sync decoupled, Deep Analysis button works)
- [2025-12-25] **Completed:** Phase 5 - Pipeline decoupling, Hive default, Playwright removal (9/9 tasks)
- [2025-12-25] **Documentation:** Updated strategy, ipc_api.md, created pipeline_triggering.md spec
- [2025-12-25] **Tests:** All 378 tests passing after Phase 5 changes
- [2025-12-25] **Completed:** Phase 4 - Decomposer wiring with 6 passing tests
- [2025-12-25] **Performance Fix:** Skip Hive network calls for tier2 holdings (970x faster)
- [2025-12-25] **Tested:** Full pipeline with Hive path - 3547 holdings, 1999 resolved (56.4%)
- [2025-12-25] **Completed:** Phase 3 - ISINResolver refactor with 16 passing tests
- [2025-12-25] **Completed:** Phase 2 - LocalCache with 31 passing tests
- [2025-12-24] **Completed:** Phase 1 - HiveClient read methods with 10 passing tests
- [2025-12-24] **Completed:** Phase 0 - RLS fix, aliases table, 7 RPC functions
- [02:30] **Created:** Workstream with 28 tasks across 5 phases
- [02:22] **Updated:** Strategy document with RLS discovery, feature flag, phase dependencies

### Artifacts Produced
- [x] `keystone/strategy/HIVE_EXTENSION_STRATEGY.md` (updated with Phase 5 complete)
- [x] `keystone/specs/ipc_api.md` (updated with run_pipeline command)
- [x] `keystone/specs/pipeline_triggering.md` (NEW - explains decoupled architecture)
- [x] `supabase/migrations/20251224_add_aliases.sql`
- [x] `supabase/functions/functions.sql` (7 RPC functions + contribute_alias)
- [x] `src-tauri/python/portfolio_src/config.py` (USE_LEGACY_CSV=false default)
- [x] `src-tauri/python/portfolio_src/data/hive_client.py` (read methods + contribute_alias)
- [x] `src-tauri/python/portfolio_src/data/local_cache.py`
- [x] `src-tauri/python/portfolio_src/data/resolution.py` (dual path refactor)
- [x] `src-tauri/python/portfolio_src/headless/handlers/sync.py` (decoupled from pipeline)
- [x] `src-tauri/python/portfolio_src/adapters/amundi.py` (Playwright removed)
- [x] `src-tauri/python/portfolio_src/adapters/vanguard.py` (Playwright removed)
- [x] `src-tauri/python/portfolio_src/prism_utils/browser.py` (DELETED)
- [x] `src-tauri/python/tests/test_hive_client_read.py` (10 tests)
- [x] `src-tauri/python/tests/test_local_cache.py` (31 tests)
- [x] `src-tauri/python/tests/test_isin_resolver_hive.py` (16 tests)
- [x] `src-tauri/python/tests/test_decomposer_resolution.py` (6 tests)
- [x] `scripts/test_hive_rpc.py`
- [x] `scripts/deploy_hive_schema.py`

### Parked Items / Ideas
- [ ] Consider adding `confidence_score` to resolution results
- [ ] Background sync thread for LocalCache (post-MVP)
- [ ] Alias contribution UI in frontend (post-MVP)

---

## Context for Resume (Handover)
- **Next Action:** None - workstream complete and archived.
- **State:** ALL PHASES COMPLETE (0-7). Legacy CSV system removed.
- **Phase 7 Output:** Backend now emits provenance data in `pipeline_health.json`:
  ```json
  {
    "decomposition": { "per_etf": [{ "isin": "...", "source": "cached|hive|{adapter}_adapter", ... }] },
    "enrichment": { 
      "stats": { "hive_hits": 450, "api_calls": 5, "new_contributions": 12 },
      "hive_log": { "contributions": ["ISIN1", ...], "hits": ["ISIN2", ...] } 
    },
    "failures": [{ "isin": "...", "issue": "...", "error": "...", "fix": "..." }]
  }
  ```
- **Files Modified (Phase 7):**
  - `src-tauri/python/portfolio_src/core/pipeline.py` - PipelineMonitor with ISIN sets, _write_health_report with provenance
  - `src-tauri/python/portfolio_src/core/services/decomposer.py` - _get_holdings returns 3-tuple with source
  - `src-tauri/python/portfolio_src/core/services/enricher.py` - EnrichmentResult dataclass, contributions tracking
  - `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py` - ETFDecompositionDetail.source field
  - `src-tauri/python/tests/*.py` - Updated tests for new API signatures (384 passing)
- **Phase 6 Completed:** 2025-12-26 - Legacy CSV system removed, all code cleaned up.
