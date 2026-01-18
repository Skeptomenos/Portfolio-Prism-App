# Pipeline Issue Priorities & Root Cause Analysis

**Generated:** 2026-01-14  
**Based on:** Interactive pipeline investigation with OpenJupy

---

## Quick Reference: Issue Priority Matrix

| Issue | Impact | Effort | Priority | Type |
|-------|--------|--------|----------|------|
| **Ticker Mappings** | €200+ value | 30 min | 🟢 **QUICK WIN** | Data |
| **Tier2 Threshold** | 44% of holdings | 2-4 hrs | 🟡 **HIGH VALUE** | Config/Code |
| **Amundi Adapter** | 2% of portfolio | 1-2 days | 🟠 **MEDIUM** | Feature |
| **Geography Gap** | UI cosmetic | 1 week | 🔴 **LOW** | Data collection |

---

## 🟢 QUICK WINS (Do First)

### 1. Make Ticker Mappings Permanent

**What:** Add the 10 tested ticker→ISIN mappings to persistent storage.

**Why Quick Win:**
- Already tested and verified working
- 30 minutes of work
- Immediate improvement (+24 ISINs)

**Where to Fix:**
```
src-tauri/python/portfolio_src/data/manual_enrichments.py
```

**The Fix:**
```python
# Add to MANUAL_TICKER_TO_ISIN dict:
MANUAL_TICKER_TO_ISIN = {
    "SAP.DE": "DE0007164600",
    "SIE.DE": "DE0007236101", 
    "7203.T": "JP3633400001",
    "8306.T": "JP3902900004",
    "NOVO-B.CO": "DK0062498333",
    "TJX": "US8725401090",
    "NEE": "US65339F1012",
    "BLK": "US09247X1019",
    "NXPI": "NL0009538784",
    "CBA.AX": "AU000000CBA7",
}
```

**Impact:** SAP and other major holdings will always resolve correctly.

---

### 2. Filter Cash Positions from Aggregation

**What:** Exclude "USD CASH", "EUR CASH", etc. from the exposure report.

**Why Quick Win:**
- Simple string filter
- Removes confusing "None ISIN" entries
- 15 minutes of work

**Where to Fix:**
```
src-tauri/python/portfolio_src/core/services/aggregator.py
```

**The Fix:**
```python
# In the aggregation loop, skip cash positions:
CASH_PATTERNS = ["CASH", "MONEY MARKET", "LIQUIDITY"]
if any(pattern in name.upper() for pattern in CASH_PATTERNS):
    continue  # Skip cash holdings
```

**Impact:** Cleaner exposure report, no more "None" ISIN confusion.

---

## 🟡 HIGH VALUE (Tackle Next)

### 3. ISIN Resolution Gap - Root Cause & Fix

**The Problem:**
44% of ETF holdings (1,578 out of 3,590) are marked as `tier2_skipped` and never get ISINs resolved.

**Root Cause Location:**
```
src-tauri/python/portfolio_src/data/resolution.py
Lines 185-209
```

**Root Cause Explained:**

```python
# Line 185: The tier check
is_tier2 = weight <= self.tier1_threshold  # threshold = 0.5%

# Line 187-194: For tier2, skip_network=True
result = self._resolve_via_hive(
    ticker_clean,
    name_clean,
    skip_network=is_tier2,  # <-- This is True for 44% of holdings
    ...
)

# Line 268-274: When skip_network=True and cache misses:
if skip_network:
    return ResolutionResult(
        isin=None,
        status="unresolved",
        detail="local_cache_miss",  # <-- This becomes "skipped"
        ...
    )
```

**The Flow:**
1. Holding has weight ≤ 0.5% → `is_tier2 = True`
2. `_resolve_via_hive()` called with `skip_network=True`
3. Local cache lookup fails (ticker not in `cache_listings`)
4. Because `skip_network=True`, Hive network call is skipped
5. Returns "unresolved" → converted to "skipped" at line 201-209

**Why So Many Skip:**
- MSCI World has 1,400 holdings
- Only ~100 holdings have weight > 0.5%
- The remaining 1,300 are all tier2
- Local cache only has ~1,600 ticker mappings
- Many international tickers (Japanese, European) aren't in cache

**Fix Options:**

#### Option A: Lower the Threshold (Simplest)
```python
# In pipeline.py line 188:
isin_resolver = ISINResolver(tier1_threshold=0.1)  # Was 0.5
```
- **Pros:** Simple config change
- **Cons:** More API calls, slower pipeline

#### Option B: Use Hive for Tier2 (Recommended)
```python
# In resolution.py, change line 191:
skip_network=False,  # Always try Hive, just skip APIs for tier2
```
Then modify the tier2 check to only skip API calls, not Hive:
```python
# Line 200-209: Only skip API, not Hive
if is_tier2:
    # Already tried Hive above, now skip API
    result = ResolutionResult(
        isin=None,
        status="skipped",
        detail="tier2_skipped",
        confidence=0.0,
    )
```
- **Pros:** Hive is fast, no API rate limits
- **Cons:** Requires code change

#### Option C: Bulk Seed Local Cache (Best Long-term)
Create a script to pre-populate `cache_listings` with common international tickers:
```python
# seed_cache.py
COMMON_TICKERS = {
    # German (XETRA)
    "SAP.DE": "DE0007164600",
    "SIE.DE": "DE0007236101",
    "ALV.DE": "DE0008404005",  # Allianz
    "BAS.DE": "DE000BASF111",  # BASF
    # Japanese (TSE)
    "7203.T": "JP3633400001",  # Toyota
    "6758.T": "JP3435000009",  # Sony
    # ... 500+ more
}
```
- **Pros:** No runtime overhead, works offline
- **Cons:** Maintenance burden, needs updates

