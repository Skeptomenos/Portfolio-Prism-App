# Identity Resolution Schema Implementation Plan

> **Purpose:** Step-by-step implementation guide to close the schema gap between identity resolution requirements and current database state.
> **Status:** Implemented
> **Created:** 2025-12-27
> **Related:**
> - `keystone/specs/identity_resolution.md` (requirements)
> - `keystone/architecture/identity-resolution.md` (component design)
> - `keystone/architecture/hive-database-schema.md` (Hive schema)
> - `keystone/specs/data_schema.md` (local SQLite schema)

---

## 1. Executive Summary

This document provides the complete implementation plan for closing the schema gap identified in the identity resolution gap analysis. The work is divided into 4 phases:

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | Local SQLite schema update | 30 min |
| Phase 2 | Supabase schema migration | 30 min |
| Phase 3 | RPC function updates | 45 min |
| Phase 4 | Documentation sync & verification | 15 min |

**Total estimated effort:** ~2 hours

---

## 2. Current State vs Target State

### 2.1 Local SQLite (`src-tauri/python/portfolio_src/data/schema.sql`)

| Table | Current | Target |
|-------|---------|--------|
| `isin_cache` | Does not exist | Create new table |

### 2.2 Supabase `aliases` Table

| Column | Current | Target |
|--------|---------|--------|
| `id` | ✅ UUID PK | No change |
| `alias` | ✅ VARCHAR(100) | No change |
| `isin` | ✅ FK to assets | No change |
| `alias_type` | ✅ VARCHAR(20) | No change |
| `language` | ✅ VARCHAR(5) | No change |
| `contributor_count` | ✅ INTEGER | No change |
| `created_at` | ✅ TIMESTAMP | No change |
| `source` | ❌ Missing | Add VARCHAR(30) DEFAULT 'user' |
| `confidence` | ❌ Missing | Add DECIMAL(3,2) DEFAULT 0.80 |
| `currency` | ❌ Missing | Add VARCHAR(3) |
| `exchange` | ❌ Missing | Add VARCHAR(10) |
| `currency_source` | ❌ Missing | Add VARCHAR(20) CHECK IN ('explicit', 'inferred') |
| `contributor_hash` | ❌ Missing | Add VARCHAR(64) |

### 2.3 Supabase `assets` Table

| Column | Current | Target |
|--------|---------|--------|
| `sector` | ❌ Missing | Add VARCHAR(50) |
| `geography` | ❌ Missing | Add VARCHAR(50) |

### 2.4 Supabase RPC Functions

| Function | Current | Target |
|----------|---------|--------|
| `lookup_alias_rpc` | Returns 5 columns | Return 9 columns (add source, confidence, currency, exchange) |
| `contribute_alias` | Accepts 4 params | Accept 10 params (add source, confidence, currency, exchange, currency_source, contributor_hash) |

---

## 3. Phase 1: Local SQLite Schema Update

### 3.1 File to Modify

`src-tauri/python/portfolio_src/data/schema.sql`

### 3.2 SQL to Add

Add after the `settings` table definition (before DEFAULT DATA section):

```sql
-- =============================================================================
-- ISIN_CACHE: Local cache for resolved aliases (identity resolution)
-- =============================================================================
CREATE TABLE IF NOT EXISTS isin_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL,                    -- Normalized identifier (ticker or name)
    alias_type TEXT NOT NULL CHECK (alias_type IN ('ticker', 'name')),
    isin TEXT,                              -- Resolved ISIN (NULL for negative cache)
    confidence REAL NOT NULL,               -- Resolution confidence 0.0-1.0
    source TEXT NOT NULL,                   -- Resolution source
    resolution_status TEXT NOT NULL DEFAULT 'resolved' 
        CHECK (resolution_status IN ('resolved', 'unresolved', 'pending')),
    expires_at DATETIME,                    -- TTL for negative cache (NULL = never)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(alias, alias_type)
);

-- Index for fast alias lookup
CREATE INDEX IF NOT EXISTS idx_isin_cache_alias ON isin_cache(alias);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_isin_cache_expires ON isin_cache(expires_at);
```

### 3.3 Verification

