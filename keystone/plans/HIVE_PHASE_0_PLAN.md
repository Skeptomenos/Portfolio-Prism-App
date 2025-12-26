# Phase 0: Unlock Database + Schema Extension

**Workstream:** hive-extension
**Owner:** OptiPie
**Status:** Ready for Implementation
**Estimated Effort:** 2-3 hours

---

## Objective

Make existing Hive data readable by creating `SECURITY DEFINER` RPC functions that bypass RLS, and add the `aliases` table for name-based resolution.

## Prerequisites

- Supabase project access (dashboard or CLI)
- Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

---

## Task Breakdown

### HIVE-001: Audit Current RLS Policies

**Goal:** Document current RLS state to understand what we're bypassing.

**Steps:**
1. Open Supabase Dashboard → Authentication → Policies
2. Check policies on: `assets`, `listings`, `etf_holdings`, `provider_mappings`
3. Document in table below

**Expected Findings:**

| Table | SELECT Policy | INSERT Policy | Notes |
|-------|---------------|---------------|-------|
| `assets` | None (blocked) | Via RPC | RLS enabled, no anon SELECT |
| `listings` | None (blocked) | Via RPC | RLS enabled, no anon SELECT |
| `etf_holdings` | None (blocked) | Via RPC | RLS enabled, no anon SELECT |

**Deliverable:** Confirmation that RLS is blocking reads (not a data issue).

---

### HIVE-005: Add `aliases` Table Migration

**File:** `supabase/migrations/20251224_add_aliases.sql`

```sql
-- Migration: Add aliases table for name-based ISIN resolution
-- Date: 2025-12-24
-- Author: OptiPie

-- =============================================================================
-- ALIASES Table
-- =============================================================================
-- Maps name variations (aliases) to ISINs for fuzzy matching.
-- Example: "NVIDIA" -> US67066G1040, "NVIDIA Corp" -> US67066G1040

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

-- Index for case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases (UPPER(alias));

-- Index for ISIN reverse lookup
CREATE INDEX IF NOT EXISTS idx_aliases_isin ON aliases (isin);

COMMENT ON TABLE aliases IS 'Name variations mapping to ISINs for fuzzy resolution';
COMMENT ON COLUMN aliases.alias_type IS 'Type: name, abbreviation, local_name';
COMMENT ON COLUMN aliases.contributor_count IS 'Number of users who contributed this alias';
```

**Deployment:**
```bash
# Via Supabase CLI
supabase db push

# Or via Dashboard: SQL Editor → Run migration
```

---

### HIVE-002: Create `resolve_ticker_rpc` Function

**File:** `supabase/functions/functions.sql` (append)

```sql
-- =============================================================================
-- FUNCTION: resolve_ticker_rpc
-- Purpose: Resolve a single ticker+exchange to ISIN, bypassing RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_ticker_rpc(
    p_ticker VARCHAR,
    p_exchange VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    currency VARCHAR(3)
)
LANGUAGE plpgsql
SECURITY DEFINER  -- Bypasses RLS
STABLE            -- Read-only, cacheable
AS $$
BEGIN
    IF p_exchange IS NOT NULL AND p_exchange != '' THEN
        -- Exact match on ticker + exchange
        RETURN QUERY
        SELECT 
            l.isin,
            a.name,
            a.asset_class::VARCHAR(20),
            l.currency
        FROM public.listings l
        JOIN public.assets a ON l.isin = a.isin
        WHERE UPPER(l.ticker) = UPPER(p_ticker)
          AND UPPER(l.exchange) = UPPER(p_exchange)
        LIMIT 1;
    ELSE
        -- Match on ticker only (any exchange)
        RETURN QUERY
        SELECT 
            l.isin,
            a.name,
            a.asset_class::VARCHAR(20),
            l.currency
        FROM public.listings l
        JOIN public.assets a ON l.isin = a.isin
        WHERE UPPER(l.ticker) = UPPER(p_ticker)
        LIMIT 1;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_ticker_rpc(VARCHAR, VARCHAR) TO anon;

COMMENT ON FUNCTION public.resolve_ticker_rpc IS 
    'Resolve ticker to ISIN. SECURITY DEFINER bypasses RLS for read access.';
```

