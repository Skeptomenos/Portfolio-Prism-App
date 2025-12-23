# 🔧 Project Echo: Bug Fix Implementation Plan

**Status**: Ready for Implementation  
**Date**: 2025-12-21  
**Severity**: Critical  
**Estimated Total Effort**: 8-12 hours across 4 phases

---

## Executive Summary

The Trade Republic integration has a **fundamental architectural mismatch** between the async FastAPI dispatcher and the synchronous subprocess-based TRBridge. This document provides a prioritized implementation plan to fix all identified issues.

### Root Causes Identified

| Symptom | Root Cause | Primary Fix |
|---------|------------|-------------|
| Rate Limiting (`TOO_MANY_REQUESTS`) | `get_status()` calls `resume_websession()` which hits TR API every time | Cache auth status locally |
| "Log Storm" blocking | `threading.Lock` blocks asyncio event loop | Use `run_in_executor()` |
| Connection Hangs | Blocking `readline()` + pytr websocket waits | Add timeouts, reset state |
| Duplicate requests | Frontend calls same endpoints from multiple components | Deduplicate in IPC layer |

---

## Issue Registry

### 🔴 CRITICAL (System Breaking)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| C1 | `get_status()` calls `resume_websession()` → API call on every status check | `tr_daemon.py:214` | Rate limiting within seconds |
| C2 | `threading.Lock` in async context blocks event loop | `tr_bridge.py:174` | All requests queue, UI freezes |
| C3 | Sync handlers in async FastAPI without `run_in_executor()` | `prism_headless.py:779` | Event loop starvation |

### 🟠 HIGH (Major Functionality Impact)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| H1 | Duplicate session checks (App.tsx + TradeRepublicView.tsx) | `TradeRepublicView.tsx:228-249` | 2x API calls, race conditions |
| H2 | `portfolio_loop()` hangs on websocket with no per-item timeout | `tr_daemon.py:186-192` | 60s hang, no recovery |
| H3 | No request deduplication in IPC layer | `src/lib/ipc.ts` | Concurrent identical requests |
| H4 | Daemon startup uses `time.sleep(0.5)` instead of ready signal | `tr_bridge.py:84` | Race condition on cold start |

### 🟡 MEDIUM (Degraded Experience)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| M1 | `try_restore_session()` async but calls sync blocking methods | `tr_auth.py:200-273` | Blocks despite async signature |
| M2 | No API state reset after portfolio timeout | `tr_daemon.py:188-192` | Stale connection reused |
| M3 | Blocking `stdout.readline()` can hang indefinitely | `tr_bridge.py:197` | Hang if daemon crashes |
| M4 | `handleSync` checks auth status before every sync | `TradeRepublicView.tsx:346` | Extra API call per sync |

### 🟢 LOW (Technical Debt)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| L1 | Duplicate `TRMethod`, `TRRequest`, `TRResponse` definitions | `tr_daemon.py:24-44` | Maintenance burden |
| L2 | Inconsistent data directory defaults | `tr_auth.py:319` | Confusion |
| L3 | Unused `run_async()` helper | `tr_auth.py:363-371` | Dead code |
| L4 | Empty `setup_python_path()` function | `prism_headless.py:54-56` | Dead code |

---

## Implementation Phases

### Phase 1: Stop the Bleeding 🩹
**Goal**: Eliminate rate limiting immediately  
**Effort**: 1-2 hours  
**Risk**: Very Low

#### Task 1.1: Cache Auth Status in Daemon (C1) ⭐ HIGHEST PRIORITY

**File**: `src-tauri/python/portfolio_src/core/tr_daemon.py`

**Current Code** (line 211-218):
```python
async def handle_get_status(self) -> Dict[str, Any]:
    status = "idle"
    try:
        if self.api is not None and self.api.resume_websession():  # ← API CALL!
            status = "authenticated"
    except Exception:
        pass
    return {"status": status}
```

**Fixed Code**:
```python
class TRDaemon:
    def __init__(self):
        self.api = None
        self._pending_phone: Optional[str] = None
        self._pending_pin: Optional[str] = None
        self._loop = None
        self._cached_auth_status = "idle"  # NEW: Local cache

    async def handle_get_status(self) -> Dict[str, Any]:
        # Return cached status - NO API CALL
        return {"status": self._cached_auth_status}

    async def handle_login(self, phone, pin, restore_only=False):
        # ... existing code ...
        if self.api.resume_websession():
            self._cached_auth_status = "authenticated"  # UPDATE CACHE
            return {"status": "authenticated", ...}
        # ... rest of method ...
        
    async def handle_confirm_2fa(self, token):
        # ... existing code ...
        if result.get("status") == "authenticated":
            self._cached_auth_status = "authenticated"  # UPDATE CACHE
        return result
        
    async def handle_logout(self):
        self._cached_auth_status = "idle"  # RESET CACHE
        # ... existing code ...
```

