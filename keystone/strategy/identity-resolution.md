# Identity Resolution Strategy

> **Purpose:** Define how to resolve arbitrary security identifiers to canonical ISINs.
> **Related:**
> - `keystone/specs/identity_resolution.md` (requirements & formats)
> - `keystone/architecture/identity-resolution.md` (components & integration)
> - `keystone/strategy/hive-architecture.md` (trust & validation model)
> **Last Updated:** 2025-12-26

---

## 1. Resolution by Data Point

| What We Have | Strategy | Confidence |
|--------------|----------|------------|
| **ISIN** | Validate format, pass through | 1.0 |
| **Ticker only** | Parse → normalize → cascade lookup | 0.70-0.95 |
| **Name only** | Normalize → cascade lookup | 0.70-0.90 |
| **Ticker + Name** | Try ticker first, fall back to name | 0.70-0.95 |

---

## 2. Per-Provider Strategy

| Provider | Data Available | Resolution Path |
|----------|----------------|-----------------|
| **Amundi** | ISIN ✅ | Direct passthrough, no resolution |
| **Trade Republic** | ISIN ✅ | Direct passthrough, no resolution |
| **iShares** | Ticker + Name | Ticker lookup → Name fallback → API cascade |
| **Vanguard** | Ticker + Name | Ticker lookup → Name fallback → API cascade |

---

## 3. Resolution Cascade

Stop at first successful resolution.

