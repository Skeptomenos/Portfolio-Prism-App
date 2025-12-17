# Hive Activation Plan

**Status:** Ready to Execute
**Objective:** Activate the "Hive" (Supabase Community Database) to serve as the master source for ISIN resolution, asset metadata, and ETF look-through.
**Architecture:** Normalized Relational Schema (See `anamnesis/strategy/hive-architecture.md`)

## 1. Documentation & Strategy (Completed)

- [x] **Create Strategy ADR:** `anamnesis/strategy/hive-architecture.md`
- [x] **Update Schema Spec:** `anamnesis/specs/data_schema.md` (Added Section 3: Community Database)

## 2. Infrastructure Setup (Supabase)

**Goal:** Configure the cloud database with a normalized schema that supports community contributions while maintaining data integrity.

- [ ] **Generate Schema SQL** (`infrastructure/supabase/schema.sql`)
    - **Table: `assets`** (Master Entity)
        - `isin` (PK), `name`, `wkn`, `asset_class`, `base_currency`
        - `enrichment_status` (ENUM: 'active', 'stub')
    - **Table: `listings`** (Resolution Layer)
        - `ticker`, `exchange` (Composite PK)
        - `currency` (Trading Currency)
        - `isin` (FK -> assets)
    - **Table: `etf_holdings`** (X-Ray Layer)
        - `etf_isin` (FK), `holding_isin` (FK)
        - `weight` (float), `last_updated` (date)
        - `confidence_score` (float)
    - **Table: `etf_history`** (Archival Layer)
        - `id` (PK), `etf_isin`, `created_at`
        - `holdings_json` (JSONB)
        - `contributor_id` (UUID)
    - **Table: `provider_mappings`** (Normalization Layer)
        - `provider` (e.g. 'Yahoo'), `provider_id` (e.g. 'APC.DE')
        - `isin` (FK)
    - **Table: `contributions`** (Audit Log)
        - `contributor_id`, `payload`, `trust_score`
    - **RPC Functions**
        - `contribute_asset`: Transactional upsert for assets/listings
        - `contribute_etf`: Handles stub creation, history archiving, and live update.

- [ ] **Apply Schema**
    - User runs SQL in Supabase Dashboard -> SQL Editor

- [ ] **Security Policies (RLS)**
    - Public (`anon`): `SELECT` access to all tables
    - Public (`anon`): `EXECUTE` access to `contribute_*` RPC functions

## 3. Client Configuration

**Goal:** Connect the Python sidecar to the Supabase instance.

- [ ] **Configuration Keys**
    - User obtains `SUPABASE_URL` and `SUPABASE_KEY` (anon public key)
    - Add to `.env` (Local Dev)
    - Add to `src-tauri/.env` (Production Build injection)

- [ ] **Update `hive_client.py`**
    - Ensure it reads from `os.getenv` or `python_dotenv` correctly
    - Update `contribute()` to use the new normalized RPC structure
    - Update `lookup()` to query the `listings` table instead of flat alias lookups

## 4. Data Migration (Seed the Hive)

**Goal:** Populate the empty cloud database with our existing local knowledge base (`asset_universe.csv`).

- [ ] **Create Migration Script** (`scripts/seed_hive.py`)
    - Source: `src-tauri/python/data/config/asset_universe.csv`
    - Logic:
        1. Parse CSV rows
        2. Normalize Currency (Split Base vs Trading currency if possible, else default)
        3. Call `contribute_asset` RPC for each row
    - Batching: Upload in chunks of 50 to avoid timeouts

- [ ] **Execute Migration**
    - Run script to seed initial ~2000 assets

## 5. Integration Verification

- [ ] **Verify Read:** App successfully resolves an ISIN (e.g., Apple) using Hive (network) instead of local CSV.
- [ ] **Verify Write:** App successfully queues a new contribution when a user fixes an unrecognized asset.
- [ ] **Verify X-Ray:** Query underlying holdings for a sample ETF.

## Execution Order
1. Generate SQL (`infrastructure/supabase/schema.sql`)
2. User applies SQL manually in Supabase
3. Configure Env Vars (`.env`)
4. Create & Run Seed Script (`scripts/seed_hive.py`)