**Verification**:
- [ ] `get_status()` returns immediately without network call
- [ ] Status updates correctly after login/logout
- [ ] No `TOO_MANY_REQUESTS` errors on app mount

---

#### Task 1.2: Remove Duplicate Session Check (H1)

**File**: `src/components/views/TradeRepublicView.tsx`

**Remove lines 228-249** (the `useEffect` that checks session):
```typescript
// DELETE THIS ENTIRE useEffect - App.tsx already handles it
useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await trCheckSavedSession();
        setSessionData(session);
        
        if (session.hasSession) {
          const status = await trGetAuthStatus();
          if (status.authState === 'authenticated') {
            setAuthState('authenticated');
          }
        }
      } catch (error) {
        console.error('[TradeRepublicView] Session check failed:', error);
      }
    };

    if (authState !== 'authenticated') {
      checkSession();
    }
  }, [authState, setAuthState]);
```

**Replace with** (use store state set by App.tsx):
```typescript
// Session state comes from App.tsx via Zustand store
// No duplicate check needed - just read from store
useEffect(() => {
    // Only fetch session data for display if we need to show restore prompt
    const loadSessionData = async () => {
        if (authState === 'idle') {
            try {
                const session = await trCheckSavedSession();
                setSessionData(session);
            } catch (error) {
                console.error('[TradeRepublicView] Failed to load session data:', error);
            }
        }
    };
    loadSessionData();
}, [authState]);
```

**Verification**:
- [ ] Only one `tr_check_saved_session` call on app mount
- [ ] Only one `tr_get_auth_status` call on app mount
- [ ] Auth state still propagates correctly to TradeRepublicView

---

#### Task 1.3: Remove Pre-Sync Auth Check (M4)

**File**: `src/components/views/TradeRepublicView.tsx`

**Current Code** (line 344-355):
```typescript
const handleSync = useCallback(async () => {
    // ...
    setIsSyncing(true);
    try {
      // Check auth status first  ← REMOVE THIS
      const status = await trGetAuthStatus();
      if (status.authState !== 'authenticated') {
        // ...
      }
      // ...
```

**Fixed Code**:
```typescript
const handleSync = useCallback(async () => {
    if (hasUnsavedChanges) {
      addToast({ type: 'warning', title: 'Unsaved changes', message: '...' });
      return;
    }

    setIsSyncing(true);
    try {
      // Removed: Pre-sync auth check (let sync fail and handle error)
      const result = await syncPortfolio(activePortfolioId, false);
      addToast({ type: 'success', title: 'Portfolio synced', message: `${result.syncedPositions} positions updated` });
      refetchPositions();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      addToast({ type: 'error', title: 'Sync failed', message });
      
      // Handle auth errors from sync response
      if (message.includes('auth') || message.includes('session') || message.includes('TR_AUTH_REQUIRED')) {
        setAuthState('idle');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [activePortfolioId, hasUnsavedChanges, addToast, refetchPositions, setAuthState]);
```

**Verification**:
- [ ] Sync starts immediately without pre-check
- [ ] Auth errors from sync are handled correctly
- [ ] User is redirected to login on session expiry

---

### Phase 2: Fix Async/Sync Mismatch 🔄
**Goal**: Prevent event loop blocking  
**Effort**: 3-4 hours  
**Risk**: Low

#### Task 2.1: Wrap Bridge Calls in Executor (C2, C3)

**File**: `src-tauri/python/prism_headless.py`

**Add executor at module level** (after imports):
```python
from concurrent.futures import ThreadPoolExecutor

# Thread pool for blocking bridge operations
_bridge_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bridge")
```

**Convert sync handlers to use executor**:

