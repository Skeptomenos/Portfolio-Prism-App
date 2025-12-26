# Prism Headless Refactor Plan

> **Session ID:** PrismRefactor
> **Created:** 2025-12-23
> **Owner:** Sisyphus
> **Status:** Ready for Implementation

---

## 1. Executive Summary

Refactor `prism_headless.py` (1,072 lines) from a monolithic "God Object" into a modular, testable architecture within `portfolio_src/headless/`. This improves maintainability, enables unit testing per handler, and prepares the engine for future growth.

### Key Outcomes
- **Before:** Single 1,072-line file with 18 handlers, 2 transports, lifecycle management
- **After:** ~60-line entry point + 12 focused modules with unit tests

### Critical Constraints
1. **100% IPC Compatibility** — Response JSON structure must not change
2. **PyInstaller Build** — Must update spec file to include new package
3. **Dual Transport Support** — Both Stdin and Echo-Bridge (HTTP) must work
4. **Echo-Bridge is Strategic** — Core component of user→dev feedback loop

---

## 2. Target Architecture

```
src-tauri/python/
├── prism_headless.py              # THIN: ~60 lines, entry point only
│
├── portfolio_src/
│   ├── headless/                  # NEW: Refactored engine core
│   │   ├── __init__.py
│   │   ├── dispatcher.py          # Command routing + dispatch
│   │   ├── responses.py           # success_response(), error_response()
│   │   ├── state.py               # Singletons: auth_manager, bridge, executor
│   │   ├── lifecycle.py           # dead_mans_switch, install_config, session
│   │   │
│   │   ├── handlers/              # Business logic by domain
│   │   │   ├── __init__.py        # Handler registry export
│   │   │   ├── health.py          # get_health
│   │   │   ├── dashboard.py       # get_dashboard_data, get_positions
│   │   │   ├── tr_auth.py         # tr_login, tr_logout, tr_*
│   │   │   ├── sync.py            # sync_portfolio, run_pipeline
│   │   │   ├── holdings.py        # upload_holdings, get_true_holdings, overlap
│   │   │   └── telemetry.py       # log_event, get_recent_reports, get_pending
│   │   │
│   │   └── transports/            # IPC layer
│   │       ├── __init__.py
│   │       ├── stdin_loop.py      # Production: Stdin/Stdout
│   │       └── echo_bridge.py     # Feedback Loop: FastAPI HTTP
│   │
│   └── ... (existing packages unchanged)
│
├── tests/
│   ├── test_headless_integration.py  # EXISTING: E2E validation
│   │
│   └── headless/                     # NEW: Unit tests per handler
│       ├── __init__.py
│       ├── test_dispatcher.py
│       ├── test_handlers_health.py
│       ├── test_handlers_dashboard.py
│       ├── test_handlers_tr_auth.py
│       ├── test_handlers_sync.py
│       ├── test_handlers_holdings.py
│       └── test_handlers_telemetry.py
```

---

## 3. Implementation Phases

### Phase 1: Foundation (No Risk)
**Goal:** Create infrastructure modules without touching existing code.

| ID | Task | File | Est. Lines |
|----|------|------|------------|
| P1-01 | Create package init | `headless/__init__.py` | 5 |
| P1-02 | Create response helpers | `headless/responses.py` | 30 |
| P1-03 | Extract state singletons | `headless/state.py` | 50 |
| P1-04 | Extract lifecycle functions | `headless/lifecycle.py` | 80 |

**Deliverable:** Foundation modules exist, original file unchanged.

---

### Phase 2: Handler Extraction (Low-Medium Risk)
**Goal:** Move handler functions to domain modules with unit tests.

| ID | Task | File | Test File | Est. Lines |
|----|------|------|-----------|------------|
| P2-01 | Create handlers package | `handlers/__init__.py` | — | 30 |
| P2-02 | Extract health handler | `handlers/health.py` | `test_handlers_health.py` | 50 |
| P2-03 | Extract dashboard handlers | `handlers/dashboard.py` | `test_handlers_dashboard.py` | 200 |
| P2-04 | Extract TR auth handlers | `handlers/tr_auth.py` | `test_handlers_tr_auth.py` | 180 |
| P2-05 | Extract sync handlers | `handlers/sync.py` | `test_handlers_sync.py` | 130 |
| P2-06 | Extract holdings handlers | `handlers/holdings.py` | `test_handlers_holdings.py` | 160 |
| P2-07 | Extract telemetry handlers | `handlers/telemetry.py` | `test_handlers_telemetry.py` | 60 |

**Deliverable:** All handlers extracted with unit tests, original file still works.

---

### Phase 3: Dispatcher (Medium Risk)
**Goal:** Central routing with handler registry.

| ID | Task | File | Test File | Est. Lines |
|----|------|------|-----------|------------|
| P3-01 | Create dispatcher | `headless/dispatcher.py` | `test_dispatcher.py` | 80 |

**Deliverable:** Dispatcher routes commands to handlers, tested.

---

### Phase 4: Transports (Medium Risk)
**Goal:** Extract IPC loops, both sharing same dispatcher.

| ID | Task | File | Est. Lines |
|----|------|------|------------|
| P4-01 | Create transports package | `transports/__init__.py` | 5 |
| P4-02 | Extract stdin loop | `transports/stdin_loop.py` | 80 |
| P4-03 | Extract Echo-Bridge | `transports/echo_bridge.py` | 100 |

**Deliverable:** Both transports work, share dispatcher.

---

### Phase 5: Integration (High Risk, Well-Prepared)
**Goal:** Rewrite entry point, update build config.