**Test Query:**
```sql
SELECT * FROM resolve_ticker_rpc('AAPL', NULL);
-- Expected: US0378331005, Apple Inc, Equity, USD
```

---

### HIVE-003: Create `batch_resolve_tickers_rpc` Function

**File:** `supabase/functions/functions.sql` (append)

```sql
-- =============================================================================
-- FUNCTION: batch_resolve_tickers_rpc
-- Purpose: Batch resolve multiple tickers to ISINs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.batch_resolve_tickers_rpc(
    p_tickers VARCHAR[]
)
RETURNS TABLE (
    ticker VARCHAR(30),
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    currency VARCHAR(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.ticker,
        l.isin,
        a.name,
        a.asset_class::VARCHAR(20),
        l.currency
    FROM public.listings l
    JOIN public.assets a ON l.isin = a.isin
    WHERE UPPER(l.ticker) = ANY(
        SELECT UPPER(t) FROM unnest(p_tickers) AS t
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_resolve_tickers_rpc(VARCHAR[]) TO anon;

COMMENT ON FUNCTION public.batch_resolve_tickers_rpc IS 
    'Batch resolve tickers to ISINs. Max recommended: 100 tickers per call.';
```

**Test Query:**
```sql
SELECT * FROM batch_resolve_tickers_rpc(ARRAY['AAPL', 'MSFT', 'NVDA']);
-- Expected: 3 rows with ISINs
```

---

### HIVE-004: Create `lookup_alias_rpc` Function

**File:** `supabase/functions/functions.sql` (append)

```sql
-- =============================================================================
-- FUNCTION: lookup_alias_rpc
-- Purpose: Resolve a name/alias to ISIN (case-insensitive).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lookup_alias_rpc(
    p_alias VARCHAR
)
RETURNS TABLE (
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    alias_type VARCHAR(20),
    contributor_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.isin,
        a.name,
        a.asset_class::VARCHAR(20),
        al.alias_type,
        al.contributor_count
    FROM public.aliases al
    JOIN public.assets a ON al.isin = a.isin
    WHERE UPPER(al.alias) = UPPER(p_alias)
    ORDER BY al.contributor_count DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_alias_rpc(VARCHAR) TO anon;

COMMENT ON FUNCTION public.lookup_alias_rpc IS 
    'Resolve name/alias to ISIN. Returns highest contributor_count match.';
```

---

### HIVE-006: Create `contribute_alias` RPC

**File:** `supabase/functions/functions.sql` (append)

```sql
-- =============================================================================
-- FUNCTION: contribute_alias
-- Purpose: Add or update an alias mapping.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contribute_alias(
    p_alias VARCHAR,
    p_isin VARCHAR,
    p_alias_type VARCHAR DEFAULT 'name',
    p_language VARCHAR DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Upsert: increment contributor_count if exists
    INSERT INTO public.aliases (alias, isin, alias_type, language, contributor_count)
    VALUES (p_alias, p_isin, p_alias_type, p_language, 1)
    ON CONFLICT (alias, isin) DO UPDATE
    SET contributor_count = aliases.contributor_count + 1;
    
    RETURN QUERY SELECT TRUE, 'Alias contributed successfully.'::TEXT;

EXCEPTION
    WHEN foreign_key_violation THEN
        RETURN QUERY SELECT FALSE, 'ISIN does not exist in assets table.'::TEXT;
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contribute_alias(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon;
```

---

### HIVE-007: Verify RLS Fix Works

**Test Script:** `scripts/test_hive_rpc.py`

