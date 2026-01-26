# Pipeline State Machine Diagram

> **Generated:** 2026-01-11  
> **Source:** `src-tauri/python/portfolio_src/core/pipeline.py` and services

---

## High-Level Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PIPELINE ORCHESTRATOR                                   │
│                                  (pipeline.py)                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: INITIALIZATION (0-5%)                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ _init_services()                                                             │    │
│  │   ├── Initialize Decomposer(holdings_cache, adapter_registry, isin_resolver) │    │
│  │   ├── Initialize Enricher(HiveEnrichmentService)                             │    │
│  │   ├── Initialize Aggregator()                                                │    │
│  │   └── Initialize ValidationGates()                                           │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: DATA LOADING (5-15%)                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ _load_portfolio()                                                            │    │
│  │   ├── get_positions(portfolio_id) → DataFrame                                │    │
│  │   ├── Split by asset_class.upper()                                           │    │
│  │   │     ├── asset_class != "ETF" → direct_positions                          │    │
│  │   │     └── asset_class == "ETF" → etf_positions                             │    │
│  │   └── Handle NaN asset_class → treated as direct holdings                    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ VALIDATION: validate_load_output(LoadPhaseOutput)                            │    │
│  │   ├── Check required columns exist                                           │    │
│  │   ├── Validate ISIN formats                                                  │    │
│  │   ├── Check for non-EUR currencies (flag for future conversion)              │    │
│  │   └── Generate DataQuality score                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            [direct_positions]                      [etf_positions]
                    │                                       │
                    │                                       ▼
                    │       ┌─────────────────────────────────────────────────────────┐
                    │       │  PHASE 3: ETF DECOMPOSITION (15-40%)                    │
                    │       │  Decomposer.decompose(etf_positions)                    │
                    │       └─────────────────────────────────────────────────────────┘
                    │                                       │
                    │                                       ▼
                    │       ┌─────────────────────────────────────────────────────────┐
                    │       │  FOR EACH ETF:                                          │
                    │       │  ┌─────────────────────────────────────────────────┐    │
                    │       │  │ _get_holdings(isin) - Multi-tier resolution     │    │
                    │       │  │                                                  │    │
                    │       │  │  ┌──────────────┐    MISS    ┌──────────────┐   │    │
                    │       │  │  │ Local Cache  │ ────────▶ │ Hive Client  │   │    │
                    │       │  │  │ (holdings_   │            │ (community   │   │    │
                    │       │  │  │  cache)      │            │  database)   │   │    │
                    │       │  │  └──────┬───────┘            └──────┬───────┘   │    │
                    │       │  │         │ HIT                       │ MISS      │    │
                    │       │  │         ▼                           ▼           │    │
                    │       │  │    [holdings_df]           ┌──────────────┐    │    │
                    │       │  │                            │ Adapter      │    │    │
                    │       │  │                            │ Registry     │    │    │
                    │       │  │                            │ (iShares,    │    │    │
                    │       │  │                            │  Vanguard,   │    │    │
                    │       │  │                            │  etc.)       │    │    │
                    │       │  │                            └──────┬───────┘    │    │
                    │       │  │                                   │            │    │
                    │       │  │                                   ▼            │    │
                    │       │  │                          [adapter_holdings]    │    │
                    │       │  │                                   │            │    │
                    │       │  │                                   ▼            │    │
                    │       │  │                     ┌─────────────────────┐    │    │
                    │       │  │                     │ _contribute_to_hive │    │    │
                    │       │  │                     │ _async() (daemon    │    │    │
                    │       │  │                     │ thread, fire&forget)│    │    │
                    │       │  │                     └─────────────────────┘    │    │
                    │       │  └─────────────────────────────────────────────────┘    │
                    │       │                                       │                  │
                    │       │                                       ▼                  │
                    │       │  ┌─────────────────────────────────────────────────┐    │
                    │       │  │ POST-PROCESSING:                                │    │
                    │       │  │   ├── _normalize_weight_format()                │    │
                    │       │  │   │     (auto-detect decimal vs percentage)     │    │
                    │       │  │   └── _resolve_holdings_isins()                 │    │
                    │       │  │         (ticker → ISIN resolution via resolver) │    │
                    │       │  └─────────────────────────────────────────────────┘    │
                    │       └─────────────────────────────────────────────────────────┘
                    │                                       │
                    │                                       ▼
                    │       ┌─────────────────────────────────────────────────────────┐
                    │       │ VALIDATION: validate_decompose_output()                 │
                    │       │   ├── Check weight sums (90-110% expected)              │
                    │       │   ├── Detect decimal format weights                     │
                    │       │   ├── Report weight validation failures via telemetry   │
                    │       │   └── Generate DataQuality score                        │
                    │       └─────────────────────────────────────────────────────────┘
                    │                                       │
                    │                                       ▼
                    │                              {holdings_map}
                    │                         {etf_isin: holdings_df}
                    │                                       │
                    ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: ENRICHMENT (40-60%)                                                        │