After adding, verify with:
```bash
cd src-tauri/python
sqlite3 :memory: < portfolio_src/data/schema.sql
# Should complete without errors
```

---

## 4. Phase 2: Supabase Schema Migration

### 4.1 File to Create

`supabase/migrations/20251227_identity_resolution_schema.sql`

### 4.2 Migration SQL

```sql
-- Migration: Identity Resolution Schema Updates
-- Date: 2025-12-27
-- Purpose: Add columns to aliases and assets tables for identity resolution

-- =============================================================================
-- 1. ALTER aliases TABLE
-- =============================================================================

-- Add source column (where the alias came from)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'user';

-- Add confidence column (resolution confidence score)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS confidence DECIMAL(3, 2) DEFAULT 0.80;

-- Add currency column (trading currency for this alias, ISO 4217)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

-- Add check constraint for currency (must be 3 chars if set)
ALTER TABLE public.aliases 
    ADD CONSTRAINT chk_currency_length 
    CHECK (currency IS NULL OR LENGTH(currency) = 3);

-- Add exchange column (exchange code for this alias)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS exchange VARCHAR(10);

-- Add currency_source column (how currency was determined)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS currency_source VARCHAR(20);

-- Add contributor_hash column (anonymous contributor ID)
ALTER TABLE public.aliases 
    ADD COLUMN IF NOT EXISTS contributor_hash VARCHAR(64);

-- Add check constraint for currency_source
ALTER TABLE public.aliases 
    ADD CONSTRAINT chk_currency_source 
    CHECK (currency_source IS NULL OR currency_source IN ('explicit', 'inferred'));

-- Add check constraint for confidence
ALTER TABLE public.aliases 
    ADD CONSTRAINT chk_confidence 
    CHECK (confidence >= 0 AND confidence <= 1);

-- Add index for contributor tracking
CREATE INDEX IF NOT EXISTS idx_aliases_contributor ON public.aliases (contributor_hash);

-- =============================================================================
-- 2. ALTER assets TABLE
-- =============================================================================

-- Add sector column
ALTER TABLE public.assets 
    ADD COLUMN IF NOT EXISTS sector VARCHAR(50);

-- Add geography column
ALTER TABLE public.assets 
    ADD COLUMN IF NOT EXISTS geography VARCHAR(50);

-- =============================================================================
-- 3. COMMENTS
-- =============================================================================

COMMENT ON COLUMN public.aliases.source IS 'Resolution source: finnhub, wikidata, openfigi, user, seed';
COMMENT ON COLUMN public.aliases.confidence IS 'Resolution confidence score 0.0-1.0';
COMMENT ON COLUMN public.aliases.currency IS 'Trading currency for this alias (optional)';
COMMENT ON COLUMN public.aliases.exchange IS 'Exchange code for this alias (optional)';
COMMENT ON COLUMN public.aliases.currency_source IS 'How currency was determined: explicit or inferred';
COMMENT ON COLUMN public.aliases.contributor_hash IS 'SHA256 hash of anonymous contributor ID';
COMMENT ON COLUMN public.assets.sector IS 'GICS sector (e.g., Technology)';
COMMENT ON COLUMN public.assets.geography IS 'Primary geography (e.g., United States)';
```

### 4.3 Deployment

```bash
# Option 1: Via Supabase CLI
supabase db push

# Option 2: Via Supabase Dashboard
# Copy SQL and run in SQL Editor
```

---

## 5. Phase 3: RPC Function Updates

### 5.1 File to Create

`supabase/migrations/20251227_identity_resolution_rpcs.sql`

### 5.2 Updated `lookup_alias_rpc`

```sql
-- =============================================================================
-- FUNCTION: lookup_alias_rpc (Updated)
-- Purpose: Resolve alias to ISIN with full identity resolution metadata
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lookup_alias_rpc(
    p_alias VARCHAR
)
RETURNS TABLE (
    isin VARCHAR(12),
    name TEXT,
    asset_class VARCHAR(20),
    alias_type VARCHAR(20),
    contributor_count INTEGER,
    source VARCHAR(30),
    confidence DECIMAL(3, 2),
    currency VARCHAR(3),
    exchange VARCHAR(10)
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
        al.contributor_count,
        al.source,
        al.confidence,
        al.currency,
        al.exchange
    FROM public.aliases al
    JOIN public.assets a ON al.isin = a.isin
    WHERE UPPER(al.alias) = UPPER(p_alias)
    ORDER BY al.confidence DESC, al.contributor_count DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_alias_rpc(VARCHAR) TO anon;

COMMENT ON FUNCTION public.lookup_alias_rpc IS
    'Resolve alias to ISIN with full identity resolution metadata. Returns highest confidence match.';
```

