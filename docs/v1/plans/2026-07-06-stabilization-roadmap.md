# Portfolio Prism — Stabilization Roadmap (2026-07-06)

> **Classification: Superseded — V1 only.** Archived 2026-09-07.
> Read when: Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2.
> Current authority: [project index](../../../index.md) and [V2 runtime contracts](../../../v2/README.md). Original requirements, commands, status and paths below are historical; they do not govern V2.

> V1 historical context, labeled 2026-09-06. The [project index](../../../index.md) routes to the current V2 plan and runtime documentation. Instructions and status below describe the earlier implementation; they do not govern V2.

> **Source:** Deep multi-agent review of 2026-07-06 (7 code-review dimensions, completeness critic, test-landscape audit, ground-truth suite runs).
> **Finding IDs:** used as stable references within this document — C* = critical (wrong numbers, broken product paths, security), H* = high (data integrity, core UX), M = medium. Each is summarized inline in the phase tables below with the affected files; the tables are self-contained and actionable as written.
> **Status:** Proposed — supersedes the "Next Recommended Execution Order" in `docs/v1/execution/stabilization-and-self-dogfood-plan.md` where they conflict.
> **Prime directive:** No phase ships without its regression tests. The Test Track (T0–T4) runs in parallel and gates the phases.

---

## Where we are