│  Enricher.enrich(holdings_map) + enrich_positions(direct_positions)                  │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 1: Collect unique ISINs (deduplication optimization)                    │    │
│  │   └── _collect_unique_isins(holdings_map) → all_unique_isins                 │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 2: HiveEnrichmentService.get_metadata_batch(isins)                      │    │
│  │                                                                              │    │
│  │  ┌──────────────┐    MISS    ┌──────────────┐    MISS    ┌──────────────┐   │    │
│  │  │ LocalCache   │ ────────▶ │ HiveClient   │ ────────▶ │ Fallback     │   │    │
│  │  │ (get_asset)  │            │ batch_lookup │            │ APIs         │   │    │
│  │  └──────┬───────┘            └──────┬───────┘            │ (Finnhub,    │   │    │
│  │         │ HIT                       │ HIT                │  yfinance)   │   │    │
│  │         ▼                           ▼                    └──────┬───────┘   │    │
│  │    {metadata}                  {metadata}                       │           │    │
│  │                                                                 ▼           │    │
│  │                                                     ┌─────────────────┐     │    │
│  │                                                     │ batch_contribute│     │    │
│  │                                                     │ (to Hive)       │     │    │
│  │                                                     └─────────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 3: Apply enrichment to each holdings DataFrame                         │    │
│  │   └── _apply_enrichment_data(holdings, enrichment_data)                      │    │
│  │         ├── Add sector column                                                │    │
│  │         ├── Add geography column (currently "Unknown" - deferred)            │    │
│  │         └── Add asset_class column                                           │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ VALIDATION: validate_enrich_output()                                         │    │
│  │   ├── Check enrichment coverage rates                                        │    │
│  │   ├── Flag missing sector/geography                                          │    │
│  │   └── Generate DataQuality score                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
        [enriched_direct_positions]              {enriched_holdings_map}
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: AGGREGATION (60-80%)                                                       │
│  Aggregator.aggregate(direct_positions, etf_positions, enriched_holdings)            │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 1: Calculate total portfolio value                                      │    │
│  │   └── calculate_portfolio_total_value(direct, etf) → total_value             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 2: Process direct positions (vectorized)                                │    │
│  │   └── _process_direct_positions(norm_direct) → direct_exposures              │    │
│  │         ├── Each position = 100% exposure to itself                          │    │
│  │         └── Value = quantity × price (or total_value column)                 │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 3: Process ETF positions (vectorized per ETF)                           │    │
│  │   └── _process_etf_positions(norm_etf, holdings_map) → etf_exposures         │    │
│  │         FOR EACH ETF:                                                        │    │
│  │           ├── Get ETF value from positions                                   │    │
│  │           ├── For each holding: exposure = etf_value × (weight/100)          │    │
│  │           └── Carry forward: sector, geography, resolution metadata          │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ STEP 4: Combine and aggregate by ISIN                                        │    │
│  │   ├── pd.concat(all_exposures)                                               │    │
│  │   ├── Sort by resolution_confidence DESC (highest confidence first)          │    │
│  │   ├── groupby("isin").agg({                                                  │    │
│  │   │     "name": "first",           # From highest confidence                 │    │
│  │   │     "sector": "first",         # From highest confidence                 │    │
│  │   │     "geography": "first",      # From highest confidence                 │    │
│  │   │     "total_exposure": "sum",   # Sum all exposures                       │    │
│  │   │     "resolution_confidence": "max"                                       │    │
│  │   │   })                                                                     │    │
│  │   └── portfolio_percentage = (exposure / total_value × 100)                  │    │
│  │         └── Division by zero protection: returns 0.0 if total_value == 0     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ VALIDATION: validate_aggregate_output(expected_total)                        │    │
│  │   ├── Check total exposure matches expected portfolio value                  │    │
│  │   ├── Flag significant discrepancies                                         │    │
│  │   └── Generate DataQuality score                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                                 [exposure_df]
                    ┌───────────────────────────────────────┐
                    │ Columns:                              │
                    │   - isin                              │
                    │   - name                              │
                    │   - sector                            │
                    │   - geography                         │
                    │   - total_exposure (EUR)              │
                    │   - portfolio_percentage              │
                    │   - resolution_confidence             │
                    │   - resolution_source                 │
                    └───────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: REPORTING (80-95%)                                                         │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ _write_reports()                                                             │    │
