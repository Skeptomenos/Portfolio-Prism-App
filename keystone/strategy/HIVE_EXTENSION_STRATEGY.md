# Hive Extension Strategy: Ticker Resolution & Data Quality

**Date:** 2025-12-24
**Status:** VALIDATED - Ready for Implementation
**Authors:** AI Assistant + Human Architect
**Reviewers:** Oracle Agent, Rigid Auditor

---

## Executive Summary

The "Hive" (Community Database) is intended to be the Source of Truth for:
1. **Identity Resolution** - Mapping tickers, names, aliases → ISIN
2. **ETF Compositions** - What holdings are inside each ETF

**Critical Discovery:** The Hive contains ~1,104 migrated entries, but **Row Level Security (RLS) policies hide the data** from the anonymous client. Initial tests showing "0 rows" were misleading — the data exists but is locked.

The legacy `asset_universe.csv` is still performing all resolutions, masking this RLS failure.

**We will execute a "Phased Unlock" strategy:**
1. **Unlock the Hive:** Fix RLS policies to allow read access via `SECURITY DEFINER` RPCs.
2. **Activate the Brain:** Update `HiveClient` to *read* from the Hive.
3. **Feed the Hive:** Update `ISINResolver` to fall back to APIs, and *push* successful resolutions to the Hive.
4. **Rewire the Heart:** Update `Decomposer` to use this new resolving capability.
5. **Safe Rollout:** Use `USE_LEGACY_CSV` feature flag for gradual migration.

---

## Hive Purpose & Scope

### What the Hive DOES

| Domain | Purpose | Tables |
|--------|---------|--------|
| **Identity Resolution** | Map ticker/name/alias → ISIN | `assets`, `listings`, `aliases` |
| **ETF Compositions** | Store what's inside each ETF | `etf_holdings`, `etf_history` |
| **Audit Trail** | Track community contributions | `contributions` |

### What the Hive DOES NOT Do

| Data Type | Source | Rationale |
|-----------|--------|-----------|
| **Price Data** | External APIs (ad-hoc) | Changes constantly, many free sources available |
| **Historical Prices** | External APIs | Yahoo Finance, Alpha Vantage, etc. provide this |
| **Dividends** | External APIs | Available from market data providers |
| **News/Sentiment** | External APIs | Not core to portfolio analysis |

**Principle:** The Hive contributes data we cannot get from other sources. Identity resolution and ETF compositions are fragmented across providers - the Hive unifies them.

---

## Hive Architecture

### Logical Domains

