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
