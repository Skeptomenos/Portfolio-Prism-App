# Phase 5: Format Learning Implementation Plan

> **Workstream:** identity-resolution
> **Session ID:** IdentityResolution
> **Branch:** `fix/pipeline-tuning`
> **Created:** 2025-12-27
> **Status:** Ready for Implementation

---

## 1. Executive Summary

Phase 5 adds **format learning** to the identity resolution pipeline. The system will track which ticker formats succeed for each API and ETF provider, then use historical success rates to prioritize variants in future resolutions.

**Goal:** Reduce API calls and improve resolution speed by trying the most likely format first.

**Example:**
- iShares ETFs often use Bloomberg format: `NVDA US`
- Vanguard ETFs often use plain format: `NVDA`
- After learning, the resolver will try the historically successful format first for each provider.

---

## 2. Problem Statement

### Current Behavior

The `TickerParser.generate_variants()` method generates multiple ticker formats:
```python
# For "NVDA US", generates:
["NVDA US", "NVDA", "NVDAUS"]
```

The resolver tries each variant sequentially until one succeeds. This is inefficient because:
1. **Wasted API calls:** If `NVDA` always works for Finnhub, we still try `NVDA US` first
2. **No learning:** Success patterns are not remembered across sessions
3. **No provider context:** Different ETF providers use different formats

### Desired Behavior

1. Track which ticker format succeeded for each (API, ETF provider) combination
2. Persist learnings to SQLite
3. Reorder variants based on historical success rates
4. Fall back to default order for unknown providers

---

## 3. Current Architecture Analysis

### 3.1 Ticker Variant Generation

**File:** `src-tauri/python/portfolio_src/data/normalizer.py`

```python
class TickerParser:
    def generate_variants(self, ticker: str) -> List[str]:
        """Generate search variants ordered by specificity."""
        # Returns: [original, root, without_exchange, concatenated, ...]
```

**Current order:** Most specific first (original → root → simplified)

### 3.2 API Resolution Flow

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

```python
def _resolve_via_api(self, ticker, name, ticker_variants, name_variants):
    # 1. Wikidata - batch query with all name variants
    # 2. Finnhub - PRIMARY TICKER ONLY (tickers[0])
    # 3. yFinance - top 2 variants
```

**Key insight:** Finnhub only uses `tickers[0]`, so variant ordering matters most for yFinance and future APIs.

### 3.3 Local Cache Schema

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

Existing tables:
- `cache_listings` - ticker → ISIN mappings
- `cache_aliases` - name → ISIN mappings
- `isin_cache` - resolution cache (positive/negative)

**No table for format learnings.**

---

## 4. Target Schema

### 4.1 New SQLite Table: `format_learnings`

```sql
CREATE TABLE IF NOT EXISTS format_learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etf_provider TEXT NOT NULL,       -- e.g., "ishares", "vanguard", "unknown"
    api_source TEXT NOT NULL,         -- e.g., "api_finnhub", "api_yfinance", "api_wikidata"
    format_type TEXT NOT NULL,        -- e.g., "bloomberg", "reuters", "plain", "yahoo_dash"
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_success_at TIMESTAMP,
    last_failure_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(etf_provider, api_source, format_type)
);

CREATE INDEX IF NOT EXISTS idx_format_learnings_provider
    ON format_learnings (etf_provider);
CREATE INDEX IF NOT EXISTS idx_format_learnings_api
    ON format_learnings (api_source);
```

### 4.2 Column Semantics

| Column | Type | Description |
|--------|------|-------------|
| `etf_provider` | TEXT | ETF provider identifier (e.g., "ishares", "vanguard") |
| `api_source` | TEXT | API that was called (e.g., "api_finnhub", "api_yfinance") |
| `format_type` | TEXT | Ticker format category (see 4.3) |
| `success_count` | INTEGER | Number of successful resolutions with this format |
| `failure_count` | INTEGER | Number of failed resolutions with this format |
| `last_success_at` | TIMESTAMP | Most recent successful resolution |
| `last_failure_at` | TIMESTAMP | Most recent failed resolution |