**Recommended Approach:**
1. **Immediate:** Option A (lower threshold to 0.1%)
2. **Short-term:** Option B (enable Hive for tier2)
3. **Long-term:** Option C (seed cache with 500+ common tickers)

---

## 🟠 MEDIUM PRIORITY

### 4. Amundi ETF Support

**The Problem:**
2 Amundi ETFs (LU0908500753, FR0010361683) fail decomposition.

**Impact:** €847 (2% of portfolio) not analyzed.

**Root Cause Location:**
```
src-tauri/python/portfolio_src/adapters/amundi.py
```

**Root Cause:**
Amundi doesn't provide a public API. Their website requires:
1. Accepting cookies
2. Navigating to fund page
3. Downloading CSV manually

**Fix Options:**

#### Option A: Document Manual Upload (Quick)
- Add UI for users to upload Amundi CSV files
- Store in local cache
- **Effort:** 4-8 hours

#### Option B: Playwright Scraper (Complex)
- Use headless browser to automate download
- Handle cookie consent, navigation
- **Effort:** 2-3 days
- **Risk:** Fragile, may break with site changes

#### Option C: Community Data (Best)
- Add Amundi holdings to Hive
- One user uploads, everyone benefits
- **Effort:** 1 day (backend) + community adoption

**Recommended:** Option A first, then Option C.

---

## 🔴 LOW PRIORITY

### 5. Geography Enrichment Gap

**The Problem:**
Only 4.2% of holdings have geography data.

**Root Cause:**
- Hive `assets` table has sparse geography data
- API enrichment (Finnhub, yfinance) doesn't return geography
- No fallback to derive from ISIN country code

**Impact:** Cosmetic - UI shows "Unknown" for geography breakdown.

**Fix Options:**

#### Option A: Derive from ISIN (Quick Win)
```python
def get_geography_from_isin(isin: str) -> str:
    country_code = isin[:2]
    COUNTRY_MAP = {
        "US": "United States",
        "DE": "Germany",
        "JP": "Japan",
        "GB": "United Kingdom",
        # ... etc
    }
    return COUNTRY_MAP.get(country_code, "Unknown")
```
- **Pros:** Works for all resolved ISINs
- **Cons:** Not always accurate (e.g., US-listed foreign companies)

#### Option B: Enhance Hive Data
- Add geography to asset harvesting
- Pull from OpenFIGI or similar
- **Effort:** 1 week

**Recommended:** Option A as quick fallback, Option B for accuracy.

---

## Summary: Recommended Action Plan

### Week 1: Quick Wins
- [ ] Add 10 ticker mappings to `manual_enrichments.py`
- [ ] Filter cash positions from aggregation
- [ ] Lower tier1_threshold to 0.1%

### Week 2: Resolution Improvement
- [ ] Enable Hive lookup for tier2 holdings
- [ ] Add ISIN-based geography fallback
- [ ] Document Amundi manual upload process

### Week 3+: Long-term
- [ ] Seed local cache with 500+ common tickers
- [ ] Add Amundi holdings to Hive
- [ ] Enhance Hive geography data

---

## Files to Modify

| File | Changes |
|------|---------|
| `portfolio_src/data/manual_enrichments.py` | Add ticker mappings |
| `portfolio_src/core/services/aggregator.py` | Filter cash positions |
| `portfolio_src/data/resolution.py` | Enable Hive for tier2 |
| `portfolio_src/core/pipeline.py` | Lower tier1_threshold |
| `portfolio_src/data/enrichment.py` | Add geography fallback |

---

## Root Cause Deep Dive: The Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ISIN RESOLUTION FLOW                                  │
│                     (src-tauri/python/portfolio_src/data/resolution.py)      │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   START     │
                              │  resolve()  │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │ Provider    │
                              │ ISIN valid? │
                              └──────┬──────┘
                                     │ No
                              ┌──────▼──────┐
                              │   Manual    │
                              │ enrichments?│
                              └──────┬──────┘
                                     │ No
                              ┌──────▼──────┐
                              │ weight >    │
                              │ 0.5%?       │──────────────────┐
                              └──────┬──────┘                  │
                                     │ Yes                     │ No (TIER 2)
                              ┌──────▼──────┐           ┌──────▼──────┐
                              │ Local Cache │           │ Local Cache │
                              │ (ticker)    │           │ (ticker)    │
                              └──────┬──────┘           └──────┬──────┘
                                     │ Miss                    │ Miss
                              ┌──────▼──────┐           ┌──────▼──────┐
                              │ Local Cache │           │   SKIPPED   │ ◄── THE GAP
                              │ (alias)     │           │ (1,578)     │
                              └──────┬──────┘           └─────────────┘
                                     │ Miss
                              ┌──────▼──────┐
                              │ Hive Network│
                              │ (ticker)    │
                              └──────┬──────┘
                                     │ Miss
                              ┌──────▼──────┐
                              │ Hive Network│
                              │ (alias)     │
                              └──────┬──────┘
                                     │ Miss
                              ┌──────▼──────┐
                              │ API Calls   │
                              │ (Wikidata,  │
                              │  Finnhub,   │
                              │  yfinance)  │
                              └──────┬──────┘
                                     │ Miss
                              ┌──────▼──────┐
                              │ UNRESOLVED  │
                              └─────────────┘
```

**The Gap:** Tier2 holdings skip directly from "Local Cache Miss" to "SKIPPED" without trying Hive Network or APIs. This is by design (to avoid API rate limits), but the local cache doesn't have enough data to cover international tickers.

**The Fix:** Either populate the local cache with more data, or allow Hive Network lookups for tier2 (Hive has no rate limits).
