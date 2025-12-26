# Phase 2: Code Reality Analysis

**Date:** 2025-12-26
**Reviewer:** Claude Opus (Plan Mode)
**Status:** Complete

---

## Executive Summary

The project has a well-designed architecture with extensive documentation, but there are **critical gaps between the documented plans and the actual deployed state**. The most significant finding is that key RPC functions may not be deployed to Supabase.

---

## 1. Critical Finding: RPC Functions Schema Drift

### The Problem (RESOLVED)

> **UPDATE 2025-12-26:** This issue has been resolved. The `infrastructure/supabase/` folder has been consolidated into `supabase/` (Supabase CLI standard location).

**Previous state:** Two versions of `functions.sql` existed and had drifted apart.

**Current state:** Single source of truth at `supabase/functions/functions.sql` (355 lines) with all bulk sync functions:
```sql
-- NOW PRESENT in supabase/functions/functions.sql:
get_all_assets_rpc()
get_all_listings_rpc()
get_all_aliases_rpc()
```

### Impact

The `HiveClient.sync_identity_domain()` method calls these RPCs:
```python
# hive_client.py lines 742-783
response = client.rpc("get_all_assets_rpc", {}).execute()  # WILL FAIL if not deployed
response = client.rpc("get_all_listings_rpc", {}).execute()  # WILL FAIL if not deployed
response = client.rpc("get_all_aliases_rpc", {}).execute()  # WILL FAIL if not deployed
```

If these RPCs don't exist in Supabase, the `LocalCache.sync_from_hive()` will **silently fail**, leaving the local cache empty.

### Evidence of Silent Failure

In `hive_client.py:sync_identity_domain()` (lines 740-784):
```python
try:
    response = client.rpc("get_all_assets_rpc", {}).execute()
    if response.data:
        result["assets"] = response.data
except Exception as e:
    logger.warning(f"Failed to sync assets: {e}")
    # Fallback: try direct query (may fail due to RLS)
```

The code catches exceptions and logs warnings, but **continues without the data**. The LocalCache remains empty.

---

## 2. Resolution Chain Analysis

### Current Resolution Flow (USE_LEGACY_CSV=False)

```
ISINResolver.resolve(ticker, name, provider_isin, weight)
│
├─► 1. Provider ISIN (if valid) ✅ Works
│
├─► 2. Manual enrichments ✅ Works
│
├─► 3. Local cache (ticker lookup)
│   └─► LocalCache.get_isin_by_ticker(ticker)
│       └─► If LocalCache is empty (sync failed) → MISS
│
├─► 4. Local cache (alias lookup)
│   └─► LocalCache.get_isin_by_alias(name)
│       └─► If LocalCache is empty (sync failed) → MISS
│
├─► 5. Hive direct resolution (if tier1)
│   └─► HiveClient.resolve_ticker(ticker) → RPC call
│       └─► If RPC exists → Works
│       └─► If network down → Falls through
│
├─► 6. Enrichment cache ✅ Works
│
├─► 7. API fallback (Finnhub → Wikidata → YFinance)
│   └─► For Tier1 holdings only (weight > 0.5%)
│
└─► 8. Unresolved
```

### Critical Dependency

The `ISINResolver` initializes like this:
```python
# resolution.py lines 211-224
if USE_LEGACY_CSV:
    self.universe = AssetUniverse.load()  # Load CSV
else:
    self._local_cache = get_local_cache()
    self._hive_client = get_hive_client()
    
    if self._local_cache.is_stale():
        try:
            self._local_cache.sync_from_hive(self._hive_client)  # <-- FAILS SILENTLY
        except Exception as e:
            logger.warning(f"Failed to sync LocalCache: {e}")
```

If the sync fails, the resolver continues with an **empty local cache**, forcing everything to either:
- Query Hive directly per-request (slow, rate-limited)
- Fall back to APIs (very slow, rate-limited)
- Remain unresolved (breaks enrichment)

---

## 3. Pipeline Data Flow Verification

### What's Working ✅

| Component | Status | Evidence |
|-----------|--------|----------|
| `sync_portfolio` | ✅ Works | Fetches TR positions, saves to SQLite |
| `Pipeline.run()` | ✅ Works | Orchestrates phases |
| `Decomposer` | ⚠️ Partial | Works for cached/manual data |
| `ISINResolver` | ⚠️ Partial | Works if LocalCache has data |
| `Enricher` | ⚠️ Partial | Depends on resolved ISINs |
| `Aggregator` | ✅ Works | Aggregates whatever it gets |
| Report writing | ✅ Works | Writes CSVs and JSON |

### What's Broken/Fragile ❌

| Issue | Root Cause | Impact |
|-------|------------|--------|
| LocalCache empty | Missing RPC functions | All local lookups fail |
| ISIN resolution slow | Falls back to APIs | 1 request per ticker (rate limited) |
| ETF holdings missing | `get_etf_holdings` may fail | X-Ray shows incomplete data |
| Enrichment gaps | Unresolved ISINs can't be enriched | Sector/geography missing |

---

## 4. UI Data Source Analysis

