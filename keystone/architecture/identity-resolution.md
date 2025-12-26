# Identity Resolution Architecture

> **Purpose:** Define how identity resolution components are structured and integrated.
> **Related:** 
> - `keystone/specs/identity_resolution.md` (requirements & formats)
> - `keystone/strategy/identity-resolution.md` (resolution logic)
> **Last Updated:** 2025-12-26

---

## 1. System Context

Identity resolution is **Stage 0** of the X-Ray pipeline, before decomposition.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           X-RAY PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────┐ │
│  │   STAGE 0    │    │   STAGE 1    │    │   STAGE 2    │    │STAGE 3 │ │
│  │              │    │              │    │              │    │        │ │
│  │   Identity   │───▶│ Decompose    │───▶│  Aggregate   │───▶│ Enrich │ │
│  │  Resolution  │    │  ETFs into   │    │   by ISIN    │    │  with  │ │
│  │              │    │  Holdings    │    │              │    │  Data  │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └────────┘ │
│         │                                                                │
│         │ Resolves: Ticker/Name → ISIN                                  │
│         │ Enables: Accurate aggregation across ETFs                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why Stage 0?**
- Decomposition needs ISINs to aggregate holdings across ETFs
- Without resolution, "NVIDIA CORP" and "NVIDIA Corp" are treated as different securities
- Resolution must happen before any cross-ETF analysis

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
│  │  │ get/set     │  │ lookup      │  │ - FinnhubResolver       │  │    │
│  │  │             │  │ contribute  │  │ - YFinanceResolver      │  │    │
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
     ├──▶ Wikidata ────HIT──▶ Cache + Contribute to Hive, Return (0.80)
     │         │
     │        MISS
     │         ▼
     ├──▶ Finnhub ─────HIT──▶ Cache + Contribute to Hive, Return (0.75)
     │         │
     │        MISS
     │         ▼
     ├──▶ yFinance ────HIT──▶ Cache + Contribute to Hive, Return (0.70)
     │         │
     │        MISS
     │         ▼
     └──▶ Unresolved ────────▶ Log, Return (confidence 0.0)
```

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
    source TEXT NOT NULL,             -- "finnhub", "wikidata", "user", etc.
    confidence REAL NOT NULL,
    contributed_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(alias, alias_type)
);

CREATE INDEX idx_aliases_alias ON security_aliases(alias);
```

---

## 5. Integration Points

### 5.1 Entry Point

Resolution is called from `decomposition.py` before processing holdings:

```
decomposition.py
     │
     │  # Before: holdings processed without ISIN validation
     │  # After:  holdings resolved first
     │
     ▼
┌─────────────────────────────────────┐
│ def decompose_etf(etf_holdings):    │
│                                     │
│     resolver = ISINResolver()       │  ◀── NEW
│                                     │
│     for holding in etf_holdings:    │
│         enriched = resolver.resolve(holding)  ◀── NEW
│         # Continue with enriched holding
│                                     │
└─────────────────────────────────────┘
```

### 5.2 HiveClient Extensions

Add methods to existing `hive_client.py`:

| Method | Purpose |
|--------|---------|
| `lookup_by_alias(alias, alias_type)` | Query Hive for ISIN by alias |
| `contribute_alias(isin, alias, alias_type, source, confidence)` | Add new alias mapping |
| `batch_contribute(aliases)` | Bulk contribute (for offline sync) |

### 5.3 New vs Modified Files

| Action | File | Changes |
|--------|------|---------|
| **NEW** | `portfolio_src/data/resolver.py` | ISINResolver class |
| **NEW** | `portfolio_src/data/normalizer.py` | NameNormalizer, TickerParser |
| **NEW** | `portfolio_src/data/parsers/ishares.py` | ISharesParser |
| **NEW** | `portfolio_src/data/parsers/vanguard.py` | VanguardParser |
| **NEW** | `portfolio_src/data/parsers/amundi.py` | AmundiParser |
| **MODIFY** | `portfolio_src/data/hive_client.py` | Add alias lookup/contribute |
| **MODIFY** | `portfolio_src/core/decomposition.py` | Call resolver before processing |
| **MODIFY** | `portfolio_src/data/database.py` | Add isin_cache table |

---

## 6. File Structure

```
src-tauri/python/portfolio_src/
├── data/
│   ├── resolver.py          # NEW: ISINResolver orchestrator
│   ├── normalizer.py        # NEW: NameNormalizer, TickerParser
│   ├── hive_client.py       # MODIFY: Add alias methods
│   ├── database.py          # MODIFY: Add cache table
│   └── parsers/             # NEW: Provider-specific parsers
│       ├── __init__.py
│       ├── base.py          # ProviderParser base class
│       ├── ishares.py       # ISharesParser
│       ├── vanguard.py      # VanguardParser
│       └── amundi.py        # AmundiParser
│
├── core/
│   └── decomposition.py     # MODIFY: Integrate resolver
│
└── models/
    └── holding.py           # MODIFY: Add EnrichedHolding
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
        ├── FinnhubResolver
        └── YFinanceResolver
```

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Parser fails to read file | Raise `ParseError`, skip file |
| Hive unavailable | Continue with local cache + APIs |
| All APIs fail | Log as unresolved, continue with null ISIN |
| Invalid ISIN format | Treat as name, attempt resolution |
| Duplicate ISIN candidates | Take highest confidence, log ambiguity |
