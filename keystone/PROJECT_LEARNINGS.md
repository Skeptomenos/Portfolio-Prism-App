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

### 2.1 The "Prism" Data Cycle

1. React sends Command -> Rust.
2. Rust writes JSON to Python Stdin.
3. Python processes -> Writes to SQLite/Parquet -> Prints Success JSON.
4. Rust emits Event -> React invalidates Cache.

### 2.2 Dead Man's Switch

- Tauri keeps stdin pipe open to Python.
- Python monitors stdin; EOF = parent died -> Self-terminate.

### 2.3 Data Directory Injection

- Python reads `PRISM_DATA_DIR` env var.
- Tauri sets this to OS-appropriate path at spawn.

### 2.4 Throttled Agility

- Python Engine uses `asyncio` for parallelism but enforces `Semaphore(5)` for rate limits.

### 2.5 Hive RPC Delegation (New)

- ALL data contributions and transactional logic MUST use PL/pgSQL RPC functions (`contribute_asset`, etc.).
- **Rationale:** Ensures atomicity, safely bypasses RLS (via `SECURITY DEFINER`), and centralizes validation logic.

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

### 3.4 Linear Completion Bias

- **Problem:** Thinking "Finish Phase 4 Streamlit" before "Start Phase 0 React".
- **Solution:** "Strangler Fig" pattern. Freeze legacy, build new foundation immediately.

### 3.5 Brittle Environment Testing (New)

- **Problem:** Integration tests fail due to inability to resolve nested modules (`portfolio_src`) and missing dependencies (`pandas`).
- **Solution:** Integration tests require explicit environment setup: `cd src-tauri/python && source .venv/bin/activate && export PYTHONPATH=$PWD:$PYTHONPATH`. Avoid simple `uv run python script.py`.

---

## 4. Technical Notes

### 4.1 PyInstaller Bundle Size

- Current binary: 84MB.
- Goal: Keep under 100MB by excluding unused libraries (e.g., unused parts of pandas).

### 4.2 pytr Library Quirks

- **Typo in v0.4.2:** Method is `inititate_weblogin` (extra 't').
- **asyncio.Lock:** Creates locks at import time -> requires process isolation (Daemon or Headless Engine).

---

## 5. Session-Specific Learnings

### 5.1 [2024-12-08] Data Path Consistency Bug

- **Learning:** Dashboard tabs defined local paths from `PROJECT_ROOT` vs `PRISM_DATA_DIR`.
- **Mandate:** ALL data read/write operations MUST use `PRISM_DATA_DIR`.

### 5.2 [2024-12-12] Strategic Pivot (Streamlit -> React)

- **Learning:** Streamlit blocks "Rapid Feedback Loop" due to slow startup and lack of component control.
- **Mandate:** Pivot to React immediately. Archive Streamlit code.

### 5.3 [2024-12-12] Task Management Discipline

- **Learning:** AI Agents can suffer from "Linear Completion Bias" (trying to finish old tasks before starting new architecture).
- **Mandate:** Explicitly define "Execution Rules" in the Implementation Plan to enforce the Strangler Fig pattern.

### 5.4 [2025-12-08] Stale Sidecar Binaries

- **Learning:** `pyinstaller prism.spec` ONLY builds the `prism` binary. The `tr-daemon` sidecar was ignored by build scripts.
- **Mandate:** Build scripts must explicitly compile ALL executables defined in `tauri.conf.json`.

### 5.5 [2025-12-08] Frozen Import Errors

- **Learning:** Relative imports fail inside a standalone PyInstaller binary.
- **Solution:** For small shared modules, prefer **Embedding** code directly into the standalone script to eliminate import complexity.

### 5.6 [2025-12-17] Spec File Overwrite Catastrophe

- **Learning:** `prism_headless.spec` was silently overwritten with `tr_daemon.spec` content during debugging. Binary name and entry point were wrong.
- **Mandate:** NEVER modify spec files without version control diff check. Keep `.spec.full` backup for critical specs.
- **Symptom:** Binary hangs before Python executes (dyld deadlock).

### 5.7 [2025-12-17] macOS ARM64 PyInstaller Requirements

- **Learning:** Heavy C-extension libs (pandas/numpy/pyarrow) require `collect_submodules()` on ARM64. Missing modules cause bootloader hang, not import error.
- **Mandate:** Always use `collect_submodules()` for: pandas, numpy, pyarrow, pydantic, keyring, pytr.
- **Mandate:** Always set `strip=False, upx=False` for macOS ARM64 binaries.

### 5.8 [2025-12-17] IPC Stdout Pollution

- **Learning:** Any logging to stdout corrupts JSON IPC channel. Symptom: Rust fails to parse Python responses.
- **Mandate:** ALL Python loggers MUST use `sys.stderr`. Audit `logging_config.py` after any logging changes.

- **Mandate:** Implement data normalization layers (`ASSET_CLASS_MAP`) on client-side migration scripts. Use robust column sizing (`VARCHAR(20)`) in PostgreSQL schemas.

### 5.10 [2024-12-19] React-First Payoff