- The build is broken (9 tsc errors) and pytest is red (15/850), but neither gates anything: **CI runs zero Python tests** and its Playwright job runs without the Python engine.
- The analytics core produces wrong numbers on the production data path (ETF sleeve valued at zero; unresolved holdings merged into one fake security; quality gates validating a different dataset than what is persisted).
- The **packaged Tauri app** is worse off than dev: pipeline commands can't complete (30s hard timeout + serial blocking dispatch), the pipeline report always fails schema validation in Tauri mode, progress UI is permanently "Connecting…", and the sidecar survives app quit.
- Hive community contribution is structurally broken (RPC fails on every call; ETF-holdings RPC doesn't exist) and the Supabase schema has **no RLS**.
- The repo carries a complete dead second pipeline generation, kept alive only by tests, that still holds features the live path lost.

## Guiding principles

1. **Safety net before surgery.** The golden-run regression test and pytest-in-CI land before any pipeline refactor (including P-28).
2. **Truth over green.** Fix or `@pytest.mark.legacy`-quarantine tests that exercise dead code; never count them as coverage.
3. **Packaged app is the product.** Every fix must be verified in (or explicitly noted as not applying to) the Tauri build, not just the dev echo-bridge.
4. **One generation.** Port the legacy features the live path needs, then delete the dead generation in the same tranche.

---

## Phase 0 — Restore the build and make checks real (≈1–2 days)

| Item | Findings | Work |
|---|---|---|
| 0.1 | C7 | Fix the 9 tsc errors: `IPCValidationError` arity in `App.test.tsx:237`; wire or remove `addToast` in `SessionRestorePrompt` (the failure toast is genuinely lost — wire it); delete 7 dead type imports in `usePipelineDiagnostics.ts`. |
| 0.2 | — | Fix the 4 stale-test clusters behind the 15 pytest failures: `write_csv_atomic` patch target (post-SnapshotRepository refactor — also stop the test writing into the real user data dir), removed `ASSET_UNIVERSE_PATH` references, and the two real bugs they exposed are Phase 1/3 items (H7, H8). |
| 0.3 | T0 | **Add a `python-tests` job to CI** (`uv run pytest` in `src-tauri/python`) and to the pre-push hook. Make the Playwright CI job either start the engine or stop claiming IPC coverage. |

**Exit gate:** `pnpm build` green; pytest green (with legacy quarantine); CI red if either breaks.

## Phase 1 — Trustworthy numbers (≈1 week)

The analytics correctness tranche. All items land behind the golden-run test (T1).

| Item | Findings | Work |
|---|---|---|
| 1.1 | **C1** | ETF value fallback `quantity × current_price` in `aggregator._process_etf_positions`, extracted to a shared helper also used by `pipeline._get_etf_value` (one value calculation per run). |
| 1.2 | H6 | Unresolved holdings get stable `UNRESOLVED:<ticker>` identities (as `contracts/schemas.py` already documents) instead of collapsing into one `"None"` security; port `generate_group_id`/`normalize_special_assets` from legacy `core/aggregation/grouping.py`. |
| 1.3 | H8 | Normalize position/holdings columns **once at stage boundaries**; helpers and callers operate on the same frame. Kills the `KeyError: 'isin'` class. |
| 1.4 | M | Quality-gate consistency: gate validates exactly the dataset that is persisted; stop double-converting/double-scoring direct positions; stop `finally`-block writing empty breakdown reports on failed runs. |
| 1.5 | M | Cash handling: either include cash rows in exposures or exclude them from `expected_total` — one policy, both sides. |
| 1.6 | M | Weight pipeline: add `weight_pct` aliases to converters; make `_normalize_weight_format` refuse ambiguous inputs instead of guessing ×100. |
| 1.7 | H13 | Fix or delete `position_keeper` cost-basis math (dormant but shipped). |

**Exit gate:** golden-run test green with committed expected outputs; aggregator golden-math unit test (T2) green.

## Phase 2 — Packaged-app viability (≈1 week, parallelizable with Phase 1)

| Item | Findings | Work |
|---|---|---|
| 2.1 | **C2** | Per-command timeouts in `python_engine.rs` (long-running class: 10–15 min or progress-based keep-alive) **and** move blocking handlers (`run_pipeline`, `sync_portfolio`) onto `run_in_executor` so the stdin loop keeps serving health/auth polls. |
| 2.2 | **C3** | `get_pipeline_report` in Rust delegates to the Python handler (envelope), never reads the raw file. Remove the `.catch(() => null)` mask in `HoldingsView`. |
| 2.3 | H12 | Pipeline progress in Tauri mode consumes the existing stdout `sync_progress` → `sync-progress` events (`isTauri()` gate in `usePipelineProgress`); fix CSP to include `http://127.0.0.1:*` for dev; reconcile the orphaned event names (`pipeline_progress`, `engine-ready`, `engine-status`, `python-ready`). |
| 2.4 | H11 | Kill the sidecar on app exit (Tauri `RunEvent::Exit` → `child.kill()`); delete the inert dead-man's-switch or actually wire it; guarantee `tr-daemon` teardown. |
| 2.5 | **C6** | Remove `pydantic_core` from the PyInstaller excludes; build verification imports the binary and runs `get_engine_health` (not just `test -x`). |
| 2.6 | M | Dev config seeding: fix the off-by-one in `resource_path` (dev mode), seed **all** default-config files, replace the fragile `"headless" in path` check; fix cwd-relative paths (`caching.py`, `manual_enrichments.py`, `enrichment_gaps.py`) to respect `PRISM_DATA_DIR`. |
| 2.7 | M | `get_engine_health` parity: Rust passes `sessionId`/`uptime` through; remove or implement `get_overlap_analysis`; rewrite `docs/v1/specs/ipc_api.md` from the actual registries. |

**Exit gate:** a full sync + pipeline run completes in the **packaged** app with live progress, truthful report envelope, and no orphan processes after quit.

## Phase 3 — Sync & frontend integrity (≈3–4 days)

| Item | Findings | Work |
|---|---|---|
| 3.1 | H1 | Sold positions: sync reconciles deletions (delete or zero-out positions absent from the TR feed) — with a DB migration note for existing inflated portfolios. |
| 3.2 | H9 | `hasUnsavedChanges`: clear on save/sync/discard — or remove the flag until a Save flow exists. Today it permanently blocks sync. |
| 3.3 | H10 | Query invalidation: `invalidatePortfolioQueries` covers `['positions']`, `['engineHealth']`, `['pipelineDiagnostics']`; `portfolio-updated` event path verified. |
| 3.4 | H7 | `tr_sync.py:50` reserved LogRecord key (one-line fix) — restores real TR error messages. |
| 3.5 | H2 | `HistoryManager` connection bug (contextmanager misuse) — restores price history/day change. |
| 3.6 | M | Logout clears the react-query cache; fix the `logEvent` recursion guard; surface transport errors in HealthView/XRayView/positions query instead of "no data yet"; scrubber handles separator-free E.164 and adds key-based redaction for `phone`/`pin`/`iban`. |

## Phase 4 — Enrichment truth (≈1 week)

| Item | Findings | Work |
|---|---|---|
| 4.1 | H5 | Enricher stops writing `asset_class` into `sector`; hive/local-cache hits carry real sector/geography (requires cache/Hive columns — coordinate with Phase 5/P-28). |
| 4.2 | H4 | Finnhub proxy call switched to POST JSON (or Worker accepts GET) + a contract test against the Worker's route table. |
| 4.3 | M | Hive contributions carry valid `asset_class` (map, don't default to `"Stock"`); contribution results are checked, failures queued/logged — not counted as successes. Harvest stops fabricating `exchange="UNKNOWN", currency="USD"`. |
| 4.4 | H3 | `sync_universe` rows satisfy `AssetUniverseSchema` (or schema relaxed deliberately) so the asset universe actually persists. |
| 4.5 | M | Cache hygiene: positive resolution cache read path; atomic enrichment-cache writes (reuse `write_json_atomic`); no blocking full-universe sync per lookup when offline; negative-cache entries only for definitive misses (not transient network failures). |
| 4.6 | — | **Port from legacy, then delete the dead generation**: impact-weighted gap tracking (`enrichment_gaps`), enrichment provenance, holdings classification, unresolved-holdings report + metadata backfill. Then remove `core/aggregation/`, `core/reporting.py`, `core/direct_reporting.py`, `data/pipeline_db.py`, `data/normalization.py`, `data/holdings_normalizer.py`, `data/wikidata_enrichment.py`, legacy halves of `data/enrichment.py`, and their tests. |

**Exit gate:** enrichment coverage metrics (sector/geography) measured on the golden snapshot improve and are asserted in the quality-gate tests (T3).

## Phase 5 — Hive security & write path (≈3–4 days; prerequisite for P-28 Phase 2)

| Item | Findings | Work |
|---|---|---|
| 5.1 | **C5** | Enable RLS on all Hive tables; writes only through SECURITY DEFINER RPCs with validation; anon role read-only on tables. |
| 5.2 | **C4** | Fix `batch_contribute_assets` enum comparison; create (or remove the client call to) `batch_contribute_holdings`; align payloads with `etf_holdings` schema. |
| 5.3 | M | Fix or delete `scripts/deploy_hive_schema.py`; make migration deployment reproducible (`supabase db push` documented as the one path). |

## Phase 6 — P-28 Unified Data Schema (the next feature)

Proceed as designed in `docs/v1/architecture/unified_data_schema.md`, **after** Phases 0–1 and Test Track T0–T2 are green, absorbing: the Phase 5 RPC/RLS work into its Phase 2 (new tables + RPCs), the enricher write-backs (4.1) into its Phase 3, and run-history tables (`pipeline_runs`, `true_exposure`) replacing the dead `pipeline_db.py` design. P-28 remains the resolution path for P-24 (performance), P-17, P-18.

---

## Test Track (parallel, gates the phases)

| ID | Deliverable | Gates |
|---|---|---|
| T0 | pytest in CI + pre-push; legacy tests quarantined with `@pytest.mark.legacy`; delete root-level debris (`test_debug.py`, `run_debug_pipeline.py`, `find_fstring_logs.py`) | Phase 0 exit |
| T1 | **Golden-run regression**: real `Pipeline.run()` on a recorded, scrubbed snapshot fixture; exact output CSV/JSON assertions with numeric tolerance; recorded network mocks | Phase 1 exit; precondition for Phase 4/6 |
| T2 | Per-stage contracts: LOAD column contract, Enricher (source priority, provenance, error accumulation), aggregator golden math (30–50 positions, overlapping ETFs), `SnapshotRepository`, harvest idempotency | Phase 1/4 |
| T3 | Quality gates through the pipeline: degraded fixtures per gate; assert `quality_score`/`is_trustworthy` in the written health report. Backend→frontend contract round-trip: golden `pipeline_health.json` parsed by `PipelineReportEnvelopeSchema` | Phase 2/4 |
| T4 | IPC round-trip breadth (real sidecar + golden data dir: `run_pipeline`, `get_positions`, `get_true_holdings`, `get_dashboard_data`); wrap every frontend mock in its Zod schema (`Schema.parse(mock)`); headless `replay-pipeline.sh` diffing outputs run-over-run (nightly/dispatch CI) | Phase 6 precondition |

## Sequencing at a glance

```
Phase 0 (build+CI truth)
  ├─► Phase 1 (numbers)  ──┐          Test Track: T0 ─ T1 ─ T2 ─ T3 ─ T4
  ├─► Phase 2 (packaged app) │  (0,1,2 parallelizable; 3 anytime after 0)
  └─► Phase 3 (sync/frontend)│
            Phase 4 (enrichment) ◄─ needs T1
                  Phase 5 (Hive security)
                        Phase 6 (P-28 + legacy deletion) ◄─ needs T0–T2
```

## Housekeeping

- Update `docs/v1/execution/stabilization-and-self-dogfood-plan.md` to point at this roadmap; keep it as the dogfood-suite tracker.
- Track a new "packaged-app truth" checklist (C2/C3/C6/H11/H12 regressions) in the dogfood suite before any alpha distribution.
