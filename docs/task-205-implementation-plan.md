# TASK-205: Async Auth State Machine Implementation Plan

> **Status:** Ready for Implementation
> **Branch:** `feat/tr-auth-state-machine`
> **Dependencies:** TASK-203 (Done)
> **Last Updated:** 2024-12-15

---

## Overview

Implement the Trade Republic authentication flow in Python, integrated with the existing IPC bridge. This enables the app to fetch real portfolio data from Trade Republic.

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| Credential handling | Keep both modes (keychain + file for dev) |
| Session restore | Show "Restore session?" prompt |
| Error handling | Very specific with error codes initially |
| Sync scope | Check auth first, prompt if needed |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REACT UI                                        │
│  ┌─────────────────────┐   ┌─────────────────────┐   ┌──────────────────┐   │
│  │ Auth Modal          │   │ SystemStatus        │   │ Dashboard        │   │
│  │ - Phone/PIN input   │   │ - Shows auth state  │   │ - Shows data     │   │
│  │ - 2FA code input    │   │                     │   │                  │   │
│  └─────────────────────┘   └─────────────────────┘   └──────────────────┘   │
│           │                          ▲                        ▲              │
│     invoke()                    listen()                 invoke()           │
└───────────┼──────────────────────────┼────────────────────────┼─────────────┘
            │                          │                        │
            ▼                          │                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RUST SHELL                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  commands.rs: tr_login, tr_submit_2fa, tr_logout, sync_portfolio   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                          stdin/stdout IPC                                    │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PYTHON (prism_headless)                            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌────────────────────────┐   │
│  │ TRAuthManager   │◄───│ handle_tr_*()   │───►│ TRBridge (subprocess)  │   │
│  │ (state machine) │    │ in headless.py  │    │ ↓                      │   │
│  └─────────────────┘    └─────────────────┘    │ tr_daemon.py           │   │
│                                │               │ ↓                      │   │
│                                ▼               │ pytr → Trade Republic  │   │
│  ┌─────────────────────────────────────────┐   └────────────────────────┘   │
│  │ SQLite: positions, assets               │                                │
│  └─────────────────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Existing Components (Already Built)

### 1. `tr_auth.py` - TRAuthManager
- `AuthState` enum: IDLE, REQUESTING, WAITING_FOR_2FA, VERIFYING, AUTHENTICATED, ERROR
- `request_2fa()`, `verify_2fa()`, `try_restore_session()` async methods
- Credential storage via keychain or file

### 2. `tr_bridge.py` - TRBridge Singleton
- Spawns `tr_daemon` subprocess
- Communicates via JSON-RPC stdin/stdout
- Methods: `login()`, `confirm_2fa()`, `fetch_portfolio()`, `get_status()`

### 3. `tr_daemon.py` - Standalone Daemon
- Uses `pytr` library to talk to Trade Republic API
- Handles the actual 2FA flow
- Stores session cookies in `~/Library/Application Support/PortfolioPrism/tr_cookies.txt`

### 4. `tr_sync.py` - TRDataFetcher
- Fetches portfolio positions via bridge
- Converts TR format to our format

---

## What's Missing (TASK-205 Scope)

1. **Integration into `prism_headless.py`** - Wire up auth commands
2. **IPC Commands for Auth** - tr_login, tr_submit_2fa, tr_logout, tr_get_auth_status
3. **SQLite Write Functions** - Write positions/assets to database
4. **`sync_portfolio` implementation** - Use auth to fetch real data, write to SQLite
5. **Rust Commands** - Expose auth commands to frontend
6. **TypeScript Types** - Auth-related type definitions

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prism_headless.py` | Modify | Add auth command handlers |
| `portfolio_src/models/contracts.py` | Modify | Add auth response types |
| `portfolio_src/data/database.py` | Modify | Add position/asset write functions |
| `src-tauri/src/commands.rs` | Modify | Add TR auth commands |
| `src-tauri/src/lib.rs` | Modify | Register new commands |
| `src/types/index.ts` | Modify | Add auth types |
| `src/lib/ipc.ts` | Modify | Add auth IPC functions |

---

## Command Specifications

### `tr_get_auth_status`

**Purpose:** Check current authentication state

```json
// Request
{"id": 1, "command": "tr_get_auth_status", "payload": {}}

// Response
{
  "id": 1,
  "status": "success",
  "data": {
    "authState": "idle|waiting_2fa|authenticated|error",
    "hasStoredCredentials": true,
    "lastError": null
  }
}
```

### `tr_check_saved_session`

**Purpose:** Check if a saved session can be restored (for "Restore session?" prompt)

```json
// Request
{"id": 2, "command": "tr_check_saved_session", "payload": {}}

