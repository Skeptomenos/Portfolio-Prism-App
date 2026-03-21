# Portfolio Prism Live Overview

> Purpose: durable project brief for future sessions and compaction recovery
> Created: 2026-03-05
> Scope: product overview, implementation state, roadmap reality, broken/incomplete areas, and next actions

---

## 1. Executive Summary

Portfolio Prism is a **privacy-first desktop portfolio analysis app** focused on **true exposure analysis** for Trade Republic portfolios.

The core idea is:

- Pull a user's positions from Trade Republic
- Decompose ETF holdings into underlying securities
- Resolve inconsistent names/tickers to canonical ISINs
- Show both **direct holdings** and **look-through exposure**
- Keep the core workflow **local-first** on the user's machine
- Optionally contribute anonymized identity-resolution knowledge to **The Hive**

Architecturally it is a **three-part desktop system**:

- **React + TypeScript UI** in [`/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src)
- **Rust/Tauri shell + IPC bridge** in [`/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src)
- **Python analytics engine / headless sidecar** in [`/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src)

The project is **well beyond a prototype**. There is a substantial implemented app, many tests, and a significant amount of bugfix/refactor history. But it is also carrying **documentation drift**, **partially finished refactor work**, and a few **dead/incomplete feature paths**.

---

## 2. What The Product Is Trying To Be

### Product goal

Build a local-first desktop app that lets a private investor answer:

- What do I actually own across all my ETFs and direct positions?
- Where am I overexposed?
- Which underlying holdings are unresolved or low-confidence?
- Can I improve resolution accuracy over time without trusting a cloud portfolio processor?

### Core product promise

- **Local-first**: portfolio processing stays on-device
- **Desktop-native**: Tauri shell rather than Electron
- **Python analytics preserved**: no rewrite of financial logic into JS
- **Privacy-aware telemetry**: opt-in/filtered reporting and feedback
- **Community knowledge, not community custody**: Hive shares mappings, not raw portfolio data

### Best short description

Portfolio Prism is a **desktop “ETF X-Ray + exposure intelligence” tool for Trade Republic users**, with a local analytics engine and a community-backed identifier resolution system.

---

## 3. Current Architecture

### Frontend

The frontend is a React/Vite app with 5 major feature areas under [`/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features):

- `auth`
- `dashboard`
- `integrations`
- `portfolio`
- `xray`

Primary user-visible views from [`App.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/App.tsx):

- Dashboard
- Trade Republic
- X-Ray
- Holdings
- Health

Global support features:

- Feedback dialog
- Toasts
- Error boundaries
- Zustand app store
- TanStack Query data fetching

### Rust / Tauri shell

The Rust layer exposes commands such as:

- `get_engine_health`
- `get_dashboard_data`
- `get_positions`
- `sync_portfolio`
- `tr_*` auth commands
- `run_pipeline`
- `get_pipeline_report`
- `get_true_holdings`
- `upload_holdings`
- Hive preference commands

See [`commands.rs`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src/commands.rs) and handler registration in [`lib.rs`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src/lib.rs).

### Python sidecar

The Python engine is not small anymore; it is a meaningful backend:

- adapters for provider-specific ETF/portfolio data
- decomposition and aggregation services
- dashboard and sync services
- local SQLite-backed cache/database
- headless command handlers
- telemetry/reporting
- contracts/validation layer
- identity resolution and Hive client

The command dispatcher and handlers are in:

- [`dispatcher.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/dispatcher.py)
- [`handlers/__init__.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/__init__.py)

### Storage and external systems

- Local SQLite for portfolio/system state
- Local files/outputs for pipeline artifacts
- Supabase-backed Hive for alias/asset resolution sharing
- Cloudflare Worker for safe proxy/report endpoints

---

## 4. What Appears To Be Working

This section is based on source inspection, not a fully executed local validation run.

### Product features with clear implemented surface area

1. **Trade Republic login + 2FA flow**
   Evidence:
   - [`TradeRepublicView.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/integrations/components/TradeRepublicView.tsx)
   - [`LoginForm.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/auth/components/LoginForm.tsx)
   - [`TwoFactorModal.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/auth/components/TwoFactorModal.tsx)
   - TR handlers in [`tr_auth.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/tr_auth.py)

2. **Portfolio sync from backend into UI**
   Evidence:
   - `sync_portfolio` IPC path in Rust and Python
   - sync progress emission in [`sync.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/sync.py)
   - positions/dashboard query surface in frontend APIs and views

