# Session Handoff — Pipeline Stabilization & Schema Redesign

> **Date:** 2026-03-09
> **Branches:** `codex/stabilize-ipc-xray` (merged), `pipeline/stabilize-xray-hive` (active, 35+ commits)
> **Next Agent:** Continue P-28 implementation on `pipeline/stabilize-xray-hive`

---

## What Was Accomplished

### Session 1: Session Restore (branch `codex/stabilize-ipc-xray`)
- Fixed `TRDaemon._get_data_dir()` to respect `PRISM_DATA_DIR`
- Fixed `SessionRestorePrompt` duplicated sync/auth ownership
- Added 4 dogfood E2E specs, fixed `auth.spec.ts`
- Session restore verified end-to-end in headed browser

### Session 2: Pipeline Stabilization (branch `pipeline/stabilize-xray-hive`)

12 code fixes shipped:

| Fix  | What                                        | Impact                                  |
| ---- | ------------------------------------------- | --------------------------------------- |
| P-01 | `resource_path()` config deployment           | 1/10 → 8/10 ETFs decompose             |
| P-07 | Pipeline success truthfulness               | No more hardcoded `success=true`          |
| P-11 | Weight column `weight_percentage`             | 0% → 99.9% ISIN resolution             |
| P-14 | Aggregator ETF value from quantity*price    | 84.8% → 0.4% total mismatch            |
| P-13 | Health report uses real resolution stats    | No more hardcoded `tier1_resolved: 0`     |
| P-19 | Validation gates column aliases             | quality_score 0.0 → 0.27               |
| P-21 | Provider metadata + Wikidata bulk SPARQL    | Replaces per-ISIN Finnhub (30min→17s)   |
| P-22 | True Exposure NVIDIA dedup                  | groupby ISIN only, not (ISIN, name)     |
| P-23 | SSE progress streaming                      | `run_in_executor` unblocks event loop     |
| P-24 | Remove Finnhub fallback + batch lookups     | 12min → 10min (variant batch pending)   |
| —    | Gate fixes (resolution + enrichment)        | tier2-skipped excluded from denominators |
| —    | HoldingRecord schema + cache migration      | sector/geography flow to validation     |

### Key Metrics Achieved

```
quality_score:    0.0 → 1.0
is_trustworthy:   false → true
ISIN resolution:  0% → 99.9% (852/853)
Total mismatch:   84.8% → 0.4%
Hive hit rate:    0% → 87%
SSE streaming:    stuck at 0% → real-time updates
Console errors:   multiple → 0
```

### Documents Created/Updated

| Document                                          | What                                              |
| ------------------------------------------------- | ------------------------------------------------- |
| `docs/specs/pipeline_definition_of_done.md`         | Created — canonical pipeline success criteria     |
| `docs/architecture/unified_data_schema.md`          | Created — target schema for P-28 refactor         |
| `docs/plans/2026-03-08-pipeline-stabilization-plan.md` | 28 tracked issues, dogfood logs, readiness checklist |
| `docs/plans/2026-03-08-session-restore-dogfood-fix-plan.md` | Session restore fix plan (completed)       |
| `docs/specs/identity_resolution_details.md`         | Updated — synchronized with implementation        |
| `docs/architecture/identity_resolution.md`          | Updated — synchronized with implementation        |
| `docs/specs/supabase_hive.md`                       | Updated — references unified schema               |
| `docs/architecture/database_schema.md`              | Updated — references unified schema               |
| `docs/specs/data_model.md`                          | Updated — references unified schema               |
| `AGENTS.md`                                         | Updated — ISIN-First domain philosophy added      |

---

## What Comes Next: P-28 Unified Data Schema

### The Task
Redesign the local SQLite cache and Supabase Hive to share an identical schema.
This enables same-query resolution on both stores, 100% cache hit rate on second run,
temporal exposure tracking, and thematic portfolio analysis.

### Design Document
`docs/architecture/unified_data_schema.md` — 468 lines, fully specified:
- 5 shared tables (securities, ticker_mappings, name_mappings, security_tags, etf_compositions)
- 4 local-only tables (pipeline_runs, true_exposure, portfolio_goals, sync_metadata)
- 8 query patterns with full SQL
- Migration plan (4 phases)

### Implementation Plan
Read `docs/plans/2026-03-08-pipeline-stabilization-plan.md` section "P-28: Implementation Readiness"

**Phase 1: Extend existing tables (non-breaking)**
- ALTER `assets`: add figi, lei, industry, industry_group, region, market_type, currency, market_cap_tier, cfi_code
- ALTER `listings`: add trading_currency, confidence, source, verified_at
- Update `local_cache.py` to match
- Write Supabase migration in `supabase/migrations/`
- Deploy with `supabase db push`

**Phase 2: New tables + RPCs**
- CREATE `security_tags`, `name_mappings` in Supabase + local SQLite
- CREATE `pipeline_runs`, `true_exposure`, `portfolio_goals` in local SQLite only
- New RPCs: batch resolve with variants, batch upsert name mappings

**Phase 3: Pipeline integration**
- ISINResolver: query `ticker_mappings` + `name_mappings` (both stores, same query)
- Decomposer: write ALL ticker variants + name variants after resolution
- Enricher: write sector/industry/geography to `securities`
- Report writer: create `true_exposure` snapshots per run

**Phase 4: Frontend (separate feature)**
- Not part of P-28