| ID | Task | Description |
|----|------|-------------|
| P5-01 | Rewrite entry point | `prism_headless.py` → ~60 lines |
| P5-02 | Update PyInstaller spec | Add `headless/` to datas/hiddenimports |
| P5-03 | Run integration tests | Verify IPC contract preserved |

**Deliverable:** Thin entry point, build works.

---

### Phase 6: Verification (Critical)
**Goal:** Full validation before merge.

| ID | Task | Command |
|----|------|---------|
| P6-01 | Run all unit tests | `pytest tests/headless/` |
| P6-02 | Run integration tests | `pytest tests/test_headless_integration.py` |
| P6-03 | Build PyInstaller binary | `pyinstaller prism_headless.spec` |
| P6-04 | Test Stdin mode | `npm run tauri dev` |
| P6-05 | Test Echo-Bridge mode | `python prism_headless.py --http` |

**Deliverable:** All tests pass, both modes work.

---

## 4. Code Standards Applied

From `keystone/standards/python.md` and `keystone/specs/observability.md`:

| Rule | Application |
|------|-------------|
| Absolute imports only | `from portfolio_src.headless.handlers import ...` |
| Type hints on all functions | `async def handle_login(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:` |
| Logger via `get_logger(__name__)` | Each module gets its own logger |
| Zero `print()` except IPC | Only `emit_progress()` uses stdout |
| Contextual logging | `logger.info(f"Syncing portfolio {portfolio_id}...")` |
| Error handling with traceback | `logger.error(f"Failed: {e}", exc_info=True)` |
| Summary over spam | Log counts, not individual items |

---

## 5. Test Strategy

### Unit Tests Per Handler
Each handler module gets a corresponding test file with:
- Input validation tests (missing/invalid params)
- Success path tests (mocked dependencies)
- Error path tests (exception handling)
- Response structure validation (IPC contract)

### Example Test Pattern
```python
@pytest.mark.asyncio
async def test_missing_phone_returns_error(self):
    """Should return TR_INVALID_CREDENTIALS when phone is missing."""
    result = await handle_tr_login(cmd_id=1, payload={"pin": "1234"})
    
    assert result["status"] == "error"
    assert result["error"]["code"] == "TR_INVALID_CREDENTIALS"
    assert result["id"] == 1
```

### Integration Tests
Existing `test_headless_integration.py` validates E2E flow — must pass after refactor.

---

## 6. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| IPC Contract Break | Keep exact JSON structure; test with integration tests |
| PyInstaller Bundle | Add `headless/` to spec's `datas` and `hiddenimports` |
| Import Cycles | Use dependency injection; state passed to handlers |
| Async/Sync Mismatch | Dispatcher detects with `asyncio.iscoroutinefunction()` |
| Echo-Bridge Regression | Dedicated manual test in Phase 6 |

---

## 7. Effort Estimate

| Phase | Time | Risk Level |
|-------|------|------------|
| Phase 1 (Foundation) | 1-2 hours | Very Low |
| Phase 2 (Handlers + Tests) | 4-5 hours | Low-Medium |
| Phase 3 (Dispatcher) | 1 hour | Low |
| Phase 4 (Transports) | 2 hours | Medium |
| Phase 5 (Integration) | 1-2 hours | High |
| Phase 6 (Verification) | 1 hour | Critical |
| **Total** | **10-13 hours** | |

---

## 8. Success Criteria

- [ ] `prism_headless.py` reduced to <100 lines
- [ ] All 18 handlers extracted to domain modules
- [ ] Unit test coverage for each handler module
- [ ] `pytest tests/` passes (all tests)
- [ ] `pyinstaller prism_headless.spec` builds successfully
- [ ] Stdin mode works (`npm run tauri dev`)
- [ ] Echo-Bridge mode works (`--http` flag)
- [ ] IPC response structure unchanged (verified by integration tests)

---

## 9. Files to Create

| File | Purpose |
|------|---------|
| `portfolio_src/headless/__init__.py` | Package init |
| `portfolio_src/headless/responses.py` | Response helpers |
| `portfolio_src/headless/state.py` | Singleton managers |
| `portfolio_src/headless/lifecycle.py` | Startup/shutdown |
| `portfolio_src/headless/dispatcher.py` | Command routing |
| `portfolio_src/headless/handlers/__init__.py` | Handler registry |
| `portfolio_src/headless/handlers/health.py` | Health handler |
| `portfolio_src/headless/handlers/dashboard.py` | Dashboard handlers |
| `portfolio_src/headless/handlers/tr_auth.py` | TR auth handlers |
| `portfolio_src/headless/handlers/sync.py` | Sync handlers |
| `portfolio_src/headless/handlers/holdings.py` | Holdings handlers |
| `portfolio_src/headless/handlers/telemetry.py` | Telemetry handlers |
| `portfolio_src/headless/transports/__init__.py` | Transport init |
| `portfolio_src/headless/transports/stdin_loop.py` | Stdin transport |
| `portfolio_src/headless/transports/echo_bridge.py` | HTTP transport |
| `tests/headless/__init__.py` | Test package |
| `tests/headless/test_dispatcher.py` | Dispatcher tests |
| `tests/headless/test_handlers_*.py` | Handler tests (6 files) |

**Total: 22 new files**

---

## 10. Rollback Strategy

Git history is sufficient. If refactor fails:
1. `git checkout HEAD -- src-tauri/python/prism_headless.py`
2. `git clean -fd src-tauri/python/portfolio_src/headless/`
3. `git clean -fd src-tauri/python/tests/headless/`
