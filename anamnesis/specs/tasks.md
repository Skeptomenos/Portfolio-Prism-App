# Implementation Plan (The "When")

> **Development Location:** Project root (standard Tauri layout)
> **Last Updated:** 2024-12-15 (MVP Complete)
> **Strategy:** `anamnesis/strategy/architecture-overview.md` > **Status:** MVP COMPLETE - Phase 0-4 Done, Phase 5 In Progress

## Status Legend

| Status        | Meaning                                | Next Action        |
| ------------- | -------------------------------------- | ------------------ |
| `Backlog`     | Idea captured, not prioritized         | Prioritize or park |
| `Open`        | Ready to work, dependencies met        | Start work         |
| `In Progress` | Currently being worked on              | Complete or block  |
| `Blocked`     | Cannot proceed, waiting for dependency | Resolve blocker    |
| `Done`        | Verified and complete                  | Archive when ready |
| `Archive`     | Historical reference                   | None               |

---

## Workstreams

| Workstream       | Description                   | Status |
| ---------------- | ----------------------------- | ------ |
| `infrastructure` | CI/CD, Telemetry, Scaffolding | Active |
| `data-engine`    | Python Backend, SQLite, IPC   | Active |
| `frontend`       | React UI, State Management    | Active |

---

## Phase 0: Infrastructure & Migration

### Workstream: infrastructure

- [x] **TASK-001:** Archive Legacy Dashboard Code

  - **Dependencies:** None
  - **Status:** Done
  - **Workstream:** infrastructure
  - **Context:** Move `src-tauri/python/portfolio_src/dashboard` to `src-tauri/python/reference_dashboard`. Update `app.py` to print a warning if run directly.
  - **Commit:** `865a91d`

- [x] **TASK-002:** Migrate In-Flight Infrastructure Tasks

  - **Dependencies:** None
  - **Status:** Done
  - **Workstream:** infrastructure
  - **Context:** Verify Cloudflare Worker `infrastructure/cloudflare/worker.js` is deployable. Check Supabase credentials.
  - **Commit:** `06370b2`

- [x] **TASK-003:** Scaffold React Environment
  - **Dependencies:** TASK-001
  - **Status:** Done
  - **Workstream:** infrastructure
  - **Context:** Clear `src/`. Initialize `npm create vite@latest` (React + TS). Install `shadcn-ui`, `tailwindcss`, `lucide-react`. Configure `tauri.conf.json` build command.
  - **Commit:** `8fde700`

---

## Phase 1: The Vault & Contracts (Data Layer)

### Workstream: data-engine

- [x] **TASK-101:** Implement SQLite Schema

  - **Dependencies:** TASK-003
  - **Status:** Done
  - **Workstream:** data-engine
  - **Context:** Create `src-tauri/python/portfolio_src/data/schema.sql` matching `specs/data_schema.md`. Use `sqlite3` to init DB at `PRISM_DATA_DIR`.
  - **Commit:** `61b14fa`

- [x] **TASK-102:** Create Pydantic Data Contracts

  - **Dependencies:** TASK-101
  - **Status:** Done
  - **Workstream:** data-engine
  - **Context:** Create `src-tauri/python/portfolio_src/models/contracts.py`. Implement IPC command/response contracts.
  - **Commit:** `e1056ac`

- [ ] **TASK-103:** Data Migration Script

  - **Dependencies:** TASK-102
  - **Status:** Backlog
  - **Workstream:** data-engine
  - **Context:** Create `scripts/migrate_v1_to_sqlite.py`. Read legacy JSON/CSV, validate via Pydantic, insert into SQLite. **Constraint:** Idempotent. **Validation:** Implement "Double-Entry Verification" (Old vs New sums match).

- [ ] **TASK-104:** Refactor Decomposer to Read SQLite
  - **Dependencies:** TASK-103
  - **Status:** Backlog
  - **Workstream:** data-engine
  - **Context:** Update `portfolio_src/core/services/decomposer.py`. Replace file-based reads with SQL queries. **Test Gate:** `pytest` passes with mocked DB.

