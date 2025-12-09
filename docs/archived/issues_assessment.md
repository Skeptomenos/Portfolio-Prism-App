# Issues Assessment: tauri-app/ Code Review

> **Date:** 2024-12-06
> **Reviewer:** AI Code Review
> **Scope:** Comprehensive review of `tauri-app/` implementation against design documents

---

## Executive Summary

**Current State: Phase 2 Complete (~90%)**

The existing implementation is solid and aligns with the design documents. The sidecar pattern is correctly implemented, PyInstaller bundling works (62MB binary), and the Tauri↔Python IPC is functional. A few gaps remain before proceeding to Phase 3.

**Verification Status:** Confirmed working — `npm run tauri dev` launches Streamlit "Phase 2 Complete" page.

---

## Issues Found

### HIGH Priority (Fix Before Phase 3)

| # | Issue | Location | Description | Impact | Fix Time |
|---|-------|----------|-------------|--------|----------|
| 1 | **Dead Man's Switch missing** | `src-tauri/python/prism_boot.py` | No stdin monitoring. If Tauri crashes, Python becomes a zombie process consuming RAM and potentially locking the database. | Zombie processes | 5 min |
| 2 | **Missing PyInstaller dependencies** | `src-tauri/python/requirements-build.txt` | Current deps: `streamlit`, `pandas`, `numpy`, `altair`, `pyarrow`. Missing for POC: `plotly`, `requests`, `beautifulsoup4`, `lxml`, `openpyxl`, `pydantic`, `pandera`, `tqdm`, `cryptography`, `pytr`, `python-dotenv`. | POC dashboard will crash | 5 min |

#### Fix for Issue #1 (Dead Man's Switch)

Add to `prism_boot.py` after imports:

```python
import threading

def dead_mans_switch():
    """Monitor stdin. If it closes (Tauri died), exit immediately."""
    sys.stdin.read()
    sys.exit(0)

# Start before main logic
threading.Thread(target=dead_mans_switch, daemon=True).start()
```

#### Fix for Issue #2 (Dependencies)

Update `requirements-build.txt`:

```
# Build requirements for PyInstaller frozen binary
pyinstaller>=6.0
streamlit>=1.29.0
pandas>=2.0.0
numpy>=1.24.0
altair>=5.0.0
pyarrow>=14.0.0

# POC Dashboard requirements
plotly>=5.18.0
requests
beautifulsoup4
lxml
openpyxl
pydantic
pandera
tqdm
cryptography
pytr>=0.4.2
python-dotenv
```

---

### MEDIUM Priority (Fix Before Release)

| # | Issue | Location | Description | Impact | Fix Time |
|---|-------|----------|-------------|--------|----------|
| 3 | **CSP disabled** | `src-tauri/tauri.conf.json` | `"csp": null` disables Content Security Policy. Allows arbitrary script execution in WebView. | Security vulnerability | 10 min |
| 4 | **Stdin pipe not configured in Rust** | `src-tauri/src/lib.rs` | Rust spawns sidecar but doesn't explicitly keep stdin pipe open. May affect Dead Man's Switch reliability. | Dead Man's Switch may not trigger | 10 min |

#### Fix for Issue #3 (CSP)

Update `tauri.conf.json`:

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; connect-src 'self' http://localhost:*"
}
```

Note: Will need testing — Streamlit may require additional CSP rules.

#### Fix for Issue #4 (Stdin Pipe)

Verify Tauri's `sidecar()` API keeps stdin open by default. If not, may need to use lower-level `Command` API with explicit stdin configuration:

```rust
.stdin(Stdio::piped())
```

---

### LOW Priority (Nice to Have)

| # | Issue | Location | Description | Impact | Fix Time |
|---|-------|----------|-------------|--------|----------|
| 5 | **Build artifacts pollution** | `src-tauri/target/debug/` | Contains unusual files (timezone names, `.so` files) — likely PyInstaller extraction artifacts. | No functional impact, visual noise | N/A |
| 6 | **README is template** | `tauri-app/README.md` | Still contains Tauri template text, not project-specific documentation. | Documentation gap | 5 min |

---

## What's Working Well

| Component | Status | Notes |
|-----------|--------|-------|
| Tauri v2 setup | ✅ Excellent | Proper configuration, correct identifier |
| Sidecar spawning | ✅ Excellent | Uses `sidecar()` API (better than raw `command()`) |
| Port discovery | ✅ Excellent | Dynamic port via socket binding |
| JSON handshake | ✅ Excellent | Clean IPC protocol |
| Health polling | ✅ Excellent | Polls `/_stcore/health` before redirect (smart!) |
| PyInstaller bundling | ✅ Working | 62MB binary, successfully runs |
| Streamlit integration | ✅ Excellent | Programmatic launch with proper flags |
| Data directory | ✅ Good | `PRISM_DATA_DIR` env var support |

---

## Architectural Alignment

| Design Doc Requirement | Implementation Status |
|------------------------|----------------------|
| Sidecar Pattern | ✅ Correctly implemented |
| Dynamic Port Binding | ✅ Port 0 → kernel assigns |
| JSON stdout handshake | ✅ `{"port": N, "status": "ready"}` |
| Dead Man's Switch | ⚠️ Python side missing |
| `externalBin` config | ✅ Configured in tauri.conf.json |
| Streamlit headless mode | ✅ `--server.headless=true` |
| CORS/XSRF disabled | ✅ For local-only access |
| Usage stats disabled | ✅ `--browser.gatherUsageStats=false` |

---

## Recommended Fix Order

### Immediate (Before Phase 3)
1. Fix #1: Add Dead Man's Switch to `prism_boot.py`
2. Fix #2: Update `requirements-build.txt` with POC dependencies

### Phase 3 (Logic Transplant)
3. Copy `POC/src/` to `tauri-app/src-tauri/python/src/`
4. Update `app.py` to import POC dashboard
5. Rebuild PyInstaller binary
6. Test with real portfolio data

### Before Public Release
7. Fix #3: Configure CSP properly
8. Fix #4: Verify stdin pipe behavior
9. Fix #6: Update README

---

## Dependencies to Add (Phase 3)

Based on POC analysis, these are the **minimal required** dependencies:

| Package | Purpose | Bundle Risk |
|---------|---------|-------------|
| `plotly` | Interactive charts | Medium |
| `requests` | HTTP client | Low |
| `beautifulsoup4` | HTML parsing | Low |
| `lxml` | XML/HTML parser | Medium (C ext) |
| `openpyxl` | Excel files | Low |
| `pydantic` | Data validation | Low |
| `pandera` | DataFrame validation | Low |
| `tqdm` | Progress bars | Low |
| `cryptography` | Required by pytr | High (C/Rust) |
| `pytr` | Trade Republic API | Low |
| `python-dotenv` | Env file loading | Low |

**Explicitly excluded (per design decision):**
- `playwright` — Replaced by Hive pattern
- `yfinance` — Replace with Finnhub proxy
- `matplotlib` — Plotly covers charting needs
- `pdfplumber` — Review if needed
- `deep-translator` — Review if needed

---

## Next Steps

1. [ ] Apply fixes #1 and #2
2. [ ] Proceed to Phase 3: Copy POC code
3. [ ] Rebuild PyInstaller binary with new dependencies
4. [ ] Test dashboard with real data
5. [ ] Document any new issues discovered
