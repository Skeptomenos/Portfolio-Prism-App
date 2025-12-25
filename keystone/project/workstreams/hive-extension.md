# Workstream: hive-extension

> **Feature Plan:** `keystone/strategy/HIVE_EXTENSION_STRATEGY.md`
> **Owner:** OptiPie
> **Status:** Active
> **Last Heartbeat:** 2025-12-24 02:30

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
                          Phase 5 (Cleanup)
                          [production verified]
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

### Phase 5: Cleanup (Post-Production Verification)
> **Objective:** Remove deprecated CSV code after production success.
> **Blocking:** Requires Phase 4 verified in production for 1+ week.

- [ ] **HIVE-501:** Delete AssetUniverse class
    - **Dependencies:** HIVE-404 (production verified)
    - **Status:** Open
    - **Workstream:** hive-extension
    - **Details:** Remove `AssetUniverse` class from `resolution.py`. Remove all imports and usages.

- [ ] **HIVE-502:** Remove CSV from migration.py
    - **Dependencies:** HIVE-501
    - **Status:** Open
    - **Workstream:** hive-extension
    - **Details:** Remove `asset_universe.csv` handling from `migration.py`. Remove `_sync_asset_universe()` from `community_sync.py`.

- [ ] **HIVE-503:** Remove feature flag
    - **Dependencies:** HIVE-502
    - **Status:** Open
    - **Workstream:** hive-extension
    - **Details:** Remove `USE_LEGACY_CSV` from `config.py`. Remove conditional logic from `resolution.py`. Hive path becomes the only path.

- [ ] **HIVE-504:** Delete deprecated files
    - **Dependencies:** HIVE-503
    - **Status:** Open
    - **Workstream:** hive-extension
    - **Details:** Delete `config/asset_universe.csv`. Update any error messages referencing CSV. Optionally remove `ASSET_UNIVERSE_PATH` from config.

- [ ] **HIVE-505:** Final documentation update
    - **Dependencies:** HIVE-504
    - **Status:** Open
    - **Workstream:** hive-extension
    - **Details:** Update `HIVE_EXTENSION_STRATEGY.md` status to COMPLETE. Archive to `keystone/plans/archive/`. Update README if needed.

---

## Active State (Session Log)
> **Current Focus:** Phase 0, 1, 2, and 3 complete. Ready for Phase 4 (Decomposer Wiring).

### Iteration Log
- [2025-12-25] **Completed:** Phase 3 - ISINResolver refactor with 16 passing tests
- [2025-12-25] **Completed:** Phase 2 - LocalCache with 31 passing tests
- [2025-12-24] **Completed:** Phase 1 - HiveClient read methods with 10 passing tests
- [2025-12-24] **Completed:** Phase 0 - RLS fix, aliases table, 7 RPC functions
- [02:30] **Created:** Workstream with 28 tasks across 5 phases
- [02:22] **Updated:** Strategy document with RLS discovery, feature flag, phase dependencies

### Artifacts Produced
- [x] `keystone/strategy/HIVE_EXTENSION_STRATEGY.md` (updated)
- [x] `infrastructure/supabase/migrations/20251224_add_aliases.sql`
- [x] `infrastructure/supabase/functions.sql` (7 RPC functions + contribute_alias)
- [x] `src-tauri/python/portfolio_src/config.py` (USE_LEGACY_CSV flag)
- [x] `src-tauri/python/portfolio_src/data/hive_client.py` (read methods + contribute_alias)
- [x] `src-tauri/python/portfolio_src/data/local_cache.py`
- [x] `src-tauri/python/portfolio_src/data/resolution.py` (dual path refactor)
- [x] `src-tauri/python/tests/test_hive_client_read.py` (10 tests)
- [x] `src-tauri/python/tests/test_local_cache.py` (31 tests)
- [x] `src-tauri/python/tests/test_isin_resolver_hive.py` (16 tests)
- [x] `scripts/test_hive_rpc.py`
- [x] `scripts/deploy_hive_schema.py`

### Parked Items / Ideas
- [ ] Consider adding `confidence_score` to resolution results
- [ ] Background sync thread for LocalCache (post-MVP)
- [ ] Alias contribution UI in frontend (post-MVP)

---

## Context for Resume (Handover)
- **Next Action:** Start Phase 4 - HIVE-401 (Inject ISINResolver into Decomposer)
- **State:** Phase 0-3 complete. ISINResolver now supports dual path (CSV or Hive).
- **Feature Flag:** `USE_LEGACY_CSV=true` (default) uses CSV, `USE_LEGACY_CSV=false` uses Hive
- **Key Files:**
  - Config: `src-tauri/python/portfolio_src/config.py` (feature flags)
  - Resolution: `src-tauri/python/portfolio_src/data/resolution.py` (dual path)
  - LocalCache: `src-tauri/python/portfolio_src/data/local_cache.py`
  - HiveClient: `src-tauri/python/portfolio_src/data/hive_client.py`
  - Decomposer: `src-tauri/python/portfolio_src/core/decomposer.py` (to be wired)