---

## Phase 2: The Headless Engine (Backend)

### Workstream: data-engine

- [x] **TASK-201:** Headless Entry Point

  - **Dependencies:** TASK-102
  - **Status:** Done
  - **Workstream:** data-engine
  - **Context:** Create `src-tauri/python/prism_headless.py`. Implement stdin/stdout JSON RPC loop with command dispatch.
  - **Commit:** `0763656`

- [x] **TASK-202:** Rust Sidecar Spawning

  - **Dependencies:** TASK-201
  - **Status:** Done
  - **Workstream:** data-engine
  - **Context:** Create `python_engine.rs` with IPC manager. Update `lib.rs` to spawn headless sidecar with proper stdin/stdout handling.
  - **Commit:** `d826489`

- [x] **TASK-203:** Implement IPC Command Handler (Python)

  - **Dependencies:** TASK-201
  - **Status:** Done
  - **Workstream:** data-engine
  - **Context:** Implement `get_health` and `get_dashboard_data` handlers in prism_headless.py. (Included in TASK-201)
  - **Commit:** `0763656`

- [ ] **TASK-204:** Implement Throttled Asyncio Decomposer

  - **Dependencies:** TASK-203
  - **Status:** Backlog
  - **Workstream:** data-engine
  - **Context:** Wrap `decomposer.fetch()` calls in `asyncio.gather` with `asyncio.Semaphore(5)`.

- [ ] **TASK-205:** Implement Async Auth State Machine (Python)
  - **Dependencies:** TASK-203
  - **Status:** Backlog
  - **Workstream:** data-engine
  - **Context:** Implement State Machine for TR Auth. Emit `auth_challenge` events. Wait for `submit_challenge` commands. **Ref:** `specs/ipc_api.md`.

---

## Phase 3: The Skeleton UI (Frontend)

### Workstream: frontend

- [x] **TASK-301:** Frontend State Setup

  - **Dependencies:** TASK-003
  - **Status:** Done
  - **Workstream:** frontend
  - **Context:** Install `zustand`, `@tanstack/react-query`. Create `src/store/useAppStore.ts`. **Goal:** Store `engineStatus` (connected/disconnected).
  - **Commit:** `f80f9e9`

- [x] **TASK-302:** IPC Bridge

  - **Dependencies:** TASK-301
  - **Status:** Done
  - **Workstream:** frontend
  - **Context:** Create `src/lib/ipc.ts`. Wrap `invoke('send_command')` and `listen('engine-event')`. **Ref:** `specs/ipc_api.md`.
  - **Commit:** `9af1d4a`

- [x] **TASK-303:** System Status Component
  - **Dependencies:** TASK-302
  - **Status:** Done
  - **Workstream:** frontend
  - **Context:** Create React component displaying "Engine Connected" (Green/Red) and "Sync Button".
  - **Commit:** `acc5465`

---

## Phase 4: Feature Parity

### Workstream: frontend

- [ ] **TASK-401:** Dashboard Metric Cards

  - **Dependencies:** TASK-303
  - **Status:** Backlog
  - **Workstream:** frontend
  - **Context:** Render Total Value, PnL. Read from `get_dashboard_data` command.

- [ ] **TASK-402:** Portfolio Chart

  - **Dependencies:** TASK-401
  - **Status:** Backlog
  - **Workstream:** frontend
  - **Context:** Install `recharts`. Render Line Chart from Parquet historical data.

- [ ] **TASK-403:** Holdings Data Table

  - **Dependencies:** TASK-401
  - **Status:** Backlog
  - **Workstream:** frontend
  - **Context:** Implement sortable/filterable table using ShadCN/TanStack Table.