// Response (session found)
{
  "id": 2,
  "status": "success",
  "data": {
    "hasSession": true,
    "phoneNumber": "+49***1234",
    "prompt": "restore_session"
  }
}

// Response (no session)
{
  "id": 2,
  "status": "success",
  "data": {
    "hasSession": false,
    "prompt": "login_required"
  }
}
```

### `tr_login`

**Purpose:** Start login with phone/PIN, may return 2FA prompt or authenticated

```json
// Request
{"id": 3, "command": "tr_login", "payload": {"phone": "+491234567890", "pin": "1234"}}

// Response (2FA needed)
{
  "id": 3,
  "status": "success",
  "data": {
    "authState": "waiting_2fa",
    "message": "Enter the 4-digit code from your Trade Republic app",
    "countdown": 30
  }
}

// Response (session restored - no 2FA needed)
{
  "id": 3,
  "status": "success",
  "data": {
    "authState": "authenticated",
    "message": "Session restored from saved cookies"
  }
}

// Response (error)
{
  "id": 3,
  "status": "error",
  "error": {
    "code": "TR_INVALID_CREDENTIALS",
    "message": "Invalid phone number or PIN format"
  }
}
```

### `tr_submit_2fa`

**Purpose:** Submit 2FA code from Trade Republic app

```json
// Request
{"id": 4, "command": "tr_submit_2fa", "payload": {"code": "1234"}}

// Response (success)
{
  "id": 4,
  "status": "success",
  "data": {
    "authState": "authenticated",
    "message": "Successfully authenticated with Trade Republic"
  }
}

// Response (error)
{
  "id": 4,
  "status": "error",
  "error": {
    "code": "TR_2FA_INVALID",
    "message": "Invalid 2FA code. Please try again."
  }
}
```

### `tr_logout`

**Purpose:** Clear session and credentials

```json
// Request
{"id": 5, "command": "tr_logout", "payload": {}}

// Response
{
  "id": 5,
  "status": "success",
  "data": {
    "authState": "idle",
    "message": "Logged out and session cleared"
  }
}
```

### `sync_portfolio` (Updated)

**Purpose:** Fetch portfolio from TR and sync to SQLite

```json
// Request
{"id": 6, "command": "sync_portfolio", "payload": {"portfolioId": 1, "force": false}}

// Response (success)
{
  "id": 6,
  "status": "success",
  "data": {
    "syncedPositions": 15,
    "newPositions": 3,
    "updatedPositions": 12,
    "totalValue": 12459.50,
    "durationMs": 2340
  }
}