```python
async def handle_tr_get_auth_status(cmd_id: int, payload: dict) -> dict:
    try:
        loop = asyncio.get_event_loop()
        bridge = get_bridge()
        
        # Offload blocking call to thread pool
        status = await loop.run_in_executor(_bridge_executor, bridge.get_status)
        
        auth_state_map = {
            "authenticated": "authenticated",
            "idle": "idle",
            "waiting_2fa": "waiting_2fa",
        }
        auth_state = auth_state_map.get(status.get("status", "idle"), "idle")
        auth_manager = get_auth_manager()
        
        # Also offload credential check
        has_credentials = await loop.run_in_executor(
            _bridge_executor, auth_manager.has_credentials
        )
        
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "authState": auth_state,
                "hasStoredCredentials": has_credentials,
                "lastError": auth_manager.last_error,
            },
        }
    except Exception as e:
        return error_response(cmd_id, "TR_AUTH_ERROR", str(e))
```

**Apply same pattern to**:
- `handle_tr_check_saved_session()` (line 166)
- `handle_tr_logout()` (line 259)
- Any other handler that calls `bridge.*` methods

**Verification**:
- [ ] Concurrent requests don't block each other
- [ ] No "event loop is blocked" warnings
- [ ] Response times remain consistent under load

---

#### Task 2.2: Add Request Deduplication (H3)

**File**: `src/lib/ipc.ts`

**Add deduplication layer**:
```typescript
// Request deduplication to prevent concurrent identical requests
const pendingRequests = new Map<string, Promise<unknown>>();

async function deduplicatedCall<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // If identical request is in flight, return its promise
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = fn();
  pendingRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    pendingRequests.delete(key);
  }
}

// Update exported functions to use deduplication
export async function trGetAuthStatus(): Promise<AuthStatusResponse> {
  return deduplicatedCall('tr_get_auth_status', () =>
    callCommand('tr_get_auth_status', {})
  );
}

export async function trCheckSavedSession(): Promise<SessionCheck> {
  return deduplicatedCall('tr_check_saved_session', () =>
    callCommand('tr_check_saved_session', {})
  );
}

export async function getEngineHealth(): Promise<EngineHealth> {
  return deduplicatedCall('get_engine_health', () =>
    callCommand('get_engine_health', {})
  );
}

// For calls with parameters, include params in key
export async function syncPortfolio(portfolioId: number, runPipeline: boolean): Promise<SyncResult> {
  const key = `sync_portfolio:${portfolioId}:${runPipeline}`;
  return deduplicatedCall(key, () =>
    callCommand('sync_portfolio', { portfolioId, runPipeline })
  );
}
```

**Verification**:
- [ ] Rapid-fire identical requests return same promise
- [ ] Different requests execute independently
- [ ] No memory leaks (map clears after completion)

---

#### Task 2.3: Wait for Daemon Ready Signal (H4)

**File**: `src-tauri/python/portfolio_src/core/tr_bridge.py`

**Current Code** (line 63-88):
```python
self._daemon_process = subprocess.Popen(...)
self._is_running = True
time.sleep(0.5)  # ← ARBITRARY SLEEP
```

**Fixed Code**:
```python
def _ensure_daemon_running(self) -> None:
    """Ensure daemon subprocess is running, start if needed."""
    if (
        self._is_running
        and self._daemon_process
        and self._daemon_process.poll() is None
    ):
        return  # Already running

    # Clean up any dead process
    if self._daemon_process:
        try:
            self._daemon_process.terminate()
            self._daemon_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._daemon_process.kill()
        self._daemon_process = None

    # Start new daemon process
    try:
        cmd = self._get_daemon_command()
        self._daemon_process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=os.environ.copy(),
        )

        # Wait for ready signal instead of arbitrary sleep
        ready_line = self._daemon_process.stdout.readline()
        if not ready_line:
            raise RuntimeError("Daemon failed to start - no ready signal")
        
        try:
            ready_data = json.loads(ready_line.strip())
            if ready_data.get("status") != "ready":
                raise RuntimeError(f"Daemon not ready: {ready_data}")
            print(f"[TR Bridge] Daemon ready (PID: {ready_data.get('pid')})", file=sys.stderr)
        except json.JSONDecodeError:
            raise RuntimeError(f"Invalid ready signal: {ready_line}")

        self._is_running = True

        # Start stderr monitoring thread
        self._daemon_thread = threading.Thread(
            target=self._monitor_stderr, daemon=True
        )
        self._daemon_thread.start()

    except Exception as e:
        self._is_running = False
        raise RuntimeError(f"Failed to start TR daemon: {e}")
```

**Verification**:
- [ ] Daemon starts reliably on first command
- [ ] No race conditions on cold start
- [ ] Clear error if daemon fails to start

