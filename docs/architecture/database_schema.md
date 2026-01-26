# HIVE Database Schema

> **Purpose:** Defines the persistent, relational structure for the community asset universe (The Hive).
> **Scope:** Schema for Supabase PostgreSQL.
> **Strategy:** See `keystone/strategy/hive-architecture.md` for strategic rationale.

---

## 1. High-Level Schema Architecture

The Hive separates **Asset Entity** (What is it?) from **Listing** (How do I buy it?) to handle multi-currency and multi-exchange data.

```
┌─────────────────────────────────────────────────────────────────┐
│                      HIVE DATABASE SCHEMA                       │
│               (Supabase Postgres - Community Data)              │
│                                                                 │
│  ┌───────────────────┐                                          │
│  │       ASSETS      │◄──────────────────────────────────────┐  │
│  │ (PK: isin)        │                                       │  │
│  │ name, base_curr   │                                       │  │
│  │ enrich_status     │                                       │  │
│  └─────────┬─────────┘                                       │  │
│            │                                                 │  │
│    ┌───────┴───────┬───────────────┬───────────────┐         │  │
│    ▼               ▼               ▼               ▼         │  │
│ ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐│  │
│ │ LISTINGS │ │PROV_MAPPINGS │ │ ETF_HOLDINGS │ │   ALIASES   ││  │
│ │(ticker,  │ │(provider,    │ │(etf_isin,    │ │(alias,      ││  │
│ │ exchange)│ │ provider_id) │ │ holding_isin)│ │ isin)       ││  │
│ └──────────┘ └──────────────┘ └──────────────┘ └─────────────┘│  │
│                                      │                        │  │
│                                      │ FK: holding_isin ──────┘  │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │   CONTRIBUTIONS   │  │    ETF_HISTORY    │                   │
│  │ (contributor_id)  │  │ (id, holdings_json)│                   │
│  │ payload, trust    │  │ etf_isin, created  │                   │
│  └───────────────────┘  └───────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Table Definitions

### 2.1 `assets` (The Entity)

The immutable anchor - properties inherent to the company/fund, not the market.

| Column | Type | Description |
|--------|------|-------------|
| `isin` | text (PK) | International Securities ID (e.g., US0378331005) |
| `name` | text | Display name (e.g., "Apple Inc.") |
| `wkn` | text | German securities ID |
| `asset_class` | text | "Equity", "ETF", "Bond", etc. |
| `base_currency` | text | Accounting currency (e.g., USD) |
| `sector` | text | GICS sector (e.g., "Technology") — *Added for identity resolution* |
| `geography` | text | Primary geography (e.g., "United States") — *Added for identity resolution* |
| `enrichment_status` | text | "active", "stub", "pending" |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

> **Note:** `sector` and `geography` are populated during identity resolution when external APIs (Finnhub, Wikidata) return metadata. See `keystone/specs/identity_resolution.md` Section 10.

### 2.2 `listings` (The Quote)

Maps user input (Ticker) to Entity (ISIN). Solves currency/exchange ambiguity.

| Column | Type | Description |
|--------|------|-------------|
| `ticker` | text (PK) | Exchange ticker symbol |
| `exchange` | text (PK) | Exchange code (e.g., "XETRA", "NYSE") |
| `isin` | text (FK) | References `assets.isin` |
| `currency` | text | Trading currency (e.g., EUR) |
| `created_at` | timestamp | Auto-set |

### 2.3 `aliases` (Name Variations & Identity Resolution)

Maps name variations, tickers, and other identifiers to canonical ISINs. Core table for identity resolution.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated UUID |
| `alias` | text | Alternative name/ticker (case-insensitive lookup via index) |
| `isin` | text (FK) | References `assets.isin` |
| `alias_type` | text | Type of alias: "name", "ticker", "abbreviation", "local_name" |
| `language` | text | Language code for localized names (e.g., "en", "de", "ja") |
| `source` | text | Resolution source: "finnhub", "wikidata", "openfigi", "user", "seed" |
| `confidence` | decimal(3,2) | Resolution confidence score 0.0-1.0 |
| `currency` | text | Trading currency for this alias (optional, e.g., "USD") |
| `exchange` | text | Exchange code for this alias (optional, e.g., "NASDAQ") |
| `currency_source` | text | How currency was determined: "explicit" or "inferred" |
| `contributor_hash` | text | SHA256 hash of anonymous contributor ID |
| `contributor_count` | integer | Number of unique contributors who corroborated this alias |
| `created_at` | timestamp | Auto-set |

**Constraints:**
- `UNIQUE(alias, isin)` — Same alias can map to same ISIN only once
- `CHECK(confidence >= 0 AND confidence <= 1)`
- `CHECK(currency_source IN ('explicit', 'inferred'))`

**Indexes:**
- `idx_aliases_lookup ON (UPPER(alias))` — Case-insensitive lookup
- `idx_aliases_isin ON (isin)` — Reverse lookup
- `idx_aliases_contributor ON (contributor_hash)` — Contributor tracking

> **See:** `keystone/specs/identity_resolution.md` for resolution cascade and confidence scoring.

### 2.4 `provider_mappings` (API Normalization)

Maps API-specific IDs to Entity.

| Column | Type | Description |
|--------|------|-------------|
| `provider` | text (PK) | API provider (e.g., "Yahoo", "Finnhub") |
| `provider_id` | text (PK) | Provider's ID (e.g., "APC.DE") |
| `isin` | text (FK) | References `assets.isin` |
| `created_at` | timestamp | Auto-set |

### 2.5 `etf_holdings` (The X-Ray)

Current ETF composition. Wiped and rewritten on update for live analytics.

| Column | Type | Description |
|--------|------|-------------|
| `etf_isin` | text (PK, FK) | ETF's ISIN |
| `holding_isin` | text (PK, FK) | Underlying asset's ISIN |
| `weight` | decimal | Weight 0.0-1.0 |
| `shares` | decimal | Number of shares (optional) |
| `confidence` | decimal | Data quality score 0.0-1.0 |
| `last_updated` | timestamp | When composition was fetched |

### 2.6 `etf_history` (Historical Log)

Immutable history for backtesting. JSON blobs, not normalized.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | Auto-increment |
| `etf_isin` | text (FK) | References `assets.isin` |
| `holdings_json` | jsonb | Full composition snapshot |
| `effective_date` | date | When composition was valid |
| `created_at` | timestamp | When record was created |

### 2.7 `contributions` (Audit Log)

Tracks who uploaded what for trust scoring.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | Auto-increment |
| `contributor_hash` | text | Anonymized user ID |
| `payload_type` | text | "asset", "holding", "alias" |
| `payload` | jsonb | What was contributed |
| `trust_score` | decimal | Contributor reliability |
| `created_at` | timestamp | Auto-set |

---

## 3. RPC Functions (SECURITY DEFINER)

All writes go through RPC functions to bypass RLS safely.

### 3.1 Write Functions

| Function | Purpose | Parameters |
|----------|---------|------------|
| `contribute_asset` | Add/update asset | isin, name, asset_class, base_currency, sector?, geography? |
| `contribute_alias` | Add/update alias mapping | alias, isin, alias_type?, language?, source?, confidence?, currency?, exchange?, currency_source?, contributor_hash? |
| `contribute_listing` | Add ticker/exchange listing | isin, ticker, exchange, currency |
| `contribute_mapping` | Add provider-specific ID | isin, provider, provider_id |

### 3.2 Read Functions

| Function | Purpose | Parameters |
|----------|---------|------------|
| `lookup_alias_rpc` | Resolve alias to ISIN | alias |
| `resolve_ticker_rpc` | Resolve ticker to ISIN | ticker, exchange? |
| `batch_resolve_tickers_rpc` | Batch resolve tickers | tickers[] |
| `get_etf_holdings_rpc` | Get ETF composition | etf_isin |
| `get_all_assets_rpc` | Fetch all assets | — |
| `get_all_listings_rpc` | Fetch all listings | — |
| `get_all_aliases_rpc` | Fetch all aliases | — |

### 3.3 `contribute_alias` Signature (Full)

```sql
contribute_alias(
    p_alias VARCHAR,              -- Required: The alias text
    p_isin VARCHAR,               -- Required: Target ISIN
    p_alias_type VARCHAR,         -- Default: 'name'
    p_language VARCHAR,           -- Default: NULL
    p_source VARCHAR,             -- Default: 'user'
    p_confidence DECIMAL,         -- Default: 0.80
    p_currency VARCHAR,           -- Default: NULL
    p_exchange VARCHAR,           -- Default: NULL
    p_currency_source VARCHAR,    -- Default: NULL
    p_contributor_hash VARCHAR    -- Default: NULL
) RETURNS TABLE (success BOOLEAN, error_message TEXT)
```

**Behavior:**
- On conflict `(alias, isin)`: Increment `contributor_count`, update `confidence` to max, fill NULL currency/exchange
- On FK violation: Log to `contributions` table, return error
- Returns success/error tuple

### 3.4 `lookup_alias_rpc` Return Type

```sql
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
```

**Ordering:** Results ordered by `confidence DESC, contributor_count DESC`, returns top 1.

---

## 4. Indexes

```sql
-- Primary lookups
CREATE INDEX idx_assets_name ON assets(name);
CREATE INDEX idx_assets_wkn ON assets(wkn);
CREATE INDEX idx_listings_isin ON listings(isin);

