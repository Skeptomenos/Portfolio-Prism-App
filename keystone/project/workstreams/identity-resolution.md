# Workstream: identity-resolution

> **Parent Workstream:** [`data-engine`](./data-engine.md)
> **Owner:** IdentityResolution
> **Status:** Active
> **Created:** 2025-12-27
> **Last Heartbeat:** 2025-12-27

---

## Objective

Improve ISIN resolution accuracy and efficiency through name/ticker normalization, optimized API cascade ordering, confidence scoring, and intelligent caching.

## Critical Constraints

- [ ] Free APIs (Wikidata) before rate-limited APIs (Finnhub)
- [ ] No SPARQL injection vulnerabilities
- [ ] Preserve backward compatibility with existing resolution flow

---

## Related Documents

| Type | Document | Description |
|------|----------|-------------|
| Spec | [`keystone/specs/identity_resolution.md`](../../specs/identity_resolution.md) | Requirements & problem statement |
| Architecture | [`keystone/architecture/identity-resolution.md`](../../architecture/identity-resolution.md) | Component design |
| Strategy | [`keystone/strategy/identity-resolution.md`](../../strategy/identity-resolution.md) | Resolution logic |

---

## 📋 Tasks (Source of Truth)

### Phase 0: Schema
> **Plan:** [`keystone/plans/identity_resolution_schema_implementation.md`](../../plans/identity_resolution_schema_implementation.md)

- [x] **IR-001:** Add isin_cache table to local SQLite
    - **Status:** Done
    - **Commit:** `037c8b4`

- [x] **IR-002:** Add source/confidence/currency columns to Supabase aliases table
    - **Status:** Done
    - **Commit:** `037c8b4`

- [x] **IR-003:** Update lookup_alias_rpc to return rich result
    - **Status:** Done
    - **Commit:** `037c8b4`

- [x] **IR-004:** Update Python HiveClient for new schema
    - **Status:** Done
    - **Commit:** `a44692e`

### Phase 1: Normalizer
> **Plan:** [`keystone/plans/identity_resolution_normalizer_implementation.md`](../../plans/identity_resolution_normalizer_implementation.md)

- [x] **IR-101:** Implement NameNormalizer (strip suffixes, generate variants)
    - **Status:** Done
    - **Commit:** `fa0a0c8`

- [x] **IR-102:** Implement TickerParser (parse formats, generate variants)
    - **Status:** Done
    - **Commit:** `fa0a0c8`

- [x] **IR-103:** Integrate normalizers into ISINResolver.resolve()
    - **Status:** Done
    - **Commit:** `fa0a0c8`

- [x] **IR-104:** Add 80 unit tests for normalizer
    - **Status:** Done
    - **Commit:** `fa0a0c8`

### Phase 2: API Cascade Reorder & Confidence
> **Plan:** [`keystone/plans/identity_resolution_cascade_implementation.md`](../../plans/identity_resolution_cascade_implementation.md)

- [x] **IR-201:** Add confidence field to ResolutionResult
    - **Status:** Done
    - **Commit:** `a8d095c`

- [x] **IR-202:** Reorder API cascade: Wikidata → Finnhub → yFinance
    - **Status:** Done
    - **Commit:** `a8d095c`

- [x] **IR-203:** Implement batched Wikidata SPARQL with VALUES clause
    - **Status:** Done
    - **Commit:** `a8d095c`

- [x] **IR-204:** Add in-memory negative cache (5-min TTL)
    - **Status:** Done
    - **Commit:** `a8d095c`

- [x] **IR-205:** Implement tiered variant strategy per API
    - **Status:** Done
    - **Commit:** `a8d095c`

- [x] **IR-206:** Fix SPARQL injection vulnerability
    - **Status:** Done
    - **Commit:** `a8d095c`

- [x] **IR-207:** Add 16 unit tests for Phase 2 features
    - **Status:** Done
    - **Commit:** `a8d095c`

### Phase 3: Persistent Negative Cache
> **Plan:** [`keystone/plans/identity_resolution_persistent_cache_implementation.md`](../../plans/identity_resolution_persistent_cache_implementation.md)

- [x] **IR-301:** Add isin_cache table to LocalCache schema
    - **Status:** Done
    - **Commit:** `12de88a`

- [x] **IR-302:** Add LocalCache methods for isin_cache
    - **Status:** Done
    - **Commit:** `12de88a`

