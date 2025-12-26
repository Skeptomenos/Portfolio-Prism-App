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
| `sector` | text | GICS sector |
| `geography` | text | Primary geography |
| `enrichment_status` | text | "active", "stub", "pending" |
| `created_at` | timestamp | Auto-set |
| `updated_at` | timestamp | Auto-updated |

### 2.2 `listings` (The Quote)

Maps user input (Ticker) to Entity (ISIN). Solves currency/exchange ambiguity.

| Column | Type | Description |
|--------|------|-------------|
| `ticker` | text (PK) | Exchange ticker symbol |
| `exchange` | text (PK) | Exchange code (e.g., "XETRA", "NYSE") |
| `isin` | text (FK) | References `assets.isin` |
| `currency` | text | Trading currency (e.g., EUR) |
| `created_at` | timestamp | Auto-set |

### 2.3 `aliases` (Name Variations)

Long-term solution for name variations and fuzzy matching.

| Column | Type | Description |
|--------|------|-------------|
| `alias` | text (PK) | Alternative name/ticker |
| `isin` | text (FK) | References `assets.isin` |
| `source` | text | Where alias came from |
| `created_at` | timestamp | Auto-set |

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

| Function | Purpose | Parameters |
|----------|---------|------------|
| `contribute_asset` | Add/update asset | isin, name, sector, geography, etc. |
| `contribute_alias` | Add name alias | alias, isin, source |
| `contribute_holdings` | Bulk upload ETF holdings | etf_isin, holdings[] |
| `resolve_ticker` | Lookup ISIN by ticker | ticker, exchange? |
| `get_etf_holdings` | Get ETF composition | etf_isin |

---

## 4. Indexes

```sql
-- Primary lookups
CREATE INDEX idx_assets_name ON assets(name);
CREATE INDEX idx_listings_isin ON listings(isin);
CREATE INDEX idx_aliases_isin ON aliases(isin);

-- X-Ray queries
CREATE INDEX idx_holdings_etf ON etf_holdings(etf_isin);
CREATE INDEX idx_holdings_holding ON etf_holdings(holding_isin);

-- Provider resolution
CREATE INDEX idx_mappings_isin ON provider_mappings(isin);
```

---

## 5. Row-Level Security (RLS)

- **Read:** Public (anyone can query)
- **Write:** Via RPC functions only (`SECURITY DEFINER`)
- **Delete:** Admin only

This ensures data integrity while allowing community contributions.
