# 🛠️ Trade Republic Integration Specification

**Status**: Critical / Fragile  
**Last Updated**: 2025-12-21  
**Owner**: Rigid Auditor / Sisyphus

---

## 1. Overview

The Trade Republic (TR) integration is a multi-layered system that bridges an async FastAPI environment with a synchronous subprocess daemon running the `pytr` library. Due to Trade Republic's aggressive rate limiting and the architectural complexity, this logic is **extremely fragile**.

### Architecture Stack
1.  **Frontend (React)**: Sends concurrent requests via IPC.
2.  **IPC Layer (TypeScript)**: Deduplicates identical concurrent requests.
3.  **FastAPI (Python/Async)**: Dispatches commands to handlers.
4.  **TRBridge (Python/Sync)**: Manages a long-lived subprocess (`tr_daemon.py`).
5.  **TRDaemon (Python/Async)**: Isolated process running `pytr` to avoid event loop conflicts.
6.  **pytr (Library)**: Handles the actual TR API (HTTP for auth, Websockets for data).

---

## 2. Critical Constraints (The "Never" List)

### 🔴 NEVER hit the TR API for status checks
Trade Republic will rate limit (`TOO_MANY_REQUESTS`) if you validate the session too often.
-   **Wrong**: Calling `api.resume_websession()` or `api.settings()` in `get_status()`.
-   **Right**: Use the local `_cached_auth_status` in `TRDaemon`. Only attempt API validation during explicit login or session restore.

### 🔴 NEVER block the FastAPI Event Loop
The `TRBridge` uses blocking I/O (`stdout.readline()`, `stdin.write()`).
-   **Wrong**: Calling `bridge.get_status()` directly from an `async def` handler.
-   **Right**: Always wrap bridge calls in `await loop.run_in_executor(_bridge_executor, bridge.method)`.

### 🔴 NEVER print to stdout in the Daemon
The Bridge and Daemon communicate via JSON-RPC over `stdin/stdout`.
-   **Wrong**: Using `print("debug info")` in the daemon. This will corrupt the JSON stream and hang the Bridge.
-   **Right**: Use `print("...", file=sys.stderr)` or the configured logger.

### 🔴 NEVER remove the path setup in tr_daemon.py
The daemon is spawned as a subprocess and needs to find `portfolio_src`.
-   **Wrong**: Removing the `sys.path.insert()` block at the top of `tr_daemon.py`.
-   **Right**: Keep the path setup block intact. It MUST run before any `portfolio_src` imports.
-   **Symptom if broken**: `ModuleNotFoundError: No module named 'portfolio_src'` → daemon crashes → "no ready signal" error.

### 🔴 NEVER reuse a timed-out API state
If a portfolio fetch times out (60s), the underlying websocket or session might be in a "zombie" state.
-   **Wrong**: Catching `TimeoutError` and returning an error while keeping `self.api`.
-   **Right**: Set `self.api = None` and `self._cached_auth_status = "idle"` to force a fresh connection on the next attempt.

---

## 3. Key Components & Fragility Points

### 3.1 TRDaemon (`tr_daemon.py`)
-   **Role**: The source of truth for TR state.
-   **Fragility**: Must maintain `_cached_auth_status` accurately. If this gets out of sync with the actual TR session, the UI will show "Connected" while syncs fail.
-   **Refactor Warning**: Do not "simplify" the `handle_get_status` method by adding a "quick check" to the API.

### 3.2 TRBridge (`tr_bridge.py`)
-   **Role**: Subprocess manager and JSON-RPC client.
-   **Fragility**: The `_read_response_with_timeout` uses `select.select` (on Unix) to prevent indefinite hangs. The 90s timeout is intentional to allow for slow TR websocket responses.
-   **Refactor Warning**: Do not remove the `threading.Lock` (`_command_lock`). It prevents concurrent writes to the daemon's `stdin`.

### 3.3 TRAuthManager (`tr_auth.py`)
-   **Role**: High-level auth state machine.
-   **Fragility**: It is an `async` class that wraps a `sync` bridge. It uses its own `ThreadPoolExecutor` to avoid blocking.
-   **Refactor Warning**: Ensure `try_restore_session` always checks `get_status()` before attempting a login to avoid redundant API calls.

---

## 4. Troubleshooting & Debugging

### Monitoring Pipes
If the app hangs during TR operations:
1.  Check if `tr_daemon` is still running: `ps aux | grep tr_daemon`.
2.  Check `stderr` logs: The Bridge redirects Daemon `stderr` to its own `stderr` with a `[TR Daemon]` prefix.
3.  Verify the "Ready" signal: The Daemon must emit `{"status": "ready", ...}` as its first line of output.

### Rate Limit Recovery
If you hit `TOO_MANY_REQUESTS`:
1.  **Stop all requests** for at least 5-10 minutes.
2.  The system will NOT auto-recover if you keep polling `get_status` (unless using the cached version).
3.  Delete `tr_cookies.txt` if the session is corrupted.

---

## 5. Automated Safeguards

### 5.1 Subprocess Startup Test
A test exists to verify the daemon can start as a subprocess and emit the ready signal.
Run it before any TR-related refactor:

```bash
cd src-tauri/python
python3 -c "
import subprocess, sys, select, json
proc = subprocess.Popen(
    [sys.executable, 'portfolio_src/core/tr_daemon.py'],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, bufsize=1
)
ready, _, _ = select.select([proc.stdout], [], [], 5.0)
assert ready, 'FAIL: Daemon did not emit ready signal'
line = proc.stdout.readline()
data = json.loads(line)
assert data.get('status') == 'ready', f'FAIL: Expected ready, got {data}'
proc.terminate()
print('PASS: Daemon subprocess startup OK')
"
```

### 5.2 What This Test Catches
| Failure Mode | Symptom | Root Cause |
|--------------|---------|------------|
| Path setup removed | `ModuleNotFoundError` | `sys.path.insert()` block deleted |
| Import order wrong | `ModuleNotFoundError` | Imports moved before path setup |
| Stdout corruption | JSON parse error | `print()` without `file=sys.stderr` |
| Crash on startup | No ready signal | Exception before `run()` is called |

---

## 6. Future Refactor Goals (Safe Path)
If the system is to be refactored, the only safe path is:
1.  **Eliminate the Subprocess**: Move `pytr` directly into the FastAPI process.
2.  **Native Async**: Use `pytr`'s async methods directly with FastAPI's event loop.
3.  **Stateful Service**: Implement a singleton `TRService` that manages the `pytr` instance and handles its own internal locking and rate limiting.

---

## 7. Lessons Learned (Post-Mortems)

### 2025-12-21: "No ready signal" after refactor
**Symptom**: `Failed to start TR daemon: Daemon failed to start - no ready signal`

**Root Cause**: During a refactor, we moved duplicate `TRMethod`/`TRRequest`/`TRResponse` definitions out of `tr_daemon.py` and imported them from `tr_protocol.py`. However, when the daemon runs as a subprocess, Python's path doesn't include `src-tauri/python/`, so `from portfolio_src.core.tr_protocol import ...` failed with `ModuleNotFoundError`.

**Fix**: Added path setup at the top of `tr_daemon.py` before any `portfolio_src` imports:
```python
import sys
from pathlib import Path
_daemon_dir = Path(__file__).resolve().parent
_python_root = _daemon_dir.parent.parent
if str(_python_root) not in sys.path:
    sys.path.insert(0, str(_python_root))
```

**Prevention**: 
1. Always run the subprocess startup test (Section 5.1) after TR changes
2. Never remove or move the path setup block
3. Never add `portfolio_src` imports before the path setup