- [x] **IR-303:** Replace in-memory negative cache with SQLite
    - **Status:** Done
    - **Commit:** `12de88a`

- [x] **IR-304:** Remove legacy enrichment_cache.json
    - **Status:** Done
    - **Commit:** `12de88a`

- [x] **IR-305:** Add tests for persistent negative cache
    - **Status:** Done
    - **Commit:** `12de88a`

### Phase 4: Per-Holding Provenance
> **Plan:** [`keystone/plans/identity_resolution_provenance_implementation.md`](../../plans/identity_resolution_provenance_implementation.md)

- [x] **IR-401:** Add resolution_source and resolution_confidence columns to DataFrame
    - **Status:** Done
    - **Commit:** `5c4ea19`

- [x] **IR-402:** Update Decomposer._resolve_holdings_isins() to store provenance
    - **Status:** Done
    - **Commit:** `5c4ea19`

- [x] **IR-403:** Update enrich_etf_holdings() to store provenance
    - **Status:** Done
    - **Commit:** `5c4ea19`

- [x] **IR-404:** Update aggregation to preserve provenance columns
    - **Status:** Done
    - **Commit:** `5c4ea19`

- [x] **IR-405:** Add unit tests for provenance storage (18 tests)
    - **Status:** Done
    - **Commit:** `5c4ea19`

### Phase 5: Format Logging (Observability)
> **Plan:** [`keystone/plans/identity_resolution_format_learning_implementation.md`](../../plans/identity_resolution_format_learning_implementation.md)

- [x] **IR-501:** Add format detection to TickerParser
    - **Status:** Done
    - **Commit:** `70b7292`

- [x] **IR-502:** Add format_logs table and logging methods
    - **Status:** Done
    - **Commit:** `70b7292`

- [x] **IR-503:** Integrate logging into resolution flow
    - **Status:** Done
    - **Commit:** `70b7292`

- [x] **IR-504:** Add unit tests for format logging
    - **Status:** Done
    - **Commit:** `70b7292`

### Phase 5b: Format Optimization (Deferred)
> **Plan:** [`keystone/plans/identity_resolution_format_optimization.md`](../../plans/identity_resolution_format_optimization.md)
> **Prerequisite:** Phase 5 complete with 2-4 weeks of data

- [ ] **IR-510:** Add format_learnings aggregate table
    - **Status:** Backlog
    - **Details:** Aggregate table derived from format_logs for fast lookups

- [ ] **IR-511:** Add variant reordering based on success rates
    - **Status:** Backlog
    - **Details:** Reorder variants to try highest success rate formats first

- [ ] **IR-512:** Integrate reordering into Finnhub/yFinance calls
    - **Status:** Backlog
    - **Details:** Use reordered list for primary_ticker selection

### Phase 6: UI Integration
> **Plan:** [`keystone/plans/identity_resolution_ui_integration.md`](../../plans/identity_resolution_ui_integration.md)
> **Phase 6A Plan:** [`keystone/plans/identity_resolution_phase6a_backend.md`](../../plans/identity_resolution_phase6a_backend.md)

#### Phase 6A: Backend Data Exposure

> **Key Insight:** The `ticker` and `name` columns already contain original values. The resolver doesn't modify the DataFrame. No new `original_ticker`/`original_name` columns needed.

- [x] **IR-6A1:** Add resolution columns to cols_to_keep
    - **Status:** Done
    - **Commit:** `26a9282`

- [x] **IR-6A2:** Add resolution defaults for direct holdings
    - **Status:** Done
    - **Commit:** `26a9282`

- [x] **IR-6A3:** Update handle_get_true_holdings response
    - **Status:** Done
    - **Commit:** `26a9282`

- [x] **IR-6A4:** Add helper functions to holdings.py
    - **Status:** Done
    - **Commit:** `26a9282`

- [x] **IR-6A5:** Add Phase 6A unit tests
    - **Status:** Done
    - **Commit:** `26a9282`

#### Phase 6B: Frontend Components
> **Plan:** [`keystone/plans/identity_resolution_phase6b_components.md`](../../plans/identity_resolution_phase6b_components.md)

- [x] **IR-6B1:** Define TypeScript types for resolution
    - **Status:** Done
    - **Commit:** `cb657ac`

- [x] **IR-6B2:** Create ResolutionStatusBadge component
    - **Status:** Done
    - **Commit:** `cb657ac`

- [x] **IR-6B3:** Create ResolutionHealthCard component
    - **Status:** Done
    - **Commit:** `cb657ac`

