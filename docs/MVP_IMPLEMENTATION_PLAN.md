# MVP Implementation Plan (React Pivot)

> **Purpose:** Detailed roadmap for pivoting Portfolio Prism to a React-based MVP.
> **See Strategy:** `anamnesis/strategy/architecture-overview.md` > **See Specs:** `anamnesis/specs/` > **Last Updated:** 2024-12-15
> **Status:** MVP COMPLETE - See `POST_MVP_ROADMAP.md` for next steps

---

## Executive Summary

The React MVP is **complete and functional**. Users can:

- Launch the native macOS app (Tauri + React)
- Authenticate with Trade Republic (login + 2FA)
- Sync real portfolio data (30+ positions)
- View holdings in a sortable table with inline editing
- See real-time portfolio metrics on the Dashboard

---

## Phase 0: Infrastructure & Migration - COMPLETE

**Goal:** Establish the clean slate for React development while preserving legacy value.

| Task                               | Status | Commit    |
| ---------------------------------- | ------ | --------- |
| Archive Legacy Dashboard           | Done   | `865a91d` |
| Migrate In-Flight Infrastructure   | Done   | `06370b2` |
| Scaffold React + Vite + TypeScript | Done   | `8fde700` |

**Deliverables:**

- Legacy Streamlit code archived to `reference_dashboard/`
- React + TypeScript + Vite project in `src/`
- Tauri configured for React dev server

---

## Phase 1: The Vault & Contracts - COMPLETE

**Goal:** Establish the Source of Truth before writing UI code.

| Task                           | Status   | Commit                     |
| ------------------------------ | -------- | -------------------------- |
| Implement SQLite Schema        | Done     | `61b14fa`                  |
| Create Pydantic Data Contracts | Done     | `e1056ac`                  |
| Data Migration Script          | Deferred | N/A - Using TR API instead |

**Deliverables:**

- SQLite schema at `portfolio_src/data/schema.sql`
- Pydantic models at `portfolio_src/models/contracts.py`
- Database wrapper with transaction support

---

## Phase 2: The Headless Engine - COMPLETE

**Goal:** A Python process that speaks JSON via Stdin/Stdout.

| Task                         | Status   | Commit                 |
| ---------------------------- | -------- | ---------------------- |
| Headless Entry Point         | Done     | `0763656`              |
| Rust Sidecar Spawning        | Done     | `d826489`              |
| IPC Command Handler          | Done     | `0763656`              |
| Throttled Asyncio Decomposer | Deferred | Not needed for TR sync |

**Deliverables:**

- `prism_headless.py` with full command dispatch
- `python_engine.rs` with IPC manager
- JSON-based stdin/stdout protocol
- PyInstaller binary bundling

---

## Phase 3: The Skeleton UI - COMPLETE

**Goal:** A running React app that can talk to the Engine.

| Task                     | Status | Commit    |
| ------------------------ | ------ | --------- |
| Zustand State Management | Done   | `f80f9e9` |
| TanStack Query Setup     | Done   | `f80f9e9` |
| IPC Bridge (TypeScript)  | Done   | `9af1d4a` |
| System Status Component  | Done   | `acc5465` |

**Deliverables:**

- `useAppStore.ts` with global state
- `ipc.ts` with typed command wrappers
- Event listeners for engine status
- Mock data fallback for browser development

---

## Phase 4: Feature Parity - COMPLETE

**Goal:** Rebuild the dashboard screens in React with Trade Republic integration.

| Task                       | Status | Commit    |
| -------------------------- | ------ | --------- |
| Trade Republic Login Flow  | Done   | `917d32a` |
| 2FA Modal                  | Done   | `917d32a` |
| Session Persistence        | Done   | `917d32a` |
| Portfolio Sync             | Done   | `917d32a` |
| Portfolio Table (TanStack) | Done   | `917d32a` |
| Dashboard with Real Data   | Done   | `917d32a` |
| Auto-Sync After Login      | Done   | `917d32a` |
| Toast Notifications        | Done   | `917d32a` |

**Deliverables:**

- Complete Trade Republic authentication (login → 2FA → authenticated)
- Real portfolio data fetching from TR API
- SQLite storage with 30+ positions
- Portfolio table with inline editing
- Dashboard showing total value, P&L, top holdings
- Glassmorphic UI components
- Auto-sync triggered after successful login

---

## Phase 5: Polish & Release - IN PROGRESS