3. **Dashboard with real portfolio metrics and true exposure widget**
   Evidence:
   - [`Dashboard.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/dashboard/components/Dashboard.tsx)
   - metric cards, holdings cards, chart, and true exposure card components

4. **Holdings / true holdings explorer**
   Evidence:
   - [`HoldingsView.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/portfolio/components/HoldingsView.tsx)
   - resolution health summary
   - filter/search/sort
   - provenance-aware holdings list

5. **X-Ray diagnostics / pipeline reporting UI**
   Evidence:
   - [`XRayView.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/components/XRayView.tsx)
   - pipeline stepper, resolution table, action queue, Hive log, diagnostics hooks

6. **Health / telemetry / pending review surface**
   Evidence:
   - [`HealthView.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/components/views/HealthView.tsx)
   - telemetry handlers in [`telemetry.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/telemetry.py)

7. **Feedback submission**
   Evidence:
   - [`FeedbackDialog.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/components/feedback/FeedbackDialog.tsx)
   - [`feedback.ts`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/lib/api/feedback.ts)

8. **Identity-resolution pipeline and Hive integration**
   Evidence:
   - workstream completion records in wrapper planning docs
   - active code in local cache / Hive client / resolution flow
   - frontend provenance UI and health score display

### Test surface exists and is non-trivial

- Frontend unit tests: **25**
- Frontend integration/E2E specs: **5**
- Python tests: **53**

This does not prove green status today, but it does prove the project is organized for validation rather than being an untested prototype.

### Recent work appears real and recent

The nested repo's latest commit is:

- `873f43b` on **2026-02-16**: remove planning files/session data after migration to wrapper

The recent tag history suggests ongoing iteration through `v0.10.x`.

---

## 5. Current State Assessment

### Overall state

**State summary:** late-stage MVP / pre-production-ish desktop app with a real engine, but not cleanly stabilized.

### Confidence by area

| Area | Assessment |
|------|------------|
| Product definition | Clear |
| Core architecture | Clear and implemented |
| Main user workflows | Implemented |
| Testing infrastructure | Good surface area |
| Docs accuracy | Weak / drifting |
| Refactor completion | Incomplete |
| Validation in this checkout | Blocked by missing deps |

### Important nuance

There are **three different “states”** in the repo:

1. **Historic plan state**
   Many docs still say “MVP complete”, “release ready”, or “phase complete”.

2. **Current code reality**
   The app surface is broad and mostly implemented, but there are still incomplete edges and cleanup debt.

3. **Current local checkout state**
   The code is present, but I could not run a full validation suite yet because:
   - [`Portfolio-Prism/node_modules`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/node_modules) is absent
   - [`Portfolio-Prism/src-tauri/python/.venv`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/.venv) is absent

So today’s status is best described as:

> **Implemented and substantial, but with stale planning artifacts and not fully runtime-verified in this working copy.**

---

## 6. Roadmap Reality

There is no single perfectly current roadmap. The repo has multiple overlapping roadmap sources, and several are stale.

### What the older roadmap says

[`POST_MVP_ROADMAP.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/plans/archive/POST_MVP_ROADMAP.md) points toward:

- better visualizations
- CI/CD
- code signing
- telemetry
- ticker/price enrichment
- historical performance
- ETF X-Ray / overlap / advanced analytics
- community Hive features

### What the more recent wrapper planning says

Wrapper planning and workstreams imply the more recent priority stack has been:

1. Identity resolution quality
2. Value semantics / data integrity
3. Project Echo / telemetry / feedback loop
4. Refactor and cleanup work

### What the current code suggests the practical roadmap should be now

#### Immediate roadmap

1. Stabilize the shipped flows that already exist
2. Remove dead/stale code and stale planning references
3. Close the manual-resolution workflow gap
4. Re-establish trusted validation in a clean dev environment

#### Near-term roadmap

1. Finish refactor residue called out in the active plans
2. Decide whether overlap analysis is coming back or should be removed fully
3. Improve logging/type quality and make build/test health trustworthy
4. Resolve documentation drift between wrapper and nested repo

#### Longer-term roadmap

1. Historical tracking and richer analytics
2. More brokers / multi-broker support
3. Manual entry / correction workflows
4. Potential multi-device sync / cloud adjuncts

---

## 7. Active Working Features

### Confirmed active product surfaces

- Dashboard
- Trade Republic auth + sync
- Holdings explorer
- X-Ray diagnostics
- Health / telemetry controls
- Feedback dialog
- Hive contribution preference

### Confirmed active infrastructure

- Rust-to-Python command bridge
- Python dispatcher/handler architecture
- contracts/validation layer in Python
- test structure for frontend + backend

### High-probability working flows

Based on code completeness, these are likely intended to work end-to-end once dependencies are installed:

- app startup + shell initialization
- auth/session restore flow
- sync portfolio
- fetch dashboard data
- fetch positions
- run pipeline
- load true holdings
- load pipeline report / health report
- send feedback

---

## 8. Broken, Incomplete, Or Dormant Areas

This is the most important section for future work.

### A. Planning/documentation drift is severe

The nested repo removed planning/keystone material in February 2026, but the wrapper planning still references missing paths.

Example:

- [`planning/active_state.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/active_state.md) points to `keystone/plans/current/master_plan.md`
- that path does **not** exist in the wrapper