```
┌─────────────────────────────────────────────────────────────────┐
│                         HIVE DATABASE                           │
│                    (Supabase PostgreSQL)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              IDENTITY DOMAIN                             │   │
│  │  "What is this security?"                                │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  assets        - ISIN → name, asset_class, currency     │   │
│  │  listings      - (ticker, exchange) → ISIN              │   │
│  │  aliases       - name variations → ISIN          [NEW]  │   │
│  │  provider_mappings - API-specific IDs → ISIN            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              COMPOSITION DOMAIN                          │   │
│  │  "What's inside this ETF?"                               │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  etf_holdings  - ETF ISIN → holding ISINs + weights     │   │
│  │  etf_history   - Historical snapshots (JSONB)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AUDIT DOMAIN                                │   │
│  │  "Who contributed what?"                                 │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  contributions - Audit log of all changes               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### New Table: `aliases`

The `asset_universe.csv` had a pipe-separated `Aliases` column for name variations. The long-term solution is a dedicated table:

```sql
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
```

**Resolution chain becomes:**
```
1. Provider ISIN (if valid)
2. Manual enrichments
3. Hive listings (ticker → ISIN)
4. Hive aliases (name → ISIN)  ← NEW
5. Local cache
6. API fallbacks (Finnhub, Wikidata, YFinance)
7. On success → Push to Hive
```

---

## Local Cache Strategy (Offline Support)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL SQLITE CACHE                           │
│              (~/Library/Application Support/PortfolioPrism/)    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ALWAYS CACHED (sync on startup + after new purchases):        │
│  ├── assets      (full table - ~10K rows max)                  │
│  ├── listings    (full table - ~50K rows max)                  │
│  └── aliases     (full table - ~20K rows max)                  │
│                                                                 │
│  SELECTIVELY CACHED (sync on demand):                           │
│  └── etf_holdings (only for user's ETFs)                       │
│                                                                 │
│  NEVER CACHED:                                                  │
│  ├── etf_history   (too large, query on demand)                │
│  └── contributions (audit only, not needed locally)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Sync Triggers

| Trigger | Action |
|---------|--------|
| App startup | Sync identity domain (assets, listings, aliases) if stale (>24h) |
| New ETF purchased | Fetch ETF holdings from Hive |
| New stock purchased | Check if asset exists in local cache, fetch if missing |
| API resolution success | Push to Hive, update local cache |
| Manual resolution | Push to Hive, update local cache |

### Offline Behavior

| Scenario | Behavior |
|----------|----------|
| Hive unreachable on startup | Use local cache, log warning |
| Hive unreachable during resolution | Skip Hive lookup, proceed to API fallback |
| API unreachable | Mark as unresolved, continue pipeline |
| All sources fail | Include holding with "Unknown" metadata |

---

## The RLS Discovery (Critical Context)

Our initial validation showed "0 rows" in Hive tables. **This was incorrect.**

**Reality:** The Hive contains ~1,104 migrated entries from `asset_universe.csv`, but Row Level Security (RLS) policies prevent the anonymous client from reading them.

| Table | Actual Rows | Client Sees | Cause |
|-------|-------------|-------------|-------|
| `assets` | ~1,100 | 0 | RLS policy blocks `anon` role |
| `listings` | ~2,000 | 0 | RLS policy blocks `anon` role |

**Implication:** Phase 0 is not "populate the Hive" but **"unlock the Hive."**

The fix: Create `SECURITY DEFINER` RPC functions that bypass RLS, allowing the anonymous client to read data through controlled endpoints.

---

## Validation Results (2025-12-24)

| Test | Component | Result | Implication |
|------|-----------|--------|-------------|
| **A1** | **ISINResolver** | ⚠️ **False Positive** | Resolved NVDA via `universe_ticker`. The legacy CSV is still active. |
| **A2** | **Legacy CSV** | ❌ **Exists** | Found at `config/asset_universe.csv` (1104 entries). It is NOT dead. |
| **A3** | **API Fallback** | ⚠️ **Blocked** | AAPL resolved via CSV, preventing API test. |
| **A4** | **Hive Holdings** | ⚠️ **RLS Blocked** | `etf_holdings` appears empty due to RLS. |
| **A5** | **Hive Listings** | ⚠️ **RLS Blocked** | `listings` appears empty due to RLS (~2,000 actual rows). |
| **A6** | **Hive Client** | ❌ **Write-Only** | Confirmed no read methods for listings. |
| **A8** | **Decomposer** | ❌ **Unwired** | Confirmed no resolution logic. |

**Key Insight:** The system works today *only* because of the deprecated CSV. The Hive has data but RLS blocks access. Phase 0 must unlock RLS before any other work.

---

## Critical Flaws Identified

### Flaw 1: Decomposer Bypasses Resolution

The Decomposer fetches adapter data and passes it through without calling ISINResolver.

```
CURRENT:  Adapter → Decomposer → Enricher (fails - no ISIN)
REQUIRED: Adapter → Decomposer → ISINResolver → Enricher (works)
```

### Flaw 2: HiveClient is Write-Only for Listings

| Method | Exists | Direction |
|--------|--------|-----------|
| `contribute_listing()` | ✅ | Write |
| `resolve_ticker()` | ❌ | Read (MISSING) |
| `batch_resolve_tickers()` | ❌ | Read (MISSING) |
| `lookup_by_alias()` | ❌ | Read (MISSING) |

**Impact:** Community Brain is dead - users can contribute but cannot query.

### Flaw 3: ISINResolver Depends on Deprecated CSV

The `AssetUniverse` class loads `asset_universe.csv` for all local lookups. This file is deprecated and must be replaced with Hive queries.

### Flaw 4: No Bidirectional Sync

When ISINResolver resolves a ticker via API, it does NOT push the result to Hive. Every user re-resolves the same tickers independently.

---

## Implementation Plan

### Phase Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                     PHASE DEPENDENCY GRAPH                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Phase 0 (Schema/RLS)                                      │
│        │                                                    │
│        ├──────────────────────┐                             │
│        ▼                      ▼                             │
│   Phase 1 (HiveClient)   Phase 2 (LocalCache)              │
│        │                      │  (can run in parallel)      │
│        └──────────┬───────────┘                             │
│                   ▼                                         │
│           Phase 3 (ISINResolver)                            │
│                   │                                         │
│                   ▼                                         │
│           Phase 4 (Decomposer Wiring)                       │
│                   │                                         │
│                   ▼                                         │
│           Phase 5 (Cleanup)                                 │
│           ⚠️ Only after production verification             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Blocking Dependencies:**
- Phase 1 requires Phase 0 (can't read without RLS fix)
- Phase 3 requires Phase 1 (can't resolve without client)
- Phase 4 requires Phase 3 (can't wire without resolver)
- Phase 5 requires Phase 4 verified in production

---

### Phase 0: Unlock Database + Schema Extension
**Objective:** Make existing data readable + add `aliases` table.

**Migrations:**
- `20251224_add_aliases.sql` - Create `aliases` table
- `20251224_add_resolution_rpc.sql` - Add read RPCs with `SECURITY DEFINER`

**Tasks:**
1. Audit current RLS policies on `assets`, `listings` tables
2. Create `resolve_ticker_rpc(ticker, exchange)` function with `SECURITY DEFINER`
3. Create `batch_resolve_tickers_rpc(tickers)` function with `SECURITY DEFINER`
4. Create `lookup_alias_rpc(alias)` function with `SECURITY DEFINER`
5. Add `aliases` table migration
6. Add `contribute_alias()` RPC
7. **Verify:** Client should now see ~1,100 entries via RPC

**Testing Requirements:**
- [ ] RPC returns data (not 0 rows)
- [ ] Known ticker (e.g., "AAPL") resolves to correct ISIN
- [ ] Batch query returns multiple results
- [ ] Alias lookup works for known aliases

---

### Phase 1: HiveClient Upgrade
**Objective:** Add read capability for resolution.

**Tasks:**
1. Add `resolve_ticker(ticker, exchange)` - calls `resolve_ticker_rpc`
2. Add `batch_resolve_tickers(tickers)` - calls `batch_resolve_tickers_rpc`
3. Add `lookup_by_alias(alias)` - calls `lookup_alias_rpc`
4. Add `sync_identity_domain()` - pull to local cache

**Testing Requirements:**
- [ ] Unit tests for each new method (mock Supabase client)
- [ ] Integration test: resolve known ticker
- [ ] Integration test: batch resolve 10 tickers
- [ ] Error handling: graceful failure when Hive unreachable

---

### Phase 2: Local Cache Infrastructure (Parallel with Phase 1)
**Objective:** Enable offline operation.

**Tasks:**
1. Create local SQLite database schema (mirror Hive identity domain)
2. Implement `LocalCache` class with CRUD operations
3. Add sync logic (pull from Hive, update local)
4. Add sync triggers (startup, new purchase)
5. All lookups go to local cache first

**Testing Requirements:**
- [ ] Unit tests for LocalCache CRUD
- [ ] Test: cache miss triggers Hive lookup
- [ ] Test: cache hit returns immediately
- [ ] Test: stale cache (>24h) triggers sync

---

### Phase 3: ISINResolver Refactor
**Objective:** Replace CSV with Hive + API (behind feature flag).

**Tasks:**
1. Add `USE_LEGACY_CSV` feature flag (default: `True`)
2. When flag is `False`:
   - **Replace:** `AssetUniverse` lookups with `HiveClient` + `LocalCache`
   - **Add:** Alias lookup via `HiveClient`
   - **Add:** Push-to-Hive on API resolution success
3. **Update resolution chain:**
   ```
   1. Provider ISIN (if valid)
   2. Manual enrichments
   3. Local cache (backed by Hive sync)
   4. API fallbacks (Finnhub → Wikidata → YFinance)
   5. On success → contribute_listing() + contribute_alias()
   ```

**Testing Requirements:**
- [ ] Unit tests for ISINResolver (mock HiveClient)
- [ ] Test: resolution with flag=True uses CSV
- [ ] Test: resolution with flag=False uses Hive
- [ ] Test: API fallback triggers on cache miss
- [ ] Test: successful API resolution pushes to Hive

---

### Phase 4: Decomposer Wiring
**Objective:** Stop passing raw tickers to Enricher.

**Tasks:**
1. Inject `ISINResolver` into `Decomposer`
2. After fetching from adapter, call `resolver.batch_resolve(holdings)`
3. Update DataFrame with resolved ISINs
4. Log resolution stats for gap analysis

**Testing Requirements:**
- [ ] Integration test: ETF decomposition resolves ISINs
- [ ] Test: unresolved holdings logged with reason
- [ ] Test: resolution stats include hit/miss counts

---

### Phase 5: Cleanup
**Objective:** Remove deprecated code. **Only after production verification.**

**Prerequisites:**
- [ ] Phase 4 deployed to production
- [ ] `USE_LEGACY_CSV=False` running successfully for 1+ week
- [ ] No rollbacks required

**Tasks:**
1. Delete `AssetUniverse` class from `resolution.py`
2. Remove `asset_universe.csv` from `migration.py`
3. Remove `_sync_asset_universe()` from `community_sync.py`
4. Remove `USE_LEGACY_CSV` feature flag
5. Update error messages referencing CSV
6. Optionally remove `ASSET_UNIVERSE_PATH` from `config.py`
7. Delete `config/asset_universe.csv` file

---

## Performance Strategy

### Tiered Resolution (Option A - Selected)

Only resolve holdings above weight threshold via API to avoid rate limits.

```python
class ISINResolver:
    def __init__(self, tier1_threshold: float = 0.5):
        """
        tier1_threshold: Minimum weight (%) to attempt API resolution.
        Holdings below this threshold are skipped (marked unresolved).
        """