### 4.3 Format Type Categories

| Format Type | Pattern | Example |
|-------------|---------|---------|
| `bloomberg` | `TICKER EXCHANGE` | `NVDA US`, `2330 TT` |
| `reuters` | `TICKER.EXCHANGE` | `NVDA.OQ`, `VOD.L` |
| `yahoo_dash` | `TICKER-CLASS` | `BRK-B` |
| `plain` | `TICKER` | `NVDA`, `AAPL` |
| `numeric` | `[0-9]+` | `005930` (Korean stocks) |

---

## 5. Implementation Details

### 5.1 Add Schema to LocalCache

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

Add to `_init_schema()`:

```python
-- Format learnings table
CREATE TABLE IF NOT EXISTS format_learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etf_provider TEXT NOT NULL,
    api_source TEXT NOT NULL,
    format_type TEXT NOT NULL,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_success_at TIMESTAMP,
    last_failure_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(etf_provider, api_source, format_type)
);

CREATE INDEX IF NOT EXISTS idx_format_learnings_provider
    ON format_learnings (etf_provider);
CREATE INDEX IF NOT EXISTS idx_format_learnings_api
    ON format_learnings (api_source);
```

### 5.2 Add LocalCache Methods

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

```python
def record_format_success(
    self,
    etf_provider: str,
    api_source: str,
    format_type: str,
) -> None:
    """Record a successful resolution with this format."""
    conn = self._get_connection()
    conn.execute(
        """
        INSERT INTO format_learnings (etf_provider, api_source, format_type, success_count, last_success_at, updated_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(etf_provider, api_source, format_type) DO UPDATE SET
            success_count = success_count + 1,
            last_success_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """,
        (etf_provider, api_source, format_type),
    )
    conn.commit()

def record_format_failure(
    self,
    etf_provider: str,
    api_source: str,
    format_type: str,
) -> None:
    """Record a failed resolution with this format."""
    conn = self._get_connection()
    conn.execute(
        """
        INSERT INTO format_learnings (etf_provider, api_source, format_type, failure_count, last_failure_at, updated_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(etf_provider, api_source, format_type) DO UPDATE SET
            failure_count = failure_count + 1,
            last_failure_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """,
        (etf_provider, api_source, format_type),
    )
    conn.commit()

def get_format_success_rates(
    self,
    etf_provider: str,
    api_source: str,
) -> Dict[str, float]:
    """
    Get success rates for each format type.
    
    Returns:
        Dict mapping format_type to success_rate (0.0 to 1.0)
    """
    conn = self._get_connection()
    cursor = conn.execute(
        """
        SELECT format_type, success_count, failure_count
        FROM format_learnings
        WHERE etf_provider = ? AND api_source = ?
        """,
        (etf_provider, api_source),
    )
    
    rates = {}
    for row in cursor.fetchall():
        total = row["success_count"] + row["failure_count"]
        if total > 0:
            rates[row["format_type"]] = row["success_count"] / total
    
    return rates
```

### 5.3 Add Format Detection to TickerParser

**File:** `src-tauri/python/portfolio_src/data/normalizer.py`

```python
class TickerParser:
    def detect_format(self, ticker: str) -> str:
        """
        Detect the format type of a ticker.
        
        Returns:
            Format type: "bloomberg", "reuters", "yahoo_dash", "numeric", or "plain"
        """
        if not ticker:
            return "plain"
        
        ticker = ticker.strip()
        
        # Bloomberg: "NVDA US"
        if self._bloomberg_pattern.match(ticker):
            return "bloomberg"
        
        # Reuters/Yahoo: "NVDA.OQ"
        if self._reuters_pattern.match(ticker):
            return "reuters"
        
        # Yahoo dash: "BRK-B"
        if self._yahoo_dash_pattern.match(ticker):
            return "yahoo_dash"
        
        # Numeric (Korean, etc.): "005930"
        if ticker.isdigit():
            return "numeric"
        
        return "plain"
```

