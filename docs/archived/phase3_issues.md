# Phase 3 Issues Assessment

> **Date:** 2024-12-06
> **Status:** Phase 3 ~85% Complete — Critical issues require fixing before testing

---

## Summary

Phase 3 (Logic Transplant) has been substantially completed by another AI agent. The POC code has been copied, configuration updated, and binary rebuilt. However, there are **2 critical issues** and **3 medium issues** that need resolution before the dashboard will function correctly.

---

## Critical Issues 🔴

### Issue 1: Dashboard Import Path Wrong

**File:** `tauri-app/src-tauri/python/portfolio_src/dashboard/app.py`
**Line:** 9

**Current Code:**
```python
from src.dashboard.tabs import (
    pipeline_health,
    holdings_analysis,
    data_manager,
    portfolio_xray,
    performance,
    etf_overlap,
    missing_data,
)
```

**Problem:** 
The import uses `src.dashboard.tabs` which was the path in the POC structure. In the Tauri app, the code lives in `portfolio_src/dashboard/tabs`. The `prism_boot.py` adds `portfolio_src` to `sys.path`, so the import should be relative to that.

**Expected Fix:**
```python
from dashboard.tabs import (
    pipeline_health,
    holdings_analysis,
    data_manager,
    portfolio_xray,
    performance,
    etf_overlap,
    missing_data,
)
```

**Impact:** App will crash with `ModuleNotFoundError: No module named 'src'` when loading the dashboard.

**Severity:** 🔴 CRITICAL — App will not start

---

### Issue 2: Tauri Not Passing PRISM_DATA_DIR

**File:** `tauri-app/src-tauri/src/lib.rs`
**Lines:** 19-22

**Current Code:**
```rust
let (mut rx, _child) = app_handle.shell().sidecar("prism")
    .expect("Failed to create sidecar command")
    .spawn()
    .expect("Failed to spawn prism sidecar");
```

**Problem:**
The Rust code spawns the Python sidecar but does not pass the `PRISM_DATA_DIR` environment variable. The Python boot script (`prism_boot.py:69`) falls back to `~/.prism/data`:

```python
data_dir = os.environ.get("PRISM_DATA_DIR", os.path.expanduser("~/.prism/data"))
```

**Expected Fix:**
```rust
use tauri::Manager;

let data_dir = app.path().app_data_dir()
    .expect("Failed to get app data directory");

let (mut rx, _child) = app_handle.shell().sidecar("prism")
    .expect("Failed to create sidecar command")
    .env("PRISM_DATA_DIR", data_dir.to_string_lossy().to_string())
    .spawn()
    .expect("Failed to spawn prism sidecar");
```

**Impact:** 
- Data stored in non-standard location (`~/.prism/data`)
- Should be `~/Library/Application Support/com.skeptomenos.prism/` on macOS
- Migration module may not find bundled defaults correctly

**Severity:** 🔴 CRITICAL — Data location incorrect, may cause data loss on app updates

---

## Medium Issues 🟡

### Issue 3: dashboard/tabs/__init__.py is Empty

**File:** `tauri-app/src-tauri/python/portfolio_src/dashboard/tabs/__init__.py`

**Current Content:** Empty file (just newline)

**Problem:**
The POC version may have had explicit exports. Need to verify if the import style in `dashboard/app.py` works with an empty `__init__.py`.

**Expected:** Likely fine if using direct module imports like `from dashboard.tabs import pipeline_health` (imports the module, not a symbol from `__init__.py`).

**Severity:** 🟡 MEDIUM — May work, but should verify

---

### Issue 4: Unused Placeholder app.py

**File:** `tauri-app/src-tauri/python/app.py`

**Current Content:** Phase 2 placeholder showing "Phase 2 Complete!" message

**Problem:**
This file is no longer used. `prism_boot.py` now launches `portfolio_src/dashboard/app.py`. Having this file is confusing for maintainers.

**Options:**
1. Delete the file
2. Rename to `app.py.bak` or `app_placeholder.py`
3. Leave as-is with a comment

**Severity:** 🟡 LOW — No runtime impact, maintenance confusion only

---

### Issue 5: Binary May Need Rebuild

**File:** `tauri-app/src-tauri/binaries/prism-aarch64-apple-darwin`
**Size:** 80MB
**Timestamp:** Dec 6 18:13:57 2025

**Problem:**
Cannot verify if the binary was rebuilt AFTER the import path was fixed. If the binary contains the broken import path, it will crash on startup.

**Action Required:**
After fixing Issue 1, rebuild the binary:
```bash
cd tauri-app/src-tauri/python
source venv-build/bin/activate
pyinstaller prism.spec
cp dist/prism ../binaries/prism-aarch64-apple-darwin
```

**Severity:** 🟡 MEDIUM — May already be correct, needs verification

---

## Verification Checklist

After fixing the issues, verify:

- [ ] `cd tauri-app && npm run tauri dev` launches successfully
- [ ] Loading screen shows, then redirects to Streamlit
- [ ] All 7 dashboard tabs render without errors:
  - [ ] Performance
  - [ ] Portfolio X-Ray
  - [ ] ETF Overlap
  - [ ] Holdings Analysis
  - [ ] Data Manager
  - [ ] Pipeline Health
  - [ ] Missing Data
- [ ] Data directory is created at correct location (`~/Library/Application Support/...`)
- [ ] Closing the app kills the Python process (no zombies)

---

## Files Requiring Changes

| File | Issue | Change Required |
|------|-------|-----------------|
| `portfolio_src/dashboard/app.py` | #1 | Fix import path from `src.` to `dashboard.` |
| `src-tauri/src/lib.rs` | #2 | Add `.env("PRISM_DATA_DIR", ...)` to sidecar spawn |
| `python/app.py` | #4 | Delete or rename (optional) |
| `binaries/prism-*` | #5 | Rebuild after fixing #1 |

---

## Recommended Fix Order

1. **Fix Issue #1** — Dashboard import path (Python)
2. **Fix Issue #2** — PRISM_DATA_DIR passing (Rust)
3. **Rebuild binary** — `pyinstaller prism.spec`
4. **Copy binary** — To `binaries/prism-aarch64-apple-darwin`
5. **Test** — Run `npm run tauri dev` and verify all tabs work
6. **Clean up Issue #4** — Remove placeholder app.py (optional)
