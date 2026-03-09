# Identity Resolution Architecture

> **Purpose:** Define how identity resolution components are structured and integrated.
> **Related:**
> - `docs/specs/identity_resolution_details.md` (requirements, formats, confidence scoring)
> - `docs/specs/pipeline_definition_of_done.md` (pipeline success criteria)
> - `docs/specs/supabase_hive.md` (Hive community database, trust model)
> - `docs/architecture/analytics_pipeline.md` (pipeline architecture)
> **Last Updated:** 2026-03-08

---

## 1. System Context

Identity resolution runs **inside the decomposition phase** of the X-Ray pipeline.
For each ETF holding extracted by the adapter, the ISINResolver attempts to resolve
the ticker/name to a canonical ISIN before aggregation can group holdings across ETFs.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           X-RAY PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────┐ │
│  │  DECOMPOSE   │    │   RESOLVE    │    │   ENRICH     │    │ AGGR. │ │
│  │  ETFs into   │───▶│  Ticker →    │───▶│  Sector +    │───▶│ by    │ │
│  │  Holdings    │    │  ISIN        │    │  Geography   │    │ ISIN  │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────┘ │
│                         │                                              │
│                         │ Resolves: Ticker/Name → ISIN                │
│                         │ Contributes: to Hive on success             │
│                         │ Enables: Aggregation by canonical ISIN      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why does resolution happen inside decomposition?**
- Decomposition extracts holdings with tickers/names from ETF providers
- Resolution MUST run on each holding before aggregation can group by ISIN
- Without resolution, "NVIDIA CORP" and "NVIDIA Corp" are treated as different securities
- Resolution results are contributed to Hive immediately, benefiting all users

---

## 2. Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ISINResolver                                    │
│                      (Orchestrator Class)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Input Layer                                 │    │
│  │                                                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │    │
│  │  │ IShares     │  │ Vanguard    │  │ Amundi      │              │    │
│  │  │ Parser      │  │ Parser      │  │ Parser      │              │    │
│  │  │ (CSV)       │  │ (XLSX)      │  │ (XLSX/XML)  │              │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │    │
│  │         │                │                │                      │    │
│  │         └────────────────┼────────────────┘                      │    │
│  │                          ▼                                       │    │
│  │                   HoldingRecord                                  │    │
│  │         (isin?, ticker?, name, weight, ...)                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                │                                         │
│                                ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Normalization Layer                            │    │
│  │                                                                  │    │
│  │  ┌─────────────────────┐    ┌─────────────────────┐             │    │
│  │  │   NameNormalizer    │    │   TickerParser      │             │    │
│  │  │                     │    │                     │             │    │
│  │  │ - Strip suffixes    │    │ - Detect format     │             │    │
│  │  │ - Uppercase         │    │ - Extract root      │             │    │
│  │  │ - Remove punctuation│    │ - Generate variants │             │    │
│  │  └─────────────────────┘    └─────────────────────┘             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                │                                         │
│                                ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Resolution Layer                              │    │
│  │                                                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │
│  │  │ Local Cache │  │ HiveClient  │  │ External APIs           │  │    │
│  │  │ (SQLite)    │  │ (Supabase)  │  │                         │  │    │
│  │  │             │  │             │  │ - WikidataResolver      │  │    │
│  │  │ get/set     │  │ lookup      │  │ - OpenFIGIResolver      │  │    │
│  │  │             │  │ contribute  │  │ - FinnhubResolver       │  │    │
│  │  │             │  │             │  │ - YFinanceResolver      │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                │                                         │
│                                ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Output Layer                                │    │
│  │                                                                  │    │
│  │                    EnrichedHolding                               │    │
│  │         (isin, ticker, name, weight, confidence, source)        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Input → Output

```
INPUT:  HoldingRecord
        ├── isin: Optional[str]      # May be null (iShares, Vanguard)
        ├── ticker: Optional[str]    # May be null (Amundi)
        ├── name: str                # Always present
        ├── weight: float
        └── ...

OUTPUT: EnrichedHolding
        ├── isin: str                # Resolved (or null if unresolved)
        ├── ticker: Optional[str]
        ├── name: str
        ├── weight: float
        ├── resolution_confidence: float   # 0.0 - 1.0
        ├── resolution_source: str         # "direct", "cache", "hive", "wikidata", etc.
        └── ...
```

### 3.2 Resolution Sequence