---

### Phase 3: Improve Robustness 🛡️
**Goal**: Graceful recovery from failures  
**Effort**: 2-3 hours  
**Risk**: Low

#### Task 3.1: Reset API State After Timeout (H2, M2)

**File**: `src-tauri/python/portfolio_src/core/tr_daemon.py`

**Current Code** (line 177-209):
```python
async def handle_fetch_portfolio(self) -> Dict[str, Any]:
    try:
        if not self.api:
            return {"status": "error", "message": "Not initialized"}
        from pytr.portfolio import Portfolio

        portfolio_obj = Portfolio(self.api)

        try:
            await asyncio.wait_for(portfolio_obj.portfolio_loop(), timeout=60.0)
        except asyncio.TimeoutError:
            return {
                "status": "error",
                "message": "Portfolio fetch timed out...",
            }
        # ...
```

**Fixed Code**:
```python
async def handle_fetch_portfolio(self) -> Dict[str, Any]:
    try:
        if not self.api:
            return {"status": "error", "message": "Not initialized"}
        from pytr.portfolio import Portfolio

        portfolio_obj = Portfolio(self.api)

        try:
            await asyncio.wait_for(portfolio_obj.portfolio_loop(), timeout=60.0)
        except asyncio.TimeoutError:
            # Reset API state to force fresh connection on retry
            print("[TR Daemon] Portfolio fetch timed out, resetting API state", file=sys.stderr)
            self.api = None
            self._cached_auth_status = "idle"
            return {
                "status": "error",
                "message": "Portfolio fetch timed out. Please try again.",
                "code": "TIMEOUT",
            }
        except Exception as e:
            error_msg = str(e).lower()
            # Reset on auth errors
            if any(x in error_msg for x in ["401", "unauthorized", "session", "expired"]):
                print(f"[TR Daemon] Auth error during fetch: {e}", file=sys.stderr)
                self.api = None
                self._cached_auth_status = "idle"
            return {"status": "error", "message": f"Portfolio fetch failed: {str(e)}"}

        positions = portfolio_obj.portfolio
        if not positions:
            return {
                "status": "error",
                "message": "No positions received. Try again in a few seconds.",
            }

        return {
            "status": "success",
            "data": {
                "positions": positions,
                "cash": getattr(portfolio_obj, "cash", []),
            },
        }
    except Exception as e:
        return {"status": "error", "message": f"Portfolio fetch failed: {str(e)}"}
```

**Verification**:
- [ ] After timeout, next login attempt works
- [ ] Auth errors trigger re-authentication flow
- [ ] No stale connections reused

---

#### Task 3.2: Add Timeout to Bridge readline (M3)

**File**: `src-tauri/python/portfolio_src/core/tr_bridge.py`

**Current Code** (line 196-199):
```python
response_line = self._daemon_process.stdout.readline()
if not response_line:
    raise RuntimeError("No response from daemon")
```

**Fixed Code**:
```python
import select

def _read_response_with_timeout(self, timeout: float = 30.0) -> str:
    """Read response from daemon with timeout."""
    if not self._daemon_process or not self._daemon_process.stdout:
        raise RuntimeError("Daemon process not available")
    
    # Use select for timeout on Unix
    import sys
    if sys.platform != 'win32':
        ready, _, _ = select.select([self._daemon_process.stdout], [], [], timeout)
        if not ready:
            raise RuntimeError(f"Daemon response timeout after {timeout}s")
    
    response_line = self._daemon_process.stdout.readline()
    if not response_line:
        raise RuntimeError("No response from daemon (EOF)")
    
    return response_line

def _send_command(self, method: str, **params) -> Dict[str, Any]:
    """Send command to daemon and get response."""
    with self._command_lock:
        self._ensure_daemon_running()

        if not self._daemon_process:
            raise RuntimeError("Daemon process not available")

        request_id = f"{method}_{int(time.time() * 1000)}"
        request = TRRequest(method=method, params=params, id=request_id)
        request_json = json.dumps(
            {"method": request.method, "params": request.params, "id": request.id}
        )

        try:
            assert self._daemon_process.stdin is not None
            self._daemon_process.stdin.write(request_json + "\n")
            self._daemon_process.stdin.flush()

            # Use timeout-aware read
            response_line = self._read_response_with_timeout(timeout=90.0)

            response_data = json.loads(response_line.strip())
            response = TRResponse(
                result=response_data.get("result"),
                error=response_data.get("error"),
                id=response_data.get("id"),
            )

            if response.error:
                raise RuntimeError(f"Daemon error: {response.error}")

            return response.result or {}

        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid daemon response: {e}")
        except Exception as e:
            self._is_running = False
            raise RuntimeError(f"Daemon communication failed: {e}")
```

