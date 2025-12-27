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

- [ ] **IR-401:** Add resolution_source and resolution_confidence columns to DataFrame
    - **Status:** Open
    - **Details:** Initialize columns in Decomposer and Enrichment

- [ ] **IR-402:** Update Decomposer._resolve_holdings_isins() to store provenance
    - **Status:** Open
    - **Details:** Store result.source and result.confidence for each holding

- [ ] **IR-403:** Update enrich_etf_holdings() to store provenance
    - **Status:** Open
    - **Details:** Store result.source and result.confidence for each holding

- [ ] **IR-404:** Verify aggregation preserves provenance columns
    - **Status:** Open
    - **Details:** Ensure highest confidence is preserved when combining holdings

- [ ] **IR-405:** Add unit tests for provenance storage
    - **Status:** Open
    - **Details:** Test provenance for resolved, unresolved, skipped holdings

- [ ] **IR-406:** Surface provenance in UI (optional)
    - **Status:** Backlog
    - **Details:** Add confidence badges, filter by resolution quality

### Phase 5: Format Learning

- [ ] **IR-501:** Track successful ticker formats per API
    - **Status:** Backlog

- [ ] **IR-502:** Persist format learnings to SQLite
    - **Status:** Backlog

- [ ] **IR-503:** Use historical success rates to prioritize variants
    - **Status:** Backlog

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
| `src-tauri/python/tests/test_isin_resolver_hive.py` | 13 Hive resolver tests |
| `keystone/plans/identity_resolution_persistent_cache_implementation.md` | Phase 3 implementation plan |
| `keystone/plans/identity_resolution_provenance_implementation.md` | Phase 4 implementation plan |
| `supabase/migrations/20251224_add_aliases.sql` | Schema migration |

---

## Active State

> **Current Focus:** Phase 4 - Per-Holding Provenance (optional)

### Iteration Log
- **2025-12-27:** Completed Phase 3 - Persistent negative cache with SQLite, removed legacy JSON cache, 20 new tests
- **2025-12-27:** Completed Phase 2 - API cascade reorder, confidence scoring, batched Wikidata, negative cache, tiered variants, SPARQL injection fix
- **2025-12-27:** Completed Phase 1 - NameNormalizer + TickerParser with 80 tests
- **2025-12-27:** Completed Phase 0 - Schema updates for identity resolution

### Test Summary
- Normalizer: 80 tests passing
- Phase 2: 15 tests passing
- Phase 3: 20 tests passing
- Hive resolver: 13 tests passing
- **Total: 128+ tests**

---

## Context for Resume

- **Next Action:** Phase 4 (IR-401) - Store resolution source/confidence per holding in DataFrame
- **State:** Phases 0-3 complete. 128+ tests passing. Persistent negative cache active.
- **Branch:** `fix/pipeline-tuning`