This means the planning layer is currently **not trustworthy as an execution map** without manual reconciliation.

### B. Manual holdings upload workflow is only partially finished

The UI exists, but the file-path handling is shaky:

- [`HoldingsUpload.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/integrations/components/HoldingsUpload.tsx)
- [`ActionModal.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/components/ActionModal.tsx)

Both rely on a non-standard `file.path` property and fall back to `file.name`.

Problem:

- The Rust command validates a real filesystem path before upload
- Standard browser `File` objects do not provide an absolute path
- I found no actual frontend use of a Tauri file-dialog API, despite comments saying that is the intended path

Practical interpretation:

> manual holdings upload likely works only in a narrow environment, and is not robustly implemented as a first-class Tauri file selection flow.

### C. “Fix” UX is still partly fake

[`ActionQueue.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/components/ActionQueue.tsx) still shows a **“Coming Soon”** tooltip for the Fix action.

So although modal/upload machinery exists elsewhere, the main X-Ray action queue is still signaling incomplete product behavior.

### D. Overlap analysis is a dead branch

Rust still exposes `get_overlap_analysis`, but:

- there is no frontend overlap view
- there is no Python overlap handler registered
- the old OverlapView was intentionally removed

Evidence:

- command remains in [`commands.rs`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src/commands.rs)
- missing Python overlap handler under [`headless/handlers`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers)
- no frontend references to overlap analysis in [`src`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src)

Practical interpretation:

> overlap is currently neither a live feature nor a cleanly removed feature.

### E. Legacy / likely-dead normalization module is broken

[`data/normalization.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/normalization.py) contains `_fetch_name_llm_stub()` but appears to use `re` without importing it, and appears to be unreferenced by the current codebase.

This is a strong signal of stale/dead code.

### F. Refactor status docs are partly stale

[`plans/active/comprehensive-refactor.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/plans/active/comprehensive-refactor.md) is directionally useful, but not fully accurate anymore.

Examples:

- it says Python f-string logging has ~180 occurrences left
- current grep found **1** remaining f-string logger call in [`core/reporting.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/core/reporting.py)

It does correctly call out some still-open frontend cleanup:

- 7 test files still mock `lib/ipc` directly
- `HoldingsUpload.tsx` still uses `any`
- `consola`-based structured frontend logging is not present

### G. Validation cannot currently be trusted from this checkout

I did not run the full app/test suite because the local checkout is missing installed dependencies.

Until that is fixed, any “release-ready” or “95% complete” claims should be treated as **historical**, not operational truth.

---

## 9. Open Items

### Open product/engineering items inferred from code + plans

1. **Finish the manual resolution workflow**
   - proper Tauri file-picker integration
   - clean path handoff to Rust command
   - predictable rerun/update UX after upload

2. **Resolve overlap feature status**
   - either restore properly
   - or remove the dead backend command and all leftover mentions

3. **Reconcile wrapper planning**
   - remove or update keystone-era path references
   - establish one authoritative “current plan” document again

4. **Finish refactor residue**
   - replace direct module mocks with transport mocks
   - remove remaining unsafe `any`/`as any`
   - clean up logging consistency

5. **Rebuild runtime confidence**
   - install deps
   - run frontend unit/integration tests
   - run Python pytest/mypy/ruff
   - smoke-run the actual app

6. **Audit stale modules**
   - unused normalization module
   - any other legacy compatibility code left after keystone/wrapper migration

### Open backlog items explicitly recorded

From wrapper planning/backlog:

- async I/O for adapters
- manual resolution upload CSV workflow
- windows/linux support
- multi-broker aggregation
- manual portfolio entry
- historical portfolio tracking
- AI insights / benchmark comparisons / watchlist

---

## 10. Prioritized Next Steps

### Tier 1: Do next

1. **Install dependencies and re-run validation**
   - `pnpm install`
   - `uv sync`
   - run frontend tests
   - run Python tests/lint/type checks

