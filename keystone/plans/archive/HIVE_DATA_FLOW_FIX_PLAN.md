# Hive Data Flow Fix Plan

> **Date:** 2025-12-26  
> **Priority:** CRITICAL  
> **Root Cause:** `sync_universe()` queries non-existent `master_view`, causing 0% Hive hit rate  
> **Sources:** Opus Review, Gemini Review, UI-focused AI Analysis

---

## Executive Summary

The Hive integration shows 0% hit rate because:
1. `HiveClient.sync_universe()` queries `master_view` which doesn't exist
2. `_universe_cache` stays empty → `batch_lookup()` returns "Unknown" for everything
3. `HiveEnrichmentService` uses `batch_lookup()` but doesn't fall back to `LocalCache`
4. All ISINs fall through to API → 0% Hive hits

**The fix:** Use the working `sync_identity_domain()` path (which uses RPCs) instead of the broken `sync_universe()` path.

---

## Architecture Analysis

### Current State (Broken)

```
HiveEnrichmentService.get_metadata_batch()
        │
        ▼
HiveClient.batch_lookup(isins)
        │
        ▼
HiveClient.sync_universe()  ← CALLED IF CACHE EMPTY
        │
        ▼
client.from_("master_view")  ← FAILS (PGRST205)
        │
        ▼
_universe_cache stays empty
        │
        ▼
batch_lookup() returns "Unknown"
        │
        ▼
0% Hive hit rate
```

### Working Path (Unused by Enricher)

```
ISINResolver._ensure_cache_synced()
        │
        ▼
LocalCache.sync_from_hive(hive_client)
        │
        ▼
HiveClient.sync_identity_domain()
        │
        ▼
client.rpc("get_all_assets_rpc")  ← WORKS! (1000 assets)
client.rpc("get_all_listings_rpc") ← WORKS! (1000 listings)
client.rpc("get_all_aliases_rpc")  ← WORKS! (0 aliases)
        │
        ▼
LocalCache populated with 1000+ entries
        │
        ▼
BUT: HiveEnrichmentService doesn't use LocalCache!
```

---

## Implementation Plan

### Issue 1: Fix `sync_universe()` to Use RPCs

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

**Problem:** Line 244 queries `client.from_("master_view")` which doesn't exist.

**Solution:** Replace with `client.rpc("get_all_assets_rpc")` and join with listings.

#### Task HIVE-FIX-001: Update sync_universe() to use RPCs

```python
# BEFORE (line 244):
response = client.from_("master_view").select("*").execute()

# AFTER:
# Fetch assets via RPC
assets_response = client.rpc("get_all_assets_rpc", {}).execute()
listings_response = client.rpc("get_all_listings_rpc", {}).execute()

# Build lookup dict for listings by ISIN
listings_by_isin = {}
for listing in listings_response.data or []:
    isin = listing.get("isin")
    if isin and isin not in listings_by_isin:
        listings_by_isin[isin] = listing

# Merge assets with their primary listing
for asset in assets_response.data or []:
    isin = asset.get("isin", "")
    listing = listings_by_isin.get(isin, {})
    
    entry = AssetEntry(
        isin=isin,
        name=asset.get("name", ""),
        asset_class=asset.get("asset_class", "Unknown"),
        base_currency=asset.get("base_currency", "Unknown"),
        ticker=listing.get("ticker"),
        exchange=listing.get("exchange"),
        currency=listing.get("currency"),
        enrichment_status=asset.get("enrichment_status", "stub"),
        last_updated=asset.get("updated_at"),
        contributor_count=1,
    )
    entry.calculate_confidence()
    self._universe_cache[entry.isin] = entry
```

**Acceptance Criteria:**
- [ ] `sync_universe()` no longer queries `master_view`
- [ ] `_universe_cache` is populated with 1000+ entries
- [ ] `batch_lookup()` returns real data instead of "Unknown"

---

### Issue 2: Create `get_etf_holdings_rpc` for RLS Bypass

