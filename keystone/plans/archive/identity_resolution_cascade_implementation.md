# Identity Resolution Phase 2: API Cascade Reorder & Optimization

> **Purpose:** Reorder API cascade per spec, add confidence scoring, optimize API usage.
> **Status:** Draft (Updated after review)
> **Created:** 2025-12-27
> **Estimated Effort:** 4-5 hours
> **Priority:** HIGH
> **Depends On:** Phase 1 (Normalizer) - DONE
> **Related:**
> - `keystone/specs/identity_resolution.md` (requirements)
> - `keystone/plans/identity_resolution_normalizer_implementation.md` (Phase 1 - DONE)
> - `portfolio_src/data/resolution.py` (implementation target)

---

## 1. Executive Summary

The current API cascade order is **wrong**:

| Priority | Spec Says | Current Reality |
|----------|-----------|-----------------|
| 4 | Wikidata (free, 0.80) | Finnhub (rate-limited, 0.75) |
| 5 | OpenFIGI (free, 0.80) | Wikidata |
| 6 | Finnhub (rate-limited, 0.75) | yFinance |
| 7 | yFinance (unreliable, 0.70) | - |

**Problems:**
1. Finnhub is called first, burning rate-limited API quota
2. OpenFIGI is missing entirely (only reverse mapping exists)
3. Free APIs should be prioritized over rate-limited ones

**Deliverables:**
1. Reorder `_resolve_via_api()` cascade: Wikidata → Finnhub → yFinance
2. Add confidence scores to resolution results
3. Optimize API usage with smart variant selection
4. Add in-memory negative cache to prevent repeated failures
5. Batch Wikidata queries using SPARQL VALUES clause

---

## 2. Current State

### 2.1 Current Cascade Order

**File:** `portfolio_src/data/resolution.py` lines 318-343

```python
def _resolve_via_api(self, ticker: str, name: str) -> ResolutionResult:
    # 1. Finnhub (WRONG - should be last of paid APIs)
    isin = self._call_finnhub(ticker)
    if isin:
        return ResolutionResult(isin=isin, ...)

    # 2. Wikidata (WRONG - should be first)
    isin = self._call_wikidata(name, ticker)
    if isin:
        return ResolutionResult(isin=isin, ...)

    # 3. yFinance
    isin = self._call_yfinance(ticker)
    if isin:
        return ResolutionResult(isin=isin, ...)

    return ResolutionResult(isin=None, status="unresolved", ...)
```

### 2.2 What's Missing

1. **OpenFIGI resolver** - Not implemented for ticker→ISIN direction
2. **Confidence scores** - All sources return same confidence
3. **Name variants in Wikidata** - Only uses primary name, not variants

---

## 3. Target State

### 3.1 New Cascade Order

```python
def _resolve_via_api(self, ticker: str, name: str, 
                     ticker_variants: List[str], 
                     name_variants: List[str]) -> ResolutionResult:
    # 1. Wikidata (free, confidence 0.80)
    isin = self._call_wikidata(name_variants)
    if isin:
        return ResolutionResult(isin=isin, confidence=0.80, source="wikidata")

    # 2. OpenFIGI (free, rate-limited 250/min, confidence 0.80)
    isin = self._call_openfigi(ticker_variants)
    if isin:
        return ResolutionResult(isin=isin, confidence=0.80, source="openfigi")

    # 3. Finnhub (rate-limited 60/min, confidence 0.75)
    isin = self._call_finnhub(ticker_variants)
    if isin:
        return ResolutionResult(isin=isin, confidence=0.75, source="finnhub")

    # 4. yFinance (unreliable, confidence 0.70)
    isin = self._call_yfinance(ticker_variants)
    if isin:
        return ResolutionResult(isin=isin, confidence=0.70, source="yfinance")

    return ResolutionResult(isin=None, status="unresolved", ...)
```

---

## 4. Implementation Details

### 4.1 Add Confidence to ResolutionResult

**File:** `portfolio_src/data/resolution.py`

