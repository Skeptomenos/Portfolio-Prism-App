# Plan: Hive Integration (Normalized Schema)

## Goal

Implement the new "Forever Database" schema (Assets + Listings) and update the Python client to use it seamlessly.

## 1. Database Setup (Supabase)

We need to create the tables and the helper RPC function.

- [ ] **Action**: Create `infrastructure/supabase/schema.sql`
- [ ] **Action**: User runs this SQL in Supabase "SQL Editor"
- [ ] **Action**: Enable Row Level Security (RLS) policies
  - Public: `SELECT` on everything
  - Authenticated: `EXECUTE` on `contribute_asset` function

## 2. Code Changes (`hive_client.py`)

The client needs to support the new normalized structure.

- [ ] **Action**: Update `AssetEntry` dataclass
  - Add: `wkn`, `currency`, `provider`, `ter`
- [ ] **Action**: Update `contribute()` method
  - **Old**: Upsert single row
  - **New**: Call `rpc('contribute_asset', params)`
- [ ] **Action**: Update `lookup()` method
  - **Old**: `select * from master_universe where isin=...`
  - **New**: `select * from listings join assets ... where isin=...` (Or create a database VIEW `master_view` for simpler querying)

## 3. App Connection

- [ ] **Action**: Configure Supabase Credentials
  1.  **Get Keys**: Go to Supabase > Project Settings > API.
      - Copy `Project URL`.
      - Copy `anon` public key.
  2.  **Configure App**: Update `hive_client.py` defaults or use build-time injection.
      - _Decision_: Hardcode `DEFAULT_SUPABASE_URL` and `DEFAULT_SUPABASE_KEY` in `hive_client.py`. These keys are safe to be public (restricted by RLS).

## 4. Data Migration

We need to seed the database with our existing knowledge base.

- [ ] **Action**: Create `scripts/migrate_csv.py`
  - **Source**: `data/config/asset_universe.csv`
  - **Logic**: Read CSV, parse ISIN/Ticker/Name, call `contribute_asset` RPC for each row.
  - **Note**: This will populate the initial `assets` and `listings` tables.

## Step-by-Step Workflow

1.  **SQL**: Generate `schema.sql`.
2.  **DB Init**: Run SQL in Supabase.
3.  **Config**: Get keys and update `hive_client.py`.
4.  **Code**: Refactor `hive_client.py`.
5.  **Seed**: Run `migrate_csv.py`.
6.  **Build**: Rebuild PyInstaller binary.