**Verification**:
- [ ] Hung daemon doesn't block forever
- [ ] Timeout error is clear and actionable
- [ ] Normal operations unaffected

---

### Phase 4: Cleanup 🧹
**Goal**: Remove technical debt  
**Effort**: 30 minutes  
**Risk**: Very Low

#### Task 4.1: Remove Duplicate Definitions (L1)

**File**: `src-tauri/python/portfolio_src/core/tr_daemon.py`

**Remove lines 24-44** (duplicate enum and dataclasses):
```python
# DELETE - already defined in tr_protocol.py
class TRMethod(Enum):
    LOGIN = "login"
    # ...

@dataclass
class TRRequest:
    # ...

@dataclass  
class TRResponse:
    # ...
```

**Add import instead**:
```python
from portfolio_src.core.tr_protocol import TRMethod, TRRequest, TRResponse
```

---

#### Task 4.2: Standardize Data Directory (L2)

**File**: `src-tauri/python/portfolio_src/core/tr_auth.py`

**Current Code** (line 319):
```python
self.data_dir = Path(
    os.getenv("PRISM_DATA_DIR", "~/.prism/data")
).expanduser()
```

**Fixed Code**:
```python
import platform

def _get_default_data_dir() -> Path:
    """Get platform-appropriate data directory."""
    home = Path.home()
    if platform.system() == "Darwin":
        return home / "Library" / "Application Support" / "PortfolioPrism"
    elif platform.system() == "Windows":
        return home / "AppData" / "Roaming" / "PortfolioPrism"
    else:
        return home / ".local" / "share" / "PortfolioPrism"

# In _save_to_file and _load_from_file:
self.data_dir = Path(os.getenv("PRISM_DATA_DIR", str(_get_default_data_dir())))
```

---

#### Task 4.3: Remove Dead Code (L3, L4)

**File**: `src-tauri/python/portfolio_src/core/tr_auth.py`

**Remove lines 363-371**:
```python
# DELETE - unused
def run_async(coro):
    """Helper to run async code from sync context."""
    # ...
```

**File**: `src-tauri/python/prism_headless.py`

**Remove lines 54-56**:
```python
# DELETE - empty function
def setup_python_path():
    pass
```

**Also remove the call** at line 903:
```python
setup_python_path()  # DELETE
```

---

## Verification Checklist

### After Phase 1
- [ ] App mounts without `TOO_MANY_REQUESTS` error
- [ ] Only 2-3 API calls on mount (not 5-6)
- [ ] Login flow works on first attempt

### After Phase 2
- [ ] Concurrent requests don't block each other
- [ ] Rapid clicking doesn't cause duplicate requests
- [ ] Cold start is reliable (no race conditions)

### After Phase 3
- [ ] Timeout during sync shows clear error
- [ ] Retry after timeout works
- [ ] Auth errors redirect to login

### After Phase 4
- [ ] No duplicate code
- [ ] Consistent data directory
- [ ] Clean codebase

---

## Rollback Plan

Each phase is independent. If issues arise:

1. **Phase 1**: Revert `tr_daemon.py` changes, restore `TradeRepublicView.tsx` useEffect
2. **Phase 2**: Remove executor wrapper, remove deduplication map
3. **Phase 3**: Revert timeout changes (system will hang but not crash)
4. **Phase 4**: N/A (cleanup only)

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| API calls on mount | 5-6 | 2-3 |
| Rate limit errors | Frequent | None |
| Sync success rate | ~50% | >95% |
| Cold start reliability | ~80% | >99% |
| Concurrent request handling | Blocking | Non-blocking |

---

## References

- [PROJECT_ECHO_BUG_REPORT.md](./PROJECT_ECHO_BUG_REPORT.md) - Original bug report
- [pytr GitHub](https://github.com/pytr-org/pytr) - Upstream library
- `src-tauri/python/portfolio_src/core/tr_daemon.py` - Daemon implementation
- `src-tauri/python/portfolio_src/core/tr_bridge.py` - Bridge implementation
- `src-tauri/python/prism_headless.py` - FastAPI dispatcher