- **Learning:** Implementing complex visual components (Sparklines, Gradient Area Charts) took <30 mins in React (`recharts`) vs hours of struggling with Streamlit iframe hacks.
- **Outcome:** Validates the "React-First" strategic pivot. Native UI components are significantly faster to iterate on for polished features.

### 5.11 [2025-12-20] Unified Sidecar Parity

- **Learning:** Separate "Dev Proxies" always drift from production logic.
- **Mandate:** Use the **exact same entry point** for both native sidecar and browser-bridge. The `--http` flag in `prism_headless.py` ensures that if a bug is fixed in the browser, it's fixed in the native app.

### 5.12 [2025-12-20] Privacy-First Telemetry

- **Learning:** Users of financial apps are hyper-sensitive to data leaks.
- **Mandate:** Telemetry must be **Scrubbed-by-Default** and **Opt-out-by-Choice**. Providing a "Review Scrubbed Data" view builds significant trust and allows the app to be "self-documenting" for developers without compromising user privacy.

### 5.13 [2025-12-21] Subprocess Path Isolation

- **Learning:** When `tr_daemon.py` is spawned as a subprocess by `tr_bridge.py`, Python's path doesn't include the parent directory. Imports like `from portfolio_src.core.tr_protocol import ...` fail with `ModuleNotFoundError`.
- **Symptom:** "Daemon failed to start - no ready signal" error.
- **Mandate:** Scripts that run as subprocesses MUST add their parent directory to `sys.path` BEFORE any local package imports. See path setup block in `tr_daemon.py`.
- **Test:** Run `pytest tests/test_tr_daemon_subprocess.py` after any TR-related changes.

### 5.15 [2025-12-22] Stacking Context Traps

- **Learning:** Components with `backdrop-filter` or specific `overflow` rules in a fixed-width sidebar create a new stacking context. Child modals/popups will be clipped to the sidebar width regardless of `fixed` positioning.
- **Mandate:** Global UI elements (Modals, Dialogs, Toasts) MUST be mounted at the application root (`App.tsx`) and managed via global state to ensure they can overlay the entire viewport.

### 5.16 [2025-12-22] Context-Aware Feedback

- **Learning:** Manual bug reports are 5x more useful when they include automated metadata about the user's current view.
- **Mandate:** Every manual feedback submission must automatically inject `currentView` and `version` into the payload metadata.

### 5.17 [2025-12-22] Stable Error Hashing

- **Learning:** Memory addresses in stack traces (e.g., `0x12345678`) change between runs, breaking hash stability.
- **Mandate:** Normalize memory addresses to `0xADDR` before hashing. Use first 500 chars of traceback to be stable across minor code changes.

### 5.18 [2025-12-22] Store Property Renames Break Components

- **Learning:** Renaming store properties (e.g., `autoReportErrors` → `telemetryMode`) silently breaks class components that access store via `getState()`.
- **Mandate:** After renaming store properties, grep for old property names across ALL `.tsx` files. TypeScript only catches errors in files that are type-checked.

### 5.19 [2025-12-22] Async Startup Tasks Need Delay

- **Learning:** Running heavy async tasks immediately on startup can race with database initialization.
- **Mandate:** Sentinel and similar startup auditors should `await asyncio.sleep(5)` before querying database to let app stabilize.

### 5.20 [2025-12-23] Context Manager API Changes Require Full Grep

- **Learning:** Converting `get_connection()` from a regular function to a `@contextmanager` breaks all callers that don't use `with`. The function returns a generator, not a connection, causing `AttributeError` at runtime.
- **Mandate:** When changing a function's return type or making it a context manager, grep the entire codebase for all call sites. Type checkers may not catch all usages (especially in dynamically typed Python).

### 5.21 [2025-12-23] SQLite Connection Leaks in Long-Running Processes

- **Learning:** In a long-running sidecar process, functions that call `get_connection()` without closing accumulate open connections over time.
- **Mandate:** ALL database query functions MUST use `with get_connection() as conn:` pattern. Never call `get_connection()` without a context manager.

### 5.22 [2025-12-23] Iterative Code Review Catches Cascading Bugs

- **Learning:** First code review found connection leak. Fix introduced new bug (settings.py not updated). Second review caught it.
- **Mandate:** After fixing bugs from code review, run review again to catch cascading issues from the fix itself.

### 5.23 [2025-12-25] Hive Network Calls Are Expensive Per-Item

- **Learning:** Calling Supabase RPC for each of 1349 holdings took 97s (72ms/call). Network latency dominates.
- **Mandate:** Batch network calls or skip for low-priority items. Use `skip_network` parameter for tier2 holdings.

### 5.24 [2025-12-25] Feature Flags Enable Safe Dual-Path Refactors

- **Learning:** `USE_LEGACY_CSV` flag allowed testing new Hive path without breaking production.
- **Mandate:** Major refactors should use feature flags. Default to safe (legacy) path. Flip after production verification.

### 5.25 [2025-12-25] Test Weight Parameters for Tiered Logic

- **Learning:** Tests for Hive resolution failed because default `weight=0.0` triggered tier2 skip logic.
- **Mandate:** When testing tiered logic, explicitly pass weight values that trigger the intended code path.