```python
@dataclass
class ResolutionResult:
    isin: Optional[str]
    status: Literal["resolved", "unresolved", "skipped"]
    detail: str
    source: Optional[str] = None
    confidence: float = 0.0  # NEW: Add confidence score
```

### 4.2 OpenFIGI Resolver Implementation

```python
OPENFIGI_API_URL = "https://api.openfigi.com/v3/mapping"

def _call_openfigi(self, ticker_variants: List[str]) -> Optional[str]:
    """
    Resolve ticker to ISIN via OpenFIGI API.
    
    Rate limit: 250 requests/minute (free tier, no API key required)
    Supports batch requests up to 100 items.
    """
    if not ticker_variants:
        return None

    headers = {
        "Content-Type": "application/json",
    }

    # Build batch request for all variants
    jobs = []
    for ticker in ticker_variants[:10]:  # Limit to 10 variants
        jobs.append({
            "idType": "TICKER",
            "idValue": ticker,
            "securityType2": "Common Stock",
        })

    try:
        response = requests.post(
            OPENFIGI_API_URL,
            headers=headers,
            json=jobs,
            timeout=15,
        )

        if response.status_code == 200:
            results = response.json()
            for result in results:
                if "data" in result and result["data"]:
                    for item in result["data"]:
                        # OpenFIGI doesn't return ISIN directly
                        # But we can use compositeFIGI to look up ISIN
                        # OR use the shareClassFIGI for equity
                        figi = item.get("compositeFIGI") or item.get("figi")
                        if figi:
                            # Need second call to get ISIN from FIGI
                            isin = self._figi_to_isin(figi)
                            if isin:
                                return isin

        elif response.status_code == 429:
            logger.warning("OpenFIGI rate limit hit")
            time.sleep(1)

    except Exception as e:
        logger.debug(f"OpenFIGI API error: {e}")

    return None

def _figi_to_isin(self, figi: str) -> Optional[str]:
    """Convert FIGI to ISIN via OpenFIGI lookup."""
    try:
        response = requests.post(
            OPENFIGI_API_URL,
            headers={"Content-Type": "application/json"},
            json=[{"idType": "ID_BB_GLOBAL", "idValue": figi}],
            timeout=10,
        )

        if response.status_code == 200:
            results = response.json()
            if results and "data" in results[0]:
                for item in results[0]["data"]:
                    # Check if there's an ISIN in metadata
                    # Note: OpenFIGI may not always have ISIN
                    pass

    except Exception as e:
        logger.debug(f"FIGI to ISIN lookup failed: {e}")

    return None
```

**Important Discovery:** OpenFIGI does NOT return ISINs directly. It returns FIGIs. We need a different approach.

### 4.3 Revised OpenFIGI Strategy

Since OpenFIGI doesn't return ISINs, we have two options:

**Option A: Use OpenFIGI for validation only**
- Use OpenFIGI to confirm a ticker exists and get metadata
- Still need another source for ISIN

**Option B: Use OpenFIGI's ID_ISIN reverse lookup**
- OpenFIGI can look up by ISIN to get ticker
- Not useful for our ticker→ISIN direction

**Option C: Skip OpenFIGI, enhance Wikidata**
- Wikidata has ISINs (P946 property)
- Focus on improving Wikidata hit rate with name variants

**Recommendation:** Option C - Skip OpenFIGI for now, focus on Wikidata improvements.

---

## 5. Revised Implementation Plan

Given OpenFIGI limitations, the revised plan is:

### 5.1 Phase 2A: Reorder Cascade & Add Confidence (2 hours)

| Task | Description |
|------|-------------|
| 1 | Add `confidence` field to `ResolutionResult` |
| 2 | Reorder `_resolve_via_api()`: Wikidata → Finnhub → yFinance |
| 3 | Update `_call_wikidata()` to try name variants |
| 4 | Update `_call_finnhub()` to try ticker variants |
| 5 | Update `_call_yfinance()` to try ticker variants |
| 6 | Add confidence scores to all resolution sources |

### 5.2 Phase 2B: OpenFIGI (Future - Optional)

OpenFIGI is useful for:
- FIGI→ticker mapping (already have this in `security_mapper.py`)
- Validating that a ticker exists
- Getting exchange/market sector metadata