// Response (auth required)
{
  "id": 6,
  "status": "error",
  "error": {
    "code": "TR_AUTH_REQUIRED",
    "message": "Please authenticate with Trade Republic first"
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `TR_AUTH_REQUIRED` | Must authenticate before syncing |
| `TR_INVALID_CREDENTIALS` | Phone/PIN format invalid |
| `TR_LOGIN_FAILED` | TR API rejected login |
| `TR_2FA_REQUIRED` | Waiting for 2FA code |
| `TR_2FA_INVALID` | Wrong 2FA code |
| `TR_2FA_EXPIRED` | 2FA code expired (30s timeout) |
| `TR_RATE_LIMITED` | Too many attempts, wait before retrying |
| `TR_SESSION_EXPIRED` | Session cookie no longer valid |
| `TR_NETWORK_ERROR` | Cannot reach Trade Republic servers |
| `TR_DAEMON_ERROR` | Internal daemon process error |
| `TR_SYNC_FAILED` | Portfolio fetch succeeded but DB write failed |

---

## Implementation Steps

### Step 1: Add SQLite Write Functions

**File:** `portfolio_src/data/database.py`

Add functions:
- `upsert_asset()` - Insert or update asset in universe
- `upsert_position()` - Insert or update position
- `sync_positions_from_tr()` - Bulk sync from TR data

### Step 2: Add Auth Command Handlers

**File:** `prism_headless.py`

Add handlers:
- `handle_tr_get_auth_status()`
- `handle_tr_check_saved_session()`
- `handle_tr_login()`
- `handle_tr_submit_2fa()`
- `handle_tr_logout()`
- Update `handle_sync_portfolio()` to use real data

### Step 3: Add Rust Commands

**File:** `src-tauri/src/commands.rs`

Add commands:
- `tr_get_auth_status`
- `tr_check_saved_session`
- `tr_login`
- `tr_submit_2fa`
- `tr_logout`

Update `sync_portfolio` to emit real progress events.

### Step 4: Add TypeScript Types

**File:** `src/types/index.ts`

Add types:
- `AuthState`
- `AuthStatus`
- `SessionCheck`
- `AuthResponse`
- `TRErrorCode`

### Step 5: Add IPC Functions

**File:** `src/lib/ipc.ts`

Add functions:
- `trGetAuthStatus()`
- `trCheckSavedSession()`
- `trLogin()`
- `trSubmit2FA()`
- `trLogout()`

### Step 6: Build and Test

1. Rebuild Python binary with PyInstaller
2. Run Tauri dev mode
3. Test auth flow manually via browser console

---

## Testing Strategy

### Phase 1: Python Unit Tests

```bash
# Test auth manager initialization
python -c "from portfolio_src.core.tr_auth import TRAuthManager; m = TRAuthManager(); print(m.state)"

# Test IPC handler (without real TR credentials)
echo '{"id":1,"command":"tr_get_auth_status"}' | python prism_headless.py
```

### Phase 2: Manual IPC Tests

```bash
# Test command dispatch
echo '{"id":1,"command":"tr_get_auth_status"}' | python prism_headless.py
echo '{"id":2,"command":"tr_check_saved_session"}' | python prism_headless.py
```

### Phase 3: Tauri Integration

```javascript
// In browser console after npm run tauri dev
await window.__TAURI__.invoke('tr_get_auth_status')
await window.__TAURI__.invoke('tr_check_saved_session')
```

### Phase 4: Full E2E (with real TR account)

1. Start app fresh (no saved session)
2. Check session → should prompt login
3. Enter phone/PIN → should show 2FA prompt
4. Enter 2FA code from TR app → should authenticate
5. Click Sync → should fetch real positions
6. Check dashboard → should show real data
7. Restart app → should offer session restore
8. Logout → should clear session

---

## What to Watch Out For

### 1. Security Concerns

| Risk | Mitigation |
|------|------------|
| PIN/Credentials in logs | Never log credentials; use `***` masking |
| Credentials in IPC | Only phone number goes through IPC; PIN stored securely |
| Session tokens exposed | Tokens stay in Python; Rust only sees auth state |
| Credentials in memory | Clear from memory after use |

### 2. pytr Library Quirks

- **Typo:** `inititate_weblogin` vs `initiate_weblogin` (handled in tr_daemon.py)
- **asyncio.Lock at import:** Requires process isolation (we have tr_daemon)
- **Session cookies:** Stored in `~/Library/Application Support/PortfolioPrism/tr_cookies.txt`

### 3. State Machine Transitions

```
IDLE → REQUESTING → WAITING_FOR_2FA → VERIFYING → AUTHENTICATED
                          ↓                            ↓
                       timeout                     fetch data
                          ↓                            ↓
                        ERROR                     sync to SQLite
```

### 4. Subprocess Management

- `tr_daemon` is a separate process spawned by `TRBridge`
- Need to handle daemon death/restart gracefully
- `TRBridge._ensure_daemon_running()` handles restart

### 5. Timeout During 2FA

- 2FA code has ~30 second validity
- User must enter code quickly
- Return countdown in response for UI timer

---

## Open Questions (To Confirm During Implementation)

### 1. Phone Number Masking
For "Restore session?" prompt, mask as: `+49***1234` (last 4 digits)

### 2. Session Restore UX
Check for saved session on app startup AND before sync if needed.

### 3. Credential Storage
Current behavior: Always save (for convenience in dev). May add "Remember me?" later.

### 4. Sync Progress Events
Emit granular progress events:
- 0%: Starting sync...
- 10%: Authenticating...
- 30%: Fetching portfolio...
- 50%: Processing positions...
- 70%: Writing to database...
- 90%: Updating analytics...
- 100%: Complete!

---

## Estimated Effort

| Step | Description | Estimate |
|------|-------------|----------|
| 1 | Add SQLite write functions | 0.5 session |
| 2 | Add auth handlers to prism_headless.py | 1 session |
| 3 | Add sync_portfolio implementation | 0.5 session |
| 4 | Add Rust commands | 0.5 session |
| 5 | Add TypeScript types and IPC | 0.5 session |
| 6 | Build and test Python binary | 0.5 session |
| 7 | Integration testing | 1 session |
| **Total** | | **~4.5 sessions** |

---

## Rollback Plan

If issues arise:
1. Auth commands can be disabled in dispatch (return "not implemented")
2. `sync_portfolio` can fall back to mock data
3. No changes to existing working code paths

---

## Success Criteria

- [ ] `tr_get_auth_status` returns current state
- [ ] `tr_check_saved_session` detects existing cookies
- [ ] `tr_login` triggers 2FA flow
- [ ] `tr_submit_2fa` completes authentication
- [ ] `tr_logout` clears session
- [ ] `sync_portfolio` fetches real data when authenticated
- [ ] Positions written to SQLite
- [ ] Dashboard shows real data after sync
- [ ] Session restore works after app restart
