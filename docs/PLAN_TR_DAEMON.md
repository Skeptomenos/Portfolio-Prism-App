# Implementation Plan: TR Daemon Architecture

> **Status:** Approved  
> **Created:** 2025-12-08  
> **Goal:** Isolate pytr in a long-running subprocess daemon

---

## Problem Statement

The `pytr` library creates asyncio primitives (`asyncio.Lock()`) at class definition time, which fails in Streamlit's ScriptRunner thread within a PyInstaller bundle:

```
RuntimeError: There is no current event loop in thread 'ScriptRunner.scriptThread'.
```

## Solution

Isolate `pytr` in a long-running subprocess daemon that:
1. Has its own asyncio event loop (no conflicts)
2. Maintains session state (avoid repeated 2FA)
3. Stores refresh token in keychain (session persistence)
4. Communicates via JSON-RPC over stdin/stdout
5. Is architecture-ready for React/Tauri migration

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                 Streamlit App (Current UI)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  tr_login.py                                               │  │
│  │  └─> TRBridge.login(phone, pin)                           │  │
│  │  └─> TRBridge.confirm_2fa(token)                          │  │
│  │  └─> TRBridge.fetch_portfolio()                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ JSON-RPC over stdin/stdout
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 tr_daemon.py (Subprocess)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Own asyncio event loop                                    │  │
│  │  ├─> import pytr (safe here!)                             │  │
│  │  ├─> Session state in memory                              │  │
│  │  ├─> Refresh token in keychain                            │  │
│  │  └─> Handles: login, confirm_2fa, fetch, export, shutdown │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create

### 1. `portfolio_src/core/tr_protocol.py`

**Purpose:** Message format definitions for daemon communication

**Contents:**
- `TRRequest` dataclass (method, params, id)
- `TRResponse` dataclass (result, error, id)
- `TRError` exception class
- Method constants: `LOGIN`, `CONFIRM_2FA`, `FETCH_PORTFOLIO`, `GET_STATUS`, `SHUTDOWN`

**Complexity:** Low (~50 lines)

---

### 2. `portfolio_src/core/tr_daemon.py`

**Purpose:** Long-running pytr worker process

**Responsibilities:**
- Import pytr safely (own process, own event loop)
- Listen for JSON-RPC commands on stdin
- Maintain pytr session in memory
- Store/retrieve refresh token from keychain
- Auto-refresh session when token expires
- Graceful shutdown on SIGTERM or "shutdown" command
- Error handling with structured responses

**Key Functions:**
```python
async def handle_login(phone: str, pin: str) -> dict
async def handle_confirm_2fa(token: str) -> dict
async def handle_fetch_portfolio() -> dict
async def handle_get_status() -> dict
def handle_shutdown() -> None
async def main_loop() -> None  # stdin listener
```

**Complexity:** Medium (~200 lines)

---

### 3. `portfolio_src/core/tr_bridge.py`

**Purpose:** Subprocess manager for Streamlit (and later Tauri)

**Responsibilities:**
- Spawn `tr_daemon.py` subprocess on first use
- Send commands via stdin, receive responses via stdout
- Handle daemon crashes (restart automatically)
- Timeout handling for hung operations
- Singleton pattern (one daemon per app instance)

**Key Class:**
```python
class TRBridge:
    _instance: Optional["TRBridge"] = None
    _daemon_process: Optional[subprocess.Popen] = None
    
    @classmethod
    def get_instance(cls) -> "TRBridge"
    
    def _ensure_daemon_running(self) -> None
    def _send_command(self, method: str, **params) -> dict
    
    # Public API
    def login(self, phone: str, pin: str) -> dict
    def confirm_2fa(self, token: str) -> dict
    def fetch_portfolio(self) -> dict
    def get_status(self) -> dict
    def shutdown(self) -> None
```

**Complexity:** Medium (~150 lines)

---

## Files to Modify

### 4. `portfolio_src/core/tr_auth.py`

**Changes:**
- Remove direct `from pytr.api import Api` import
- Remove `PYTR_AVAILABLE` check (bridge handles this)
- `TRAuthManager` now uses `TRBridge` internally
- Simplify to be a thin wrapper around bridge

**Before:**
```python
try:
    from pytr.api import Api as TRApi
    PYTR_AVAILABLE = True
except ImportError:
    PYTR_AVAILABLE = False
```