But NOT for ticker→ISIN resolution. Defer to future phase.

---

## 6. Detailed Implementation

### 6.1 Update ResolutionResult

```python
@dataclass
class ResolutionResult:
    isin: Optional[str]
    status: Literal["resolved", "unresolved", "skipped"]
    detail: str
    source: Optional[str] = None
    confidence: float = 0.0

    def __post_init__(self):
        if self.isin and not is_valid_isin(self.isin):
            logger.warning(f"Invalid ISIN format: {self.isin}")
            self.isin = None
            self.status = "unresolved"
            self.detail = "isin_format_invalid"
            self.confidence = 0.0
```

### 6.2 Confidence Score Constants

```python
# Resolution confidence scores per spec
CONFIDENCE_PROVIDER = 1.0      # Provider-supplied ISIN
CONFIDENCE_LOCAL_CACHE = 0.95  # Local SQLite cache
CONFIDENCE_HIVE = 0.90         # The Hive (Supabase)
CONFIDENCE_WIKIDATA = 0.80     # Wikidata SPARQL
CONFIDENCE_OPENFIGI = 0.80     # OpenFIGI (if implemented)
CONFIDENCE_FINNHUB = 0.75      # Finnhub API
CONFIDENCE_YFINANCE = 0.70     # yFinance (unreliable)
CONFIDENCE_MANUAL = 0.85       # Manual enrichments
```

### 6.3 API Variant Strategy (CRITICAL)

**Problem:** Naive iteration burns API quota. If `BRK/B` generates 4 variants and all miss, that's 4 Finnhub calls wasted.

**Solution:** Tiered variant strategy per API type:

| API | Rate Limit | Variant Strategy |
|-----|------------|------------------|
| Wikidata | None | Batch all variants in single SPARQL query |
| Finnhub | 60/min | Primary ticker only (root from parser) |
| yFinance | Unstable | Top 2 variants max |

### 6.4 In-Memory Negative Cache

To prevent repeated API calls for known failures during a single run:

```python
class ISINResolver:
    def __init__(self, tier1_threshold: float = 1.0):
        # ... existing init ...
        self._api_negative_cache: Dict[str, float] = {}  # ticker -> timestamp
        self._negative_cache_ttl = 300  # 5 minutes
```

### 6.5 Reordered _resolve_via_api()

```python
def _resolve_via_api(
    self,
    ticker: str,
    name: str,
    ticker_variants: Optional[List[str]] = None,
    name_variants: Optional[List[str]] = None,
) -> ResolutionResult:
    """
    Resolve via external APIs in priority order.
    
    Order (per spec):
    1. Wikidata (free, 0.80) - batch query with all name variants
    2. Finnhub (rate-limited, 0.75) - primary ticker only
    3. yFinance (unreliable, 0.70) - top 2 variants
    """
    names = name_variants or ([name] if name else [])
    tickers = ticker_variants or ([ticker] if ticker else [])
    primary_ticker = tickers[0] if tickers else ticker

    # Check negative cache first
    if self._is_negative_cached(primary_ticker):
        return ResolutionResult(
            isin=None,
            status="unresolved",
            detail="negative_cached",
            confidence=0.0,
        )

    # 1. Wikidata - batch query with all name variants (FREE, no limit)
    isin = self._call_wikidata_batch(names)
    if isin:
        return ResolutionResult(
            isin=isin,
            status="resolved",
            detail="api_wikidata",
            source="wikidata",
            confidence=CONFIDENCE_WIKIDATA,
        )

    # 2. Finnhub - PRIMARY TICKER ONLY (rate-limited 60/min)
    if primary_ticker:
        isin = self._call_finnhub(primary_ticker)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_finnhub",
                source="finnhub",
                confidence=CONFIDENCE_FINNHUB,
            )

    # 3. yFinance - top 2 variants only (unreliable)
    for t in tickers[:2]:
        isin = self._call_yfinance(t)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_yfinance",
                source="yfinance",
                confidence=CONFIDENCE_YFINANCE,
            )

    # Cache this failure to prevent repeated calls
    self._add_negative_cache(primary_ticker)

    return ResolutionResult(
        isin=None,
        status="unresolved",
        detail="api_all_failed",
        confidence=0.0,
    )

def _is_negative_cached(self, ticker: str) -> bool:
    """Check if ticker is in negative cache and not expired."""
    if ticker not in self._api_negative_cache:
        return False
    cached_time = self._api_negative_cache[ticker]
    if time.time() - cached_time > self._negative_cache_ttl:
        del self._api_negative_cache[ticker]
        return False
    return True

def _add_negative_cache(self, ticker: str) -> None:
    """Add ticker to negative cache."""
    if ticker:
        self._api_negative_cache[ticker] = time.time()
```