**Goal:** A crash-proof, signed application with modern build infrastructure.

### 5.1: Build System Modernization (Prerequisite)

| Task                        | Status | Notes                                                                    |
| --------------------------- | ------ | ------------------------------------------------------------------------ |
| **UV Migration**            | Done   | Converted to `pyproject.toml` + `uv.lock`. Deterministic builds enabled. |
| Update Build Scripts        | Done   | Replaced `pip` with `uv run` commands.                                   |
| Validate Environment Parity | Done   | Dev and Prod envs aligned via `uv sync`.                                 |
| **Verify Binary Stability** | Done   | (TASK-507) Fixed macOS startup hang via `collect_submodules`.            |
| **Config Auto-Install**     | Done   | (TASK-505) Bundle -> Data Dir copy logic verified.                       |

**Why UV First:** CI/CD requires deterministic builds. The current `pip` + `requirements-build.txt` setup has no lockfile, creating "works on my machine" risks for automated builds.

**Deliverables:**

- `src-tauri/python/pyproject.toml` (replaces `requirements-build.txt`)
- `src-tauri/python/uv.lock` (pins exact dependency versions)
- Updated `scripts/build-python.sh` using `uv run pyinstaller`
- Faster dependency resolution (10-100x speedup)

### 5.2: Release Infrastructure

| Task                     | Status  | Dependencies                     |
| ------------------------ | ------- | -------------------------------- |
| Verify PII Scrubber      | Pending | TASK-501                         |
| **GitHub Actions CI/CD** | Pending | TASK-502, UV Migration           |
| Build `.dmg` Release     | Pending | Requires CI/CD                   |
| Code Signing             | Pending | Requires Apple Developer Account |

**Next Steps:** See `POST_MVP_ROADMAP.md`

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  ┌─────────┐ ┌──────────┐ ┌────────────────────────┐   │
│  │Dashboard│ │ TR View  │ │    Portfolio Table     │   │
│  └────┬────┘ └────┬─────┘ └───────────┬────────────┘   │
│       └───────────┴───────────────────┘                 │
│                       │                                  │
│              ┌────────▼────────┐                        │
│              │   Zustand Store │                        │
│              │  TanStack Query │                        │
│              └────────┬────────┘                        │
└───────────────────────┼─────────────────────────────────┘
                        │ IPC (invoke/listen)
┌───────────────────────┼─────────────────────────────────┐
│                 Rust Shell (Tauri)                       │
│              ┌────────▼────────┐                        │
│              │  python_engine  │                        │
│              │   (IPC Manager) │                        │
│              └────────┬────────┘                        │
└───────────────────────┼─────────────────────────────────┘
                        │ stdin/stdout JSON
┌───────────────────────┼─────────────────────────────────┐
│              Python Headless Engine                      │
│              ┌────────▼────────┐                        │
│              │ prism_headless  │                        │
│              │  (Command Loop) │                        │
│              └────────┬────────┘                        │
│                       │                                  │
│    ┌──────────────────┼──────────────────┐              │
│    │                  │                  │              │
│ ┌──▼───┐      ┌───────▼──────┐    ┌─────▼─────┐       │
│ │SQLite│      │ TR Sync/Auth │    │ Analytics │       │
│ └──────┘      └──────────────┘    └───────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## Key Learnings

1. **PyInstaller + Tauri**: Schema files must use `sys._MEIPASS` for path resolution in frozen binaries
2. **Tauri App Identifier**: Data directory is based on bundle identifier (`com.skeptomenos.portfolioprism`)
3. **TR API**: Uses WebSocket connection via daemon process for real-time data
4. **IPC Protocol**: JSON over stdin/stdout works reliably; stderr reserved for logging
5. **React Query**: Excellent for caching and refetching portfolio data after sync
6. **Build System Risk**: Current `pip` + `requirements-build.txt` lacks dependency locking, creating CI/CD reliability risks

## Technical Debt

| Issue                      | Impact                             | Resolution                                       |
| -------------------------- | ---------------------------------- | ------------------------------------------------ |
| **No Dependency Lockfile** | CI builds may be non-deterministic | Migrate to UV with `uv.lock`                     |
| **Manual venv Management** | Slower setup for new contributors  | Use `uv run` commands                            |
| **Build Cache Clearing**   | Slower PyInstaller rebuilds        | Retain `build/` directory for incremental builds |

**Priority:** UV migration should be completed before implementing CI/CD to ensure reliable automated builds.