### 5.4 Add Variant Reordering to ISINResolver

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

Add method to reorder variants based on learnings:

```python
def _reorder_variants_by_success(
    self,
    variants: List[str],
    etf_provider: str,
    api_source: str,
) -> List[str]:
    """
    Reorder ticker variants based on historical success rates.
    
    Args:
        variants: List of ticker variants
        etf_provider: ETF provider identifier
        api_source: Target API source
    
    Returns:
        Reordered list with highest success rate formats first
    """
    if not self._local_cache or not variants:
        return variants
    
    success_rates = self._local_cache.get_format_success_rates(etf_provider, api_source)
    
    if not success_rates:
        return variants  # No learnings yet, use default order
    
    def sort_key(variant: str) -> float:
        format_type = self._ticker_parser.detect_format(variant)
        # Higher success rate = lower sort key (comes first)
        # Unknown formats get 0.5 (neutral)
        return -success_rates.get(format_type, 0.5)
    
    return sorted(variants, key=sort_key)
```

### 5.5 Integrate Learning into Resolution Flow

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

Update `resolve()` to accept ETF provider context:

```python
def resolve(
    self,
    ticker: str,
    name: str,
    provider_isin: Optional[str] = None,
    weight: float = 0.0,
    etf_provider: str = "unknown",  # NEW PARAMETER
) -> ResolutionResult:
```

Update `_resolve_via_api()` to:
1. Reorder variants before trying
2. Record success/failure after each attempt

```python
def _resolve_via_api(
    self,
    ticker: str,
    name: str,
    ticker_variants: Optional[List[str]] = None,
    name_variants: Optional[List[str]] = None,
    etf_provider: str = "unknown",  # NEW PARAMETER
) -> ResolutionResult:
    names = name_variants or ([name] if name else [])
    tickers = ticker_variants or ([ticker] if ticker else [])
    
    # Reorder variants based on learnings for each API
    tickers_for_yfinance = self._reorder_variants_by_success(
        tickers, etf_provider, "api_yfinance"
    )
    
    primary_ticker = tickers[0] if tickers else ticker
    
    # ... existing Wikidata logic ...
    
    # 2. Finnhub - PRIMARY TICKER ONLY
    if primary_ticker:
        format_type = self._ticker_parser.detect_format(primary_ticker)
        isin, was_rate_limited = self._call_finnhub_with_status(primary_ticker)
        
        if isin:
            # Record success
            if self._local_cache:
                self._local_cache.record_format_success(etf_provider, "api_finnhub", format_type)
            # ... existing success handling ...
        else:
            # Record failure
            if self._local_cache:
                self._local_cache.record_format_failure(etf_provider, "api_finnhub", format_type)
    
    # 3. yFinance - use reordered variants
    for t in tickers_for_yfinance[:2]:
        format_type = self._ticker_parser.detect_format(t)
        isin = self._call_yfinance(t)
        
        if isin:
            if self._local_cache:
                self._local_cache.record_format_success(etf_provider, "api_yfinance", format_type)
            # ... existing success handling ...
        else:
            if self._local_cache:
                self._local_cache.record_format_failure(etf_provider, "api_yfinance", format_type)
```

### 5.6 Pass ETF Provider Through Pipeline

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

Update `_resolve_holdings_isins()` to pass ETF provider:

