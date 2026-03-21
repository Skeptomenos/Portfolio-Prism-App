# Identity Resolution Specification

> **Purpose:** Define the system for resolving arbitrary security identifiers to canonical ISINs.
> **Status:** Draft
> **Last Updated:** 2025-12-26
> **Related:**
> - `keystone/strategy/identity-resolution.md` (resolution logic)
> - `keystone/architecture/identity-resolution.md` (components & integration)
> - `keystone/strategy/hive-architecture.md` (trust & validation model)
> - `keystone/strategy/external-integrations.md` (confidence scoring)

---

## 1. Problem Statement

ETF holdings data comes from multiple providers with **inconsistent identifiers**:

| Source | ISIN | Ticker | Name |
|--------|------|--------|------|
| Trade Republic | US67066G1040 | NVDA | "NVIDIA" |
| iShares CSV | ❌ | NVDA | "NVIDIA CORP" |
| Vanguard XLSX | ❌ | NVDA | "NVIDIA Corp" |
| Amundi XLSX | US67066G1040 | ❌ | "NVIDIA CORP" |
| justETF | ❌ | NVDA.OQ | "NVIDIA Corporation" |

**These are ALL the same company.** Without resolution, we cannot:
- Calculate true exposure across ETFs
- Detect position overlaps
- Aggregate by sector/country

---

## 2. Why This Matters

| Without Resolution | Impact |
|--------------------|--------|
| "NVIDIA CORP" ≠ "NVIDIA Corp" | Same holding counted twice, inflated exposure |
| No cross-ETF aggregation | Can't answer "what's my total NVIDIA exposure?" |
| Wrong overlap detection | User thinks they're diversified, but they're not |
| Broken sector breakdown | "NVIDIA CORP" has no sector, "NVIDIA" does |

**Why now?** We discovered that major ETF providers (iShares, Vanguard) don't include ISINs in their holdings exports. Without solving this, X-Ray is fundamentally broken.

**Why The Hive?** Resolution is expensive (API calls, rate limits). By contributing every resolution back, the community builds a shared knowledge base. After warm-up, most lookups are instant cache hits.

---

## 3. Assumptions

1. **ISIN is the canonical identifier** - Every public security has a unique 12-character ISIN
2. **The Hive grows organically** - Each resolution contributes back, improving future lookups
3. **Most lookups are repeats** - Cache hit rate should exceed 80% after warm-up
4. **Provider formats are stable** - iShares/Vanguard/Amundi export formats don't change frequently
5. **Fuzzy matching is risky** - Prefer exact matches; fuzzy only as last resort with low confidence

---

## 4. Provider Format Matrix

| Provider | File Type | Has ISIN | Has Ticker | Name Format | Parsing Notes |
|----------|-----------|----------|------------|-------------|---------------|
| **iShares** | CSV | ❌ | ✅ | "NVIDIA CORP" | Header at row 3, German |
| **Vanguard** | XLSX | ❌ | ✅ | "NVIDIA Corp" | Header at row 7, German |
| **Amundi** | XLSX | ✅ | ❌ | "NVIDIA CORP" | Invalid XML, needs raw extraction |
| **Trade Republic** | API | ✅ | ✅ | Mixed | Direct from API |

### Key Observations

- **iShares/Vanguard require resolution** - No ISINs provided
- **Amundi is the easy case** - ISINs included, no resolution needed
- **Ticker formats vary** - "2330" (local) vs "NVDA US" (Bloomberg) vs "NVDA.OQ" (Reuters)
- **Name formats vary** - "NVIDIA CORP" vs "NVIDIA Corp" vs "NVIDIA Corporation"

---

## 5. Requirements

### 4.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Resolve ticker symbols to ISINs |
| FR-2 | Resolve company names to ISINs |
| FR-3 | Validate and pass through existing ISINs |
| FR-4 | Parse provider-specific file formats (iShares CSV, Vanguard XLSX, Amundi XLSX) |
| FR-5 | Contribute new resolutions to The Hive immediately on API success |
| FR-6 | Cache resolutions locally for offline use |
| FR-7 | Report unresolved identifiers for manual review |

### 4.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Resolution rate | >95% of holdings resolved |
| NFR-2 | Cache hit rate | >80% from local/Hive |
| NFR-3 | Resolution latency | <100ms average |
| NFR-4 | API call reduction | <20% of resolutions hit external APIs |

