# Unified Data Schema — Local Cache & Hive

> **Purpose:** Define the shared data schema for local SQLite cache and Supabase Hive.
> **Status:** Design (not yet implemented)
> **Created:** 2026-03-09
> **Related:**
> - `docs/specs/pipeline_definition_of_done.md` (pipeline success criteria)
> - `docs/specs/identity_resolution_details.md` (resolution cascade)
> - `docs/architecture/identity_resolution.md` (resolution architecture)
> - `docs/plans/2026-03-08-pipeline-stabilization-plan.md` (active work)

---

## 1. Design Goals

1. **Same schema in both stores** — identical tables in local SQLite and Hive PostgreSQL.
   Same queries, swap the connection. One repository class, two backends.
2. **ISIN-first** — every security identified by ISIN. Tickers and names are lookup keys, not identities.
3. **Variant-complete** — all known ticker variants and name variants stored per ISIN.
   Any lookup by any variant hits the same ISIN.
4. **Temporal analysis** — every pipeline run creates a complete snapshot.
   Users can compare exposure across months, track theme shifts, detect drift.
5. **Community-enriched** — every resolution and enrichment contributed to Hive.
   Each user makes the next user's experience faster.
6. **Future-proof** — schema supports deep portfolio analysis: sector/industry/theme breakdown,
   geographic diversification, market cap tiers, goal-based gap analysis.

---

## 2. Shared Schema

These tables are **identical** in local SQLite and Hive PostgreSQL.
The resolution logic uses the same queries against both, only the connection differs.

### 2.1 Securities — Core Identity

One row per security in the world. ISIN is the canonical, globally unique key.

```sql
CREATE TABLE securities (
  -- Primary identity
  isin             TEXT PRIMARY KEY,
  canonical_name   TEXT NOT NULL,

  -- Optional secondary identifiers (stored when available)
  figi             TEXT UNIQUE,             -- Bloomberg OpenFIGI (free, open, all asset classes)
  lei              TEXT,                    -- Legal Entity Identifier (company-level, not security-level)

  -- Classification (GICS hierarchy)
  asset_class      TEXT DEFAULT 'equity',   -- equity, etf, bond, reit, commodity, crypto, cash
  cfi_code         TEXT,                    -- ISO 10962 Classification of Financial Instruments
  sector           TEXT,                    -- GICS Level 1 (11 sectors): Technology, Healthcare, Energy
  industry_group   TEXT,                    -- GICS Level 2 (24 groups): Software & Services, Pharma
  industry         TEXT,                    -- GICS Level 3 (69 industries): Application Software, Biotech

  -- Geography
  geography        TEXT,                    -- Country of domicile: United States, Germany, Japan
  region           TEXT,                    -- Macro region: North America, Europe, Asia Pacific
  market_type      TEXT,                    -- developed, emerging, frontier

  -- Market characteristics
  currency         TEXT,                    -- Primary trading currency: USD, EUR, GBP
  market_cap_tier  TEXT,                    -- mega, large, mid, small, micro

  -- Timestamps
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why FIGI?** Free, open (Bloomberg-backed), covers all asset classes including crypto.
Modern alternative to ISIN for systems that need cross-asset identification.

**Why LEI?** Links securities to legal entities. Useful for: "Show me all securities
issued by Alphabet Inc" (GOOGL, GOOG, Alphabet bonds, etc.)

**Why three GICS levels?** Sector ("Technology") is too broad for theme analysis.
Industry ("Semiconductors") enables queries like "Am I in the AI chip supply chain?"

**Why `region` and `market_type`?** Different analysis dimensions:
- `geography` = "Where is the company domiciled?" (United States, Taiwan)
- `region` = "What macro region?" (North America, Asia Pacific)
- `market_type` = "Developed or emerging?" (portfolio risk analysis)

### 2.2 Ticker Mappings — Many Tickers per ISIN

A security can have many tickers across exchanges. NVIDIA is NVDA on NASDAQ,
NVD on Xetra, 6861 on Tokyo. All map to the same ISIN.

```sql
CREATE TABLE ticker_mappings (
  ticker           TEXT NOT NULL,
  exchange         TEXT DEFAULT 'UNKNOWN',  -- MIC code: XNAS, XLON, XETR, XJPX
  isin             TEXT NOT NULL REFERENCES securities(isin),
  trading_currency TEXT,                    -- Currency on this specific exchange
  confidence       REAL DEFAULT 0.90,
  source           TEXT DEFAULT 'unknown',  -- hive, provider, api_wikidata, manual, derived
  verified_at      TIMESTAMP,              -- When this mapping was last confirmed valid
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, exchange)
);