**Files:** 
- `supabase/functions/functions.sql`
- `supabase/migrations/20251226_add_etf_holdings_rpc.sql`
- `src-tauri/python/portfolio_src/data/hive_client.py`

**Problem:** `get_etf_holdings()` uses direct table access which fails with RLS.

**Solution:** Create RPC function and update Python client.

#### Task HIVE-FIX-002: Create get_etf_holdings_rpc SQL function

```sql
-- Migration: Add get_etf_holdings_rpc for RLS bypass
-- Date: 2025-12-26

CREATE OR REPLACE FUNCTION public.get_etf_holdings_rpc(p_etf_isin VARCHAR)
RETURNS TABLE (
    etf_isin VARCHAR(12),
    holding_isin VARCHAR(12),
    weight DECIMAL(5, 4),
    confidence_score DECIMAL(3, 2),
    last_updated DATE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT etf_isin, holding_isin, weight, confidence_score, last_updated
    FROM public.etf_holdings
    WHERE etf_isin = p_etf_isin;
$$;

GRANT EXECUTE ON FUNCTION public.get_etf_holdings_rpc(VARCHAR) TO anon;

COMMENT ON FUNCTION public.get_etf_holdings_rpc IS 
    'Fetch ETF holdings by ETF ISIN. SECURITY DEFINER bypasses RLS.';
```

#### Task HIVE-FIX-003: Update hive_client.py to use RPC

```python
# BEFORE (line 799-803):
response = (
    client.from_("etf_holdings")
    .select("*")
    .eq("etf_isin", etf_isin)
    .execute()
)

# AFTER:
response = client.rpc(
    "get_etf_holdings_rpc",
    {"p_etf_isin": etf_isin}
).execute()
```

**Acceptance Criteria:**
- [ ] RPC function deployed to Supabase
- [ ] `get_etf_holdings()` uses RPC instead of direct table access
- [ ] ETF holdings queries work with RLS enabled

---

### Issue 3: Bridge HiveEnrichmentService to LocalCache

**File:** `src-tauri/python/portfolio_src/core/services/enricher.py`

**Problem:** `HiveEnrichmentService` only uses `HiveClient.batch_lookup()` which depends on the broken `_universe_cache`. It doesn't use the working `LocalCache`.

**Solution:** Check `LocalCache` first before calling `batch_lookup()`.

#### Task HIVE-FIX-004: Add LocalCache lookup to HiveEnrichmentService

```python
# In HiveEnrichmentService.__init__():
from portfolio_src.data.local_cache import get_local_cache

def __init__(self):
    self.hive_client = get_hive_client()
    self.fallback_service = EnrichmentService()
    self.local_cache = get_local_cache()  # ADD THIS

# In get_metadata_batch():
def get_metadata_batch(self, isins: List[str]) -> EnrichmentResult:
    if not isins:
        return EnrichmentResult(data={}, sources={}, contributions=[])

    metadata = {}
    sources = {}
    remaining_isins = []

    # STEP 1: Check LocalCache first (fast, offline-capable)
    for isin in isins:
        cached_asset = self.local_cache.get_asset(isin)
        if cached_asset:
            metadata[isin] = {
                "isin": cached_asset.isin,
                "name": cached_asset.name,
                "sector": cached_asset.asset_class,
                "geography": "Unknown",
                "asset_class": cached_asset.asset_class,
            }
            sources[isin] = "hive"  # LocalCache is synced from Hive
        else:
            remaining_isins.append(isin)

    # STEP 2: Try HiveClient for remaining ISINs
    if remaining_isins:
        hive_results = self.hive_client.batch_lookup(remaining_isins)
        for isin in remaining_isins:
            asset = hive_results.get(isin)
            if asset and asset.name != "Unknown":
                metadata[isin] = {
                    "isin": asset.isin,
                    "name": asset.name,
                    "sector": asset.asset_class,
                    "geography": "Unknown",
                    "asset_class": asset.asset_class,
                }
                sources[isin] = "hive"
                remaining_isins.remove(isin)

    # STEP 3: Fallback to APIs for still-missing ISINs
    # ... existing fallback logic ...
```

