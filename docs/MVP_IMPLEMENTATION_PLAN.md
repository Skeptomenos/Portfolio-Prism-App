# MVP Implementation Plan (React Pivot)

> **Purpose:** Detailed roadmap for pivoting Portfolio Prism to a React-based MVP.
> **See Strategy:** `anamnesis/strategy/architecture-overview.md`
> **See Specs:** `anamnesis/specs/`

---

## Phase 0: Infrastructure & Migration (Foundation)
**Goal:** Establish the clean slate for React development while preserving legacy value.

> **CRITICAL EXECUTION RULE:** "Migrating" tasks means ensuring they are tracked in the backlog. **DO NOT** execute code for Supabase or Daemons until `TASK-003 (Scaffold React)` and `Phase 1 (Data Layer)` are complete. The React Foundation is the blocking dependency for everything else.

*   **Migrate In-Flight Tasks**
    *   Deploy Cloudflare Worker (GitHub Proxy).
    *   Configure Supabase Project (Hive Tables).
*   **Archive Legacy**
    *   Move `src-tauri/python/portfolio_src/dashboard` to `src-tauri/python/reference_dashboard`.
    *   Update `tasks.md` to point to this new plan.
*   **Scaffold React**
    *   Clean `src/` (Remove default Tauri vanilla JS template).
    *   Initialize Vite + React + TypeScript + ShadCN/UI.
    *   Configure `tauri.conf.json` for React dev server.

---

## Phase 1: The Vault & Contracts (Data Layer)
**Goal:** Establish the Source of Truth before writing UI code.

*   **Implement Schema**
    *   Create SQLite schema migration scripts (`001_init.sql`).
    *   Create Pydantic Models matching `data_schema.md`.
*   **Migration Script**
    *   Write Python utility to migrate existing JSON/CSV data to SQLite.
    *   Verify data integrity (Row counts match).
*   **Engine Refactor (Part 1)**
    *   Update `Decomposer` to read from SQLite instead of raw files.
    *   **Test Gate:** `pytest` passes with mocked SQLite data.

---

## Phase 2: The Headless Engine (Backend)
**Goal:** A Python process that speaks JSON via Stdin/Stdout.

*   **Entry Point**
    *   Create `headless.py` (Event Loop).
    *   Implement IPC Command Handler (`sync_portfolio`, `get_health`).
*   **Throttling**
    *   Implement `asyncio.Semaphore` in `Decomposer` for rate limiting.
*   **Rust Bridge**
    *   Implement Rust `Command` structs matching `ipc_api.md`.
    *   Implement Sidecar spawning and Stdin writing in `lib.rs`.
*   **Validation**
    *   **Test Gate:** Rust test spawns Python, sends `ping`, receives `pong`.

---

## 3. Phase 3: The Skeleton UI (Frontend)
**Goal:** A running React app that can talk to the Engine.

*   **State Management**
    *   Setup Zustand Store (App State).
    *   Setup TanStack Query (Async Data).
*   **IPC Bridge**
    *   Implement TypeScript `invoke()` wrappers for Rust commands.
    *   Implement Event Listeners for `portfolio-updated`.
*   **Hello World**
    *   Create a "System Status" component showing Engine health (RAM/Version).
    *   Create a "Sync" button that triggers the full Python pipeline.

---

## Phase 4: Feature Parity (The Build)
**Goal:** Rebuild the dashboard screens in React.

*   **Dashboard Tab**
    *   Implement `MetricCard` components.
    *   Implement `PortfolioChart` (Recharts) reading from Parquet/JSON.
*   **Holdings Tab**
    *   Implement `DataTable` (ShadCN) with sorting/filtering.
*   **Authentication**
    *   Port Trade Republic Login flow to React Modal.
    *   Connect 2FA input to Python auth handler.

---

## Phase 5: Polish & Release (The Launch)
**Goal:** A crash-proof, signed application.

*   **Telemetry**
    *   Verify PII Scrubber removes emails/paths.
    *   Test "Report Bug" button with Cloudflare Worker.
*   **Packaging**
    *   Configure GitHub Actions for CI/CD.
    *   Build `.dmg` (macOS) and verify signature.
*   **Launch**
    *   Release v0.1.0-alpha to internal testers.