CREATE INDEX idx_ticker_isin ON ticker_mappings(isin);
```

**Variant storage:** When resolving `AZN.L → GB0009895292`, insert ALL variants:
```
(AZN,    XLON,    GB0009895292, GBP, 0.95, 'hive')
(AZN.L,  UNKNOWN, GB0009895292, GBP, 0.95, 'derived')
(AZN.LN, UNKNOWN, GB0009895292, GBP, 0.90, 'derived')
```
Any variant hits the lookup. No more 52% cache miss rate.

**Regional identifiers as tickers:**
- CUSIP: derivable from US ISINs (characters 3-11), no separate column needed
- SEDOL: stored as ticker with exchange='XLON'
- VALOR: stored as ticker with exchange='XSWX'

### 2.3 Name Mappings — Many Names per ISIN

Different ETF providers use different names for the same company.
iShares says "NVIDIA CORP", Vanguard says "NVIDIA Corporation", direct holding says "NVIDIA".

```sql
CREATE TABLE name_mappings (
  original_name    TEXT NOT NULL,            -- "NVIDIA CORP" as seen from provider
  normalized_name  TEXT NOT NULL,            -- "nvidia" (lowercase, stripped suffixes)
  isin             TEXT NOT NULL REFERENCES securities(isin),
  source           TEXT DEFAULT 'unknown',   -- ishares, amundi, direct, manual, wikidata
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (original_name, isin)
);

CREATE INDEX idx_name_normalized ON name_mappings(normalized_name);
```

**Normalization:** Uses `NameNormalizer` (already implemented in `data/normalizer.py`):
- Strip suffixes: Inc, Corp, Ltd, PLC, AG, SE, SA
- Lowercase
- Strip punctuation
- "NVIDIA CORP" → "nvidia", "NVIDIA Corporation" → "nvidia"

**This prevents the P-22 NVIDIA dedup issue** at the resolution layer,
not as a patch in the aggregator's groupby.

### 2.4 Thematic Tags — Many Themes per ISIN

Enables deep analysis: "Am I in the complete AI chain?"
A security can belong to multiple themes.

```sql
CREATE TABLE security_tags (
  isin             TEXT NOT NULL REFERENCES securities(isin),
  tag              TEXT NOT NULL,
  confidence       REAL DEFAULT 1.0,
  source           TEXT DEFAULT 'unknown',  -- gics_derived, wikidata, manual, hive
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (isin, tag)
);

CREATE INDEX idx_tags_tag ON security_tags(tag);
```

**Example tags for NVIDIA (US67066G1040):**
```
(US67066G1040, 'ai_infrastructure',  1.0, 'manual')
(US67066G1040, 'semiconductors',     1.0, 'gics_derived')
(US67066G1040, 'data_center',        0.8, 'wikidata')
(US67066G1040, 'gaming',             0.6, 'wikidata')
(US67066G1040, 'autonomous_driving', 0.5, 'manual')
```

**Tag sources:**
1. **GICS-derived** (automatic): industry "Semiconductors" → tag "semiconductors"
2. **Wikidata** (automatic): company categories → tags
3. **Manual** (user): "I consider TSMC part of my AI chain"
4. **Hive** (community): other users' tag contributions

### 2.5 ETF Compositions — What's Inside Each ETF

```sql
CREATE TABLE etf_compositions (
  etf_isin         TEXT NOT NULL,
  holding_ticker   TEXT NOT NULL,
  holding_name     TEXT,
  holding_isin     TEXT,                    -- NULL until resolved
  weight_pct       REAL NOT NULL,           -- Percentage weight within the ETF
  sector           TEXT,                    -- Sector from provider (if available)
  geography        TEXT,                    -- Country from provider (if available)
  source           TEXT DEFAULT 'unknown',  -- ishares, amundi, vaneck, manual
  source_date      DATE,                    -- When provider published this data
  contributed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (etf_isin, holding_ticker)
);
```

**Staleness:** `source_date` enables the 30-day freshness threshold.
If Hive data is older than 30 days, prefer adapter (fresh from provider).

---

## 3. Local-Only Tables

These tables exist only in the local SQLite database. Not shared with the Hive.

### 3.1 Pipeline Runs — Execution History

```sql
CREATE TABLE pipeline_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  portfolio_id     INTEGER,
  duration_ms      INTEGER,
  quality_score    REAL,
  is_trustworthy   BOOLEAN,
  etfs_processed   INTEGER,
  etfs_failed      INTEGER,
  resolution_rate  REAL,
  total_holdings   INTEGER,
  total_value      REAL,                    -- Portfolio total in EUR at this point
  positions_count  INTEGER,                 -- How many positions the user held
  etf_count        INTEGER                  -- How many were ETFs
);
```

### 3.2 True Exposure — The Foundation for All Analysis

Each pipeline run creates a **complete snapshot** of the user's true exposure.
This is the primary data source for all portfolio analysis features.

```sql
CREATE TABLE true_exposure (
  run_id           INTEGER NOT NULL REFERENCES pipeline_runs(id),
  isin             TEXT NOT NULL,
  name             TEXT,
  sector           TEXT,
  industry         TEXT,
  geography        TEXT,
  region           TEXT,
  market_cap_tier  TEXT,
  total_exposure   REAL,                    -- EUR value
  portfolio_pct    REAL,                    -- % of total portfolio
  source_count     INTEGER,                 -- How many ETFs + direct
  sources          TEXT,                    -- JSON: ["IE00B4L5Y983", "direct"]
  tags             TEXT,                    -- JSON: ["ai_infrastructure", "semiconductors"]
  PRIMARY KEY (run_id, isin)
);