```python
#!/usr/bin/env python3
"""Test script to verify Hive RPC functions work via anon client."""

import os
from dotenv import load_dotenv

load_dotenv()

def test_hive_rpcs():
    from supabase import create_client
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("❌ SUPABASE_URL or SUPABASE_ANON_KEY not set")
        return False
    
    client = create_client(url, key)
    all_passed = True
    
    # Test 1: Single ticker resolution
    print("\n=== Test 1: resolve_ticker_rpc ===")
    try:
        result = client.rpc("resolve_ticker_rpc", {"p_ticker": "AAPL"}).execute()
        if result.data and len(result.data) > 0:
            isin = result.data[0].get("isin")
            print(f"✅ AAPL -> {isin}")
            if isin != "US0378331005":
                print(f"⚠️  Expected US0378331005, got {isin}")
        else:
            print("❌ No data returned")
            all_passed = False
    except Exception as e:
        print(f"❌ Error: {e}")
        all_passed = False
    
    # Test 2: Batch resolution
    print("\n=== Test 2: batch_resolve_tickers_rpc ===")
    try:
        result = client.rpc(
            "batch_resolve_tickers_rpc", 
            {"p_tickers": ["AAPL", "MSFT", "NVDA"]}
        ).execute()
        if result.data:
            print(f"✅ Returned {len(result.data)} results")
            for row in result.data:
                print(f"   {row['ticker']} -> {row['isin']}")
        else:
            print("❌ No data returned")
            all_passed = False
    except Exception as e:
        print(f"❌ Error: {e}")
        all_passed = False
    
    # Test 3: Alias lookup (may be empty if aliases table is new)
    print("\n=== Test 3: lookup_alias_rpc ===")
    try:
        result = client.rpc("lookup_alias_rpc", {"p_alias": "Apple"}).execute()
        if result.data and len(result.data) > 0:
            print(f"✅ 'Apple' -> {result.data[0].get('isin')}")
        else:
            print("⚠️  No alias found (expected if aliases table is empty)")
    except Exception as e:
        print(f"❌ Error: {e}")
        all_passed = False
    
    # Test 4: Count accessible data
    print("\n=== Test 4: Data accessibility ===")
    try:
        # This should work via RPC even though direct SELECT is blocked
        result = client.rpc("batch_resolve_tickers_rpc", {"p_tickers": []}).execute()
        print("✅ RPC functions are accessible")
    except Exception as e:
        print(f"❌ RPC access failed: {e}")
        all_passed = False
    
    print("\n" + "=" * 40)
    if all_passed:
        print("✅ All tests passed! Phase 0 complete.")
    else:
        print("❌ Some tests failed. Check RPC deployment.")
    
    return all_passed

if __name__ == "__main__":
    test_hive_rpcs()
```

**Run:**
```bash
python scripts/test_hive_rpc.py
```

---

## Deployment Checklist

- [ ] Run HIVE-001: Audit RLS policies in Supabase dashboard
- [ ] Deploy HIVE-005: `aliases` table migration
- [ ] Deploy HIVE-002: `resolve_ticker_rpc` function
- [ ] Deploy HIVE-003: `batch_resolve_tickers_rpc` function
- [ ] Deploy HIVE-004: `lookup_alias_rpc` function
- [ ] Deploy HIVE-006: `contribute_alias` function
- [ ] Run HIVE-007: Verification script passes

## Rollback Plan

If RPCs cause issues:
```sql
-- Drop new functions (safe - no data loss)
DROP FUNCTION IF EXISTS public.resolve_ticker_rpc(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.batch_resolve_tickers_rpc(VARCHAR[]);
DROP FUNCTION IF EXISTS public.lookup_alias_rpc(VARCHAR);
DROP FUNCTION IF EXISTS public.contribute_alias(VARCHAR, VARCHAR, VARCHAR, VARCHAR);

-- Drop aliases table (only if empty)
DROP TABLE IF EXISTS public.aliases;
```

## Success Criteria

- [ ] `resolve_ticker_rpc('AAPL')` returns `US0378331005`
- [ ] `batch_resolve_tickers_rpc` returns multiple results
- [ ] `aliases` table exists and accepts inserts
- [ ] All operations work via anon client (no auth required)