### 6.6 Batched Wikidata Query

```python
def _call_wikidata_batch(self, name_variants: List[str]) -> Optional[str]:
    """
    Query Wikidata for ISIN using all name variants in a single SPARQL query.
    
    Uses VALUES clause to batch multiple names efficiently.
    """
    if not name_variants:
        return None

    # Limit to 5 variants to keep query reasonable
    variants = name_variants[:5]
    
    # Build VALUES clause for SPARQL
    values_clause = " ".join(f'"{v}"' for v in variants)
    
    sparql_query = f"""
    SELECT ?item ?isin WHERE {{
      VALUES ?searchName {{ {values_clause} }}
      ?item rdfs:label ?label .
      FILTER(UCASE(?label) = ?searchName)
      ?item wdt:P946 ?isin .
    }}
    LIMIT 1
    """

    headers = {
        "User-Agent": "PortfolioAnalyzer/1.0 (Educational Python Project)",
        "Accept": "application/sparql-results+json",
    }

    try:
        response = requests.get(
            "https://query.wikidata.org/sparql",
            params={"query": sparql_query, "format": "json"},
            headers=headers,
            timeout=15,
        )

        if response.status_code == 200:
            results = response.json().get("results", {}).get("bindings", [])
            if results:
                isin = results[0].get("isin", {}).get("value")
                if isin and is_valid_isin(isin):
                    return isin

    except Exception as e:
        logger.debug(f"Wikidata SPARQL error: {e}")

    # Fallback to entity search if SPARQL fails
    return self._call_wikidata_entity_search(name_variants[0])

def _call_wikidata_entity_search(self, name: str) -> Optional[str]:
    """Fallback: Search Wikidata entities by name (existing logic)."""
    # ... existing _call_wikidata logic ...
```

### 6.4 Update resolve() to Pass Variants to API

```python
# In resolve() method, update the API call:
result = self._resolve_via_api(
    ticker_clean,
    name_clean,
    ticker_variants=ticker_variants,
    name_variants=name_variants,
)
```

### 6.5 Update All Resolution Sources with Confidence

Update all `ResolutionResult` creations to include confidence:

| Source | Confidence | Location |
|--------|------------|----------|
| Provider ISIN | 1.0 | `resolve()` line ~135 |
| Manual enrichments | 0.85 | `resolve()` line ~150 |
| Local cache ticker | 0.95 | `_resolve_via_hive()` |
| Local cache alias | 0.95 | `_resolve_via_hive()` |
| Hive ticker | 0.90 | `_resolve_via_hive()` |
| Hive alias | 0.90 | `_resolve_via_hive()` |
| Legacy cache | 0.70 | `resolve()` line ~172 |
| Wikidata | 0.80 | `_resolve_via_api()` |
| Finnhub | 0.75 | `_resolve_via_api()` |
| yFinance | 0.70 | `_resolve_via_api()` |

---

## 7. Test Plan

### 7.1 Unit Tests to Add

