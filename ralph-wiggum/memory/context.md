# Project Context

> This file provides shared context for all Ralphus agents.
> Fill in the sections below to help agents understand your project.

## Ralphus Structure

**CRITICAL**: All Ralphus files live under `ralph-wiggum/`:
- `ralph-wiggum/specs/` - Technical specifications
- `ralph-wiggum/prds/` - Product requirement docs
- `ralph-wiggum/memory/` - Shared context (this file)
- `ralph-wiggum/[variant]/` - Variant workspaces

**NEVER** create `specs/`, `prds/`, or `inbox/` at the project root.

## Project Overview

**Portfolio Prism** is a privacy-first, local-first desktop portfolio analyzer.

-   **Goal**: Provide institutional-grade portfolio analysis (X-Ray look-through, geographic/sector exposure) without sending sensitive financial data to the cloud.
-   **Target User**: Privacy-conscious investors (specifically Trade Republic users in DACH/EU) who want deep insights without spreadsheet hell.
-   **Philosophy**: "Battery Included, Browser Free". It runs as a native macOS app (via Tauri) with a bundled Python engine.

### Key Features
1.  **Local-First**: SQLite database lives on the user's machine. Credentials never leave localhost (except for direct 2FA exchange with TR).
2.  **X-Ray Analysis**: Decomposes ETFs into their underlying constituents to show "True Exposure" (e.g., "You think you own 10% Apple, but via 5 ETFs you actually own 18%").
3.  **The Hive**: A community-sourced database (Supabase) for resolving ISINs to ticker symbols, anonymized and optional.
4.  **Trade Republic Sync**: Headless Python automation to fetch transaction history using `pytr`.

## Tech Stack

| Layer | Technology | Role |
|-------|------------|------|
| **Shell** | **Tauri v2** (Rust) | Native window management, menu bar, OS integration. ~10MB footprint. |
| **Frontend** | **React** + **TypeScript** | UI/UX. Uses Vite, TailwindCSS, Recharts. **Feature-Sliced Design**. |
| **Engine** | **Python 3.12** | Headless sidecar. Handles data ingestion, `pytr` auth, pandas analytics, and SQLite management. |
| **Data** | **SQLite** | Local persistence (`~/Library/Application Support/PortfolioPrism/`). |
| **Cloud** | **Supabase** (Hive) | Shared read-only data for asset resolution. |
| **Proxy** | **Cloudflare Workers** | Protects API keys (Finnhub, etc.) from being embedded in the binary. |

## Architecture

**The Sidecar Model**:
1.  **Tauri (Rust)** spawns a Python subprocess (`src-tauri/binaries/prism`).
2.  **Communication**: JSON-RPC over `stdin`/`stdout`.
    -   Frontend sends: `{"command": "get_dashboard_data", "payload": {...}}`
    -   Backend responds: `{"success": true, "data": {...}}`
3.  **Isolation**:
    -   Frontend: Presentation ONLY. No calculations.
    -   Backend: Service & Data logic. Pydantic validation.

**Current Refactoring State (2026 Mandate)**:
-   Moving Frontend to **Feature-Sliced Design** (`src/features/`).
-   Enforcing strict **Zod** validation at the IPC boundary.
-   Structuring Python backend into **3-Layer Architecture** (Handlers -> Services -> Data).

## Development Workflow

### Requirements
-   Node.js 18+
-   Rust (Stable)
-   Python 3.12 (managed via `uv`)

### Commands
```bash
# Install deps
npm install
cd src-tauri/python && uv sync

# Run Dev (Hot Reload)
npm run tauri dev

# Run Tests
npm test                  # Frontend (Vitest)
pytest src-tauri/python   # Backend (Pytest)

# Build
npm run tauri build
```

## Conventions

-   **Strict Typing**: No `any` in TS. No untyped args in Python.
-   **Validation**: Inputs MUST be validated (Zod for TS, Pydantic for Python).
-   **Logging**: JSON structured logs only. No `console.log` or `print`.
-   **Testing**: Unit tests co-located with source files (`Component.test.tsx`, `service.test.py`).

## Key Files

-   `src/lib/ipc.ts`: The bridge between React and Rust/Python.
-   `src-tauri/src/lib.rs`: Rust entry point, manages sidecar lifecycle.
-   `src-tauri/python/portfolio_src/headless/dispatcher.py`: Python entry point for IPC commands.
-   `AGENTS.md`: The developer handbook and rule registry.