---

## 6. Resolution Cascade

Order matters. Stop at first successful resolution.

| Priority | Source | Confidence | Cost |
|----------|--------|------------|------|
| 1 | Direct ISIN validation | 1.0 | Free |
| 2 | Local SQLite cache | 0.95 | Free |
| 3 | The Hive (Supabase) | 0.90 | Free |
| 4 | Wikidata SPARQL | 0.80 | Free |
| 5 | OpenFIGI | 0.80 | Free (rate-limited) |
| 6 | Finnhub API | 0.75 | Rate-limited |
| 7 | yFinance | 0.70 | Unreliable |
| 8 | Unresolved | 0.0 | Log for review |

### 6.1 External Data Sources

| Source | Type | Cost | Rate Limit | Best For | Notes |
|--------|------|------|------------|----------|-------|
| **Wikidata** | SPARQL | Free | None | ISIN lookup by name/ticker | High quality, community maintained |
| **OpenFIGI** | REST API | Free | 250/min | Ticker→ISIN, FIGI mapping | Industry standard symbology |
| **Finnhub** | REST API | Free tier | 60/min | Metadata enrichment | Good for sector/country |
| **yFinance** | Scraping | Free | Unstable | Fallback | Unreliable, use as last resort |

#### Alternative Sources (Future Consideration)

| Source | Cost | Notes |
|--------|------|-------|
| **Polygon.io** | Free tier available | Good US coverage, real-time data |
| **EODHD** | Free tier (20/day) | Global coverage, fundamental data |
| **Intrinio** | Paid | Professional grade, expensive |
| **Koyfin** | Free tier | Good for ETF data |

**Priority:** Free sources first. Paid sources only if free options fail consistently.

---

## 7. Normalization Rules

### 6.1 Name Normalization

**Goal:** "NVIDIA CORP", "Nvidia Corp", "NVIDIA Corporation" → "NVIDIA"

| Rule | Example |
|------|---------|
| Uppercase | "Nvidia Corp" → "NVIDIA CORP" |
| Strip suffixes | "NVIDIA CORP" → "NVIDIA" |
| Remove punctuation | "A.B.C." → "ABC" |
| Collapse whitespace | "NVIDIA  CORP" → "NVIDIA CORP" |

**Suffixes to strip:** CORPORATION, CORP, INCORPORATED, INC, LIMITED, LTD, PLC, AG, SA, NV, SE, CLASS A/B/C, REG, ADR, ADS, GDR

### 6.2 Ticker Parsing

**Goal:** Extract root ticker from various formats

| Format | Example | Root | Exchange |
|--------|---------|------|----------|
| Bloomberg | "NVDA US" | NVDA | US |
| Reuters | "NVDA.OQ" | NVDA | OQ |
| Yahoo | "NVDA.DE" | NVDA | DE |
| Local | "NVDA" | NVDA | - |
| Local (slash) | "BRK/B" | BRK/B | - |

**Search variants for "BRK/B":** BRK/B, BRKB, BRK.B

---

## 8. Confidence Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| ≥0.80 | High confidence | Auto-accept |
| 0.50-0.79 | Medium confidence | Use but flag for review |
| <0.50 | Low confidence | Reject, log as unresolved |

### 8.1 Trust & Validation

Alias contributions use the existing Hive trust model (see `keystone/strategy/hive-architecture.md` Section 3.4).

**Confidence Formula:**
```
(SubmissionCount * 40%) + (SourceReliability * 30%) + (Freshness * 20%) + (Consensus * 10%)
```

| Factor | MVP | v1+ |
|--------|-----|-----|
| **Corroboration threshold** | 1 (accept first valid) | 3 (require consensus) |
| **API-sourced trust** | Higher initial score | Higher initial score |
| **User-sourced trust** | Accept as provisional | Require corroboration |

**User Identification:** Supabase anonymous auth generates stable `contributor_hash` per device without requiring login.

### 8.2 Hive Seeding

To prevent cold start data quality issues, pre-populate the Hive before launch:

| Seed Data | Source | Count |
|-----------|--------|-------|
| S&P 500 constituents | OpenFIGI / Wikidata | ~500 |
| Major ETF holdings (top 10 ETFs) | Provider exports | ~2,000 unique |
| Common ticker aliases | Manual curation | ~100 |

