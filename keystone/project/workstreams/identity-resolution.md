# Workstream: identity-resolution

> **Parent Workstream:** `data-engine`
> **Owner:** root-session
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

## Tasks

### Phase 1: Normalizer
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

- [x] **IR-206:** Add 16 unit tests for Phase 2 features
    - **Status:** Done
    - **Commit:** `a8d095c`

### Phase 3: Persistent Negative Cache
- [ ] **IR-301:** Move negative cache to SQLite (isin_cache table)
    - **Status:** Open

- [ ] **IR-302:** Remove legacy enrichment_cache.json
    - **Status:** Open

- [ ] **IR-303:** Add TTL tracking for SQLite negative cache
    - **Status:** Open

### Phase 4: Per-Holding Provenance
- [ ] **IR-401:** Store resolution source/confidence per holding in DataFrame
    - **Status:** Open

- [ ] **IR-402:** Surface provenance in UI (optional)
    - **Status:** Backlog

### Phase 5: Format Learning
- [ ] **IR-501:** Track successful ticker formats per API
    - **Status:** Backlog

- [ ] **IR-502:** Persist format learnings to SQLite
    - **Status:** Backlog

- [ ] **IR-503:** Use historical success rates to prioritize variants
    - **Status:** Backlog

---

## Active State

> **Current Focus:** Phase 3 - Persistent Negative Cache

### Iteration Log
- **2025-12-27:** Completed Phase 2 - API cascade reorder, confidence scoring, batched Wikidata, negative cache, tiered variants
- **2025-12-27:** Completed Phase 1 - NameNormalizer + TickerParser with 80 tests

### Artifacts Produced
- `src-tauri/python/portfolio_src/data/normalizer.py`
- `src-tauri/python/portfolio_src/data/resolution.py` (modified)
- `src-tauri/python/tests/test_normalizer.py`
- `src-tauri/python/tests/test_resolution_phase2.py`
- `keystone/plans/identity_resolution_cascade_implementation.md`

### Related Specs
- `keystone/specs/identity_resolution.md`

---

## Context for Resume

- **Next Action:** Implement Phase 3 - Move negative cache to SQLite, remove legacy JSON cache
- **State:** Phases 1-2 complete. 96 tests passing. API cascade optimized.