CREATE INDEX idx_exposure_run ON true_exposure(run_id);
```

**Why `tags` is stored per snapshot:**
If we reclassify NVIDIA from "gaming" to "ai_infrastructure" in June,
the March snapshot must still show the original classification.
Tags are captured at snapshot time to prevent historical revision.

**Storage:** ~853 holdings × 52 runs/year = ~44,000 rows/year. SQLite handles millions.

### 3.3 Portfolio Goals — Target Allocations

Enables gap analysis: "Where am I vs where I want to be?"

```sql
CREATE TABLE portfolio_goals (
  dimension        TEXT NOT NULL,           -- 'sector', 'industry', 'region', 'market_type', 'theme'
  target_key       TEXT NOT NULL,           -- 'Technology', 'Europe', 'emerging', 'ai_chain'
  target_pct       REAL NOT NULL,           -- 30.0 = target 30% allocation
  PRIMARY KEY (dimension, target_key)
);
```

**Example goals:**
```
('sector',      'Technology',     35.0)   -- Target 35% in tech
('region',      'Europe',         25.0)   -- Target 25% in Europe
('market_type', 'emerging',       15.0)   -- Target 15% in emerging markets
('theme',       'ai_chain',       20.0)   -- Target 20% in AI value chain
```

### 3.4 Sync Metadata

```sql
CREATE TABLE sync_metadata (
  table_name       TEXT PRIMARY KEY,
  last_sync        TIMESTAMP,
  row_count        INTEGER
);
```

---

## 4. Hive-Only Tables

These tables exist only in Supabase PostgreSQL. Not in the local cache.

### 4.1 Contributions — Audit Trail

```sql
CREATE TABLE contributions (
  id               SERIAL PRIMARY KEY,
  contributor_hash TEXT NOT NULL,            -- Anonymous hash of contributor
  contribution_type TEXT NOT NULL,           -- security, ticker, name, composition, enrichment, tag
  isin             TEXT,
  data             JSONB,                    -- Contribution details
  contributed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Query Patterns

### 5.1 Resolution (identical for both stores)

```sql
-- Resolve by ticker (primary path)
SELECT s.isin, s.canonical_name, s.sector, s.geography, tm.confidence
FROM securities s
JOIN ticker_mappings tm ON s.isin = tm.isin
WHERE tm.ticker IN ('AZN.L', 'AZN', 'AZN.LN');

-- Resolve by name (fallback path)
SELECT s.isin, s.canonical_name, s.sector, s.geography
FROM securities s
JOIN name_mappings nm ON s.isin = nm.isin
WHERE nm.normalized_name = 'nvidia';

-- Batch resolution (1000 tickers in one query)
SELECT tm.ticker, s.isin, s.canonical_name, s.sector, s.geography
FROM securities s
JOIN ticker_mappings tm ON s.isin = tm.isin
WHERE tm.ticker IN (?, ?, ?, ...);
```

### 5.2 Temporal Analysis

```sql
-- Sector distribution over time (pie chart data)
SELECT
  pr.run_timestamp,
  te.sector,
  SUM(te.portfolio_pct) as sector_pct,
  SUM(te.total_exposure) as sector_value_eur
FROM true_exposure te
JOIN pipeline_runs pr ON te.run_id = pr.id
GROUP BY pr.run_timestamp, te.sector
ORDER BY pr.run_timestamp;

-- Theme exposure over time ("Am I growing my AI position?")
SELECT
  pr.run_timestamp,
  SUM(te.portfolio_pct) as theme_pct
FROM true_exposure te
JOIN pipeline_runs pr ON te.run_id = pr.id
WHERE te.tags LIKE '%"ai_infrastructure"%'
GROUP BY pr.run_timestamp;

-- What changed between two snapshots?
SELECT
  COALESCE(old.isin, new.isin) as isin,
  COALESCE(new.name, old.name) as name,
  old.portfolio_pct as old_pct,
  new.portfolio_pct as new_pct,
  ROUND(new.portfolio_pct - old.portfolio_pct, 2) as change_pct,
  CASE
    WHEN old.isin IS NULL THEN 'NEW'
    WHEN new.isin IS NULL THEN 'SOLD'
    ELSE 'CHANGED'
  END as status
FROM true_exposure old
FULL OUTER JOIN true_exposure new ON old.isin = new.isin
WHERE old.run_id = :old_run AND new.run_id = :new_run
ORDER BY ABS(COALESCE(new.portfolio_pct, 0) - COALESCE(old.portfolio_pct, 0)) DESC;
```

### 5.3 Goal-Based Analysis

```sql
-- Compare actual vs target allocation
SELECT
  g.dimension,
  g.target_key,
  g.target_pct as target,
  COALESCE(actual.pct, 0) as actual,
  ROUND(COALESCE(actual.pct, 0) - g.target_pct, 1) as gap
FROM portfolio_goals g
LEFT JOIN (
  SELECT sector as key, SUM(portfolio_pct) as pct
  FROM true_exposure
  WHERE run_id = (SELECT MAX(id) FROM pipeline_runs)
  GROUP BY sector
) actual ON g.target_key = actual.key
WHERE g.dimension = 'sector'
ORDER BY ABS(gap) DESC;
```

### 5.4 Theme Chain Analysis

```sql
-- "Am I in the complete AI chain?"
SELECT
  st.tag,
  COUNT(DISTINCT te.isin) as holdings,
  SUM(te.portfolio_pct) as exposure_pct,
  SUM(te.total_exposure) as exposure_eur,
  GROUP_CONCAT(te.name, ', ') as companies
FROM true_exposure te
JOIN security_tags st ON te.isin = st.isin
WHERE te.run_id = (SELECT MAX(id) FROM pipeline_runs)
  AND st.tag LIKE 'ai_%'
GROUP BY st.tag
ORDER BY exposure_pct DESC;
```

Result:
```
ai_infrastructure    8    18.2%   €7,560    NVIDIA, TSMC, ASML, ...
ai_applications      5    12.1%   €5,025    Microsoft, Alphabet, Meta, ...
ai_data_center       3     8.5%   €3,530    Equinix, Digital Realty, ...
ai_total            12    28.3%   €11,755   (deduplicated across sub-themes)
```

---

## 6. Migration Plan

### Phase 1: Schema Creation (local)
- Create new tables in local SQLite alongside existing `cache_*` tables
- Migrate data from `cache_assets` → `securities`
- Migrate data from `cache_listings` → `ticker_mappings`
- Add `name_mappings` (new, populated from pipeline runs)

### Phase 2: Pipeline Integration
- Update `ISINResolver` to query new tables
- Update `Decomposer` to write ticker/name variants
- Update `Enricher` to write sector/industry/geography
- Update pipeline report writer to create `true_exposure` snapshots

### Phase 3: Hive Migration
- Create matching tables in Supabase
- Update `HiveClient` to use new schema
- Migrate existing `assets`/`listings` data
- Remove Supabase 1000-row cap (increase PostgREST `max_rows`)

### Phase 4: Frontend Integration
- Update X-Ray views to show new fields (industry, tags)
- Add temporal analysis views (exposure over time)
- Add goal-based gap analysis dashboard
- Add theme chain visualization

---

## 7. Identifier Reference

| Identifier | Standard   | In Schema?           | Notes                                                |
|------------|------------|----------------------|------------------------------------------------------|
| **ISIN**   | ISO 6166   | `securities.isin` PK | Globally unique, our canonical key                   |
| **FIGI**   | Bloomberg  | `securities.figi`    | Free, open, all asset classes                        |
| **LEI**    | ISO 17442  | `securities.lei`     | Company-level (not security-level)                   |
| **CFI**    | ISO 10962  | `securities.cfi_code`| Instrument type classification                       |
| **Ticker** | Exchange   | `ticker_mappings`    | Many per ISIN, exchange-specific                     |
| **MIC**    | ISO 10383  | `ticker_mappings.exchange` | Market Identifier Code for exchange            |
| **CUSIP**  | US/Canada  | Derived from ISIN    | Characters 3-11 of US ISINs                          |
| **SEDOL**  | UK/Ireland | As ticker, XLON      | Stored as ticker with exchange='XLON'                |
| **VALOR**  | Switzerland| As ticker, XSWX      | Stored as ticker with exchange='XSWX'                |
| **RIC**    | Refinitiv  | Not stored           | Proprietary, license cost                            |
| **DTI**    | ISO 24165  | Not stored (defer)   | Crypto-specific, add when needed                     |
