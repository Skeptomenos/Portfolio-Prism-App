# Operation Silent Night: Print Cleanup

**Status:** Ready  
**Effort:** ~1-2 hours  
**Risk:** Low  
**Total prints:** 90 across 15 files

## Goal

Replace `print()` statements with `logger` calls for better observability.

## Why This Is Safe

- Logger writes to `sys.stderr` (same destination as most existing prints)
- Only `tr_daemon.py` and `stdin_loop.py` have IPC sensitivity
- Existing tests catch IPC corruption

---

## Pre-Implementation Checklist

- [ ] Activate venv: `source src-tauri/python/venv-build/bin/activate`
- [ ] Verify tests pass: `pytest tests/test_tr_daemon_subprocess.py -v` (13/13)

---

## Step 1: IPC-Sensitive Files

These files communicate via stdout. Handle with care.

### 1A. tr_daemon.py (7 prints, 4 to replace)

**Replace these (stderr → logger):**

| Line | Current | Replacement |
|------|---------|-------------|
| 105 | `print("[TR Daemon] Session resumed from cookies", file=sys.stderr)` | `logger.info("Session resumed from cookies")` |
| 121 | `print("[TR Daemon] Initiating web login...", file=sys.stderr)` | `logger.info("Initiating web login")` |
| 178-180 | `print("[TR Daemon] Portfolio fetch timed out...", file=sys.stderr)` | `logger.warning("Portfolio fetch timed out, resetting API state")` |
| 195 | `print(f"[TR Daemon] Auth error during fetch: {e}", file=sys.stderr)` | `logger.error(f"Auth error during fetch: {e}")` |

**DO NOT TOUCH (IPC protocol):**
- Lines 261-265: Ready signal
- Line 279: Response output  
- Lines 281-285: Error response

**Add import after line 18** (after `=== END PATH SETUP ===`, before other imports):
```python
from portfolio_src.prism_utils.logging_config import get_logger
logger = get_logger(__name__)
```

**Verify:** `pytest tests/test_tr_daemon_subprocess.py -v`

### 1B. stdin_loop.py (4 prints, keep as-is)

| Line | Purpose | Action |
|------|---------|--------|
| 52 | Ready signal JSON | **DO NOT TOUCH** |
| 79 | Error response | **DO NOT TOUCH** |
| 96 | Response JSON | **DO NOT TOUCH** |
| 104 | Error response | **DO NOT TOUCH** |

These are IPC protocol messages. Leave them.

---

## Step 2: Core Modules (No IPC Risk)

### tr_bridge.py (10 prints)

| Lines | Action |
|-------|--------|
| 86, 140-141, 142, 147, 154, 159, 165, 183, 232 | Replace with `logger.debug()` or `logger.info()` |

All use `file=sys.stderr`. Add logger import at top.

### validation.py (17 prints)

| Lines | Action |
|-------|--------|
| 18, 30-33, 36, 40-41, 44, 58-59, 62, 64, 69, 71, 83, 108 | Replace with `logger.info()` for status, `logger.warning()` for failures |

### position_keeper.py (4 prints)

| Lines | Action |
|-------|--------|
| 68-69, 78-79 | Replace with `logger.info()` or `logger.warning()` |

---

## Step 3: Data Layer (No IPC Risk)

### hive_client.py (11 prints) — Logger already exists

| Lines | Action |
|-------|--------|
| 170, 205, 219, 395, 428, 447, 450, 453, 907, 912, 916 | Replace with `logger.error()` or `logger.info()` |

No import needed — logger already initialized at line 23.

---

## Step 4: Adapters (No IPC Risk)

All adapters have prints in `if __name__ == "__main__":` blocks (standalone testing). Low priority but clean up for consistency.

### ishares.py (5 prints)

| Lines | Action |
|-------|--------|
| 83-84, 87, 90, 100 | Replace with `logger.warning()` for missing product ID prompts |

### vanguard.py (4 prints)

| Lines | Action |
|-------|--------|
| 554-556, 558 | Replace with `logger.info()` |

### amundi.py (4 prints)

| Lines | Action |
|-------|--------|
| 215, 222-223, 225 | Replace with `logger.info()` or `logger.error()` |

### xtrackers.py (3 prints)

| Lines | Action |
|-------|--------|
| 125-126, 132 | Replace with `logger.info()` |

### vaneck.py (6 prints)

| Lines | Action |
|-------|--------|
| 90-93, 98, 102 | Replace with `logger.info()` |

---

## Step 5: Other Files

### pdf_parser/parser.py (11 prints)

| Lines | Action |
|-------|--------|
| 306, 309, 314, 333, 336, 367, 372, 379, 417, 425, 429 | Replace with `logger.info()` for progress, `logger.warning()` for issues |

### headless/transports/echo_bridge.py (2 prints)

| Lines | Action |
|-------|--------|
| 274-275 | Replace with `logger.error()` |

### headless/handlers/sync.py (1 print)

| Line | Action |
|------|--------|
| 262 | Replace with `logger.debug()` |

### prism_utils/metrics.py (1 print)

| Line | Action |
|------|--------|
| 81 | Replace with `logger.error()` |

---

## Logger Usage Reference

```python
from portfolio_src.prism_utils.logging_config import get_logger
logger = get_logger(__name__)

logger.debug("Verbose details")      # Development/debugging
logger.info("Normal operation")      # Status updates  
logger.warning("Something odd")      # Recoverable issues
logger.error("Something failed")     # Errors
logger.exception("With traceback")   # Errors + automatic stack trace
```

---

## Verification

**Critical gate (must pass):**
```bash
pytest tests/test_tr_daemon_subprocess.py -v
```

All 13 tests must pass. This confirms IPC integrity.

---

## Post-Implementation Checklist

- [ ] All 13 subprocess tests pass
- [ ] No `print(` in modified files (except IPC protocol lines)
- [ ] Update CHANGELOG.md
- [ ] Commit: `fix(python): replace print() with logger calls`

---

## Out of Scope (Deferred)

### Exception Hardening

The codebase has ~166 broad `except Exception:` blocks. Adding `logger.exception()` to these is a separate task.

**Create separate plan when ready:** `keystone/plans/exception_hardening.md`

---

## Summary

| Category | Files | Prints |
|----------|-------|--------|
| IPC-sensitive | 2 | 11 (4 to replace, 7 untouchable) |
| Core modules | 3 | 31 |
| Data layer | 1 | 11 |
| Adapters | 5 | 22 |
| Other | 4 | 15 |
| **Total** | **15** | **90** |