```python
class TestResolutionConfidence:
    def test_provider_isin_has_confidence_1(self):
        """Provider-supplied ISIN should have confidence 1.0"""
        
    def test_wikidata_has_confidence_080(self):
        """Wikidata resolution should have confidence 0.80"""
        
    def test_finnhub_has_confidence_075(self):
        """Finnhub resolution should have confidence 0.75"""

class TestCascadeOrder:
    def test_wikidata_called_before_finnhub(self):
        """Wikidata should be tried before Finnhub"""
        
    def test_finnhub_called_before_yfinance(self):
        """Finnhub should be tried before yFinance"""
        
    def test_finnhub_uses_primary_ticker_only(self):
        """Finnhub should only try primary ticker, not all variants"""
        
    def test_yfinance_uses_top_2_variants(self):
        """yFinance should try at most 2 ticker variants"""

class TestNegativeCache:
    def test_negative_cache_prevents_repeated_calls(self):
        """Failed ticker should not trigger API calls again"""
        
    def test_negative_cache_expires_after_ttl(self):
        """Negative cache entries should expire after TTL"""
        
    def test_negative_cache_is_per_ticker(self):
        """Different tickers should have independent cache entries"""

class TestWikidataBatch:
    def test_wikidata_batch_sends_single_query(self):
        """Multiple name variants should be batched in one SPARQL query"""
        
    def test_wikidata_batch_limits_to_5_variants(self):
        """Batch query should limit to 5 variants max"""
        
    def test_wikidata_falls_back_to_entity_search(self):
        """If SPARQL fails, should fall back to entity search"""
```

### 7.2 Integration Tests

```python
class TestCascadeIntegration:
    def test_wikidata_success_skips_finnhub(self):
        """If Wikidata succeeds, Finnhub should not be called"""
        
    def test_wikidata_failure_falls_through_to_finnhub(self):
        """If Wikidata fails, should try Finnhub"""
        
    def test_all_apis_fail_adds_to_negative_cache(self):
        """Complete failure should add ticker to negative cache"""
        
    def test_negative_cached_ticker_returns_immediately(self):
        """Negative cached ticker should return without API calls"""
```

---

## 8. Implementation Order

```
1. Add confidence field to ResolutionResult
   └── Update dataclass definition
   └── Update __post_init__ to reset confidence on invalid ISIN

2. Add confidence constants
   └── Define CONFIDENCE_* constants at module level

3. Add in-memory negative cache
   └── Add _api_negative_cache dict to __init__
   └── Add _is_negative_cached() method
   └── Add _add_negative_cache() method

4. Implement batched Wikidata query
   └── Add _call_wikidata_batch() with SPARQL VALUES clause
   └── Keep existing _call_wikidata() as fallback (rename to _call_wikidata_entity_search)

5. Update _resolve_via_api()
   └── Add ticker_variants and name_variants parameters
   └── Reorder: Wikidata → Finnhub → yFinance
   └── Use tiered variant strategy (batch for Wikidata, primary only for Finnhub)
   └── Check negative cache before API calls
   └── Add to negative cache on failure

6. Update resolve() to pass variants
   └── Pass ticker_variants and name_variants to _resolve_via_api()

7. Update all ResolutionResult creations
   └── Add confidence to provider, manual, cache, hive sources

8. Add unit tests
   └── Test confidence values
   └── Test cascade order
   └── Test negative cache behavior
   └── Test Wikidata batching

9. Run full test suite
   └── Verify no regressions
```

---

## 9. Verification Checklist

After implementation, verify:

- [ ] `ResolutionResult` has `confidence` field
- [ ] Confidence constants defined per spec
- [ ] Wikidata called before Finnhub
- [ ] Finnhub called before yFinance
- [ ] All name variants tried for Wikidata
- [ ] All ticker variants tried for Finnhub/yFinance
- [ ] All resolution sources have correct confidence
- [ ] Existing tests pass
- [ ] New tests pass

---

## 10. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Wikidata hit rate | Unknown | >30% |
| Finnhub calls per resolution | 1-4 (all variants) | 1 (primary only) |
| API quota usage | High | Reduced 70% |
| Resolution confidence tracked | No | Yes |
| Repeated failure calls | Unlimited | 0 (negative cached) |
| Wikidata queries per resolution | 1-5 (sequential) | 1 (batched) |

---

## 11. Rollback Plan

If issues occur:

1. Revert `resolution.py` to previous version
2. No database changes required
3. No external dependencies added