│  │   ├── true_exposure.csv      (exposure_df - main output)                     │    │
│  │   └── direct_holdings.csv    (direct positions with enrichment)              │    │
│  │                                                                              │    │
│  │ _write_breakdown_report()                                                    │    │
│  │   └── holdings_breakdown.csv (detailed parent→child breakdown)               │    │
│  │                                                                              │    │
│  │ _write_health_report()                                                       │    │
│  │   └── pipeline_health.json   (metrics, quality, timing, hive stats)          │    │
│  │                                                                              │    │
│  │ _write_errors()                                                              │    │
│  │   └── pipeline_errors.json   (all errors with fix hints)                     │    │
│  │                                                                              │    │
│  │ All writes use write_csv_atomic() / write_json_atomic()                      │    │
│  │   └── Pattern: write to .tmp → os.replace() to final path                   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 7: HARVEST & BROADCAST (95-100%)                                              │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ _harvest()                                                                   │    │
│  │   └── harvest_cache() - Auto-discover new securities (non-fatal)             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ _build_summary() → PipelineSummaryData                                       │    │
│  │   ├── holdings: {stocks, etfs, total_value}                                  │    │
│  │   ├── decomposition: {etfs_processed, etfs_failed, details[]}                │    │
│  │   ├── resolution: {total, resolved, unresolved, rate}                        │    │
│  │   ├── timing: {total_seconds, phase_durations}                               │    │
│  │   └── unresolved: [{isin, name, weight, parent_etf}]                         │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ broadcast_summary(summary)                                                   │    │
│  │   └── SSE broadcast to frontend via echo_bridge                              │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                             │
│                                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ FINALLY BLOCK (always runs):                                                 │    │
│  │   ├── _write_health_report()                                                 │    │
│  │   ├── report_quality_summary() via telemetry (if issues)                     │    │
│  │   ├── _write_breakdown_report()                                              │    │
│  │   └── _write_errors()                                                        │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ PipelineResult  │
                              │   - success     │
                              │   - etfs_proc   │
                              │   - etfs_failed │
                              │   - total_value │
                              │   - errors[]    │
                              │   - warnings[]  │
                              │   - harvested   │
                              └─────────────────┘
```

---

## Data Flow Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Database   │     │   Hive      │     │  Adapters   │     │  APIs       │
│  (SQLite)   │     │  (Supabase) │     │  (iShares)  │     │  (Finnhub)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ positions         │ holdings          │ holdings          │ metadata
       │                   │ metadata          │                   │
       ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE ORCHESTRATOR                            │
│  ┌─────────┐   ┌────────────┐   ┌──────────┐   ┌────────────┐          │
│  │  LOAD   │──▶│ DECOMPOSE  │──▶│  ENRICH  │──▶│ AGGREGATE  │          │
│  └─────────┘   └────────────┘   └──────────┘   └────────────┘          │
│       │              │                │               │                 │
│       ▼              ▼                ▼               ▼                 │
│  [positions]   [holdings_map]   [enriched_map]   [exposure_df]         │
└─────────────────────────────────────────────────────────────────────────┘
       │                                                    │
       │                                                    │
       ▼                                                    ▼
┌─────────────┐                                    ┌─────────────────────┐
│ Validation  │                                    │      OUTPUTS        │
│   Gates     │                                    │  ┌───────────────┐  │
│ (per phase) │                                    │  │ true_exposure │  │
└──────┬──────┘                                    │  │    .csv       │  │
       │                                           │  ├───────────────┤  │
       ▼                                           │  │ holdings_     │  │
┌─────────────┐                                    │  │ breakdown.csv │  │
│ DataQuality │                                    │  ├───────────────┤  │
│   Score     │                                    │  │ pipeline_     │  │
│  (0-100%)   │                                    │  │ health.json   │  │
└─────────────┘                                    │  └───────────────┘  │
                                                   └─────────────────────┘
```

