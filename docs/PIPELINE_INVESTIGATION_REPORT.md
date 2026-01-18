# Portfolio Prism Pipeline Investigation Report

**Generated:** 2026-01-14  
**Method:** Interactive step-by-step debugging with OpenJupy MCP  
**Portfolio:** €42,942.57 (20 stocks, 10 ETFs)

---

## Executive Summary

The Portfolio Prism analytics pipeline is **functional but has significant data coverage gaps**. The pipeline successfully processes 97.7% of ETF value, but only 56% of underlying holdings get fully resolved ISINs, limiting enrichment coverage.

### Key Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Portfolio Value | €42,942.57 | ✓ Calculated correctly |
| ETFs Decomposed | 8/10 (97.7% of value) | ⚠️ 2 Amundi ETFs failed |
| ISIN Resolution Rate | 56.0% (2,012/3,590) | ⚠️ 44% skipped |
| Sector Coverage | 55.9% | ⚠️ Matches resolution rate |
| Geography Coverage | 4.2% | ❌ Critical gap |
| Value Accuracy | +0.04% difference | ✓ Excellent |
| Quality Score | 1.00 | ✓ Trustworthy |

---

## Phase-by-Phase Analysis

### Phase 1: Data Loading ✓

**Status:** Fully functional

| Check | Result |
|-------|--------|
| Positions loaded | 30 (20 stocks, 10 ETFs) |
| ISIN validity | 100% valid |
| Value calculation | €42,942.57 |
| Null columns | sector, region (expected - needs enrichment) |

**Findings:**
- Data loads correctly from SQLite database
- All ISINs pass validation
- Asset class distribution: 19 stocks, 10 ETFs, 1 crypto
- Top holding: Core MSCI World (€13,780, 32% of portfolio)

---

### Phase 2: ETF Decomposition ⚠️

**Status:** Mostly functional with gaps

| Metric | Value |
|--------|-------|
| ETFs processed | 8/10 |
| ETFs failed | 2 (Amundi) |
| Value coverage | 97.7% |
| Holdings extracted | 3,590 |
| Weight sums | All within 95-105% ✓ |

**ETF Resolution Sources:**

| ETF ISIN | Source | Holdings | Status |
|----------|--------|----------|--------|
| IE00B4L5Y983 | cached | 1,400 | ✓ Core MSCI World |
| IE00B3WJKG14 | cached | 76 | ✓ S&P 500 Info Tech |
| IE00B53SZB19 | cached | 516 | ✓ NASDAQ100 |
| IE0031442068 | cached | 508 | ✓ Core S&P 500 |
| IE00BYVQ9F29 | cached | 110 | ✓ NASDAQ100 EUR |
| DE000A0F5UF5 | cached | 107 | ✓ |
| IE00BL25JP72 | cached | 365 | ✓ |
| IE00B5BMR087 | cached | 508 | ✓ |
| LU0908500753 | failed | 0 | ❌ Amundi - manual upload |
| FR0010361683 | failed | 0 | ❌ Amundi - manual upload |

**ISIN Resolution Breakdown:**

| Status | Count | Percentage |
|--------|-------|------------|
| Resolved | 2,012 | 56.0% |
| Skipped (tier2) | 1,578 | 44.0% |
| Unresolved | 0 | 0% |

**Resolution Sources:**
- `local_cache_ticker`: 1,663 (82.7%)
- `existing`: 349 (17.3%)

**Critical Finding:** 44% of holdings are "tier2_skipped" because their weight is below the 0.5% threshold. These holdings have tickers but no resolved ISINs.

---

### Phase 3: Enrichment ⚠️

**Status:** Limited by resolution gaps

| Metric | Value |
|--------|-------|
| Holdings processed | 3,590 |
| Errors | 0 |
| Sector coverage | 55.9% |
| Geography coverage | 4.2% |

**Enrichment Sources:**
- Hive: 693 ISINs (90.1%)
- API: 75 ISINs (9.9%)

**Root Cause Analysis:**
- Enrichment requires valid ISINs
- 44% of holdings have no ISIN (tier2_skipped)
- These holdings cannot be enriched
- Geography data is sparse even for resolved ISINs

**Sector Distribution (resolved holdings):**

| Sector | Count |
|--------|-------|
| Equity | 1,837 |
| Financial Services | 13 |
| Insurance | 11 |
| Road & Rail | 9 |
| Utilities | 9 |

---

### Phase 4: Aggregation ✓

**Status:** Functional with minor issues

| Metric | Value |
|--------|-------|
| Unique securities | 781 |
| Value accuracy | +0.04% (€16.84 difference) |
| Duplicate ISINs | 0 ✓ |

**Top 10 Exposures:**

| ISIN | Name | Exposure | % |
|------|------|----------|---|
| US67066G1040 | NVIDIA | €5,320 | 12.4% |
| DE0007164600 | SAP | €41 | 0.1% |
| US5949181045 | Microsoft | €3,559 | 8.3% |
| US0378331005 | Apple | €2,899 | 6.8% |
| US02079K3059 | Alphabet A | €1,912 | 4.5% |

**Issue Found:** "USD CASH" (€4,084, 9.5%) aggregates under None ISIN. This is expected behavior for cash positions in ETFs, not a bug.

---

### Phase 5: Quality Validation ✓

**Status:** All gates passed

| Metric | Value |
|--------|-------|
| Quality Score | 1.00 |
| Is Trustworthy | True |
| Critical Issues | 0 |
| High Issues | 0 |
| Medium Issues | 0 |
| Low Issues | 0 |

---

## Issues Identified

### 1. ISIN Resolution Gap (HIGH PRIORITY)

**Problem:** 44% of ETF holdings (1,578) are skipped during ISIN resolution.

