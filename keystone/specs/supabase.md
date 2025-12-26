# Supabase Specification

> **Version:** 1.0.0  
> **Last Updated:** 2025-12-26  
> **Project:** Portfolio Prism - Hive Database

---

## Overview

The Hive is a community-driven Supabase PostgreSQL database that enables crowdsourced ISIN resolution and ETF holdings data. It follows a "local-first, cloud-optional" philosophy where the app works offline but benefits from shared community data when connected.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Python Sidecar                           │
│                   (HiveClient)                              │
├─────────────────────────────────────────────────────────────┤
│                         │                                   │
│                         ▼                                   │
│              ┌─────────────────────┐                        │
│              │  Supabase Client    │                        │
│              │  (supabase-py)      │                        │
│              └─────────────────────┘                        │
│                         │                                   │
└─────────────────────────│───────────────────────────────────┘
                          │ HTTPS (anon key)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Cloud                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   assets    │  │  listings   │  │    etf_holdings     │  │
│  │   (ISIN)    │◄─┤  (ticker)   │  │   (composition)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                                    │              │
│         ▼                                    ▼              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   aliases   │  │  mappings   │  │   contributions     │  │
│  │   (names)   │  │ (providers) │  │   (audit log)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              RPC Functions (SECURITY DEFINER)           ││
│  │  • contribute_asset    • resolve_ticker_rpc             ││
│  │  • contribute_listing  • batch_resolve_tickers_rpc      ││
│  │  • contribute_alias    • lookup_alias_rpc               ││
│  │  • contribute_mapping  • get_all_*_rpc                  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
MVP/
├── supabase/                          # Supabase CLI project root (SINGLE SOURCE OF TRUTH)
│   ├── .branches/                     # CLI state
│   ├── .temp/                         # CLI cache
│   ├── schema.sql                     # Full schema reference
│   ├── functions/
│   │   └── functions.sql              # All RPC function definitions
│   └── migrations/                    # Versioned migrations (applied to DB)
│       ├── 20251224_add_aliases.sql
│       ├── 20251224_test_rpc.sql
│       └── 20251226_fix_contribute_alias_logging.sql
│
├── infrastructure/
│   └── cloudflare/                    # Cloudflare Workers only
│       ├── worker.js
│       └── wrangler.toml
```

### File Roles

| File | Role | When to Edit |
|------|------|--------------|
| `supabase/migrations/*.sql` | **Source of Truth** - Applied to remote DB | Always create new migration for changes |
| `supabase/schema.sql` | Reference - Full schema snapshot | Update after migrations for documentation |
| `supabase/functions/functions.sql` | Reference - All RPC functions | Update after function changes |

---

## Database Schema

### Tables

#### `assets` - Core Entity Table
```sql
CREATE TABLE assets (
    isin VARCHAR(12) PRIMARY KEY,           -- ISO 6166 identifier
    name TEXT NOT NULL,                      -- Display name
    wkn VARCHAR(12),                         -- German security ID
    asset_class asset_class_type NOT NULL,   -- Equity, ETF, Cash, Crypto, Bond, Fund
    base_currency VARCHAR(3) NOT NULL,       -- ISO 4217 (USD, EUR)
    enrichment_status asset_enrichment_status DEFAULT 'stub',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `listings` - Ticker Resolution
```sql
CREATE TABLE listings (
    ticker VARCHAR(30) NOT NULL,             -- Trading symbol
    exchange VARCHAR(10) NOT NULL,           -- Exchange code (XNAS, XNYS)
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin),
    currency VARCHAR(3) NOT NULL,            -- Trading currency
    PRIMARY KEY (ticker, exchange)
);
```

#### `aliases` - Name-based Resolution
```sql
CREATE TABLE aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alias VARCHAR(100) NOT NULL,             -- Name variation
    isin VARCHAR(12) NOT NULL REFERENCES assets(isin),
    alias_type VARCHAR(20) DEFAULT 'name',   -- name, abbreviation, local_name
    language VARCHAR(5),                     -- en, de, ja
    contributor_count INTEGER DEFAULT 1,     -- Crowdsource trust signal
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(alias, isin)
);
```

#### `etf_holdings` - ETF Composition
```sql
CREATE TABLE etf_holdings (
    etf_isin VARCHAR(12) NOT NULL REFERENCES assets(isin),
    holding_isin VARCHAR(12) NOT NULL REFERENCES assets(isin),
    weight DECIMAL(5, 4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    confidence_score DECIMAL(3, 2) DEFAULT 0.0,
    last_updated DATE NOT NULL,
    PRIMARY KEY (etf_isin, holding_isin)
);
```

#### `contributions` - Audit Log
```sql
CREATE TABLE contributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contributor_id UUID,                     -- Anonymous user ID
    target_table VARCHAR(30) NOT NULL,       -- assets, etf_holdings, alias_rpc_error
    payload JSONB NOT NULL,                  -- Submitted data
    trust_score DECIMAL(3, 2) DEFAULT 0.0,
    error_message TEXT,                      -- For error logging
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Enums

```sql
CREATE TYPE asset_enrichment_status AS ENUM ('active', 'stub');
CREATE TYPE asset_class_type AS ENUM ('Equity', 'ETF', 'Cash', 'Crypto', 'Bond', 'Fund');
```

---

## RPC Functions

All functions use `SECURITY DEFINER` to bypass Row Level Security (RLS) for anonymous access.

### Write Functions (Contributions)

| Function | Purpose | Parameters |
|----------|---------|------------|
| `contribute_asset` | Add/update asset + listing | isin, ticker, exchange, name, asset_class, base_currency, trading_currency |
| `contribute_listing` | Add secondary listing | isin, ticker, exchange, currency |
| `contribute_alias` | Add name→ISIN mapping | alias, isin, alias_type, language |
| `contribute_mapping` | Add provider mapping | isin, provider, provider_id |

### Read Functions (Resolution)

| Function | Purpose | Parameters |
|----------|---------|------------|
| `resolve_ticker_rpc` | Single ticker→ISIN | ticker, exchange (optional) |
| `batch_resolve_tickers_rpc` | Batch ticker→ISIN | tickers[] (max 100) |
| `lookup_alias_rpc` | Name→ISIN | alias |
| `get_all_assets_rpc` | Bulk sync | none |
| `get_all_listings_rpc` | Bulk sync | none |
| `get_all_aliases_rpc` | Bulk sync | none |

---

## Deployment Instructions

### Prerequisites

1. **Supabase CLI** installed: `brew install supabase/tap/supabase`
2. **Project linked**: `supabase link --project-ref <your-project-ref>`
3. **Logged in**: `supabase login`

### Pushing Migrations

```bash
# Navigate to project root
cd /Users/davidhelmus/Repos/portfolio-master/MVP

# Push pending migrations to remote database
supabase db push

# With auto-confirm (for CI/CD)
supabase db push --yes
```

### Creating New Migrations

```bash
# Option 1: Create empty migration file
supabase migration new <migration_name>
# Creates: supabase/migrations/<timestamp>_<migration_name>.sql

# Option 2: Create manually with date prefix
# File: supabase/migrations/YYYYMMDD_description.sql
```

### Migration File Format

```sql
-- Migration: <Brief description>
-- Date: YYYY-MM-DD
-- Author: <Name>

-- Your SQL here
CREATE TABLE IF NOT EXISTS ...;

-- For function updates, use CREATE OR REPLACE
CREATE OR REPLACE FUNCTION public.my_function(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    ...
END;
$$;

-- Don't forget grants for anon access
GRANT EXECUTE ON FUNCTION public.my_function(...) TO anon;
```

### Checking Migration Status

```bash
# List applied migrations
supabase migration list

# Check remote database status
supabase db diff
```

### Rolling Back (Manual)

Supabase doesn't have automatic rollback. Create a new migration to undo changes:

```sql
-- Migration: Rollback previous change
DROP FUNCTION IF EXISTS public.my_function;
-- or
ALTER TABLE ... DROP COLUMN ...;
```

---

## Local Development

### Starting Local Supabase

```bash
# Start local containers
supabase start

# Check status
supabase status

# Access local Studio
open http://127.0.0.1:54323
```

### Resetting Local Database

```bash
# Reset to clean state with all migrations
supabase db reset
```

### Testing SQL Locally

```bash
# Connect to local database
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Or use Studio SQL Editor
open http://127.0.0.1:54323
```

---

## Python Client Usage

### Configuration

```python
# Environment variables (in .env or system)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...your-anon-key
```

### HiveClient Location

```
src-tauri/python/portfolio_src/data/hive_client.py
```

### Example Usage

```python
from portfolio_src.data.hive_client import get_hive_client

client = get_hive_client()

# Resolve ticker to ISIN
result = client.resolve_ticker("AAPL", exchange="XNAS")
# Returns: {"isin": "US0378331005", "name": "Apple Inc", ...}

# Batch resolve
results = client.batch_resolve_tickers(["AAPL", "MSFT", "GOOGL"])

# Contribute new asset
client.contribute_asset(
    isin="US0378331005",
    ticker="AAPL",
    exchange="XNAS",
    name="Apple Inc",
    asset_class="Equity",
    base_currency="USD",
    trading_currency="USD"
)
```

---

## Security Model

### Row Level Security (RLS)

- **Enabled** on all tables
- **Bypass** via `SECURITY DEFINER` functions
- Anonymous users can only access data through RPC functions

### API Key Protection

- Supabase anon key is safe to embed (RLS protects data)
- Service role key **NEVER** in client code
- Cloudflare Worker proxies sensitive API calls (Finnhub, etc.)

---

## Troubleshooting

### "Permission denied" on table access

**Cause:** RLS is blocking direct table access.  
**Fix:** Use RPC functions instead of direct queries.

```python
# Wrong
client.table("assets").select("*").execute()

# Right
client.rpc("get_all_assets_rpc").execute()
```

### Migration fails with "already exists"

**Cause:** Object was created outside migrations.  
**Fix:** Add `IF NOT EXISTS` or `CREATE OR REPLACE`.

```sql
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE OR REPLACE FUNCTION my_function(...);
CREATE INDEX IF NOT EXISTS idx_name ON table (...);
```

### Function changes not taking effect

**Cause:** Functions need explicit migration, not just file edit.  
**Fix:** Create migration with `CREATE OR REPLACE FUNCTION`.

---

## Changelog

| Date | Migration | Description |
|------|-----------|-------------|
| 2025-12-24 | `20251224_add_aliases.sql` | Added aliases table for name-based resolution |
| 2025-12-26 | `20251226_fix_contribute_alias_logging.sql` | Added error logging to contribute_alias (BUG-003) |

---

## References

- [Supabase CLI Docs](https://supabase.com/docs/reference/cli)
- [PostgreSQL PL/pgSQL](https://www.postgresql.org/docs/current/plpgsql.html)
- `keystone/strategy/hive-architecture.md` - Architecture decisions
- `keystone/architecture/hive-database-schema.md` - Schema design rationale