**Why:** First user contributions are high-risk (MVP corroboration = 1). Seeding with authoritative data ensures common securities resolve correctly from day one.

---

## 9. Currency Handling

**Problem:** NVDA trades in USD (NASDAQ), EUR (Xetra), MXN (BMV). Same ISIN, different currencies.

| Scenario | Resolution |
|----------|------------|
| Ticker without exchange | Resolve ISIN, currency unknown |
| Ticker with exchange suffix | Resolve ISIN + infer currency from exchange |
| Provider includes currency | Store ticker→ISIN→currency mapping |

**Storage:** Aliases include optional `currency` and `exchange` fields. Resolution returns ISIN + currency when known.

**Currency Source Logging:** Store `currency_source: 'explicit' | 'inferred'` to track confidence. Inferred currencies flagged for future review.

**MVP Focus:** Resolve to ISIN. Currency is bonus metadata when available.

---

## 10. Metadata Enrichment

When hitting external APIs, capture all available metadata—not just ISIN.

| Field | Source Priority | Storage |
|-------|-----------------|---------|
| **ISIN** | All sources | Required |
| **Sector** | Finnhub > Wikidata > yFinance | Hive `assets.sector` |
| **Country** | Finnhub > Wikidata | Hive `assets.geography` |
| **Currency** | Exchange inference > API | Hive `listings.currency` |
| **Asset Class** | API response | Hive `assets.asset_class` |

**Conflict Resolution:** When sources disagree (e.g., OpenFIGI says "Technology", yFinance says "Electronics"):
- Store all values with source attribution
- Use highest-confidence source for display
- Flag conflicts for review

**MVP Focus:** Store ISIN + sector + country. Full metadata in v1+.

---

## 11. Temporal Validity

Aliases can become stale due to corporate actions (mergers, name changes, ticker changes).

| Field | Purpose |
|-------|---------|
| `valid_from` | When this alias became valid |
| `deprecated_at` | When this alias was superseded (null if current) |
| `superseded_by` | New alias that replaced this one |

**Examples:**
- "FACEBOOK" → deprecated 2021-10-28, superseded by "META PLATFORMS"
- "FB" → deprecated 2022-06-09, superseded by "META"

**MVP:** Not implemented. All aliases treated as current.
**v1+:** Add temporal fields, support historical lookups.

---

## 12. Edge Cases

| Case | Example | Solution |
|------|---------|----------|
| Dual-listed | TSM (US) vs 2330 (TW) | Same ISIN, multiple ticker aliases |
| Share classes | GOOGL vs GOOG | Different ISINs, preserve class info |
| Corporate actions | Facebook → Meta | Historical aliases, both resolve to same ISIN |
| Non-equity | Cash, futures | Skip resolution, use synthetic ID or null |
| Currency ambiguity | NVDA in USD vs EUR | Store exchange/currency with alias |

---

## 13. Components

| Component | Responsibility |
|-----------|----------------|
| `ISINResolver` | Orchestrates resolution cascade |
| `NameNormalizer` | Cleans company names for matching |
| `TickerParser` | Parses ticker formats, generates search variants |
| `ProviderParser` | Base class for format-specific parsers |
| `ISharesParser` | Parses iShares CSV exports |
| `VanguardParser` | Parses Vanguard XLSX exports |
| `AmundiParser` | Parses Amundi XLSX via raw XML extraction |
| `EagerContributor` | Contributes resolutions to Hive immediately |

---

## 14. Implementation Phases

| Phase | Scope | Deliverables |
|-------|-------|--------------|
| 1 | Core Infrastructure | ISINResolver, NameNormalizer, TickerParser, local cache |
| 2 | Provider Parsers | ISharesParser, VanguardParser, AmundiParser |
| 3 | Hive Integration | Eager contribution, fuzzy lookup |
| 4 | Pipeline Integration | Wire into decomposition, add metrics |

---

## 15. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Resolution Rate | >95% | Resolved / Total holdings |
| Cache Hit Rate | >80% | Cache hits / Total lookups |
| Hive Growth | +100/week | New aliases contributed |
| API Dependency | <20% | API calls / Total resolutions |
