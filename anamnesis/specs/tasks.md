# Implementation Plan (The "When")

> **Development Location:** Project root (standard Tauri layout)
> **Last Updated:** 2024-12-12
> **Strategy:** `anamnesis/strategy/architecture-overview.md`

## Status Legend

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `Backlog` | Idea captured, not prioritized | Prioritize or park |
| `Open` | Ready to work, dependencies met | Start work |
| `In Progress` | Currently being worked on | Complete or block |
| `Blocked` | Cannot proceed, waiting for dependency | Resolve blocker |
| `Done` | Verified and complete | Archive when ready |
| `Archive` | Historical reference | None |

---

## Workstreams

| Workstream | Description | Status |
|------------|-------------|--------|
| `infrastructure` | CI/CD, Telemetry, Scaffolding | Active |
| `data-engine` | Python Backend, SQLite, IPC | Active |
| `frontend` | React UI, State Management | Active |

---

## Phase 0: Infrastructure & Migration

### Workstream: infrastructure

- [ ] **TASK-001:** Archive Legacy Dashboard Code
    - **Dependencies:** None
    - **Status:** Open
    - **Workstream:** infrastructure
    - **Context:** Move `src-tauri/python/portfolio_src/dashboard` to `src-tauri/python/reference_dashboard`. Update `app.py` to print a warning if run directly.

- [ ] **TASK-002:** Migrate In-Flight Infrastructure Tasks
    - **Dependencies:** None
    - **Status:** Open
    - **Workstream:** infrastructure
    - **Context:** Verify Cloudflare Worker `infrastructure/cloudflare/worker.js` is deployable. Check Supabase credentials.

- [ ] **TASK-003:** Scaffold React Environment
    - **Dependencies:** TASK-001
    - **Status:** Open
    - **Workstream:** infrastructure
    - **Context:** Clear `src/`. Initialize `npm create vite@latest` (React + TS). Install `shadcn-ui`, `tailwindcss`, `lucide-react`. Configure `tauri.conf.json` build command.

---

## Phase 1: The Vault & Contracts (Data Layer)

### Workstream: data-engine

- [ ] **TASK-101:** Implement SQLite Schema
    - **Dependencies:** TASK-003
    - **Status:** Backlog
    - **Workstream:** data-engine
    - **Context:** Create `src-tauri/python/portfolio_src/data/schema.sql` matching `specs/data_schema.md`. Use `sqlite3` to init DB at `PRISM_DATA_DIR`.

- [ ] **TASK-102:** Create Pydantic Data Contracts
    - **Dependencies:** TASK-101
    - **Status:** Backlog
    - **Workstream:** data-engine
    - **Context:** Create `src-tauri/python/portfolio_src/models/contracts.py`. Implement `Asset`, `Position`, `Transaction` classes matching `specs/data_schema.md`.

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

- [ ] **TASK-201:** Headless Entry Point
    - **Dependencies:** TASK-104
    - **Status:** Backlog
    - **Workstream:** data-engine
    - **Context:** Create `src-tauri/python/headless.py`. Implement `while True: readline()` loop. Handle `JSONDecodeError`. **Ref:** `specs/tech.md`.

- [ ] **TASK-202:** Rust Sidecar Spawning
    - **Dependencies:** TASK-201
    - **Status:** Backlog
    - **Workstream:** data-engine
    - **Context:** Update `src-tauri/src/lib.rs`. Use `tauri::api::process::Command`. Implement `write_stdin` function. **Constraint:** Must capture stdout line-by-line.

- [ ] **TASK-203:** Implement IPC Command Handler (Python)
    - **Dependencies:** TASK-201
    - **Status:** Backlog
    - **Workstream:** data-engine
    - **Context:** Map JSON commands (`sync_portfolio`) to Service calls. Return JSON response. **Ref:** `specs/ipc_api.md`.

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

- [ ] **TASK-301:** Frontend State Setup
    - **Dependencies:** TASK-003
    - **Status:** Backlog
    - **Workstream:** frontend
    - **Context:** Install `zustand`, `@tanstack/react-query`. Create `src/store/useAppStore.ts`. **Goal:** Store `engineStatus` (connected/disconnected).

- [ ] **TASK-302:** IPC Bridge
    - **Dependencies:** TASK-202
    - **Status:** Backlog
    - **Workstream:** frontend
    - **Context:** Create `src/lib/ipc.ts`. Wrap `invoke('send_command')` and `listen('engine-event')`. **Ref:** `specs/ipc_api.md`.

- [ ] **TASK-303:** System Status Component
    - **Dependencies:** TASK-302
    - **Status:** Backlog
    - **Workstream:** frontend
    - **Context:** Create React component displaying "Engine Connected" (Green/Red) and "Sync Button".

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

- [ ] **TASK-404:** Implement Auth Challenge Modal (React)
    - **Dependencies:** TASK-205
    - **Status:** Backlog
    - **Workstream:** frontend
    - **Context:** Create Modal that listens for `auth_challenge` event. Input field for SMS/PIN. Sends `submit_challenge`.

---

## Phase 5: Polish & Release

### Workstream: infrastructure

- [ ] **TASK-501:** Verify PII Scrubber
    - **Dependencies:** TASK-202
    - **Status:** Backlog
    - **Workstream:** infrastructure
    - **Context:** Write test case injecting fake email into logs, assert it is scrubbed in `app.log`.

- [ ] **TASK-502:** GitHub Actions CI/CD
    - **Dependencies:** TASK-003
    - **Status:** Backlog
    - **Workstream:** infrastructure
    - **Context:** Build Rust + Python + React assets. Release `.dmg`.

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