```

**Rationale:**
- Top 80% of ETF weight is typically ~100-200 holdings
- Remaining 20% is 1000+ micro-holdings
- Resolving micro-holdings via API is slow and low-value
- Users can manually resolve important micro-holdings

### Batch Operations

| Operation | Batch Size | Rate Limit |
|-----------|------------|------------|
| Hive query | 100 tickers | None (our DB) |
| Finnhub API | 1 ticker | 60/min (free tier) |
| Wikidata API | 1 ticker | Be polite (1/sec) |

---

## Safety Mechanisms

### Feature Flag: `USE_LEGACY_CSV`

```python
# config.py
USE_LEGACY_CSV = True  # Default: use old system (safe)

# resolution.py
if USE_LEGACY_CSV:
    # Use AssetUniverse (CSV-based) - legacy path
    result = self._universe.lookup(ticker)
else:
    # Use HiveClient + LocalCache - new path
    result = self._hive_client.resolve_ticker(ticker, exchange)
```

**Rollout Strategy:**
1. Implement new system behind flag (flag=`True`, old system active)
2. Test new system with flag=`False` in development
3. Deploy with flag=`True` (no behavior change)
4. Flip flag to `False` in production after verification
5. Monitor for 1+ week
6. Remove flag and legacy code in Phase 5 (cleanup)

### Rollback Procedure

If Hive integration fails in production:

1. Set `USE_LEGACY_CSV = True` in config
2. Restart application
3. System reverts to CSV-based resolution immediately
4. Investigate and fix issue
5. Re-attempt rollout

**Rollback time:** < 1 minute (config change + restart)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **RLS blocks data** | `SECURITY DEFINER` RPCs bypass RLS safely. |
| **Hive unreachable** | Local cache serves all lookups. Sync when available. |
| **API rate limits** | Tiered resolution (skip micro-holdings). Delays between calls. |
| **Incorrect mappings** | Confidence scoring. Community can override. Manual enrichments. |
| **Large ETFs (1500+ holdings)** | Only resolve top 80% by weight. Background resolution for rest. |
| **New system breaks** | `USE_LEGACY_CSV` flag enables instant rollback. |

---

## Migration: `asset_universe.csv` → Hive

### Current CSV Structure (1,105 entries)

| Column | Hive Equivalent |
|--------|-----------------|
| `ISIN` | `assets.isin` |
| `Name` | `assets.name` |
| `Asset_Class` | `assets.asset_class` |
| `TR_Ticker` | `listings` row with `exchange='TR'` |
| `Yahoo_Ticker` | `listings` row with `exchange='YAHOO'` |
| `Aliases` | Multiple `aliases` rows |
| `Provider` | Not migrated (ETF-specific, low value) |
| `Source` | `contributions` table |
| `Added_Date` | `assets.created_at` |
| `Last_Verified` | `assets.updated_at` |

### Migration Status

**User confirmed:** Data already migrated to Hive. The CSV is a deprecated artifact.

**Action:** Remove CSV dependency from code, not migrate data.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-24 | **Hive scope: Identity + Compositions only** | Price data available from external APIs |
| 2025-12-24 | **Add `aliases` table** | Long-term solution for name variations |
| 2025-12-24 | **Same database for all domains** | Foreign key integrity between holdings and assets |
| 2025-12-24 | **Local SQLite cache** | Offline support, reduce Hive load |
| 2025-12-24 | **Selective cache for holdings** | Only cache user's ETFs, not entire table |
| 2025-12-24 | **Tiered resolution (Option A)** | Performance: skip micro-holdings in API calls |
| 2025-12-24 | **Disable `asset_universe.csv`** | User directive. POC artifact must go. |
| 2025-12-24 | **Enable Bidirectional Sync** | Hive has data; users can contribute more. |
| 2025-12-24 | **Strict FKs Remain** | We will not relax database schemas; we fix the data instead. |
| 2025-12-24 | **RLS fix via SECURITY DEFINER** | Bypass RLS through controlled RPC endpoints, not policy changes. |
| 2025-12-24 | **Feature flag for rollout** | `USE_LEGACY_CSV` enables safe, reversible migration. |
| 2025-12-24 | **Exchange codes: Best Effort** | No strict MIC enforcement initially; normalize where possible. |

---

## Files to Modify

| File | Changes |
|------|---------|
| `infrastructure/supabase/schema.sql` | Add `aliases` table |
| `infrastructure/supabase/functions.sql` | Add `contribute_alias()` RPC |
| `data/hive_client.py` | Add read methods, sync logic |
| `data/resolution.py` | Remove `AssetUniverse`, add Hive integration |
| `data/local_cache.py` | NEW - Local SQLite cache |
| `core/services/decomposer.py` | Wire ISINResolver |
| `core/migration.py` | Remove CSV from migration |
| `data/community_sync.py` | Remove `_sync_asset_universe()` |
| `config.py` | Optionally remove `ASSET_UNIVERSE_PATH` |

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Resolution rate (top 80% by weight) | >95% |
| Offline functionality | Works with 24h stale cache |
| API calls per ETF decomposition | <50 (after Hive populated) |
| Time to resolve 200 holdings | <30 seconds |
| Hive contribution rate | 100% of API resolutions pushed |
