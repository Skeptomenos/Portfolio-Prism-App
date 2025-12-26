# Phase 5: Cleanup (Post-Production Verification)

**Workstream:** hive-extension
**Owner:** OptiPie
**Status:** Blocked (requires Phase 4 verified in production)
**Estimated Effort:** 1-2 hours

---

## Objective

Remove all deprecated CSV-based resolution code after the Hive integration has been verified in production for 1+ week. This is the final cleanup phase that eliminates technical debt.

## Prerequisites

**CRITICAL: Do NOT start this phase until:**

- [ ] Phase 4 deployed to production
- [ ] `USE_LEGACY_CSV=False` running successfully for 1+ week
- [ ] No rollbacks required during verification period
- [ ] Resolution rate >95% for top 80% holdings by weight
- [ ] No user-reported issues with ISIN resolution

---

## Pre-Cleanup Verification Checklist

Before removing any code, verify:

| Check | Command/Action | Expected Result |
|-------|----------------|-----------------|
| Feature flag status | Check `config.py` | `USE_LEGACY_CSV = False` |
| Resolution stats | Check logs/metrics | >95% resolution rate |
| Hive connectivity | Test RPC calls | All RPCs return data |
| LocalCache health | Check SQLite file | Recent sync timestamp |
| User complaints | Check support channels | No ISIN-related issues |
| Rollback count | Check deployment history | 0 rollbacks in past week |

---

## Task Breakdown

### HIVE-501: Delete AssetUniverse Class

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

**Remove:**

1. The entire `AssetUniverse` class definition:
```python
# DELETE THIS ENTIRE CLASS
class AssetUniverse:
    """
    Loads and queries the asset universe CSV.
    DEPRECATED: Use HiveClient + LocalCache instead.
    """
    _instance = None
    _data = None
    
    @classmethod
    def load(cls):
        ...
    
    def lookup_by_ticker(self, ticker: str) -> Optional[str]:
        ...
    
    def lookup_by_alias(self, alias: str) -> Optional[str]:
        ...
```

2. Remove the import and any references:
```python
# DELETE
from portfolio_src.config import ASSET_UNIVERSE_PATH
```

3. Remove the `_resolve_via_csv()` method from `ISINResolver`:
```python
# DELETE THIS METHOD
def _resolve_via_csv(self, ticker: str, name: str) -> ResolutionResult:
    """Legacy path: resolve via AssetUniverse CSV."""
    ...
```

4. Remove the conditional in `__init__`:
```python
# BEFORE
if USE_LEGACY_CSV:
    self.universe = AssetUniverse.load()
    self._local_cache = None
    self._hive_client = None
else:
    self.universe = None
    self._local_cache = get_local_cache()
    self._hive_client = get_hive_client()

# AFTER
self._local_cache = get_local_cache()
self._hive_client = get_hive_client()

# Sync cache if stale
if self._local_cache.is_stale():
    try:
        self._local_cache.sync_from_hive(self._hive_client)
    except Exception as e:
        logger.warning(f"Failed to sync LocalCache: {e}")
```

5. Remove the conditional in `resolve()`:
```python
# BEFORE
if USE_LEGACY_CSV:
    result = self._resolve_via_csv(ticker_clean, name_clean)
else:
    result = self._resolve_via_hive(ticker_clean, name_clean)

# AFTER
result = self._resolve_via_hive(ticker_clean, name_clean)
```

---

### HIVE-502: Remove CSV from migration.py

**File:** `src-tauri/python/portfolio_src/core/migration.py`

**Search for and remove:**

1. Any imports related to asset universe:
```python
# DELETE
from portfolio_src.config import ASSET_UNIVERSE_PATH
```

2. Any migration logic for CSV:
```python
# DELETE any function like:
def _migrate_asset_universe():
    """Migrate asset_universe.csv to Hive."""
    ...
```

3. Any calls to CSV migration in the main migration flow.

**File:** `src-tauri/python/portfolio_src/data/community_sync.py`

**Remove:**

```python
# DELETE THIS METHOD
def _sync_asset_universe(self):
    """Sync asset_universe.csv to Hive."""
    ...
```

And any calls to it:
```python
# DELETE
self._sync_asset_universe()
```

---

### HIVE-503: Remove Feature Flag

**File:** `src-tauri/python/portfolio_src/config.py`

**Remove:**

```python
# DELETE
# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Hive Extension: Use legacy CSV for ISIN resolution
# Set to False to use Hive + LocalCache instead
# Default: True (safe - uses existing behavior)
USE_LEGACY_CSV = True
```

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

**Remove:**

```python
# DELETE
from portfolio_src.config import USE_LEGACY_CSV
```

And all conditional logic that checks the flag.

---

### HIVE-504: Delete Deprecated Files

**Files to delete:**

1. **`src-tauri/python/config/asset_universe.csv`** - The deprecated CSV file

```bash
rm src-tauri/python/config/asset_universe.csv
```