```python
def _resolve_holdings_isins(
    self,
    holdings: pd.DataFrame,
    etf_isin: str,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    # Determine ETF provider from ISIN or source
    etf_provider = self._detect_etf_provider(etf_isin)
    
    # ... existing logic ...
    
    result = self.isin_resolver.resolve(
        ticker=ticker,
        name=name,
        provider_isin=existing_isin if isinstance(existing_isin, str) else None,
        weight=weight,
        etf_provider=etf_provider,  # NEW
    )

def _detect_etf_provider(self, etf_isin: str) -> str:
    """Detect ETF provider from ISIN or cached source."""
    # Check cached source
    source = self._etf_sources.get(etf_isin, "")
    
    if "ishares" in source.lower():
        return "ishares"
    elif "vanguard" in source.lower():
        return "vanguard"
    elif "spdr" in source.lower() or "state_street" in source.lower():
        return "spdr"
    elif "invesco" in source.lower():
        return "invesco"
    elif "xtrackers" in source.lower():
        return "xtrackers"
    
    # Fallback: detect from ISIN prefix
    if etf_isin.startswith("IE"):
        return "ishares"  # Most IE ISINs are iShares
    elif etf_isin.startswith("US"):
        return "us_generic"
    
    return "unknown"
```

---

## 6. Task Breakdown

### IR-501: Track successful ticker formats per API
- Add `detect_format()` to TickerParser
- Add `etf_provider` parameter to `resolve()` and `_resolve_via_api()`
- Record success/failure after each API call
- **Estimate:** 1-2 hours

### IR-502: Persist format learnings to SQLite
- Add `format_learnings` table to LocalCache schema
- Add `record_format_success()`, `record_format_failure()`, `get_format_success_rates()` methods
- **Estimate:** 1 hour

### IR-503: Use historical success rates to prioritize variants
- Add `_reorder_variants_by_success()` to ISINResolver
- Integrate reordering into `_resolve_via_api()`
- Add `_detect_etf_provider()` to Decomposer
- Pass `etf_provider` through pipeline
- **Estimate:** 1-2 hours

### IR-504: Add unit tests for format learning
- Test format detection
- Test success/failure recording
- Test variant reordering
- Test ETF provider detection
- **Estimate:** 1 hour

---

## 7. File Changes

| File | Action | Description |
|------|--------|-------------|
| `data/local_cache.py` | MODIFY | Add `format_learnings` table and methods |
| `data/normalizer.py` | MODIFY | Add `detect_format()` to TickerParser |
| `data/resolution.py` | MODIFY | Add reordering, recording, `etf_provider` param |
| `core/services/decomposer.py` | MODIFY | Add `_detect_etf_provider()`, pass to resolver |
| `tests/test_resolution_phase5.py` | CREATE | Unit tests for format learning |
| `CHANGELOG.md` | MODIFY | Document changes |

---

## 8. Test Plan

### 8.1 Unit Tests

**File:** `src-tauri/python/tests/test_resolution_phase5.py`

