# Project Learnings & Constraints

This document tracks the specific constraints, patterns, and lessons learned _during the development of this project_.

**Rules for this file:**

1.  **Append Only:** Never delete existing learnings unless they are factually incorrect.
2.  **Telegraphic Style:** Be concise.
3.  **Specifics:** Focus on _this_ project.

---

## 1. Project Constraints (Invariants)

### 1.1 Bundle Size Critical

- Electron rejected (~200MB+).
- Target: < 150MB total (Tauri shell + Python sidecar + React assets).

### 1.2 API Key Security

- Finnhub key MUST NOT be embedded in client.
- All API calls route through Cloudflare Worker proxy.

### 1.3 Local-First Architecture

- Data lives in `~/Library/Application Support/PortfolioPrism/` (SQLite + Parquet).
- "SaaS" means rapid updates (Tauri Updater), not cloud processing.

### 1.4 Sidecar Pattern

- Python runs as a **Headless Worker** (Stdin/Stdout IPC).
- **No HTTP Server:** Previous Streamlit/Flask patterns replaced by pure JSON IPC.
- Tauri manages lifecycle (spawn, monitor, terminate).

### 1.5 React-First UI

- Streamlit is **Deprecated** for production UI.
- All UI components must be React (ShadCN/Tailwind).

---

## 2. Patterns (The "How")

> **Note:** Detailed patterns moved to `keystone/strategy/architecture-overview.md` Section 8.

- **Prism Data Cycle:** React → Rust → Python stdin → SQLite → stdout → Rust event → React
- **Dead Man's Switch:** EOF on stdin = self-terminate
- **Data Directory Injection:** `PRISM_DATA_DIR` env var
- **Hive RPC Delegation:** All writes via `SECURITY DEFINER` RPCs

---

## 3. Anti-Patterns (What Failed / What to Avoid)

### 3.1 Hardcoded Ports

- **Problem:** Port conflicts.
- **Solution:** Use Stdin/Stdout IPC instead of HTTP ports.

### 3.2 Blocking I/O

- **Problem:** Network calls freeze UI.
- **Solution:** Python Engine runs in background; UI is optimistic/reactive.

### 3.3 Premature Parquet Optimization

- **Learning:** Don't use Parquet as the primary DB.
- **Solution:** SQLite for transactional data (Source of Truth). Parquet for optional analytics cache.

---

## 4. Technical Notes

> **Note:** Detailed technical rules moved to:
> - `keystone/specs/build_optimization.md` (PyInstaller, bundle size)
> - `keystone/specs/ipc_api.md` (IPC rules, subprocess isolation)
> - `keystone/specs/trade_republic_integration.md` (pytr quirks)

---

## 5. Session-Specific Learnings

> **Note:** Actionable rules distilled to canonical locations:
> - `keystone/standards/python.md` (database patterns, testing)
> - `keystone/standards/typescript.md` (React patterns)
> - `keystone/specs/observability.md` (privacy, telemetry)
> - `keystone/directives/THINKING.md` (cognitive biases)
> - `keystone/directives/EXECUTION.md` (review, feature flags)

### Historical Context (Archived)

- **2024-12-12:** Strategic pivot from Streamlit to React. Strangler Fig pattern adopted.
- **2025-12-17:** macOS ARM64 PyInstaller issues resolved (collect_submodules, strip=False).
- **2025-12-20:** Unified sidecar entry point (`--http` flag) prevents dev/prod drift.
- **2025-12-25:** Hive extension complete. Feature flag pattern validated for safe refactors.
- **2025-12-26:** Legacy CSV resolution removed. Hive + LocalCache is now the only path.