```
HoldingRecord
     │
     ▼
┌─────────────────┐
│ Has ISIN?       │──YES──▶ Return (confidence 1.0)
└────────┬────────┘
         │ NO
         ▼
┌─────────────────┐
│ Has Ticker?     │──YES──▶ Normalize ticker
└────────┬────────┘         Generate variants
         │ NO               Try each variant in cascade
         ▼
┌─────────────────┐
│ Normalize Name  │──────▶ Try normalized name in cascade
└─────────────────┘

CASCADE (for each normalized identifier):
     │
     ├──▶ Local Cache ──HIT──▶ Return (confidence 0.95)
     │         │
     │        MISS
     │         ▼
     ├──▶ Hive Lookup ──HIT──▶ Cache locally, Return (confidence 0.90)
     │         │
     │        MISS
     │         ▼
     ├──▶ Provider ────HIT──▶ Return (confidence 1.0, already in data)
     │         │
     │        MISS
     │         ▼
     ├──▶ Wikidata (bulk) ─HIT──▶ Cache + Contribute to Hive, Return (0.80)
     │         │
     │        MISS
     │         ▼
     └──▶ Manual entry ────▶ Flag for user, Return (confidence 0.0)
```

**Note:** Finnhub and yFinance remain as legacy fallbacks but are NOT in the primary cascade.
The bulk Wikidata approach (SPARQL `VALUES` clause, up to 1000 ISINs per query) replaces
sequential per-ISIN API calls which caused 30min+ timeouts.
See `docs/specs/pipeline_definition_of_done.md` for full cascade and enrichment architecture.

---

## 4. Storage Schema

### 4.1 Local Cache (SQLite)

New table in `prism.db`:

```sql
CREATE TABLE isin_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL,              -- Normalized identifier
    alias_type TEXT NOT NULL,         -- "ticker" or "name"
    isin TEXT NOT NULL,               -- Resolved ISIN
    confidence REAL NOT NULL,         -- Resolution confidence
    source TEXT NOT NULL,             -- Where it was resolved
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(alias, alias_type)
);

CREATE INDEX idx_isin_cache_alias ON isin_cache(alias);
```

### 4.2 Hive Tables (Supabase)

Existing `security_master` table + new `aliases` table:

```sql
-- Existing
security_master (
    isin TEXT PRIMARY KEY,
    name TEXT,
    ticker TEXT,
    sector TEXT,
    country TEXT,
    ...
)

-- New (or extend existing)
security_aliases (
    id SERIAL PRIMARY KEY,
    isin TEXT REFERENCES security_master(isin),
    alias TEXT NOT NULL,
    alias_type TEXT NOT NULL,         -- "ticker" or "name"
    source TEXT NOT NULL,             -- "finnhub", "wikidata", "openfigi", "user", etc.
    confidence REAL NOT NULL,
    currency TEXT,                    -- Optional: trading currency for this alias
    exchange TEXT,                    -- Optional: exchange code
    valid_from TIMESTAMP,             -- Optional: when alias became valid (v1+)
    deprecated_at TIMESTAMP,          -- Optional: when alias was superseded (v1+)
    contributor_hash TEXT,            -- Anonymous contributor ID
    contributed_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(alias, alias_type)
);

CREATE INDEX idx_aliases_alias ON security_aliases(alias);
CREATE INDEX idx_aliases_isin ON security_aliases(isin);
```

---

## 5. Integration Points

### 5.1 Entry Point

Resolution is called from `decomposer.py` during the decomposition phase:

```
decomposer.py (_resolve_holdings_isins)
     │
     │  For each holding in ETF:
     │    1. Read weight from weight_percentage column
     │    2. Classify as tier1 (weight > threshold) or tier2
     │    3. Call ISINResolver.resolve(ticker, name, weight)
     │    4. Write resolved ISIN back to holding DataFrame
     │
     ▼
ISINResolver (data/resolution.py)
     │
     │  Runs cascade: cache → Hive → provider → APIs → manual
     │  On API success: auto-contribute to Hive
     │
     ▼
EnrichedHolding (isin, ticker, name, weight, confidence, source)
```

### 5.2 Actual File Locations (as implemented)

| File | Role | Status |
|------|------|--------|
| `portfolio_src/data/resolution.py` | ISINResolver orchestrator | Implemented |
| `portfolio_src/data/normalizer.py` | NameNormalizer, TickerParser | Implemented |
| `portfolio_src/data/local_cache.py` | Local SQLite cache (hive_cache.db) | Implemented |
| `portfolio_src/data/hive_client.py` | Supabase Hive client | Implemented |
| `portfolio_src/data/manual_enrichments.py` | Manual ticker→ISIN mappings | Implemented |
| `portfolio_src/adapters/ishares.py` | iShares CSV adapter | Implemented |
| `portfolio_src/adapters/amundi.py` | Amundi XLSX adapter | Implemented |
| `portfolio_src/adapters/vaneck.py` | VanEck adapter | Implemented |
| `portfolio_src/core/services/decomposer.py` | Decomposition + resolution integration | Implemented |
| `portfolio_src/core/services/enricher.py` | Sector/geography enrichment | Implemented |
| `portfolio_src/core/services/aggregator.py` | ISIN-based aggregation | Implemented |
---