```python
import pytest
from portfolio_src.data.normalizer import TickerParser
from portfolio_src.data.local_cache import LocalCache


class TestFormatDetection:
    """Test TickerParser.detect_format()."""

    def test_bloomberg_format(self):
        parser = TickerParser()
        assert parser.detect_format("NVDA US") == "bloomberg"
        assert parser.detect_format("2330 TT") == "bloomberg"
        assert parser.detect_format("VOD LN") == "bloomberg"

    def test_reuters_format(self):
        parser = TickerParser()
        assert parser.detect_format("NVDA.OQ") == "reuters"
        assert parser.detect_format("VOD.L") == "reuters"
        assert parser.detect_format("005930.KS") == "reuters"

    def test_yahoo_dash_format(self):
        parser = TickerParser()
        assert parser.detect_format("BRK-B") == "yahoo_dash"
        assert parser.detect_format("BRK-A") == "yahoo_dash"

    def test_numeric_format(self):
        parser = TickerParser()
        assert parser.detect_format("005930") == "numeric"
        assert parser.detect_format("2330") == "numeric"

    def test_plain_format(self):
        parser = TickerParser()
        assert parser.detect_format("NVDA") == "plain"
        assert parser.detect_format("AAPL") == "plain"
        assert parser.detect_format("BRKB") == "plain"


class TestFormatLearnings:
    """Test format learning persistence."""

    def test_record_success(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.record_format_success("ishares", "api_finnhub", "bloomberg")
        cache.record_format_success("ishares", "api_finnhub", "bloomberg")
        
        rates = cache.get_format_success_rates("ishares", "api_finnhub")
        assert rates["bloomberg"] == 1.0

    def test_record_failure(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.record_format_failure("ishares", "api_finnhub", "plain")
        
        rates = cache.get_format_success_rates("ishares", "api_finnhub")
        assert rates["plain"] == 0.0

    def test_mixed_success_failure(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.record_format_success("ishares", "api_finnhub", "bloomberg")
        cache.record_format_success("ishares", "api_finnhub", "bloomberg")
        cache.record_format_failure("ishares", "api_finnhub", "bloomberg")
        
        rates = cache.get_format_success_rates("ishares", "api_finnhub")
        assert rates["bloomberg"] == pytest.approx(0.666, rel=0.01)

    def test_empty_rates_for_unknown_provider(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        rates = cache.get_format_success_rates("unknown_provider", "api_finnhub")
        assert rates == {}


class TestVariantReordering:
    """Test variant reordering based on success rates."""

    def test_reorder_by_success_rate(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        
        # Bloomberg has 80% success, plain has 20%
        for _ in range(8):
            cache.record_format_success("ishares", "api_yfinance", "bloomberg")
        for _ in range(2):
            cache.record_format_failure("ishares", "api_yfinance", "bloomberg")
        
        for _ in range(2):
            cache.record_format_success("ishares", "api_yfinance", "plain")
        for _ in range(8):
            cache.record_format_failure("ishares", "api_yfinance", "plain")
        
        rates = cache.get_format_success_rates("ishares", "api_yfinance")
        assert rates["bloomberg"] > rates["plain"]


class TestETFProviderDetection:
    """Test ETF provider detection."""

    def test_detect_from_source(self):
        from portfolio_src.core.services.decomposer import Decomposer
        from unittest.mock import MagicMock
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
        )
        decomposer._etf_sources = {"IE00B4L5Y983": "ishares_adapter"}
        
        assert decomposer._detect_etf_provider("IE00B4L5Y983") == "ishares"

    def test_detect_from_isin_prefix(self):
        from portfolio_src.core.services.decomposer import Decomposer
        from unittest.mock import MagicMock
        
        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
        )
        
        assert decomposer._detect_etf_provider("IE00B4L5Y983") == "ishares"
        assert decomposer._detect_etf_provider("US1234567890") == "us_generic"
        assert decomposer._detect_etf_provider("DE1234567890") == "unknown"
```

---

## 9. Verification Checklist

After implementation, verify:

- [ ] `format_learnings` table created in LocalCache schema
- [ ] `detect_format()` correctly identifies all format types
- [ ] `record_format_success()` increments success_count
- [ ] `record_format_failure()` increments failure_count
- [ ] `get_format_success_rates()` returns correct rates
- [ ] Variants are reordered based on success rates
- [ ] ETF provider is detected from source or ISIN
- [ ] `etf_provider` is passed through resolve() chain
- [ ] All Phase 5 tests pass
- [ ] All existing tests still pass

---

## 10. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Format learnings persisted | No | Yes |
| Variant ordering adaptive | No | Yes |
| API calls reduced (estimated) | Baseline | -10-20% |

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Cold start (no learnings) | Fall back to default variant order |
| Wrong format detection | Conservative detection, prefer "plain" |
| Stale learnings | Consider TTL or decay factor (future) |
| Provider detection errors | Fall back to "unknown" |

---

## 12. Future Enhancements (Out of Scope)

- Decay factor for old learnings
- Per-ticker format memory (not just per-provider)
- Export/import learnings for sharing
- UI to view/reset learnings
