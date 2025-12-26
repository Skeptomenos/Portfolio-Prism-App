# Identity Resolution Strategy

> **Purpose:** Define how to resolve arbitrary security identifiers to canonical ISINs.
> **Related:** `keystone/specs/identity_resolution.md` (requirements & formats)
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
│         5b. Finnhub API (rate-limited) → confidence 0.75    │
│         5c. yFinance (unreliable) → confidence 0.70         │
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

This ensures:
- Next user with same identifier gets instant Hive hit
- Hive grows organically with real-world data
- API calls decrease over time

---

## 6. Confidence Thresholds

| Score | Source | Action |
|-------|--------|--------|
| 1.0 | Direct ISIN | Use without question |
| 0.95 | Local cache | Use (previously validated) |
| 0.90 | Hive exact match | Use |
| 0.80 | Wikidata | Use |
| 0.75 | Finnhub | Use |
| 0.70 | yFinance | Use but flag as lower quality |
| <0.50 | Fuzzy match | Reject, log as unresolved |

**Threshold for auto-accept:** ≥0.70
**Threshold for rejection:** <0.50

---

## 7. Failure Handling

| Failure | Action |
|---------|--------|
| All sources miss | Log identifier, continue with null ISIN |
| API rate limit | Skip to next API in cascade |
| API timeout | Skip to next API in cascade |
| Hive unavailable | Continue with local cache + APIs |
| Multiple ISIN candidates | Take highest confidence, log ambiguity |

---

## 8. Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Resolution rate | >95% | Most holdings should resolve |
| Cache hit rate | >80% | After warm-up, most lookups are repeats |
| API dependency | <20% | Hive should handle most misses |
| Avg latency | <100ms | Cache/Hive hits are fast |