## 6. File Structure (as implemented)

```
src-tauri/python/portfolio_src/
├── data/
│   ├── resolution.py        # ISINResolver orchestrator
│   ├── normalizer.py        # NameNormalizer, TickerParser
│   ├── local_cache.py       # SQLite cache (hive_cache.db)
│   ├── hive_client.py       # Supabase Hive client
│   ├── manual_enrichments.py # Manual ticker→ISIN mappings
│   ├── enrichment.py        # Metadata enrichment service
│   ├── holdings_cache.py    # ETF holdings cache (working dir)
│   └── proxy_client.py      # Finnhub proxy endpoints
│
├── adapters/
│   ├── registry.py          # AdapterRegistry (ISIN → adapter mapping)
│   ├── base.py              # Base adapter class
│   ├── ishares.py           # iShares CSV adapter
│   ├── amundi.py            # Amundi XLSX adapter
│   └── vaneck.py            # VanEck adapter
│
├── core/services/
│   ├── decomposer.py        # ETF decomposition + ISIN resolution
│   ├── enricher.py          # Sector/geography enrichment
│   └── aggregator.py        # ISIN-based true exposure aggregation
│
└── core/contracts/
    ├── quality.py           # Quality scoring (is_trustworthy)
    ├── gates.py             # Validation gates
    └── pipeline_report.py   # Health report contract
```

---

## 7. Dependencies

### 7.1 External Libraries

| Library | Purpose | Already Installed? |
|---------|---------|-------------------|
| `pandas` | CSV/Excel parsing | ✅ Yes |
| `openpyxl` | Excel parsing | ✅ Yes |
| `httpx` | Async API calls | ✅ Yes |
| `SPARQLWrapper` | Wikidata queries | ❌ Add |

### 7.2 Internal Dependencies

```
ISINResolver
    ├── NameNormalizer
    ├── TickerParser
    ├── ResolutionCache (SQLite)
    ├── HiveClient (existing)
    └── ExternalResolvers
        ├── WikidataResolver
        ├── OpenFIGIResolver
        ├── FinnhubResolver
        └── YFinanceResolver
```

---

## 8. Parser Versioning & Resilience

ETF providers change export formats without warning. Parsers must be resilient.

### 8.1 Format Detection

Each parser implements format detection before parsing:

| Check | Purpose |
|-------|---------|
| Header row detection | Find actual data start (skip metadata rows) |
| Column name matching | Verify expected columns exist |
| Sample row validation | Check data types match expectations |

### 8.2 Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| New column added | Ignore, continue parsing known columns |
| Column renamed | Log warning, attempt fuzzy column match |
| Column removed | Log error, skip file if critical column |
| Row format changed | Log error, skip malformed rows |
| File structure changed | Raise `FormatChangedError`, alert user |

### 8.3 Version Tracking

```
parsers/
├── ishares.py          # Current parser
├── ishares_v1.py       # Archived: pre-2025 format
└── parser_registry.py  # Auto-detects format, selects parser
```

**On format change:**
1. Log detailed error with file sample
2. Fall back to manual upload flow
3. Create GitHub issue via feedback system
4. User can still use app with cached/manual data

---

## 9. User Identification

Contributors identified for corroboration counting without requiring login.

### 9.1 Strategy: Supabase Anonymous Auth

| Aspect | Implementation |
|--------|----------------|
| **Method** | Supabase `signInAnonymously()` |
| **Persistence** | Token stored in local keychain |
| **Stability** | Same ID across app restarts |
| **Privacy** | No PII collected, just anonymous UUID |

### 9.2 Contributor Hash

```
contributor_hash = SHA256(supabase_anonymous_user_id)
```

- Stored with each contribution
- Enables counting unique contributors per alias
- Cannot be reversed to identify user

### 9.3 Upgrade Path

If user later creates account:
- Anonymous contributions can be linked to account
- Contribution history preserved
- Trust score carries over

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| Parser fails to read file | Raise `ParseError`, skip file |
| Parser detects format change | Raise `FormatChangedError`, fall back to manual |
| Hive unavailable | Continue with local cache + APIs |
| All APIs fail | Log as unresolved, continue with null ISIN |
| Invalid ISIN format | Treat as name, attempt resolution |
| Duplicate ISIN candidates | Take highest confidence, log ambiguity |
| Contribution rejected | Log locally, retry on next sync |