-- Alias resolution (identity resolution)
CREATE INDEX idx_aliases_lookup ON aliases(UPPER(alias));  -- Case-insensitive
CREATE INDEX idx_aliases_isin ON aliases(isin);
CREATE INDEX idx_aliases_contributor ON aliases(contributor_hash);

-- X-Ray queries
CREATE INDEX idx_holdings_etf ON etf_holdings(etf_isin);
CREATE INDEX idx_holdings_holding ON etf_holdings(holding_isin);

-- Provider resolution
CREATE INDEX idx_mappings_isin ON provider_mappings(isin);

-- History queries
CREATE INDEX idx_history_etf_isin ON etf_history(etf_isin);
```

---

## 5. Row-Level Security (RLS)

- **Read:** Public (anyone can query)
- **Write:** Via RPC functions only (`SECURITY DEFINER`)
- **Delete:** Admin only

This ensures data integrity while allowing community contributions.

---

## 6. Identity Resolution Integration

The `aliases` table is the core of identity resolution. See related documentation:

| Document | Purpose |
|----------|---------|
| `keystone/specs/identity_resolution.md` | Requirements, confidence scoring, resolution cascade |
| `keystone/strategy/identity-resolution.md` | Decision logic, per-provider strategy |
| `keystone/architecture/identity-resolution.md` | Component architecture, data flow |

### 6.1 Resolution Flow (Hive Participation)

```
Client Request (alias) 
    │
    ▼
┌─────────────────────────────┐
│   lookup_alias_rpc(alias)   │
│                             │
│   Returns: isin, confidence,│
│   source, currency, etc.    │
└─────────────────────────────┘
    │
    │ If MISS → Client tries external APIs
    │
    ▼
┌─────────────────────────────┐
│  contribute_alias(...)      │
│                             │
│  Eager contribution on      │
│  successful API resolution  │
└─────────────────────────────┘
```

### 6.2 Trust Model

| Source | Initial Confidence | Notes |
|--------|-------------------|-------|
| `seed` | 0.95 | Pre-populated authoritative data (S&P 500, etc.) |
| `openfigi` | 0.85 | Industry-standard symbology |
| `wikidata` | 0.80 | Community-maintained, high quality |
| `finnhub` | 0.75 | Commercial API, reliable |
| `user` | 0.70 | User contribution, requires corroboration |

**Corroboration:** Each unique `contributor_hash` increments `contributor_count`. Higher count = higher trust.