### 5.3 Updated `contribute_alias`

```sql
-- =============================================================================
-- FUNCTION: contribute_alias (Updated)
-- Purpose: Add or update alias mapping with full identity resolution metadata
-- Note: CREATE OR REPLACE handles signature changes gracefully in PostgreSQL.
--       No DROP needed since we're the only client and deploy atomically.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contribute_alias(
    p_alias VARCHAR,
    p_isin VARCHAR,
    p_alias_type VARCHAR DEFAULT 'name',
    p_language VARCHAR DEFAULT NULL,
    p_source VARCHAR DEFAULT 'user',
    p_confidence DECIMAL DEFAULT 0.80,
    p_currency VARCHAR DEFAULT NULL,
    p_exchange VARCHAR DEFAULT NULL,
    p_currency_source VARCHAR DEFAULT NULL,
    p_contributor_hash VARCHAR DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.aliases (
        alias, 
        isin, 
        alias_type, 
        language, 
        contributor_count,
        source, 
        confidence, 
        currency, 
        exchange, 
        currency_source, 
        contributor_hash
    )
    VALUES (
        p_alias, 
        p_isin, 
        p_alias_type, 
        p_language, 
        1,
        p_source, 
        p_confidence, 
        p_currency, 
        p_exchange, 
        p_currency_source, 
        p_contributor_hash
    )
    ON CONFLICT (alias, isin) DO UPDATE
    SET 
        contributor_count = aliases.contributor_count + 1,
        -- Update confidence if new source is more reliable
        confidence = GREATEST(aliases.confidence, EXCLUDED.confidence),
        -- Update source if confidence improved
        source = CASE 
            WHEN EXCLUDED.confidence > aliases.confidence THEN EXCLUDED.source 
            ELSE aliases.source 
        END,
        -- Fill NULL currency/exchange if not already set
        currency = COALESCE(aliases.currency, EXCLUDED.currency),
        exchange = COALESCE(aliases.exchange, EXCLUDED.exchange),
        currency_source = COALESCE(aliases.currency_source, EXCLUDED.currency_source);

    RETURN QUERY SELECT TRUE, 'Alias contributed successfully.'::TEXT;

EXCEPTION
    WHEN foreign_key_violation THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES (
            'alias_rpc_error', 
            jsonb_build_object(
                'alias', p_alias, 
                'isin', p_isin,
                'source', p_source,
                'confidence', p_confidence
            ), 
            0.0,
            'ISIN does not exist in assets table.'
        );
        RETURN QUERY SELECT FALSE, 'ISIN does not exist in assets table.'::TEXT;
    WHEN OTHERS THEN
        INSERT INTO public.contributions (target_table, payload, trust_score, error_message)
        VALUES (
            'alias_rpc_error', 
            jsonb_build_object(
                'alias', p_alias, 
                'isin', p_isin,
                'source', p_source
            ), 
            0.0, 
            SQLERRM
        );
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$;

-- Grant execute to anon for the new signature
GRANT EXECUTE ON FUNCTION public.contribute_alias(
    VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR
) TO anon;

COMMENT ON FUNCTION public.contribute_alias IS
    'Add or update alias mapping with full identity resolution metadata. Increments contributor_count on conflict.';
```

### 5.4 Update `functions.sql` (Sync)

After deploying migrations, update `supabase/functions/functions.sql` to match the new function definitions for documentation purposes.

---

## 6. Phase 4: Documentation Sync & Verification

### 6.1 Files Already Updated

- ✅ `keystone/architecture/hive-database-schema.md` — Updated with new columns and RPC signatures
- ✅ `keystone/specs/data_schema.md` — Updated with `isin_cache` table

### 6.2 Files to Sync After Implementation

