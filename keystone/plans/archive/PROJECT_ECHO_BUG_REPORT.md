# 🧩 Project Echo: Technical Handover & Bug Report

**Status**: Critical Stability Issues in Trade Republic Integration (Echo-Bridge Mode)
**Date**: 2025-12-21
**Context**: Transitioned from a blocking stdin/stdout loop to a fully async FastAPI-powered "Echo-Bridge" to enable browser-based development.

---

## 1. The Current Architecture
- **Shell**: React (Vite) running at `localhost:1420`.
- **Bridge**: FastAPI server in `prism_headless.py` listening on `127.0.0.1:5001`.
- **Dispatcher**: A fully `async` command router in `prism_headless.py`.
- **Daemon**: `tr_daemon.py` - An isolated process running `pytr`. It now uses `asyncio.StreamReader` for non-blocking communication with the Bridge.
- **IPC**: `src/lib/ipc.ts` detects the environment and routes `invoke` calls to `fetch` if not in Tauri.

---

## 2. The Core Issues
Despite multiple stabilization attempts, the following issues persist:

1.  **The "Log Storm"**: On app mount, the frontend sends multiple concurrent requests (`get_engine_health`, `tr_check_saved_session`, `get_dashboard_data`). Even with a `threading.Lock` in `TRBridge`, the backend seems to struggle with this concurrency.
2.  **Trade Republic Rate Limiting**: The primary blocker is `TOO_MANY_REQUESTS`. This is triggered because the system often fails to verify a resumed session correctly, forcing a fresh login attempt which Trade Republic throttles.
3.  **Connection Hangs**: During `sync_portfolio`, the daemon often enters a "Waiting for tickers" state but never returns the portfolio data, eventually timing out or breaking the connection.
4.  **Async/Sync Mismatch**: We moved the dispatcher to `async` to support FastAPI, but the underlying `TRBridge` still uses `subprocess` and `threading.Lock`, which might be causing deadlocks or race conditions in the `asyncio` event loop.

---

## 3. Attempted Fixes (and why they weren't enough)
- **Thread-Safety**: Added `threading.Lock` to `TRBridge` to prevent concurrent writes to the daemon's `stdin`. *Result*: Prevented stream corruption but didn't solve the logic hangs.
- **Async Daemon**: Rebuilt `tr_daemon.py` to use `asyncio` for its own internal loop. *Result*: Improved responsiveness but the "Portfolio Fetch" still times out.
- **Session Verification**: Added a step to "ping" Trade Republic on session resume. *Result*: This actually made things worse by adding more requests and triggering rate limits faster.
- **Frontend Throttling**: Optimized `App.tsx` to initialize only once. *Result*: Reduced the number of requests, but the "Backend Error: Login failed" still appears on the first attempt.

---

## 4. Hypotheses for Deep Dive
1.  **Daemon Communication**: The `stdin/stdout` pipe between the Bridge and the Daemon might be losing synchronization. If the Daemon prints a warning to `stdout` that isn't valid JSON, the Bridge's parser might hang or crash.
2.  **Pytr Session State**: The `pytr` library's `resume_websession()` might be returning `True` even if the session is partially invalid, leading to a state where we think we are logged in but the API calls fail.
3.  **FastAPI vs. Subprocess**: Running a long-lived subprocess (`tr_daemon`) inside a FastAPI worker thread might be causing signal handling issues or resource starvation.

---

## 5. Instructions for the Next Session
- **Focus**: Stabilize the `TRBridge` ↔ `TRDaemon` communication.
- **Tooling**: Use `lsof -i :5001` and `ps aux | grep python` to monitor orphaned processes.
- **Logging**: The logs are now "Beautiful" (using `rich`), but you should look for `[TR Daemon]` stderr output to see the raw `pytr` errors.
- **Strategy**: Consider moving the Trade Republic logic *directly* into the FastAPI process instead of using a separate Daemon process, now that we are in a fully async environment. The Daemon was originally built for the blocking Tauri stdin loop; it may now be redundant and adding unnecessary complexity.

**Current Branch**: `feat/tr-auth-state-machine`
**Root Directory**: `/MVP/`