---

## Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| **Pipeline** | `core/pipeline.py` | Orchestration only. Calls services, emits progress, writes outputs. NO business logic. |
| **Decomposer** | `core/services/decomposer.py` | ETF → holdings resolution. Multi-tier: cache → Hive → adapters. ISIN resolution. |
| **Enricher** | `core/services/enricher.py` | Add sector/geography/asset_class. Multi-tier: LocalCache → Hive → APIs. |
| **Aggregator** | `core/services/aggregator.py` | Combine exposures, group by ISIN, calculate percentages. Vectorized operations. |
| **ValidationGates** | `core/contracts/gates.py` | Validate phase outputs, generate DataQuality scores, log issues. |
| **HiveClient** | `data/hive_client.py` | Community database (Supabase). Holdings + asset metadata. |
| **HoldingsCache** | `data/holdings_cache.py` | Local file cache for ETF holdings. |
| **AdapterRegistry** | `adapters/` | Provider-specific scrapers (iShares, Vanguard, etc.) |
| **ISINResolver** | `data/resolution.py` | Ticker → ISIN resolution with confidence scoring. |
| **Telemetry** | `prism_utils/telemetry.py` | Report issues to GitHub for community fixes. |

---

## Error Handling States

```
┌─────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Each phase can produce errors that are:                         │
│    1. Collected (not thrown) → errors.extend(phase_errors)       │
│    2. Logged with severity                                       │
│    3. Pipeline continues (never crashes on data issues)          │
│                                                                  │
│  Error Types (ErrorType enum):                                   │
│    - FILE_NOT_FOUND      - No portfolio data                     │
│    - VALIDATION_FAILED   - Schema/data validation failed         │
│    - NO_ADAPTER          - No adapter for ETF ISIN               │
│    - CACHE_MISS          - Holdings not in cache/Hive            │
│    - API_FAILURE         - External API call failed              │
│    - UNKNOWN             - Unexpected exception                  │
│                                                                  │
│  Error Phases (ErrorPhase enum):                                 │
│    - DATA_LOADING                                                │
│    - ETF_DECOMPOSITION                                           │
│    - ENRICHMENT                                                  │
│    - AGGREGATION                                                 │
│    - REPORTING                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Gates (Phase 2 Addition)

```
┌─────────────────────────────────────────────────────────────────┐
│                    VALIDATION GATES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  After each phase, ValidationGates validates output:             │
│                                                                  │
│  LOAD → validate_load_output()                                   │
│    ├── Required columns present                                  │
│    ├── Valid ISIN formats                                        │
│    └── Currency check (flag non-EUR)                             │
│                                                                  │
│  DECOMPOSE → validate_decompose_output()                         │
│    ├── Weight sum validation (90-110%)                           │
│    ├── Decimal format detection                                  │
│    └── Holdings count sanity check                               │
│                                                                  │
│  ENRICH → validate_enrich_output()                               │
│    ├── Enrichment coverage rate                                  │
│    └── Missing sector/geography flags                            │
│                                                                  │
│  AGGREGATE → validate_aggregate_output()                         │
│    ├── Total exposure vs expected value                          │
│    └── Percentage sum validation                                 │
│                                                                  │
│  Each validation produces:                                       │
│    - ValidationResult { passed, quality: DataQuality }           │
│    - DataQuality { score, issues[], is_trustworthy }             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Data Structures

```python
# Phase Outputs (Pydantic models in core/contracts/schemas.py)
LoadPhaseOutput:
    direct_positions: List[LoadedPosition]
    etf_positions: List[LoadedPosition]

DecomposePhaseOutput:
    decompositions: List[ETFDecomposition]  # {etf_isin, holdings[], source}

EnrichPhaseOutput:
    enriched_holdings: List[EnrichedHolding]  # {isin, name, sector, geography}

AggregatePhaseOutput:
    exposures: List[AggregatedExposureRecord]  # {isin, total_exposure, pct}

# Quality Tracking
DataQuality:
    score: float  # 0.0 - 1.0
    issues: List[ValidationIssue]
    is_trustworthy: bool  # score >= 0.8 and no critical issues

ValidationIssue:
    severity: IssueSeverity  # CRITICAL, HIGH, MEDIUM, LOW
    code: str  # e.g., "WEIGHT_SUM_LOW"
    message: str
    item: str  # affected ISIN
    fix_hint: str
```