**Acceptance Criteria:**
- [ ] `HiveEnrichmentService` checks `LocalCache` first
- [ ] Cache hits are recorded as "hive" source
- [ ] Hive hit rate > 0% when LocalCache is populated

---

### Issue 4: Update schema.sql with aliases Table

**File:** `supabase/schema.sql`

**Problem:** The `aliases` table exists in migrations but is missing from the reference schema.

**Solution:** Add the table definition for documentation completeness.

#### Task HIVE-FIX-005: Add aliases table to schema.sql

```sql
-- =============================================================================
-- 7. ALIASES Table (Name-based Resolution)
-- =============================================================================
-- Maps name variations to ISINs for fuzzy matching.

CREATE TABLE IF NOT EXISTS aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alias VARCHAR(100) NOT NULL,
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin) ON DELETE CASCADE,
    alias_type VARCHAR(20) DEFAULT 'name',  -- 'name', 'abbreviation', 'local_name'
    language VARCHAR(5),                     -- 'en', 'de', 'ja' for localized names
    contributor_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(alias, isin)
);

CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases (UPPER(alias));
CREATE INDEX IF NOT EXISTS idx_aliases_isin ON aliases (isin);

COMMENT ON TABLE aliases IS 'Name variations mapping to ISINs for fuzzy resolution';
```

**Acceptance Criteria:**
- [ ] `aliases` table definition added to `schema.sql`
- [ ] Schema file is complete reference documentation

---

## Task Summary

| ID | Task | File(s) | Priority | Effort |
|----|------|---------|----------|--------|
| HIVE-FIX-001 | Fix sync_universe() to use RPCs | hive_client.py | CRITICAL | 30 min |
| HIVE-FIX-002 | Create get_etf_holdings_rpc | functions.sql, migration | HIGH | 15 min |
| HIVE-FIX-003 | Update get_etf_holdings() to use RPC | hive_client.py | HIGH | 10 min |
| HIVE-FIX-004 | Bridge HiveEnrichmentService to LocalCache | enricher.py | CRITICAL | 30 min |
| HIVE-FIX-005 | Add aliases table to schema.sql | schema.sql | LOW | 5 min |

**Total Estimated Effort:** ~1.5 hours

---

## Verification Steps

After implementation:

1. **Test sync_universe():**
   ```python
   from portfolio_src.data.hive_client import get_hive_client
   client = get_hive_client()
   result = client.sync_universe(force=True)
   print(f"Synced: {result.data}")  # Should show count > 0
   ```

2. **Test batch_lookup():**
   ```python
   results = client.batch_lookup(["US0378331005", "US5949181045"])
   for isin, asset in results.items():
       print(f"{isin}: {asset.name}")  # Should show real names, not "Unknown"
   ```

3. **Test ETF holdings RPC:**
   ```python
   df = client.get_etf_holdings("IE00B4L5Y983")  # iShares Core MSCI World
   print(f"Holdings: {len(df)} rows")
   ```

4. **Test enrichment with LocalCache:**
   ```python
   from portfolio_src.core.services.enricher import HiveEnrichmentService
   enricher = HiveEnrichmentService()
   result = enricher.get_metadata_batch(["US0378331005"])
   print(f"Source: {result.sources}")  # Should show "hive"
   ```

5. **Run full pipeline and check metrics:**
   - Hive hit rate should be > 0%
   - API calls should be reduced

---

## Dependencies

- All bulk sync RPCs must be deployed (✅ DONE)
- Supabase connection must be configured (✅ DONE)
- LocalCache must be synced before enrichment runs

---

## Rollback Plan

If issues arise:
1. Revert `sync_universe()` changes
2. Keep `get_etf_holdings_rpc` (additive, no breaking change)
3. Remove LocalCache integration from enricher (revert to batch_lookup only)

---

## References

- `review/opus/03_SYNTHESIS_AND_RECOMMENDATIONS.md`
- `review/gemini/02_next_steps.md`
- UI-focused AI analysis (provided by user)
- `keystone/specs/supabase.md`