2. **Any backup copies:**
```bash
rm -f src-tauri/python/config/asset_universe.csv.bak
rm -f src-tauri/python/config/asset_universe.csv.old
```

**File:** `src-tauri/python/portfolio_src/config.py`

**Optionally remove:**

```python
# DELETE (optional - only if no other code references it)
ASSET_UNIVERSE_PATH = DATA_DIR / "asset_universe.csv"
```

**Update error messages:**

Search for any error messages that reference the CSV file and update them:

```python
# BEFORE
fix_hint="Check asset_universe.csv or add manual enrichment"

# AFTER
fix_hint="Add manual enrichment or wait for Hive sync"
```

---

### HIVE-505: Final Documentation Update

**File:** `keystone/strategy/HIVE_EXTENSION_STRATEGY.md`

**Update status:**

```markdown
# Hive Extension Strategy: Ticker Resolution & Data Quality

**Date:** 2025-12-24
**Status:** COMPLETE - Deployed to Production
**Completion Date:** [INSERT DATE]
**Authors:** AI Assistant + Human Architect
**Reviewers:** Oracle Agent, Rigid Auditor
```

**Add completion summary:**

```markdown
## Completion Summary

### What Was Delivered

1. **RLS Fix:** `SECURITY DEFINER` RPCs enable anonymous client to read Hive data
2. **HiveClient Upgrade:** Added `resolve_ticker()`, `batch_resolve_tickers()`, `lookup_by_alias()`
3. **LocalCache:** SQLite cache for offline operation
4. **ISINResolver Refactor:** Hive-first resolution chain with API fallback
5. **Decomposer Wiring:** Holdings now resolved to ISINs before enrichment
6. **CSV Removal:** Deprecated `asset_universe.csv` deleted

### Metrics

| Metric | Before | After |
|--------|--------|-------|
| Resolution rate | N/A (CSV only) | >95% |
| Offline support | No | Yes (24h cache) |
| Community contributions | Write-only | Bidirectional |
| X-Ray accuracy | Broken | Working |

### Lessons Learned

[Document any lessons learned during implementation]
```

**Archive the strategy:**

```bash
mv keystone/strategy/HIVE_EXTENSION_STRATEGY.md keystone/plans/archive/HIVE_EXTENSION_STRATEGY_COMPLETE.md
```

**Update workstream:**

**File:** `keystone/project/workstreams/hive-extension.md`

Mark all tasks as Done and update status to Complete.

**Update README if needed:**

If the README mentions the CSV file or legacy resolution, update it to reflect the new Hive-based system.

---

## Verification After Cleanup

After completing all cleanup tasks, verify:

| Check | Command | Expected Result |
|-------|---------|-----------------|
| No CSV references | `grep -r "asset_universe" src-tauri/python/` | No matches |
| No flag references | `grep -r "USE_LEGACY_CSV" src-tauri/python/` | No matches |
| No AssetUniverse | `grep -r "AssetUniverse" src-tauri/python/` | No matches |
| Tests pass | `pytest src-tauri/python/tests/` | All pass |
| Build succeeds | `npm run tauri build` | Success |
| Resolution works | Run pipeline with test ETF | ISINs resolved |

---

## Rollback Procedure

**If cleanup causes issues:**

1. **Git revert:** `git revert HEAD~N` (where N is number of cleanup commits)
2. **Restore CSV:** `git checkout HEAD~N -- src-tauri/python/config/asset_universe.csv`
3. **Restore flag:** Set `USE_LEGACY_CSV = True` in config
4. **Restart application**

**Prevention:** Make cleanup changes in small, atomic commits so individual changes can be reverted.

---

## Success Criteria

- [ ] `AssetUniverse` class deleted from `resolution.py`
- [ ] CSV migration code removed from `migration.py`
- [ ] `_sync_asset_universe()` removed from `community_sync.py`
- [ ] `USE_LEGACY_CSV` flag removed from `config.py`
- [ ] `asset_universe.csv` file deleted
- [ ] No grep matches for deprecated code
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Strategy document archived
- [ ] Workstream marked complete

---

## Files Modified

| File | Changes |
|------|---------|
| `data/resolution.py` | Delete `AssetUniverse` class, remove flag logic |
| `core/migration.py` | Remove CSV migration code |
| `data/community_sync.py` | Remove `_sync_asset_universe()` |
| `config.py` | Remove `USE_LEGACY_CSV` flag, optionally `ASSET_UNIVERSE_PATH` |
| `config/asset_universe.csv` | DELETE file |
| `keystone/strategy/HIVE_EXTENSION_STRATEGY.md` | Update status, archive |
| `keystone/project/workstreams/hive-extension.md` | Mark complete |

---

## Post-Cleanup Monitoring

After cleanup, monitor for 1 week:

| Metric | Alert Threshold |
|--------|-----------------|
| Resolution failures | >5% of holdings |
| Hive connection errors | >10 per hour |
| LocalCache sync failures | >1 per day |
| User complaints | Any ISIN-related issue |

If any threshold is exceeded, investigate immediately. The cleanup is irreversible without git revert.
