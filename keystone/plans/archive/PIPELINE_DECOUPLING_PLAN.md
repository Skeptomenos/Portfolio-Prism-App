# Pipeline Decoupling Implementation Plan

> **Status:** Active
> **Workstream:** hive-extension
> **Owner:** OptiPie
> **Created:** 2025-12-25

---

## Problem Statement

Currently, the Trade Republic sync automatically triggers the analytics pipeline, creating a tightly coupled UX. Users cannot:
1. Sync portfolio data without running full analysis
2. Run analysis independently of sync
3. Control when expensive pipeline operations occur

Additionally:
- `USE_LEGACY_CSV=true` (default) bypasses the new Hive resolution path
- Playwright dependency adds complexity and bundle size for scraping that rarely works

---

## Goals

1. **Decouple Sync from Pipeline** - Separate "Sync" and "Analyze" as independent user actions
2. **Enable Hive Path by Default** - Make `USE_LEGACY_CSV=false` the default
3. **Remove Playwright Dependency** - Simplify adapters to: manual upload → Hive holdings → error

---

## Implementation Details

### Phase A: Decouple Sync from Pipeline

#### DECOUPLE-001: Remove pipeline auto-trigger from sync handler

**File:** `src-tauri/python/portfolio_src/headless/handlers/sync.py`

**Current (lines 223-226):**
```python
emit_progress(100, "Sync complete! Running Deep Analysis...", "sync")

# Trigger analytics pipeline
await handle_run_pipeline(cmd_id, payload)
```

**Target:**
```python
emit_progress(100, "Sync complete!", "sync")

# Pipeline is now triggered separately via run_pipeline command
```

**Rationale:** Users control when to run expensive analysis. Sync becomes a quick data refresh.

#### DECOUPLE-002: Update sync tests

**File:** `tests/headless/test_handlers_sync.py`

- Remove/update tests that expect `handle_run_pipeline` to be called after sync
- Add test verifying sync does NOT trigger pipeline
- Verify sync returns success without pipeline execution

---

### Phase B: Enable Hive Path by Default

#### DECOUPLE-003: Change USE_LEGACY_CSV default

**File:** `src-tauri/python/portfolio_src/config.py`

**Current (line 68):**
```python
USE_LEGACY_CSV = os.getenv("USE_LEGACY_CSV", "true").lower() == "true"
```

**Target:**
```python
USE_LEGACY_CSV = os.getenv("USE_LEGACY_CSV", "false").lower() == "true"
```

**Rollback:** Set `USE_LEGACY_CSV=true` environment variable

---

### Phase C: Remove Playwright Dependency

#### DECOUPLE-004: Simplify AmundiAdapter

**File:** `src-tauri/python/portfolio_src/adapters/amundi.py`

**Changes:**
1. Remove `_fetch_via_playwright()` method entirely
2. Update `fetch_holdings()` to: manual file → raise `ManualUploadRequired`
3. Remove Playwright imports

**New flow:**
```python
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    # 1. Try Manual File
    df = self._fetch_from_manual_file(isin)
    if df is not None:
        return df
    
    # 2. No automation - require manual upload
    raise ManualUploadRequired(
        isin=isin,
        provider="Amundi",
        message=f"Amundi ETF {isin} requires manual holdings upload.",
        download_url=f"https://www.amundietf.de/de/privatanleger/products/equity/{isin}"
    )
```

#### DECOUPLE-005: Simplify VanguardAdapter

**File:** `src-tauri/python/portfolio_src/adapters/vanguard.py`

**Changes:**
1. Remove `_fetch_via_playwright()` method
2. Remove `_extract_holdings_from_playwright()` method
3. Remove `_parse_playwright_table()` method
4. Keep: manual file → US API → BeautifulSoup fallback → raise error
5. Remove Playwright imports

#### DECOUPLE-006: Delete browser.py

**File:** `src-tauri/python/portfolio_src/prism_utils/browser.py`

**Action:** Delete entire file

**Cleanup:**
- Remove any imports of `BrowserContext`, `PlaywrightNotInstalledError` from adapters
- Keep `ManualUploadRequired` exception (it's in `holdings_cache.py`)

#### DECOUPLE-007: Update adapter error handling

**Files:** All adapters that used Playwright

**Changes:**
- Replace `PlaywrightNotInstalledError` catches with direct `ManualUploadRequired` raises
- Ensure clear error messages with download URLs for manual upload

---

### Phase D: Verification

#### DECOUPLE-008: Run test suite

```bash
cd src-tauri/python
python3 -m pytest tests/ -v --tb=short
```

**Expected:** All tests pass (some may need updates for removed Playwright mocks)

#### DECOUPLE-009: Live integration test

1. Start dev server: `npm run dev:browser`
2. Login to Trade Republic
3. Verify: Sync completes WITHOUT auto-triggering pipeline
4. Navigate to X-Ray view
5. Manually trigger pipeline
6. Verify: Holdings resolve via Hive path (check logs for `local_cache_ticker`)

---

## Task Summary

| ID | Task | Phase | Priority |
|----|------|-------|----------|
| DECOUPLE-001 | Remove pipeline auto-trigger from sync handler | A | High |
| DECOUPLE-002 | Update sync tests | A | High |
| DECOUPLE-003 | Change USE_LEGACY_CSV default to false | B | High |
| DECOUPLE-004 | Simplify AmundiAdapter (remove Playwright) | C | Medium |
| DECOUPLE-005 | Simplify VanguardAdapter (remove Playwright) | C | Medium |
| DECOUPLE-006 | Delete browser.py | C | Medium |
| DECOUPLE-007 | Update adapter error handling | C | Medium |
| DECOUPLE-008 | Run test suite | D | High |
| DECOUPLE-009 | Live integration test | D | High |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing sync flow | Tests verify sync still works independently |
| Hive path has bugs | `USE_LEGACY_CSV=true` env var for rollback |
| Adapters fail without Playwright | Clear `ManualUploadRequired` errors with download URLs |
| Tests depend on Playwright mocks | Update tests to mock `ManualUploadRequired` instead |

---

## Success Criteria

- [ ] Sync completes without triggering pipeline
- [ ] Pipeline can be triggered independently from X-Ray view
- [ ] `USE_LEGACY_CSV=false` is default (Hive path active)
- [ ] No Playwright code remains in codebase
- [ ] All tests pass
- [ ] ETFs without cached holdings show clear "Manual Upload Required" message
