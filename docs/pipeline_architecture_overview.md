# Portfolio Prism Pipeline - Architecture Overview

> **Last Updated:** January 2026  
> **Status:** Code Review Complete  
> **Scope:** Rigorous analysis of the 5-phase analytics pipeline

---

## Executive Summary

The Portfolio Prism analytics pipeline is a **5-phase data processing system** that transforms raw portfolio positions into a "True Exposure" report showing actual underlying asset allocation. The pipeline is well-architected with clear separation of concerns, but has several areas requiring attention.

**Key Metrics:**
- ~2,500 lines of core pipeline code
- 5 distinct processing phases
- 7-tier ISIN resolution strategy
- 4-tier ETF holdings resolution
- Multi-source enrichment with community contribution

---

## Table of Contents

1. [Pipeline Architecture Overview](#pipeline-architecture-overview)
2. [Phase 1: Data Loading](#phase-1-data-loading)
3. [Phase 2: ETF Decomposition](#phase-2-etf-decomposition)
4. [Phase 3: Enrichment](#phase-3-enrichment)
5. [Phase 4: Aggregation](#phase-4-aggregation)
6. [Phase 5: Reporting](#phase-5-reporting)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Performance Analysis](#performance-analysis)
9. [Issues & Recommendations](#issues--recommendations)

---

## Pipeline Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PIPELINE ORCHESTRATOR                          │
│                            (core/pipeline.py:Pipeline)                      │
│                                                                             │
│  Responsibilities:                                                          │
│  - Calls services in order                                                  │
│  - Emits progress via callback                                              │
│  - Collects errors into List[PipelineError]                                 │
│  - Writes outputs and error logs                                            │
│  - Contains NO business logic                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     │                                │                                │
     ▼                                ▼                                ▼
┌─────────┐    ┌─────────────┐    ┌─────────┐    ┌──────────┐    ┌─────────┐
│  LOAD   │───▶│  DECOMPOSE  │───▶│ ENRICH  │───▶│AGGREGATE │───▶│ REPORT  │
│ Phase 1 │    │   Phase 2   │    │ Phase 3 │    │ Phase 4  │    │ Phase 5 │
│         │    │             │    │         │    │          │    │         │
│ 0-15%   │    │   15-40%    │    │  40-60% │    │  60-85%  │    │ 85-100% │
└─────────┘    └─────────────┘    └─────────┘    └──────────┘    └─────────┘
     │                │                │                │                │
     ▼                ▼                ▼                ▼                ▼
  SQLite         HoldingsCache     HiveClient      Aggregator       CSV/JSON
  Database       + Adapters        + APIs          Service          Reports
```

### Service Dependencies

```
Pipeline
├── Decomposer
│   ├── HoldingsCache
│   │   ├── Local Cache (filesystem)
│   │   ├── Community Data (bundled)
│   │   └── AdapterRegistry
│   │       ├── ISharesAdapter
│   │       ├── VanguardAdapter
│   │       ├── VanEckAdapter
│   │       ├── XtrackersAdapter
│   │       └── AmundiAdapter
│   ├── HiveClient (Supabase)
│   └── ISINResolver
│       ├── LocalCache (SQLite)
│       ├── HiveClient
│       ├── ManualEnrichments
│       └── APIs (Wikidata, Finnhub, yFinance)
├── Enricher
│   └── HiveEnrichmentService
│       ├── LocalCache
│       ├── HiveClient
│       └── EnrichmentService (APIs)
└── Aggregator
    └── SchemaNormalizer
```

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `core/pipeline.py` | Orchestrator | 930 |
| `core/services/decomposer.py` | ETF decomposition | 392 |
| `core/services/enricher.py` | Metadata enrichment | 317 |
| `core/services/aggregator.py` | Exposure aggregation | 345 |
| `data/resolution.py` | ISIN resolution | 699 |
| `data/holdings_cache.py` | Holdings caching | 377 |
| `data/hive_client.py` | Community sync | 1029 |
| `core/utils.py` | Shared utilities | 433 |
| `core/errors.py` | Error types | 113 |

---

## Phase 1: Data Loading

### Entry Point

**File:** `core/pipeline.py` → `_load_portfolio()` (lines 463-475)

### Purpose

Load portfolio positions from SQLite database and split into direct holdings (stocks) and ETF positions for separate processing paths.

### Data Flow Diagram

```
SQLite Database (prism.db)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  get_positions(portfolio_id=1)                                              │
│  (data/database.py:200-224)                                                 │
│                                                                             │
│  SQL Query:                                                                 │
│  SELECT                                                                     │
│      p.portfolio_id,                                                        │
│      p.isin,                                                                │
│      p.quantity,                                                            │
│      p.cost_basis,                                                          │
│      p.current_price,                                                       │
│      p.updated_at,                                                          │
│      a.name,                                                                │
│      a.symbol,                                                              │
│      a.asset_class,                                                         │
│      a.sector,                                                              │
│      a.region                                                               │
│  FROM positions p                                                           │
│  LEFT JOIN assets a ON p.isin = a.isin                                      │
│  WHERE p.portfolio_id = ?                                                   │
│  ORDER BY (p.quantity * COALESCE(p.current_price, p.cost_basis, 0)) DESC    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Convert to DataFrame                                                       │
│  df = pd.DataFrame(positions)                                               │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Split by asset_class                                                       │
│                                                                             │
│  direct_positions = df[df["asset_class"].str.upper() != "ETF"].copy()       │
│  etf_positions = df[df["asset_class"].str.upper() == "ETF"].copy()          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   Tuple[pd.DataFrame, pd.DataFrame]
   (direct_positions, etf_positions)
```

### Input Schema (from SQLite)

| Column | Type | Source | Description |
|--------|------|--------|-------------|
| `portfolio_id` | int | positions.portfolio_id | Portfolio identifier |
| `isin` | str | positions.isin | ISIN identifier |
| `quantity` | float | positions.quantity | Number of shares/units |
| `cost_basis` | float | positions.cost_basis | Average purchase price |
| `current_price` | float | positions.current_price | Current market price |
| `updated_at` | datetime | positions.updated_at | Last update timestamp |
| `name` | str | assets.name | Asset name |
| `symbol` | str | assets.symbol | Trading symbol |
| `asset_class` | str | assets.asset_class | "ETF", "Stock", etc. |
| `sector` | str | assets.sector | Industry sector |
| `region` | str | assets.region | Geographic region |

### Output Schema

Two DataFrames with identical schema, split by `asset_class == "ETF"`:
- `direct_positions`: All non-ETF holdings (stocks, bonds, crypto, etc.)
- `etf_positions`: All ETF holdings (to be decomposed)

### Code Implementation

```python
def _load_portfolio(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
    from portfolio_src.data.database import get_positions

    positions = get_positions(portfolio_id=1)
    if not positions:
        return pd.DataFrame(), pd.DataFrame()

    df = pd.DataFrame(positions)

    direct = cast(pd.DataFrame, df[df["asset_class"].str.upper() != "ETF"].copy())
    etfs = cast(pd.DataFrame, df[df["asset_class"].str.upper() == "ETF"].copy())

    return direct, etfs
```

### Issues Identified

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **CRITICAL** | NaN Handling Bug | line 472-473 | `.str.upper()` fails on NaN values with `AttributeError`. Fix: Use `df["asset_class"].fillna("").str.upper()` |
| **MEDIUM** | No Schema Validation | line 463-475 | Assumes `asset_class` column exists. Should use `SchemaNormalizer.validate_schema()` |
| **LOW** | Hardcoded portfolio_id | line 466 | No multi-portfolio support despite schema allowing it |

---

## Phase 2: ETF Decomposition

### Entry Point

**File:** `core/services/decomposer.py` → `Decomposer.decompose()` (lines 32-130)

### Purpose

Break down ETF positions into their underlying holdings. Each ETF is "looked through" to reveal the actual securities it contains, enabling true exposure analysis.

### Data Flow Diagram

```
etf_positions: pd.DataFrame
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Schema Normalization & Validation                                          │
│                                                                             │
│  1. SchemaNormalizer.normalize_columns(etf_positions)                       │
│  2. SchemaNormalizer.validate_schema(["isin"])                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  For each ETF ISIN:                                                         │
│                                                                             │
│  _get_holdings(isin) → 4-Tier Holdings Resolution                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4-TIER HOLDINGS RESOLUTION                                                 │
│  (decomposer.py:132-238)                                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TIER 1: Local Cache (Instant, Offline)                              │    │
│  │ Location: data/working/etf_holdings_cache/{ISIN}.csv                │    │
│  │ TTL: 7 days                                                         │    │
│  │ Source: "cached"                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │ Miss                                             │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TIER 2: Hive Community (Pre-cached)                                 │    │
│  │ Method: HiveClient.get_etf_holdings(isin)                           │    │
│  │ Backend: Supabase RPC: get_etf_holdings_rpc                         │    │
│  │ Source: "hive"                                                      │    │
│  │ Action: Save to local cache on hit                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │ Miss                                             │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TIER 3: Provider Adapters (Scraping)                                │    │
│  │ Method: AdapterRegistry.get_adapter(isin).fetch_holdings(isin)      │    │
│  │ Adapters: IShares, Vanguard, VanEck, Xtrackers, Amundi              │    │
│  │ Source: "{adapter_name}_adapter"                                    │    │
│  │ Actions:                                                            │    │
│  │   - Save to local cache                                             │    │
│  │   - Contribute to Hive (if enabled)                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │ Miss                                             │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ TIER 4: Manual Upload (User Action Required)                        │    │
│  │ Location: data/inputs/manual_holdings/{ISIN}.csv                    │    │
│  │ Formats: .csv, .xlsx, .xls                                          │    │
│  │ Source: "manual_upload"                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │ Miss                                             │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ FAILURE: ManualUploadRequired Exception                             │    │
│  │ Error: PipelineError(phase=ETF_DECOMPOSITION, type=CACHE_MISS)      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ (on success)
┌─────────────────────────────────────────────────────────────────────────────┐
│  ISIN RESOLUTION FOR HOLDINGS                                               │
│  _resolve_holdings_isins(holdings, etf_isin)                                │
│  (decomposer.py:240-357)                                                    │
│                                                                             │
│  For each holding row without valid ISIN:                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ ISINResolver.resolve(ticker, name, provider_isin, weight, etf_isin) │    │
│  │                                                                     │    │
│  │ Resolution Priority:                                                │    │
│  │ 1. Provider-supplied ISIN (if valid)     → confidence: 1.00        │    │
│  │ 2. Manual enrichments (ticker mapping)   → confidence: 0.85        │    │
│  │ 3. LocalCache lookup (ticker/name)       → confidence: 0.95        │    │
│  │ 4. Hive network lookup                   → confidence: 0.90        │    │
│  │ 5. Wikidata SPARQL API                   → confidence: 0.80        │    │
│  │ 6. Finnhub API                           → confidence: 0.75        │    │
│  │ 7. yFinance                              → confidence: 0.70        │    │
│  │ 8. Mark as unresolved                    → confidence: 0.00        │    │
│  │                                                                     │    │
│  │ Tier 2 Skip: Holdings with weight <= 0.5% skip API resolution      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Adds columns to holdings DataFrame:                                        │
│  - resolution_status: "resolved" | "unresolved" | "skipped"                 │
│  - resolution_source: "provider" | "hive" | "api_finnhub" | etc.            │
│  - resolution_confidence: 0.0 - 1.0                                         │
│  - resolution_detail: Detailed resolution method                            │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   Dict[str, pd.DataFrame]
   {etf_isin: holdings_df, ...}
```

### Holdings DataFrame Schema (Output)

| Column | Type | Description | Source |
|--------|------|-------------|--------|
| `ticker` | str | Trading symbol (may be Yahoo-formatted) | Provider |
| `raw_ticker` | str | Original ticker from provider | Provider |
| `name` | str | Holding name | Provider |
| `weight_percentage` | float | Weight in ETF (0-100) | Provider |
| `isin` | str | Resolved ISIN (may be None) | Resolution |
| `resolution_status` | str | "resolved", "unresolved", "skipped" | Resolution |
| `resolution_source` | str | Source that provided ISIN | Resolution |
| `resolution_confidence` | float | 0.0-1.0 confidence score | Resolution |
| `resolution_detail` | str | Resolution method details | Resolution |

### ISIN Resolution Confidence Scores

| Priority | Source | Confidence | Description |
|----------|--------|------------|-------------|
| 1 | Provider-supplied | 1.00 | ISIN from ETF provider data |
| 2 | Local SQLite cache | 0.95 | Previously resolved, cached locally |
| 3 | Hive community | 0.90 | Community-contributed mapping |
| 4 | Manual enrichments | 0.85 | User-provided ticker→ISIN mapping |
| 5 | Wikidata SPARQL | 0.80 | Free, reliable, but limited coverage |
| 6 | Finnhub API | 0.75 | Rate-limited (60/min), good coverage |
| 7 | yFinance | 0.70 | Unreliable, last resort |

### Adapter Implementation Example (IShares)

```python
# adapters/ishares.py - Simplified flow

class ISharesAdapter:
    @cache_adapter_data(ttl_hours=24)
    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        # 1. Get product ID from config or auto-discover
        product_id = self._discover_product_id(isin)
        
        # 2. Construct download URL
        url = f"https://www.ishares.com/de/privatanleger/de/produkte/{product_id}/..."
        
        # 3. Download CSV
        response = requests.get(url, headers=headers, timeout=30)
        holdings_df = pd.read_csv(StringIO(response.text), skiprows=2)
        
        # 4. Normalize columns
        holdings_df.rename(columns={
            "Emittententicker": "ticker",
            "Name": "name",
            "Gewichtung (%)": "weight_percentage",
        }, inplace=True)
        
        # 5. Apply Yahoo Finance ticker suffixes
        holdings_df["ticker"] = holdings_df.apply(clean_and_suffix_ticker, axis=1)
        
        return holdings_df
```

### Issues Identified

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **HIGH** | Synchronous Hive Contribution | decomposer.py:197-202 | Contribution to Hive happens during decomposition, blocking pipeline if Hive is slow |
| **MEDIUM** | No Holdings Deduplication | decomposer.py | Same holding in multiple ETFs triggers duplicate enrichment API calls |
| **MEDIUM** | Tier Naming Confusion | resolution.py:185 | "Tier 1" = high weight, "Tier 2" = low weight - variable naming is inverted |
| **LOW** | Negative Weight Clipping | ishares.py:208-210 | Short positions clipped to 0, losing information |

---

## Phase 3: Enrichment

### Entry Point

**File:** `core/services/enricher.py` → `Enricher.enrich()` (lines 155-219)

### Purpose

Add sector, geography, and asset class metadata to holdings. This enables sector/geography breakdown analysis in the final report.

### Data Flow Diagram

```
holdings_map: Dict[str, pd.DataFrame]
direct_positions: pd.DataFrame
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  For each ETF's holdings DataFrame:                                         │
│                                                                             │
│  _enrich_holdings(holdings)                                                 │
│  (enricher.py:254-308)                                                      │
│                                                                             │
│  1. SchemaNormalizer.normalize_columns(holdings)                            │
│  2. SchemaNormalizer.validate_schema(["isin"])                              │
│  3. Add default columns if missing:                                         │
│     - sector = "Unknown"                                                    │
│     - geography = "Unknown"                                                 │
│     - asset_class = "Equity"                                                │
│  4. enrichment_service.get_metadata_batch(isins)                            │
│  5. Apply metadata to DataFrame rows                                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  HiveEnrichmentService.get_metadata_batch(isins)                            │
│  (enricher.py:44-144)                                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 1: LocalCache Lookup (Fast, Offline)                           │    │
│  │ Method: local_cache.get_asset(isin)                                 │    │
│  │ Returns: AssetEntry with name, asset_class                          │    │
│  │ Source: "hive" (cached from previous Hive sync)                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │ Miss                                             │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 2: HiveClient.batch_lookup(remaining_isins)                    │    │
│  │ Backend: Supabase query on assets table                             │    │
│  │ Returns: AssetEntry with name, asset_class, enrichment_status       │    │
│  │ Action: Unknown asset_class triggers local detection                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │ Miss                                             │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 3: Fallback API (EnrichmentService)                            │    │
│  │ APIs: Finnhub, yFinance                                             │    │
│  │ Returns: name, sector, asset_class                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                          │                                                  │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 4: Contribute New Discoveries to Hive                          │    │
│  │ Method: hive_client.batch_contribute(new_contributions)             │    │
│  │ Condition: Only if Hive contribution enabled in settings            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Also enrich direct positions:                                              │
│  enrich_positions(direct_positions)                                         │
│  (enricher.py:221-252)                                                      │
│                                                                             │
│  Same flow as holdings enrichment                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   Dict[str, pd.DataFrame]  # Enriched holdings
   pd.DataFrame             # Enriched direct positions
```

### Enriched DataFrame Schema (Output)

| Column | Type | Description | Added By |
|--------|------|-------------|----------|
| (all from Phase 2) | ... | ... | Phase 2 |
| `sector` | str | Industry sector (e.g., "Technology") | Enrichment |
| `geography` | str | Country/region (e.g., "United States") | Enrichment |
| `asset_class` | str | Asset type (e.g., "Equity", "Bond") | Enrichment |

### Enrichment Result Structure

```python
@dataclass
class EnrichmentResult:
    data: Dict[str, Dict[str, Any]]  # {isin: {name, sector, geography, asset_class}}
    sources: Dict[str, str]          # {isin: source_name}
    contributions: List[str]         # ISINs contributed to Hive this batch
```

### Issues Identified

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **HIGH** | Geography Always "Unknown" | enricher.py:68-69, 91-93 | Geography is hardcoded to "Unknown" in all code paths. Never populated from any source. |
| **MEDIUM** | Sector/Asset Class Conflation | enricher.py:66 | LocalCache returns `asset_class` as `sector`, conflating two different concepts |
| **MEDIUM** | No Rate Limiting | enricher.py:138-140 | `batch_contribute()` sends all assets at once, may hit Supabase limits |
| **LOW** | Duplicate Enrichment | enricher.py | Same ISIN in multiple ETFs gets enriched multiple times |

---

## Phase 4: Aggregation

### Entry Point

**File:** `core/services/aggregator.py` → `Aggregator.aggregate()` (lines 28-173)

### Purpose

Combine all exposures (direct holdings + ETF underlying holdings) into a single aggregated view. Same security appearing in multiple places is summed into one row.

### Data Flow Diagram

```
direct_positions: pd.DataFrame (enriched)
etf_positions: pd.DataFrame
holdings_map: Dict[str, pd.DataFrame] (enriched)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Input Validation                                                           │
│  (aggregator.py:49-81)                                                      │
│                                                                             │
│  - Validate direct_positions is DataFrame                                   │
│  - Validate etf_positions is DataFrame                                      │
│  - Validate holdings_map is dict                                            │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Calculate Total Portfolio Value                                            │
│  (utils.py:347-403)                                                         │
│                                                                             │
│  total_value = calculate_portfolio_total_value(direct, etf)                 │
│                                                                             │
│  For each DataFrame:                                                        │
│    If market_value column exists → sum(market_value)                        │
│    Else if price + quantity exist → sum(price * quantity)                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Process Direct Positions                                                   │
│  _process_direct_positions(direct_positions)                                │
│  (aggregator.py:175-241)                                                    │
│                                                                             │
│  For each direct holding:                                                   │
│    total_exposure = quantity * price (or market_value if available)         │
│                                                                             │
│  Output columns: isin, name, sector, geography, total_exposure              │
│                                                                             │
│  Value Calculation Priority:                                                │
│  1. market_value column (if exists)                                         │
│  2. quantity * price                                                        │
│  3. quantity * current_price                                                │
│  4. 0.0 (with warning)                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Process ETF Positions                                                      │
│  _process_etf_positions(etf_positions, holdings_map)                        │
│  (aggregator.py:243-344)                                                    │
│                                                                             │
│  For each ETF:                                                              │
│    etf_value = quantity * price                                             │
│                                                                             │
│    If holdings exist in holdings_map:                                       │
│      For each underlying holding:                                           │
│        total_exposure = etf_value * (weight_percentage / 100)               │
│                                                                             │
│    Else (no holdings data):                                                 │
│      Treat entire ETF as single exposure                                    │
│      sector = "ETF", geography = "Global"                                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Concatenate All Exposures                                                  │
│  combined = pd.concat([direct_exp, etf_exp], ignore_index=True)             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Aggregate by ISIN                                                          │
│  (aggregator.py:114-152)                                                    │
│                                                                             │
│  aggregated = combined.groupby("isin").agg({                                │
│      "name": "first",              # First occurrence wins                  │
│      "sector": "first",            # First occurrence wins                  │
│      "geography": "first",         # First occurrence wins                  │
│      "total_exposure": "sum",      # Sum all exposures                      │
│      "resolution_confidence": "max" # Highest confidence                    │
│  })                                                                         │
│                                                                             │
│  # Resolution source from highest confidence entry                          │
│  resolution_source = source with max(resolution_confidence)                 │
│                                                                             │
│  # Calculate portfolio percentage                                           │
│  portfolio_percentage = (total_exposure / total_value) * 100                │
│                                                                             │
│  # Sort by exposure (largest first)                                         │
│  aggregated = aggregated.sort_values("total_exposure", ascending=False)     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   pd.DataFrame  # Aggregated exposure report
```

### Aggregated DataFrame Schema (Output)

| Column | Type | Description |
|--------|------|-------------|
| `isin` | str | Unique security ISIN |
| `name` | str | Security name (first occurrence) |
| `sector` | str | Industry sector (first occurrence) |
| `geography` | str | Country/region (first occurrence) |
| `total_exposure` | float | Total EUR value across all positions |
| `portfolio_percentage` | float | Percentage of total portfolio |
| `resolution_confidence` | float | Max confidence across all sources |
| `resolution_source` | str | Source with highest confidence |

### Exposure Calculation Formula

```
For Direct Holdings:
  exposure = quantity × current_price

For ETF Underlying Holdings:
  etf_value = etf_quantity × etf_price
  holding_exposure = etf_value × (holding_weight_percentage / 100)

For Aggregation:
  total_exposure[isin] = Σ exposure[isin] across all sources
  portfolio_percentage = (total_exposure / Σ all_exposures) × 100
```

### Issues Identified

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **CRITICAL** | No Weight Sum Validation | aggregator.py | ETF holdings weights should sum to ~100%. If provider returns decimal weights (0.05 instead of 5%), calculations are 100x off |
| **HIGH** | First-Wins Strategy | aggregator.py:117-119 | If same ISIN appears with different names/sectors, first one wins. Should use highest-confidence source |
| **MEDIUM** | No Currency Conversion | aggregator.py | All values assumed EUR. Non-EUR positions have incorrect values |
| **MEDIUM** | Division by Zero Risk | aggregator.py:140-143 | If total_value == 0, all percentages become 0 instead of NaN |

---

## Phase 5: Reporting

### Entry Point

**File:** `core/pipeline.py` → `_write_reports()`, `_write_health_report()`, `_write_breakdown_report()` (lines 490-769)

### Purpose

Write final outputs: CSV reports for analysis, JSON health report for debugging, and breakdown report for UI exploration.

### Data Flow Diagram

```
exposure_df: pd.DataFrame (aggregated)
direct_positions: pd.DataFrame
etf_positions: pd.DataFrame
holdings_map: Dict[str, pd.DataFrame]
monitor: PipelineMonitor
errors: List[PipelineError]
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  _write_reports(exposure_df, direct_positions, etf_positions)               │
│  (pipeline.py:490-508)                                                      │
│                                                                             │
│  OUTPUT 1: TRUE_EXPOSURE_REPORT                                             │
│  Path: outputs/true_exposure.csv                                            │
│  Content: Aggregated exposure by ISIN                                       │
│  Columns: isin, name, sector, geography, total_exposure, portfolio_pct      │
│                                                                             │
│  OUTPUT 2: DIRECT_HOLDINGS_REPORT                                           │
│  Path: outputs/direct_holdings.csv                                          │
│  Content: Concatenation of direct + ETF positions (raw, not decomposed)     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  _write_health_report(...)                                                  │
│  (pipeline.py:519-595)                                                      │
│                                                                             │
│  OUTPUT 3: PIPELINE_HEALTH_PATH                                             │
│  Path: outputs/pipeline_health.json                                         │
│  Content:                                                                   │
│  {                                                                          │
│    "timestamp": "2026-01-10T04:12:37",                                      │
│    "metrics": {                                                             │
│      "direct_holdings": 15,                                                 │
│      "etf_positions": 8,                                                    │
│      "etfs_processed": 8,                                                   │
│      "tier1_resolved": 0,                                                   │
│      "tier1_failed": 2                                                      │
│    },                                                                       │
│    "performance": {                                                         │
│      "execution_time_seconds": 45.2,                                        │
│      "phase_durations": {                                                   │
│        "initialization": 0.5,                                               │
│        "data_loading": 0.1,                                                 │
│        "etf_decomposition": 30.5,                                           │
│        "enrichment": 10.2,                                                  │
│        "aggregation": 0.8,                                                  │
│        "reporting": 0.3                                                     │
│      },                                                                     │
│      "hive_hit_rate": 85.5,                                                 │
│      "api_fallback_rate": 14.5,                                             │
│      "total_assets_processed": 1250,                                        │
│      "hive_hits_count": 1068,                                               │
│      "hive_misses_count": 182,                                              │
│      "api_calls_count": 45,                                                 │
│      "contributions_count": 12                                              │
│    },                                                                       │
│    "decomposition": {                                                       │
│      "per_etf": [                                                           │
│        {"isin": "IE00B4L5Y983", "name": "iShares MSCI World",               │
│         "holdings_count": 1500, "status": "success", "source": "cached"}    │
│      ]                                                                      │
│    },                                                                       │
│    "enrichment": {                                                          │
│      "stats": {"hive_hits": 1068, "api_calls": 45, "new_contributions": 12},│
│      "hive_log": {"hits": [...], "contributions": [...]}                    │
│    },                                                                       │
│    "failures": [                                                            │
│      {"severity": "ERROR", "stage": "ETF_DECOMPOSITION",                    │
│       "item": "LU1234567890", "issue": "NO_ADAPTER",                        │
│       "error": "No adapter registered", "fix": "Upload manually"}           │
│    ]                                                                        │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  _write_breakdown_report(...)                                               │
│  (pipeline.py:609-769)                                                      │
│                                                                             │
│  OUTPUT 4: HOLDINGS_BREAKDOWN_PATH                                          │
│  Path: outputs/holdings_breakdown.csv                                       │
│  Content: Parent-child relationship with calculated values                  │
│                                                                             │
│  For direct holdings:                                                       │
│    parent_isin = "DIRECT"                                                   │
│    parent_name = "Direct Holdings"                                          │
│    value_eur = quantity × price                                             │
│    weight_percent = 100.0                                                   │
│                                                                             │
│  For ETF holdings:                                                          │
│    parent_isin = ETF ISIN                                                   │
│    parent_name = ETF name                                                   │
│    value_eur = etf_value × (weight_percent / 100)                           │
│    weight_percent = holding weight in ETF                                   │
│                                                                             │
│  Columns: parent_isin, parent_name, child_isin, child_name,                 │
│           weight_percent, value_eur, sector, geography,                     │
│           resolution_status, resolution_source, resolution_confidence,      │
│           resolution_detail, ticker                                         │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  _write_errors(errors)                                                      │
│  (pipeline.py:510-517)                                                      │
│                                                                             │
│  OUTPUT 5: PIPELINE_ERRORS_PATH                                             │
│  Path: outputs/pipeline_errors.json                                         │
│  Content: [                                                                 │
│    {                                                                        │
│      "phase": "ETF_DECOMPOSITION",                                          │
│      "error_type": "NO_ADAPTER",                                            │
│      "item": "LU1234567890",                                                │
│      "message": "No adapter registered for this ISIN",                      │
│      "fix_hint": "Add adapter or upload to manual_holdings/",               │
│      "timestamp": "2026-01-10T04:12:37"                                     │
│    }                                                                        │
│  ]                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Output Files Summary

| File | Format | Purpose | Key Contents |
|------|--------|---------|--------------|
| `true_exposure.csv` | CSV | Final analysis | Aggregated exposure by ISIN |
| `direct_holdings.csv` | CSV | Raw data | Original positions (direct + ETF) |
| `holdings_breakdown.csv` | CSV | UI exploration | Parent-child relationships |
| `pipeline_health.json` | JSON | Debugging | Execution metrics, errors |
| `pipeline_errors.json` | JSON | Error tracking | Structured error log |

### Broadcast Summary (SSE)

The pipeline also broadcasts a summary via Server-Sent Events for real-time UI updates:

```python
@dataclass
class PipelineSummaryData:
    holdings: HoldingsSummary        # stocks, etfs, total_value
    decomposition: DecompositionSummary  # etfs_processed, etfs_failed, per_etf
    resolution: ResolutionSummary    # total, resolved, unresolved, by_source
    timing: TimingSummary            # total_seconds, phases
    unresolved: List[UnresolvedItem] # ticker, name, weight, parent_etf, reason
    unresolved_truncated: bool       # True if > 100 unresolved
    unresolved_total: int            # Total unresolved count
```

### Issues Identified

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **HIGH** | Vectorized Claim False | pipeline.py:623-656 | Comment says "vectorized ONCE" but code uses `.iterrows()`. Should use vectorized assignment |
| **MEDIUM** | Inconsistent Value Logic | pipeline.py:667-703 | ETF value detection has 5 fallback paths, different from `calculate_position_values()` |
| **LOW** | Non-Atomic CSV Writes | pipeline.py:495-505 | `to_csv()` not atomic, could leave corrupted files on crash |

---

## Cross-Cutting Concerns

### Schema Normalization

**File:** `core/utils.py` → `SchemaNormalizer` (lines 202-344)

The `SchemaNormalizer` class handles column name variations across different data providers:

```python
class SchemaNormalizer:
    STANDARD_COLUMNS = {
        "isin": "isin",
        "name": "name",
        "ticker": "ticker",
        "weight": "weight",
        "quantity": "quantity",
        "price": "price",
        "sector": "sector",
        "geography": "geography",
        "asset_class": "asset_class",
        "market_value": "market_value",
        # ...
    }
    
    PROVIDER_MAPPINGS = {
        "ishares": {
            "ISIN": "isin",
            "Name": "name",
            "Weight (%)": "weight",
            "Ticker": "ticker",
        },
        "vanguard": {
            "isin": "isin",
            "fund_name": "name",
            "allocation_pct": "weight",
        },
        "amundi": {
            "Code ISIN": "isin",
            "Libellé": "name",
            "Poids": "weight",
            "Devise": "currency",
        },
    }
```

**Normalization Process:**
1. Apply provider-specific mappings (if provider specified)
2. Convert remaining columns to lowercase
3. Apply fuzzy matching for common variations
4. Drop duplicate columns (keep first)

**Issues:**
- Provider parameter rarely passed, so provider-specific mappings unused
- Fuzzy matching can cause false positives ("value" → "market_value")
- No validation that normalization succeeded

### Error Handling

**File:** `core/errors.py`

```python
class ErrorPhase(Enum):
    DATA_LOADING = "DATA_LOADING"
    ETF_DECOMPOSITION = "ETF_DECOMPOSITION"
    ENRICHMENT = "ENRICHMENT"
    AGGREGATION = "AGGREGATION"
    HARVESTING = "HARVESTING"
    REPORTING = "REPORTING"
    VALIDATION = "VALIDATION"

class ErrorType(Enum):
    NO_ADAPTER = "NO_ADAPTER"
    API_FAILURE = "API_FAILURE"
    CACHE_MISS = "CACHE_MISS"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    PARSE_ERROR = "PARSE_ERROR"
    SCHEMA_MISMATCH = "SCHEMA_MISMATCH"
    UNKNOWN = "UNKNOWN"

@dataclass
class PipelineError(Exception):
    phase: ErrorPhase
    error_type: ErrorType
    item: str  # ISIN or identifier (safe to share)
    message: str
    fix_hint: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def anonymize(self) -> dict:
        """Return dict safe for GitHub issue (no portfolio values)."""
        return {
            "phase": self.phase.value,
            "error_type": self.error_type.value,
            "item": self.item,  # ISIN is safe to share
            "message": self.message,
            "fix_hint": self.fix_hint,
        }
```

**Issues:**
- `PipelineError` inherits from `Exception` but is used as dataclass
- Some errors swallowed with `logger.warning()` instead of collected

### Caching Strategy

| Cache | Location | TTL | Purpose |
|-------|----------|-----|---------|
| Holdings Cache | `data/working/etf_holdings_cache/` | 7 days | ETF holdings data |
| Hive Universe Cache | `data/cache/master_universe_normalized.json` | 24 hours | Asset metadata |
| Local SQLite Cache | `prism.db` tables | Varies | ISIN resolution |
| Negative Cache | SQLite | 1-24 hours | Failed resolutions |

**Negative Cache TTLs:**
- Unresolved (all APIs failed): 24 hours
- Rate limited: 1 hour

### Logging

**File:** `prism_utils/logging_config.py`

All modules use structured logging via `get_logger(__name__)`:

```python
logger = get_logger(__name__)
logger.info(f"Decomposed ETF {isin}: {len(holdings)} holdings extracted")
logger.warning(f"Adapter fetch failed for {isin}: {e}")
logger.error(f"Pipeline failed: {e}", exc_info=True)
logger.debug(f"Finnhub resolved {ticker} -> {isin}")
```

---

## Performance Analysis

### Execution Timeline (Typical Run)

```
Phase               Duration    % of Total
─────────────────────────────────────────
Initialization      0.5s        1%
Data Loading        0.1s        <1%
ETF Decomposition   30.5s       68%      ← BOTTLENECK
Enrichment          10.2s       23%
Aggregation         0.8s        2%
Reporting           0.3s        1%
─────────────────────────────────────────
Total               45.2s       100%
```

### Bottlenecks

1. **Sequential ETF Processing**
   - Each ETF decomposed one at a time
   - Network requests are blocking
   - Could parallelize with asyncio/threading

2. **Synchronous API Calls**
   - Finnhub/yFinance called sequentially
   - Rate limiting adds delays (0.5-1.1s per call)
   - Could batch where APIs support it

3. **Row-by-Row Iteration**
   - Several places use `.iterrows()` instead of vectorized ops
   - Breakdown report, value calculations affected

### Metrics Tracked (PipelineMonitor)

```python
class PipelineMonitor:
    def __init__(self):
        self.start_time = time.time()
        self.phase_times: Dict[str, float] = {}
        self.hive_hits: Set[str] = set()
        self.hive_misses: Set[str] = set()
        self.api_calls: Set[str] = set()
        self.contributions: Set[str] = set()
    
    def get_metrics(self) -> Dict[str, Any]:
        return {
            "execution_time_seconds": ...,
            "phase_durations": self.phase_times,
            "hive_hit_rate": ...,
            "api_fallback_rate": ...,
            "total_assets_processed": ...,
            "hive_hits_count": len(self.hive_hits),
            "hive_misses_count": len(self.hive_misses),
            "api_calls_count": len(self.api_calls),
            "contributions_count": len(self.contributions),
        }
```

---

## Issues & Recommendations

### Critical Issues (Must Fix)

| # | Issue | Phase | Impact | Recommendation |
|---|-------|-------|--------|----------------|
| 1 | NaN handling in asset_class split | Load | Crashes on NaN | Use `.fillna("").str.upper()` |
| 2 | No weight sum validation | Decompose | 100x calculation errors | Validate weights sum to ~100% |
| 3 | Geography always "Unknown" | Enrich | Broken geography analysis | Populate from Hive/API |

### High Priority Issues

| # | Issue | Phase | Impact | Recommendation |
|---|-------|-------|--------|----------------|
| 4 | Synchronous Hive contribution | Decompose | Pipeline blocking | Move to background task |
| 5 | First-wins name/sector | Aggregate | Incorrect metadata | Use highest-confidence source |
| 6 | Vectorized claim false | Report | Performance | Use actual vectorized ops |

### Medium Priority Issues

| # | Issue | Phase | Impact | Recommendation |
|---|-------|-------|--------|----------------|
| 7 | No ISIN deduplication | Decompose | Wasted API calls | Dedupe before enrichment |
| 8 | Sector/asset_class conflation | Enrich | Incorrect sector data | Separate concepts |
| 9 | No currency conversion | Aggregate | Incorrect values | Add conversion or validation |
| 10 | Division by zero risk | Aggregate | Silent failures | Return NaN or raise error |
| 11 | Inconsistent value logic | Report | Maintenance burden | Single source of truth |
| 12 | Non-atomic CSV writes | Report | Corruption risk | Use atomic writes |

### Low Priority Issues

| # | Issue | Phase | Impact | Recommendation |
|---|-------|-------|--------|----------------|
| 13 | Hardcoded portfolio_id | Load | No multi-portfolio | Add parameter |
| 14 | Negative weight clipping | Decompose | Lost short info | Preserve or flag |
| 15 | Tier naming confusion | Decompose | Maintenance | Rename variables |
| 16 | No rate limiting on batch | Enrich | Supabase limits | Add throttling |

### Performance Recommendations

| # | Recommendation | Expected Impact |
|---|----------------|-----------------|
| 1 | Parallelize ETF decomposition | -50% decomposition time |
| 2 | Batch Finnhub API calls | -30% resolution time |
| 3 | Deduplicate ISINs before enrichment | -20% enrichment time |
| 4 | Replace `.iterrows()` with vectorized | -10% reporting time |

---

## Appendix: File Reference

### Core Pipeline Files

| File | Lines | Purpose |
|------|-------|---------|
| `core/pipeline.py` | 930 | Main orchestrator |
| `core/services/decomposer.py` | 392 | ETF decomposition service |
| `core/services/enricher.py` | 317 | Metadata enrichment service |
| `core/services/aggregator.py` | 345 | Exposure aggregation service |
| `core/utils.py` | 433 | Shared utilities |
| `core/errors.py` | 113 | Error types |

### Data Layer Files

| File | Lines | Purpose |
|------|-------|---------|
| `data/database.py` | 468 | SQLite access |
| `data/resolution.py` | 699 | ISIN resolution |
| `data/holdings_cache.py` | 377 | Holdings caching |
| `data/hive_client.py` | 1029 | Community sync |
| `data/local_cache.py` | ~400 | Local SQLite cache |
| `data/enrichment.py` | ~200 | Enrichment APIs |

### Adapter Files

| File | Lines | Purpose |
|------|-------|---------|
| `adapters/registry.py` | 210 | Adapter factory |
| `adapters/ishares.py` | 311 | iShares scraper |
| `adapters/vanguard.py` | ~250 | Vanguard scraper |
| `adapters/vaneck.py` | ~200 | VanEck scraper |
| `adapters/xtrackers.py` | ~200 | Xtrackers scraper |
| `adapters/amundi.py` | ~200 | Amundi scraper |

---

## Conclusion

The Portfolio Prism pipeline is **well-architected** with clear separation between:
- **Orchestration** (`Pipeline`)
- **Services** (`Decomposer`, `Enricher`, `Aggregator`)
- **Data Access** (`HoldingsCache`, `HiveClient`, `ISINResolver`)

The multi-tier resolution strategy for both holdings and ISINs is sophisticated and handles offline scenarios well. The community contribution model via Hive enables crowdsourced data improvement.

However, there are **data quality issues** (geography always "Unknown", weight validation missing) and **performance opportunities** (sequential processing, duplicate API calls) that should be addressed before production use.

**Priority Actions:**
1. Fix critical NaN handling bug in data loading
2. Add weight sum validation in decomposition
3. Implement geography population in enrichment
4. Parallelize ETF decomposition for performance