2. **Fix manual holdings upload properly**
   - use Tauri file dialog or another real absolute-path acquisition method
   - stop depending on `file.name` fallback
   - verify upload from X-Ray and Health flows

3. **Clean dead overlap path**
   - remove `get_overlap_analysis` command if overlap is out
   - or reintroduce a real overlap feature end-to-end

4. **Repair planning source of truth**
   - create one current execution plan in wrapper
   - fix stale `keystone/...` references

### Tier 2: Do soon after

1. **Close refactor debt**
   - migrate the 7 remaining test files off direct `lib/ipc` mocks
   - remove remaining `any`/`as any` usage in upload/action flows
   - decide on frontend structured logger direction

2. **Prune stale Python modules**
   - confirm whether `data/normalization.py` is dead
   - delete or repair it

3. **Reconcile docs**
   - README
   - roadmap docs
   - wrapper planning
   - changelog vs reality

### Tier 3: Product-level next moves

1. Historical portfolio snapshots and trend views
2. Stronger correction workflows for unresolved holdings
3. Additional broker support
4. Cross-device or optional cloud sync strategy

---

## 11. Suggested Truth Model For Future Sessions

When resuming work, treat these as the trustworthy sources in this order:

1. **Current code in the nested repo**
2. **Recent changelog entries**
3. **Wrapper workstreams/backlog, but only after verifying paths**
4. **Old roadmap/mission docs as historical context, not current truth**

If a plan doc conflicts with the code, trust the code.

---

## 12. Resume Checklist

If a future session picks this up, start here:

1. Read this file
2. Verify dependency state in the nested repo
3. Run validation suite
4. Decide whether the next session is:
   - stabilization
   - refactor cleanup
   - manual upload fix
   - overlap cleanup
5. Update this document with:
   - what was validated
   - what changed
   - what is still broken

---

## 13. Evidence Files Consulted

Key files used for this assessment:

- [`planning/mission.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/mission.md)
- [`planning/active_state.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/active_state.md)
- [`planning/backlog.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/backlog.md)
- [`planning/board.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/board.md)
- [`planning/workstreams/data-engine.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/workstreams/data-engine.md)
- [`planning/workstreams/identity-resolution.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/workstreams/identity-resolution.md)
- [`plans/active/comprehensive-refactor.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/plans/active/comprehensive-refactor.md)
- [`plans/active/python-type-mitigation.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/plans/active/python-type-mitigation.md)
- [`plans/archive/POST_MVP_ROADMAP.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/plans/archive/POST_MVP_ROADMAP.md)
- [`Portfolio-Prism/README.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/README.md)
- [`Portfolio-Prism/CHANGELOG.md`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/CHANGELOG.md)
- [`Portfolio-Prism/package.json`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/package.json)
- [`Portfolio-Prism/src/App.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/App.tsx)
- [`Portfolio-Prism/src/components/Sidebar.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/components/Sidebar.tsx)
- [`Portfolio-Prism/src/features/dashboard/components/Dashboard.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/dashboard/components/Dashboard.tsx)
- [`Portfolio-Prism/src/features/portfolio/components/HoldingsView.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/portfolio/components/HoldingsView.tsx)
- [`Portfolio-Prism/src/features/xray/components/ActionQueue.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/components/ActionQueue.tsx)
- [`Portfolio-Prism/src/features/xray/components/ActionModal.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/components/ActionModal.tsx)
- [`Portfolio-Prism/src/features/integrations/components/HoldingsUpload.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/integrations/components/HoldingsUpload.tsx)
- [`Portfolio-Prism/src/components/views/HealthView.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/components/views/HealthView.tsx)
- [`Portfolio-Prism/src/components/feedback/FeedbackDialog.tsx`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/components/feedback/FeedbackDialog.tsx)
- [`Portfolio-Prism/src/lib/ipc.ts`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/lib/ipc.ts)
- [`Portfolio-Prism/src-tauri/src/lib.rs`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src/lib.rs)
- [`Portfolio-Prism/src-tauri/src/commands.rs`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src/commands.rs)
- [`Portfolio-Prism/src-tauri/python/pyproject.toml`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/pyproject.toml)
- [`Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/__init__.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/__init__.py)
- [`Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/dashboard.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/dashboard.py)
- [`Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/holdings.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/holdings.py)
- [`Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/sync.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/sync.py)
- [`Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/telemetry.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/telemetry.py)
- [`Portfolio-Prism/src-tauri/python/portfolio_src/data/normalization.py`](/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/normalization.py)