---

## 12. Learning from Previous Runs

### 12.1 Problem: Guessing Ticker Suffixes

When we see "NVDA" from iShares, we don't know if Finnhub wants:
- `NVDA` (US)
- `NVDA.US`
- `NVDA US`

Currently we guess. But we can **learn** from successful resolutions.

### 12.2 Solution: Exchange Hint Learning

Track which ticker format works for each exchange:

```python
# In LocalCache or separate learning store
class TickerFormatLearner:
    """
    Learns which ticker format works for each exchange/provider combination.
    
    Example: If "NVDA" succeeds on Finnhub, remember that US stocks
    don't need a suffix for Finnhub.
    """
    
    def __init__(self):
        self._format_success: Dict[str, Dict[str, int]] = {}
        # Structure: {api_name: {format_pattern: success_count}}
        # Example: {"finnhub": {"bare": 50, "dot_suffix": 5}}
    
    def record_success(self, api: str, ticker: str, original_ticker: str) -> None:
        """Record which format worked."""
        pattern = self._detect_pattern(ticker, original_ticker)
        if api not in self._format_success:
            self._format_success[api] = {}
        self._format_success[api][pattern] = self._format_success[api].get(pattern, 0) + 1
    
    def get_best_format(self, api: str, ticker: str) -> str:
        """Return the most likely format for this API."""
        if api not in self._format_success:
            return ticker  # No data, use as-is
        
        # Return format with highest success rate
        best_pattern = max(self._format_success[api], key=self._format_success[api].get)
        return self._apply_pattern(ticker, best_pattern)
    
    def _detect_pattern(self, successful: str, original: str) -> str:
        """Detect what pattern was used."""
        if successful == original:
            return "bare"
        if " " in successful:
            return "space_suffix"
        if "." in successful and "." not in original:
            return "dot_suffix"
        return "other"
```

### 12.3 Implementation Strategy

**Phase 2 (Now):** Add basic in-memory negative cache to prevent repeated failures.

**Phase 3 (Future):** Add format learning:
1. On successful resolution, record the format that worked
2. On next resolution, try the most successful format first
3. Persist learnings to SQLite for cross-session learning

### 12.4 Quick Win: Provider-Specific Hints

We already know some patterns from provider data:

| Provider | Ticker Format | Hint |
|----------|---------------|------|
| iShares | `NVDA` | Bare ticker, US stocks |
| Vanguard | `NVDA` | Bare ticker |
| justETF | `NVDA.OQ` | Reuters format |

Use the provider as a hint for which format to try first:

```python
def _get_ticker_priority(self, ticker: str, provider: Optional[str] = None) -> List[str]:
    """Return ticker variants in priority order based on provider hint."""
    variants = self._ticker_parser.generate_variants(ticker)
    
    if provider == "ishares":
        # iShares uses bare US tickers, prioritize root
        root, _ = self._ticker_parser.parse(ticker)
        return [root] + [v for v in variants if v != root]
    
    if provider == "justetf":
        # justETF uses Reuters format, keep as-is
        return variants
    
    return variants
```

---

## 13. Future Considerations

### 13.1 OpenFIGI Integration (Deferred)

OpenFIGI could be useful for:
- Batch validation of tickers
- Getting exchange/market sector metadata
- FIGI-based lookups

But requires additional work to map FIGI→ISIN.

### 13.2 Batch Resolution

Current implementation resolves one holding at a time. Future optimization:
- Batch Wikidata SPARQL queries (implemented in Phase 2)
- Batch Finnhub calls (if API supports)
- Parallel resolution for independent holdings

### 13.3 Persistent Learning Store

Move format learning from in-memory to SQLite:
- Track success/failure per (ticker_format, api, exchange) tuple
- Use historical data to prioritize variants
- Decay old data to adapt to API changes

---

## 14. Next Steps After Implementation

1. **Phase 3:** Wire persistent negative caching (SQLite), remove legacy `enrichment_cache.json`
2. **Phase 4:** Store per-holding provenance in DataFrame
3. **Phase 5:** Add format learning with persistence