- [x] **IR-6B4:** Create NeedsAttentionSection component
    - **Status:** Done
    - **Commit:** `cb657ac`

- [x] **IR-6B5:** Create FilterBar component
    - **Status:** Done
    - **Commit:** `cb657ac`

#### Phase 6C: Integration
> **Plan:** [`keystone/plans/identity_resolution_phase6c_integration.md`](../../plans/identity_resolution_phase6c_integration.md)

- [x] **IR-6C1:** Update IPC types
    - **Status:** Done
    - **Commit:** `aa85f21`

- [x] **IR-6C2:** Integrate all components into HoldingsView
    - **Status:** Done
    - **Commit:** `aa85f21`

- [x] **IR-6C3:** Add keyboard accessibility to GlassCard
    - **Status:** Done
    - **Commit:** `aa85f21`

#### Removed Tasks

- ~~IR-603: PortfolioTable badge~~ - Removed (positions have ISINs from Trade Republic)
- ~~IR-605: Streamlit dashboard~~ - Removed (deprecated)

---

## Artifacts Produced

| File | Description |
|------|-------------|
| `src-tauri/python/portfolio_src/data/normalizer.py` | NameNormalizer + TickerParser |
| `src-tauri/python/portfolio_src/data/resolution.py` | ISINResolver with cascade/confidence/persistent cache |
| `src-tauri/python/portfolio_src/data/local_cache.py` | LocalCache with isin_cache table |
| `src-tauri/python/tests/test_normalizer.py` | 80 normalizer tests |
| `src-tauri/python/tests/test_resolution_phase2.py` | 15 Phase 2 tests |
| `src-tauri/python/tests/test_resolution_phase3.py` | 20 Phase 3 tests |
| `src-tauri/python/tests/test_resolution_phase4.py` | 18 Phase 4 tests |
| `src-tauri/python/tests/test_resolution_phase5.py` | 14 Phase 5 tests |
| `src-tauri/python/tests/test_isin_resolver_hive.py` | 13 Hive resolver tests |
| `keystone/plans/identity_resolution_persistent_cache_implementation.md` | Phase 3 implementation plan |
| `keystone/plans/identity_resolution_provenance_implementation.md` | Phase 4 implementation plan |
| `keystone/plans/identity_resolution_format_learning_implementation.md` | Phase 5 implementation plan |
| `keystone/plans/identity_resolution_ui_integration.md` | Phase 6 implementation plan |
| `supabase/migrations/20251224_add_aliases.sql` | Schema migration |

---

## Active State

> **Current Focus:** Phase 6 Complete - UI Integration Done

### Iteration Log
- **2025-12-28:** Completed Phase 6C - Full HoldingsView integration with all components
- **2025-12-28:** Completed Phase 6B - 5 UI components (ResolutionStatusBadge, ResolutionHealthCard, NeedsAttentionSection, FilterBar, types)
- **2025-12-28:** Completed Phase 6A - Backend exposes resolution fields in API response
- **2025-12-28:** Created detailed Phase 6A implementation plan
- **2025-12-27:** Completed Phase 5 - Format Logging (observability), 14 new tests
- **2025-12-27:** Completed Phase 4 - Per-holding provenance (resolution_source, resolution_confidence), 18 new tests
- **2025-12-27:** Completed Phase 3 - Persistent negative cache with SQLite, removed legacy JSON cache, 20 new tests
- **2025-12-27:** Completed Phase 2 - API cascade reorder, confidence scoring, batched Wikidata, negative cache, tiered variants, SPARQL injection fix
- **2025-12-27:** Completed Phase 1 - NameNormalizer + TickerParser with 80 tests
- **2025-12-27:** Completed Phase 0 - Schema updates for identity resolution

### Test Summary
- Normalizer: 80 tests passing
- Phase 2: 15 tests passing
- Phase 3: 20 tests passing
- Phase 4: 18 tests passing
- Phase 5: 14 tests passing
- Hive resolver: 13 tests passing
- **Total: 160+ tests**

---

## Context for Resume

- **Next Action:** Phase 6D (Manual Resolution Upload) - See backlog
- **State:** Phases 0-6C complete. 160+ tests passing. UI integration complete.
- **Branch:** `fix/pipeline-tuning`
- **Remaining:** Phase 5b (Format Optimization) deferred pending data collection, Phase 6D (Manual Upload) in backlog