### Dashboard Data Flow
```
Dashboard.tsx
    → useQuery(['dashboardData', 1])
    → getDashboardData(1)
    → callCommand('get_dashboard_data', {portfolioId: 1})
    → handle_get_dashboard_data()
        → database.get_positions(portfolio_id)  ← SQLite
        → Reads TRUE_EXPOSURE_REPORT for allocations  ← CSV file
```

**Issue:** The Dashboard depends on `TRUE_EXPOSURE_REPORT` for sector/region allocations. If the pipeline fails or hasn't run, allocations will be empty.

### XRayView Data Flow
```
XRayView.tsx
    → usePipelineDiagnostics()
    → getPipelineReport()
    → callCommand('get_pipeline_report', {})
    → handle_get_pipeline_report()
        → Reads PIPELINE_HEALTH_PATH  ← JSON file
```

**Issue:** If pipeline never ran or failed early, `PIPELINE_HEALTH_PATH` won't exist or will show failure state.

### Data File Dependencies
| View | Required Files | Created By |
|------|----------------|------------|
| Dashboard | `TRUE_EXPOSURE_REPORT` | `Pipeline.run()` |
| XRay | `PIPELINE_HEALTH_PATH` | `Pipeline.run()` |
| Holdings | `HOLDINGS_BREAKDOWN_PATH` | `Pipeline.run()` |
| Overlap | `HOLDINGS_BREAKDOWN_PATH` | `Pipeline.run()` |

---

## 5. Hive Integration Verification

### Contribution Path (Write) ✅
```python
# Gated by is_hive_contribution_enabled()
HiveClient.contribute_asset(...)  → RPC: contribute_asset
HiveClient.contribute_listing(...) → RPC: contribute_listing
HiveClient.contribute_alias(...)   → RPC: contribute_alias
```

These RPCs **exist in both files** and should work.

### Pull Path (Read) ⚠️
```python
# Resolution
HiveClient.resolve_ticker(...)      → RPC: resolve_ticker_rpc ✅
HiveClient.batch_resolve_tickers(...) → RPC: batch_resolve_tickers_rpc ✅
HiveClient.lookup_by_alias(...)     → RPC: lookup_alias_rpc ✅

# Bulk Sync (POTENTIALLY BROKEN)
HiveClient.sync_identity_domain() → RPCs: get_all_*_rpc ❓
```

### ETF Holdings Path ⚠️
```python
HiveClient.get_etf_holdings(etf_isin)
    → client.from_("etf_holdings").select("*").eq("etf_isin", etf_isin).execute()
```

**Issue:** This uses direct table access, not an RPC. If RLS is enabled on `etf_holdings` without a SELECT policy for anon, this will return 0 rows.

---

## 6. Feature Flag Analysis

```python
# config.py
USE_LEGACY_CSV = os.getenv("USE_LEGACY_CSV", "false").lower() == "true"
```

Current state: `USE_LEGACY_CSV = False` (Hive path is active)

**Implication:** The system is actively using the Hive path, which means:
- If Hive RPCs are not deployed → failures
- If LocalCache sync fails → empty cache
- Resolution will fall through to slow API calls

---

## 7. Verification Needed

### Immediate Checks Required

1. **Are bulk sync RPCs deployed to Supabase?**
   ```bash
   # Test via script
   python scripts/test_hive_rpc.py
   ```

2. **Is the aliases table created?**
   - Migration: `20251224_add_aliases.sql`

3. **What's in LocalCache right now?**
   ```python
   from portfolio_src.data.local_cache import get_local_cache
   cache = get_local_cache()
   print(cache.get_stats())
   ```

4. **Does direct Hive query work?**
   ```python
   from portfolio_src.data.hive_client import get_hive_client
   client = get_hive_client()
   print(client.resolve_ticker("AAPL"))
   ```

---

## 8. Recommended Actions

### Immediate (Fix Broken State)

1. **Deploy missing RPCs to Supabase** ✅ RESOLVED
   - Bulk sync RPCs now in `supabase/functions/functions.sql`
   - Deploy to production via `supabase db push` or SQL Editor

2. **Folder consolidation** ✅ RESOLVED
   - `infrastructure/supabase/` removed
   - `supabase/` is now the single source of truth

3. **Add RLS policy or RPC for `etf_holdings`**
   - Currently uses direct table access, will fail with RLS

### Short-term (Improve Resilience)

1. **Add health check for Hive connectivity**
   - Surface in UI if Hive is unreachable

2. **Improve LocalCache sync error reporting**
   - Don't silently swallow sync failures

3. **Add cache statistics to pipeline health report**
   - Show LocalCache stats in XRayView

### Medium-term (Architecture)

1. **Consider fallback to CSV if Hive is down**
   - The CSV still exists, could be emergency fallback

2. **Add integration test for full pipeline**
   - Test: sync → pipeline → verify output files

---

## Next Steps

→ **Phase 3**: Gap analysis - compare documented state vs actual deployed state
→ **Phase 4**: Live testing via Chrome DevTools to observe actual UI behavior