**After:**
```python
from portfolio_src.core.tr_bridge import TRBridge

class TRAuthManager:
    def __init__(self, data_dir: Path):
        self.bridge = TRBridge.get_instance()
        # ... rest uses self.bridge.login(), etc.
```

**Complexity:** Low (~30 lines changed)

---

### 5. `portfolio_src/dashboard/pages/tr_login.py`

**Changes:**
- Update to use new `TRAuthManager` API
- Handle async status updates from daemon
- Show daemon status (connected/disconnected)

**Complexity:** Low (~20 lines changed)

---

### 6. `portfolio_src/dashboard/__init__.py`

**Changes:**
- Remove early import of `tr_login` that triggers pytr import
- Use lazy loading for TR-related pages

**Complexity:** Low (~5 lines changed)

---

## Files Unchanged

- `prism.spec` - No changes needed (pytr already included)
- `requirements-build.txt` - No new dependencies
- `prism_boot.py` - No changes needed
- All other dashboard tabs - Unaffected

---

## Keychain Integration

**Service Name:** `PortfolioPrism-TR`

**Stored Data:**
```json
{
  "refresh_token": "...",
  "phone_hash": "...",
  "expires_at": 1234567890
}
```

**Flow:**
1. On daemon startup: Check keychain for valid refresh token
2. If found and not expired: Auto-restore session (no 2FA needed)
3. If expired or missing: Require full login flow
4. On successful login: Store new refresh token in keychain
5. On logout: Clear keychain entry

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Daemon not running | Bridge auto-spawns it |
| Daemon crashes | Bridge detects, restarts on next command |
| pytr import fails | Daemon returns structured error |
| 2FA timeout | Daemon returns timeout error, UI shows message |
| Network error | Daemon returns network error with details |
| Invalid credentials | Daemon returns auth error |

---

## Testing Strategy

### Unit Tests (can run without pytr)
- `test_tr_protocol.py` - Message serialization
- `test_tr_bridge.py` - Mock daemon, test bridge logic

### Integration Tests (require pytr)
- `test_tr_daemon.py` - Daemon in isolation
- Manual: Full login flow in app

---

## Execution Order

| Step | Task | Files | Est. Time |
|------|------|-------|-----------|
| 1 | Create protocol definitions | `tr_protocol.py` | 10 min |
| 2 | Create daemon | `tr_daemon.py` | 45 min |
| 3 | Create bridge | `tr_bridge.py` | 30 min |
| 4 | Update auth manager | `tr_auth.py` | 15 min |
| 5 | Update login page | `tr_login.py` | 15 min |
| 6 | Fix lazy imports | `dashboard/__init__.py` | 5 min |
| 7 | Test in dev mode | Manual testing | 15 min |
| 8 | Rebuild binary | PyInstaller | 5 min |
| 9 | Test in bundle | Manual testing | 10 min |

**Total Estimated Time:** ~2.5 hours

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Daemon doesn't start in bundle | Medium | High | Test early, add detailed logging |
| Keychain access fails in bundle | Low | Medium | Fallback to file-based storage |
| pytr API changes | Low | Medium | Daemon isolates changes to one file |
| Stdin/stdout buffering issues | Low | Medium | Use line-buffered I/O, flush explicitly |

---

## Future Compatibility (React/Tauri)

When migrating to React, only `tr_bridge.py` logic moves to Rust:

```rust
// src-tauri/src/tr_commands.rs
#[tauri::command]
async fn tr_login(phone: String, pin: String) -> Result<Value, String> {
    // Same logic as Python bridge, spawn tr_daemon.py
}
```

`tr_daemon.py` and `tr_protocol.py` remain **unchanged**.

---

## Summary

| Component | Action | Lines (est.) |
|-----------|--------|--------------|
| `tr_protocol.py` | Create | ~50 |
| `tr_daemon.py` | Create | ~200 |
| `tr_bridge.py` | Create | ~150 |
| `tr_auth.py` | Modify | ~30 changed |
| `tr_login.py` | Modify | ~20 changed |
| `dashboard/__init__.py` | Modify | ~5 changed |

---

## Approval

- [x] Architecture reviewed
- [x] stdin/stdout communication confirmed
- [x] Keychain storage for refresh token confirmed
- [x] Ready for implementation