### Tools Verified
- Supabase CLI: v2.75.0, project linked (`dqtewajqqgngdgddycmr`)
- `supabase db push`: available for migrations
- Hive data: 1,104 assets, 2,193 listings (row limit raised to 10,000)
- RPCs: read + write working
- Python tests: 192+ passing
- Frontend tests: 400 Vitest + 18 E2E

### Key Decisions Made This Session
1. **Local cache stays SQLite** — correct for desktop app, no PostgreSQL dependency
2. **Same schema in both stores** — identical tables, swap the connection
3. **All ticker variants stored** — AZN, AZN.L, AZN.LN all map to same ISIN
4. **Name variants stored** — "NVIDIA CORP", "NVIDIA" both map to US67066G1040
5. **NameNormalizer for lookup** — strip Inc/Corp/Ltd, lowercase, index on normalized
6. **Thematic tags** — junction table (not JSON), enables "Am I in the AI chain?"
7. **Temporal snapshots** — `true_exposure` per `pipeline_run`, enables 3/6/12 month tracking
8. **30-day Hive staleness** — prefer adapter over stale Hive data
9. **OpenFIGI integration** — for FIGI + CFI codes
10. **Wikidata primary source** — for sector, industry, geography
11. **Enrichment: provider metadata first** — iShares CSV has Sektor + Standort
12. **Enrichment: Wikidata bulk SPARQL fallback** — one query for all gaps
13. **Finnhub/yFinance removed** — legacy fallbacks disabled
14. **Supabase row limit: 10,000** — raised from default 1,000

---

## Remaining Issues (all in plan document)

| ID   | Issue                                    | Priority | Status           |
| ---- | ---------------------------------------- | -------- | ---------------- |
| P-24 | Pipeline 10min → <30s                    | High     | Root cause found |
| P-25 | Manual ISIN entry UI                     | Medium   | Planned          |
| P-27 | Sub-ETF decomposition progress           | Medium   | Planned          |
| P-28 | Unified Data Schema refactor             | High     | Design complete  |
| P-15 | Resolution source `nan`                    | Low      | Open             |
| P-06 | Tier2 UI visibility                      | Low      | Deferred         |
| P-10 | Frontend degraded concept                | Low      | Deferred         |

P-28 resolves P-24 (performance via variant caching), P-17 (SQLite storage),
and P-18 (Hive freshness timestamps).

---

## Files Changed This Session

### Code (Python backend)
- `src-tauri/python/portfolio_src/headless/lifecycle.py` — resource_path fix
- `src-tauri/python/portfolio_src/headless/dispatcher.py` — run_in_executor for SSE
- `src-tauri/python/portfolio_src/headless/handlers/sync.py` — pipeline handler threading
- `src-tauri/python/portfolio_src/headless/handlers/holdings.py` — NVIDIA dedup fix
- `src-tauri/python/portfolio_src/core/pipeline.py` — success derivation, health report stats
- `src-tauri/python/portfolio_src/core/services/decomposer.py` — weight column, batch cache/Hive
- `src-tauri/python/portfolio_src/core/services/enricher.py` — Wikidata bulk, remove Finnhub
- `src-tauri/python/portfolio_src/core/services/aggregator.py` — ETF value from quantity*price
- `src-tauri/python/portfolio_src/core/contracts/schemas.py` — sector/geography on HoldingRecord
- `src-tauri/python/portfolio_src/core/contracts/converters.py` — HOLDING_COLUMN_ALIASES
- `src-tauri/python/portfolio_src/core/contracts/validation.py` — exclude tier2 from gates
- `src-tauri/python/portfolio_src/data/local_cache.py` — sector/geography columns + migration
- `src-tauri/python/portfolio_src/data/hive_client.py` — sector/geography on AssetEntry
- `src-tauri/python/portfolio_src/data/wikidata_enrichment.py` — NEW: bulk SPARQL service
- `src-tauri/python/portfolio_src/adapters/ishares.py` — preserve Sektor/Standort, German→English

### Code (Frontend)
- `src/features/auth/components/SessionRestorePrompt.tsx` — remove duplicated ownership
- `tests/e2e/dogfood-routes.spec.ts` — NEW: 4 route E2E specs
- `tests/e2e/auth.spec.ts` — auth-state-agnostic rewrite

### Tests (Python)
- `src-tauri/python/tests/test_pipeline_smoke.py` — 15+ new tests
- `src-tauri/python/tests/test_tr_daemon_unit.py` — 2 new tests
- `src-tauri/python/portfolio_src/headless/test_lifecycle.py` — 2 new tests

---

## How to Start Next Session

```
1. Read docs/plans/2026-03-08-pipeline-stabilization-plan.md (the live plan)
2. Read docs/architecture/unified_data_schema.md (the target schema)
3. Read supabase/schema.sql (current Hive schema)
4. Start with Phase 1: ALTER TABLE migrations
5. Use TDD: write failing test → fix → verify → dogfood
6. Update the plan after each step
```

### Runtime
```bash
pnpm dev:engine    # Python sidecar
pnpm dev           # Vite frontend
# App at http://localhost:1420
# Supabase CLI: supabase db push (deploy migrations)
```

### Key .env variables
```
VITE_ECHO_BRIDGE_TOKEN=<must match PRISM_ECHO_TOKEN>
PRISM_ECHO_TOKEN=<must match VITE_ECHO_BRIDGE_TOKEN>
SUPABASE_URL=https://dqtewajqqgngdgddycmr.supabase.co
SUPABASE_ANON_KEY=<in .env>
```