```
┌─────────────────────────────────────────────────────────────┐
│                         INPUT                                │
│         identifier + type hint (TICKER/NAME/UNKNOWN)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Is it already an ISIN?                              │
│         (12 chars, 2-letter prefix, valid checksum)         │
│                                                             │
│         YES → Return immediately (confidence 1.0)           │
└─────────────────────────────────────────────────────────────┘
                              │ NO
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Normalize                                           │
│                                                             │
│         Ticker: extract root, generate variants             │
│                 "BRK/B" → [BRK/B, BRKB, BRK.B]             │
│                 "NVDA US" → [NVDA, NVDA US, NVDA.OQ]       │
│                                                             │
│         Name: uppercase, strip suffixes                     │
│               "NVIDIA CORP" → "NVIDIA"                      │
│               "Alphabet Inc Class A" → "ALPHABET"           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Local Cache (SQLite)                                │
│                                                             │
│         HIT → Return (confidence 0.95)                      │
└─────────────────────────────────────────────────────────────┘
                              │ MISS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: The Hive (Supabase)                                 │
│                                                             │
│         lookup_by_alias(normalized)                         │
│         HIT → Cache locally, return (confidence 0.90)       │
└─────────────────────────────────────────────────────────────┘
                              │ MISS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: External API Cascade                                │
│                                                             │
│         5a. Wikidata SPARQL (free) → confidence 0.80        │
│         5b. OpenFIGI (free, rate-limited) → confidence 0.80 │
│         5c. Finnhub API (rate-limited) → confidence 0.75    │
│         5d. yFinance (unreliable) → confidence 0.70         │
│                                                             │
│         On ANY success:                                     │
│           - Cache locally                                   │
│           - Contribute to Hive immediately                  │
│           - Return                                          │
└─────────────────────────────────────────────────────────────┘
                              │ ALL MISS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Unresolved                                          │
│                                                             │
│         Log for manual review (confidence 0.0)              │
│         Continue pipeline with null ISIN                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Ticker vs Name Priority

**Ticker is preferred** because:
- More standardized (NVDA is NVDA everywhere)
- Fewer variations than company names
- Faster exact-match lookup

**Name is fallback** because:
- More ambiguous ("NVIDIA" vs "NVIDIA CORP" vs "NVIDIA Corporation")
- Requires normalization and potentially fuzzy matching
- But sometimes it's all we have (rare)

**When both available:**
1. Try all ticker variants first
2. If all miss, try normalized name
3. Do NOT cross-validate (adds complexity, low value)

---

## 5. Eager Contribution

When an identifier is resolved via external API:

1. **Immediately contribute to Hive** - Don't wait for pipeline end
2. **Include metadata** - Source API, confidence score, timestamp
3. **Normalize before contributing** - Store canonical form
4. **Grab all available metadata** - Sector, country, currency (see spec Section 10)

This ensures:
- Next user with same identifier gets instant Hive hit
- Hive grows organically with real-world data
- API calls decrease over time
- Metadata enrichment happens once, benefits all users

---

## 6. Trust Model for Aliases

Alias contributions follow the Hive trust model (see `keystone/strategy/hive-architecture.md` Section 3.4).

### Source Weighting

| Source | Initial Trust | Rationale |
|--------|---------------|-----------|
| API resolution (Wikidata, OpenFIGI, Finnhub) | High (0.8) | Authoritative sources |
| User contribution | Low (0.5) | Needs corroboration |
| Hive consensus (3+ matching) | High (0.9) | Community validated |

### MVP vs v1+ Thresholds

| Phase | Corroboration Required | Rationale |
|-------|------------------------|-----------|
| **MVP** | 1 (accept first valid) | Fast Hive growth, bootstrap phase |
| **v1+** | 3 (require consensus) | Data quality over growth |

### Data Poisoning Prevention

| Risk | Mitigation |
|------|------------|
| Buggy resolver contributes wrong mapping | API-sourced mappings get higher trust than user-sourced |
| Malicious contribution | Low initial trust, requires corroboration in v1+ |
| Conflicting mappings | Flag for review, don't overwrite existing high-trust mapping |

### User Identification

Contributors identified by `contributor_hash` generated via Supabase anonymous auth:
- Stable per device (survives app restarts)
- No login required
- Enables contribution counting for corroboration

**Offline Fallback:** If Supabase is unreachable, use locally-generated device UUID as `contributor_hash`. Contributions are queued locally and synced when connectivity returns. This preserves the "local-first" promise.

---

## 7. Confidence Thresholds

| Score | Source | Action |
|-------|--------|--------|
| 1.0 | Direct ISIN | Use without question |
| 0.95 | Local cache | Use (previously validated) |
| 0.90 | Hive exact match | Use |
| 0.80 | Wikidata / OpenFIGI | Use |
| 0.75 | Finnhub | Use |
| 0.70 | yFinance | Use but flag as lower quality |
| <0.50 | Fuzzy match | Reject, log as unresolved |

**Threshold for auto-accept:** ≥0.70
**Threshold for rejection:** <0.50

---

## 8. Failure Handling

| Failure | Action |
|---------|--------|
| All sources miss | Log identifier, continue with null ISIN |
| API rate limit | Skip to next API in cascade |
| API timeout | Skip to next API in cascade |
| Hive unavailable | Continue with local cache + APIs |
| Fully offline | Use local cache only; if miss, display raw name as-is |
| Multiple ISIN candidates | Take highest confidence, log ambiguity |

### 8.1 Negative Caching

Cache failed lookups to prevent repeated API calls for the same unknown identifier.

| Cache Entry | TTL | Purpose |
|-------------|-----|---------|
| `{alias} → UNRESOLVED` | 24 hours | Prevent API quota burn on repeated failures |
| `{alias} → RATE_LIMITED` | 1 hour | Back off from rate-limited APIs |

**Why this matters:** If 1,000 users sync "Unknown Ticker X" at 9:00 AM, without negative caching we burn API quota on 1,000 identical failed lookups. With negative caching, only the first user hits APIs; others get instant "unresolved" from cache.

**Implementation:** Store in local SQLite cache with `resolution_status = 'unresolved'` and `expires_at` timestamp.

---

## 9. Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Resolution rate | >95% | Most holdings should resolve |
| Cache hit rate | >80% | After warm-up, most lookups are repeats |
| API dependency | <20% | Hive should handle most misses |
| Avg latency | <100ms | Cache/Hive hits are fast |