**Root Cause:** The `tier1_threshold` is set to 0.5%, meaning holdings below this weight don't trigger API resolution.

**Impact:**
- No enrichment data for these holdings
- Incomplete sector/geography breakdown
- Aggregation groups them by ticker instead of ISIN

**Evidence:**
```
Resolution Status Distribution (MSCI World):
- resolved: 701
- skipped: 699
```

**Recommendation:** 
1. Lower tier1_threshold for high-value ETFs
2. Add bulk ticker→ISIN mappings for common international stocks
3. Consider weight-based prioritization (resolve top N holdings regardless of threshold)

---

### 2. Amundi ETF Support (MEDIUM PRIORITY)

**Problem:** 2 Amundi ETFs cannot be decomposed automatically.

**Affected ETFs:**
- LU0908500753 (Core Stoxx Europe 600) - €682
- FR0010361683 - €165

**Total Impact:** €847 (2.3% of ETF value)

**Root Cause:** Amundi's website requires manual CSV download; no API available.

**Recommendation:**
1. Document manual upload process for users
2. Consider web scraping adapter (with rate limiting)
3. Add to Hive community data

---

### 3. Geography Enrichment Gap (LOW PRIORITY)

**Problem:** Only 4.2% of holdings have geography data.

**Root Cause:** 
- Hive data lacks geography for most assets
- API enrichment focuses on sector, not geography

**Recommendation:**
1. Enhance Hive data collection to include geography
2. Add geography lookup to API enrichment flow
3. Consider deriving geography from ISIN country code

---

### 4. Ticker Format Variations (FIXED)

**Problem:** International tickers (SAP.DE, 7203.T, NOVO-B.CO) weren't resolving.

**Root Cause:** Local cache lacked mappings for exchange-suffixed tickers.

**Fix Applied:** Added 10 high-impact ticker→ISIN mappings:
- SAP.DE → DE0007164600 (SAP)
- SIE.DE → DE0007236101 (Siemens)
- 7203.T → JP3633400001 (Toyota)
- 8306.T → JP3902900004 (Mitsubishi UFJ)
- NOVO-B.CO → DK0062498333 (Novo Nordisk)
- TJX → US8725401090 (TJX Companies)
- NEE → US65339F1012 (NextEra Energy)
- BLK → US09247X1019 (BlackRock)
- NXPI → NL0009538784 (NXP Semiconductors)
- CBA.AX → AU000000CBA7 (Commonwealth Bank)

**Result:** +24 ISINs resolved, SAP now properly tracked.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PORTFOLIO PRISM PIPELINE                         │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   PHASE 1    │     │   PHASE 2    │     │   PHASE 3    │     │   PHASE 4    │
│  Data Load   │────▶│  Decompose   │────▶│   Enrich     │────▶│  Aggregate   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
  30 positions         3,590 holdings      55.9% enriched      781 securities
  €42,943 value        8/10 ETFs OK        4.2% geography      +0.04% accuracy
  100% valid ISINs     56% resolved        Hive: 90%           Quality: 1.0

                              │
                              ▼
                    ┌──────────────────┐
                    │   RESOLUTION     │
                    │     TIERS        │
                    └──────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  TIER 1  │        │  TIER 2  │        │ SKIPPED  │
    │ >0.5% wt │        │ ≤0.5% wt │        │ No ISIN  │
    │ API call │        │ Cache    │        │          │
    └──────────┘        └──────────┘        └──────────┘
         │                   │                   │
         ▼                   ▼                   ▼
    2,012 resolved      0 resolved         1,578 skipped
```

---

## Recommendations

### Immediate Actions

1. **Make ticker mappings permanent**
   - Add the 10 tested mappings to `manual_enrichments.json`
   - Or create a seed script for local cache

2. **Filter cash positions**
   - Exclude "USD CASH", "EUR CASH" from aggregation
   - Or create separate "Cash" category

### Short-term Improvements

3. **Enhance tier2 resolution**
   - Option A: Lower threshold to 0.1% for large ETFs
   - Option B: Resolve top 100 holdings regardless of weight
   - Option C: Use Hive for tier2 (no API calls)

4. **Document Amundi workflow**
   - Create user guide for manual CSV upload
   - Add upload UI in settings

### Long-term Enhancements

5. **Geography enrichment**
   - Derive from ISIN country code as fallback
   - Enhance Hive data collection

6. **Community contributions**
   - Encourage users to contribute ticker→ISIN mappings
   - Auto-harvest resolved ISINs to Hive

---

## Appendix: Ticker Mappings to Add

These mappings were tested and verified during the investigation:

```json
{
  "SAP.DE": "DE0007164600",
  "SIE.DE": "DE0007236101",
  "7203.T": "JP3633400001",
  "8306.T": "JP3902900004",
  "NOVO-B.CO": "DK0062498333",
  "TJX": "US8725401090",
  "NEE": "US65339F1012",
  "BLK": "US09247X1019",
  "NXPI": "NL0009538784",
  "CBA.AX": "AU000000CBA7"
}
```

---

## Appendix: Test Environment

```python
# Kernel state after investigation
Variables in memory:
- pipeline: Pipeline instance
- direct_positions: DataFrame (20 rows)
- etf_positions: DataFrame (10 rows)
- holdings_map: Dict[str, DataFrame] (8 ETFs)
- enriched_holdings: Dict[str, DataFrame] (8 ETFs)
- exposure_df: DataFrame (781 rows)
- decomposer, enricher, aggregator: Service instances
- local_cache: LocalCache instance

# Fixes applied during session:
- 10 ticker→ISIN mappings added to local cache
- All persist in SQLite until cache expiry
```

---

*Report generated via interactive OpenJupy debugging session*