- [x] **TASK-404:** Implement Trade Republic Integration (React)
  - **Dependencies:** TASK-303
  - **Status:** Done
  - **Workstream:** frontend
  - **Context:** Full Trade Republic integration: login flow, 2FA modal, session persistence, portfolio sync, auto-sync after login, portfolio table with TanStack Table, Dashboard with real data.
  - **Commit:** `917d32a`

---

## Phase 4.5: Hive Activation

### Workstream: data-engine, infrastructure

- [ ] **TASK-451:** Finalize Hive Schema & Generate SQL
  - **Dependencies:** TASK-102 (Pydantic Contracts)
  - **Status:** Open
  - **Workstream:** data-engine, infrastructure
  - **Context:** Generate `infrastructure/supabase/schema.sql` based on `hive-architecture.md`.
- [ ] **TASK-452:** Implement Hive Client (Read/Write)
  - **Dependencies:** TASK-451
  - **Status:** Open
  - **Workstream:** data-engine
  - **Context:** Refactor `hive_client.py` to use new normalized schema and RPC functions. Implement staleness check.
- [ ] **TASK-453:** Create Hive Migration Script

  - **Dependencies:** TASK-452
  - **Status:** Open
  - **Workstream:** data-engine
  - **Context:** Create `scripts/seed_hive.py` to upload `asset_universe.csv` data via the new client.

- [ ] **TASK-454:** Deploy Hive Schema & Seed Data
  - **Dependencies:** TASK-451, TASK-453
  - **Status:** Open
  - **Workstream:** infrastructure
  - **Context:** User applies SQL. Run migration script.

---

## Phase 5: Polish & Release

### Workstream: infrastructure

- [ ] **TASK-501:** Verify PII Scrubber

  - **Dependencies:** TASK-202
  - **Status:** Backlog
  - **Workstream:** infrastructure
  - **Context:** Write test case injecting fake email into logs, assert it is scrubbed in `app.log`.

- [ ] **TASK-502:** GitHub Actions CI/CD

  - **Dependencies:** TASK-003, TASK-503
  - **Status:** Backlog
  - **Workstream:** infrastructure
  - **Context:** Build Rust + Python + React assets. Release `.dmg`. Requires UV migration for deterministic builds.

- [x] **TASK-503:** Migrate to UV Dependency Management (Critical)

  - **Dependencies:** None
  - **Status:** Done
  - **Workstream:** infrastructure
  - **Context:** Convert `requirements-build.txt` to `pyproject.toml` + `uv.lock` for deterministic builds. Update `build-python.sh` to use `uv run pyinstaller`. Prerequisite for CI/CD.
  - **Commit:** `Verified in Phase 5.6`

- [x] **TASK-505:** Config Auto-Installation (Frozen Mode)

  - **Dependencies:** TASK-503
  - **Status:** Done
  - **Workstream:** infrastructure, data-engine
  - **Context:** Ensure `adapter_registry.json`, `asset_universe.csv`, etc. are copied from the PyInstaller bundle to `PRISM_DATA_DIR/config` on startup. Fixes `NO_ADAPTER` errors in release builds.

- [x] **TASK-507:** Debug Binary Startup Hang (Critical)
  - **Dependencies:** TASK-503
  - **Status:** Done
  - **Workstream:** infrastructure
  - **Context:** Resolve silent binary hang on macOS ARM64. Identified and fixed dynamic library loading deadlock (Pandas/Numpy) in frozen bundle using `collect_submodules`.

---

## Archive

### Legacy Tasks (Streamlit Era)

- [x] **TASK-401:** Create Trade Republic login UI in Streamlit
- [x] **TASK-402:** Implement keyring storage for TR credentials
- [x] **TASK-403:** Set up Cloudflare Worker proxy
- [x] **TASK-404:** Implement Hive sync client
- [x] **TASK-405:** Implement silent ISIN contribution
- [x] **TASK-406:** Add missing hidden imports to prism.spec
- [x] **TASK-407:** Integrate TR Login as Tab 8
- [x] **TASK-410:** Fix duplicate header/form bug