| File | Action |
|------|--------|
| `supabase/functions/functions.sql` | Update with new RPC definitions |
| `supabase/schema.sql` | Update base schema to reflect current state |

### 6.3 Verification Checklist

After implementation, verify:

- [ ] Local SQLite: `isin_cache` table created successfully
- [ ] Supabase: `aliases` table has all 6 new columns
- [ ] Supabase: `assets` table has `sector` and `geography` columns
- [ ] Supabase: `lookup_alias_rpc` returns 9 columns
- [ ] Supabase: `contribute_alias` accepts 10 parameters
- [ ] Python client: Can call new RPC functions without errors
- [ ] Existing data: No data loss from migrations

---

## 7. Implementation Order

Execute in this exact order to avoid dependency issues:

```
1. Phase 2: Supabase schema migration (20251227_identity_resolution_schema.sql)
   └── Adds columns to aliases and assets tables
   
2. Phase 3: Supabase RPC updates (20251227_identity_resolution_rpcs.sql)
   └── Updates function signatures to use new columns
   
3. Phase 1: Local SQLite schema update
   └── Adds isin_cache table
   
4. Phase 4: Documentation sync
   └── Update functions.sql and schema.sql
```

**Why this order?**
- Supabase schema must exist before RPC functions can reference new columns
- Local SQLite is independent and can be done anytime
- Documentation sync is last to capture final state

---

## 8. Rollback Plan

If issues occur, rollback in reverse order:

### 8.1 Rollback RPC Functions

```sql
-- Restore old contribute_alias signature
DROP FUNCTION IF EXISTS public.contribute_alias(
    VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR
);

-- Recreate old version (copy from 20251226_fix_contribute_alias_logging.sql)
```

### 8.2 Rollback Schema Changes

```sql
-- Remove new columns from aliases
ALTER TABLE public.aliases 
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS confidence,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS exchange,
    DROP COLUMN IF EXISTS currency_source,
    DROP COLUMN IF EXISTS contributor_hash;

-- Remove new columns from assets
ALTER TABLE public.assets 
    DROP COLUMN IF EXISTS sector,
    DROP COLUMN IF EXISTS geography;

-- Drop constraints
ALTER TABLE public.aliases DROP CONSTRAINT IF EXISTS chk_currency_source;
ALTER TABLE public.aliases DROP CONSTRAINT IF EXISTS chk_confidence;
ALTER TABLE public.aliases DROP CONSTRAINT IF EXISTS chk_currency_length;

-- Drop index
DROP INDEX IF EXISTS idx_aliases_contributor;
```

### 8.3 Rollback Local SQLite

```sql
DROP TABLE IF EXISTS isin_cache;
DROP INDEX IF EXISTS idx_isin_cache_alias;
DROP INDEX IF EXISTS idx_isin_cache_expires;
```

---

## 9. Testing Plan

### 9.1 Unit Tests

| Test | Description |
|------|-------------|
| `test_isin_cache_insert` | Insert and retrieve from local cache |
| `test_isin_cache_negative` | Negative cache entry with TTL |
| `test_lookup_alias_rpc` | Call RPC and verify all 9 columns returned |
| `test_contribute_alias_new` | Contribute new alias with all params |
| `test_contribute_alias_update` | Contribute existing alias, verify count increment |

### 9.2 Integration Tests

| Test | Description |
|------|-------------|
| `test_resolution_cascade` | Full resolution from local → Hive → API |
| `test_eager_contribution` | Verify API hit contributes to Hive |
| `test_offline_fallback` | Resolution works with Hive unavailable |

---

## 10. Success Criteria

| Criteria | Metric |
|----------|--------|
| Schema deployed | All columns exist in Supabase |
| RPC functions work | Can call from Python without errors |
| Backward compatible | Existing code continues to work |
| No data loss | Existing aliases preserved |
| Documentation accurate | Schema docs match reality |

---

## 11. Next Steps After Implementation

1. **Implement Python client updates** — Update `hive_client.py` to use new RPC parameters
2. **Implement ISINResolver** — Create resolver class using new cache table
3. **Seed Hive** — Pre-populate with S&P 500 and common aliases
4. **Wire into pipeline** — Integrate resolver into decomposition stage
