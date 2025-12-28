# Phase 5: Format Learning - Observability (Simplified)

> **Workstream:** identity-resolution
> **Session ID:** IdentityResolution
> **Branch:** `fix/pipeline-tuning`
> **Created:** 2025-12-27
> **Updated:** 2025-12-27
> **Status:** Ready for Implementation

---

## 1. Executive Summary

Phase 5 adds **observability** to the identity resolution pipeline. We will log which ticker formats succeed/fail for each API, collecting data to inform future optimization decisions.

**Goal:** Understand real-world format patterns before building optimization logic.

**Non-Goal:** This phase does NOT implement adaptive reordering. That is deferred to Phase 5b (see `identity_resolution_format_optimization.md`).

---

## 2. Problem Statement

### Current Behavior

The resolver tries multiple ticker variants but we have no visibility into:
- Which formats succeed vs fail
- Which APIs work best with which formats
- Whether format patterns vary by ETF provider

### Desired Behavior

1. Log format success/failure for each API call
2. Persist logs to SQLite for analysis
3. Generate summary statistics on demand
4. Use data to inform future optimization (Phase 5b)

---

## 3. Current Architecture

### 3.1 API Resolution Flow

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

```python
def _resolve_via_api(self, ticker, name, ticker_variants, name_variants):
    # 1. Wikidata - batch query with all name variants
    # 2. Finnhub - PRIMARY TICKER ONLY (tickers[0])
    # 3. yFinance - top 2 variants
```

### 3.2 What We Don't Know

- Which ticker format works best for each API?
- Do different ETF providers use different formats?
- How many API calls are "wasted" on wrong formats?

**This phase adds logging to answer these questions.**

---

## 4. Target Schema

### 4.1 New SQLite Table: `format_logs`

```sql
CREATE TABLE IF NOT EXISTS format_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_input TEXT NOT NULL,       -- Original ticker from holdings
    ticker_tried TEXT NOT NULL,       -- Variant that was tried
    format_type TEXT NOT NULL,        -- Detected format type
    api_source TEXT NOT NULL,         -- API that was called
    success INTEGER NOT NULL,         -- 1 = success, 0 = failure
    etf_isin TEXT,                    -- Source ETF (for context)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_format_logs_api
    ON format_logs (api_source);
CREATE INDEX IF NOT EXISTS idx_format_logs_format
    ON format_logs (format_type);
CREATE INDEX IF NOT EXISTS idx_format_logs_created
    ON format_logs (created_at);
```

### 4.2 Column Semantics

| Column | Type | Description |
|--------|------|-------------|
| `ticker_input` | TEXT | Original ticker from ETF holdings data |
| `ticker_tried` | TEXT | The specific variant that was tried |
| `format_type` | TEXT | Detected format (bloomberg, reuters, plain, etc.) |
| `api_source` | TEXT | API that was called (api_finnhub, api_yfinance, api_wikidata) |
| `success` | INTEGER | 1 if resolved, 0 if failed |
| `etf_isin` | TEXT | Source ETF ISIN (nullable, for context) |
| `created_at` | TIMESTAMP | When the attempt was made |

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
-- Format logs table (observability only)
CREATE TABLE IF NOT EXISTS format_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_input TEXT NOT NULL,
    ticker_tried TEXT NOT NULL,
    format_type TEXT NOT NULL,
    api_source TEXT NOT NULL,
    success INTEGER NOT NULL,
    etf_isin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_format_logs_api
    ON format_logs (api_source);
CREATE INDEX IF NOT EXISTS idx_format_logs_format
    ON format_logs (format_type);
CREATE INDEX IF NOT EXISTS idx_format_logs_created
    ON format_logs (created_at);
```

### 5.2 Add LocalCache Methods

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

```python
def log_format_attempt(
    self,
    ticker_input: str,
    ticker_tried: str,
    format_type: str,
    api_source: str,
    success: bool,
    etf_isin: Optional[str] = None,
) -> None:
    """Log a format resolution attempt for analysis."""
    conn = self._get_connection()
    conn.execute(
        """
        INSERT INTO format_logs (ticker_input, ticker_tried, format_type, api_source, success, etf_isin)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (ticker_input, ticker_tried, format_type, api_source, 1 if success else 0, etf_isin),
    )
    conn.commit()

def get_format_stats(self) -> Dict[str, Any]:
    """
    Get summary statistics for format attempts.
    
    Returns:
        Dict with success rates by API and format type
    """
    conn = self._get_connection()
    
    # Overall stats by API
    cursor = conn.execute(
        """
        SELECT api_source, format_type,
               SUM(success) as successes,
               COUNT(*) as total
        FROM format_logs
        GROUP BY api_source, format_type
        ORDER BY api_source, total DESC
        """
    )
    
    stats = {"by_api_format": []}
    for row in cursor.fetchall():
        total = row["total"]
        rate = row["successes"] / total if total > 0 else 0
        stats["by_api_format"].append({
            "api": row["api_source"],
            "format": row["format_type"],
            "successes": row["successes"],
            "total": total,
            "rate": round(rate, 3),
        })
    
    return stats

def cleanup_old_format_logs(self, days: int = 30) -> int:
    """Remove format logs older than N days. Returns count deleted."""
    conn = self._get_connection()
    cursor = conn.execute(
        """
        DELETE FROM format_logs
        WHERE created_at < datetime('now', ?)
        """,
        (f"-{days} days",),
    )
    conn.commit()
    return cursor.rowcount
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

### 5.4 Integrate Logging into Resolution Flow

**File:** `src-tauri/python/portfolio_src/data/resolution.py`

Update `_resolve_via_api()` to log attempts:

```python
def _resolve_via_api(
    self,
    ticker: str,
    name: str,
    ticker_variants: Optional[List[str]] = None,
    name_variants: Optional[List[str]] = None,
    etf_isin: Optional[str] = None,  # NEW: for logging context
) -> ResolutionResult:
    names = name_variants or ([name] if name else [])
    tickers = ticker_variants or ([ticker] if ticker else [])
    primary_ticker = tickers[0] if tickers else ticker
    
    # ... existing Wikidata logic (no logging - batch query) ...
    
    # 2. Finnhub - PRIMARY TICKER ONLY
    if primary_ticker:
        format_type = self._ticker_parser.detect_format(primary_ticker)
        isin, was_rate_limited = self._call_finnhub_with_status(primary_ticker)
        
        # Log the attempt
        if self._local_cache:
            self._local_cache.log_format_attempt(
                ticker_input=ticker,
                ticker_tried=primary_ticker,
                format_type=format_type,
                api_source="api_finnhub",
                success=bool(isin),
                etf_isin=etf_isin,
            )
        
        if isin:
            # ... existing success handling ...
    
    # 3. yFinance - top 2 variants
    for t in tickers[:2]:
        format_type = self._ticker_parser.detect_format(t)
        isin = self._call_yfinance(t)
        
        # Log the attempt
        if self._local_cache:
            self._local_cache.log_format_attempt(
                ticker_input=ticker,
                ticker_tried=t,
                format_type=format_type,
                api_source="api_yfinance",
                success=bool(isin),
                etf_isin=etf_isin,
            )
        
        if isin:
            # ... existing success handling ...
```

### 5.5 Pass ETF ISIN Through Pipeline

**File:** `src-tauri/python/portfolio_src/core/services/decomposer.py`

Update `_resolve_holdings_isins()` to pass ETF ISIN for logging context:

```python
result = self.isin_resolver.resolve(
    ticker=ticker,
    name=name,
    provider_isin=existing_isin if isinstance(existing_isin, str) else None,
    weight=weight,
    etf_isin=etf_isin,  # NEW: for logging context
)
```

Update `resolve()` signature:

```python
def resolve(
    self,
    ticker: str,
    name: str,
    provider_isin: Optional[str] = None,
    weight: float = 0.0,
    etf_isin: Optional[str] = None,  # NEW: for logging context
) -> ResolutionResult:
```

---

## 6. Task Breakdown

### IR-501: Add format detection to TickerParser
- Add `detect_format()` method
- Detect: bloomberg, reuters, yahoo_dash, numeric, plain
- **Estimate:** 30 minutes

### IR-502: Add format_logs table and logging methods
- Add `format_logs` table to LocalCache schema
- Add `log_format_attempt()` method
- Add `get_format_stats()` method
- Add `cleanup_old_format_logs()` method
- **Estimate:** 1 hour

### IR-503: Integrate logging into resolution flow
- Update `_resolve_via_api()` to log each attempt
- Pass `etf_isin` through for context
- **Estimate:** 30 minutes

### IR-504: Add unit tests for format logging
- Test format detection
- Test log insertion
- Test stats aggregation
- Test cleanup
- **Estimate:** 1 hour

**Total estimate:** 3 hours (reduced from 4-6 hours)

---

## 7. File Changes

| File | Action | Description |
|------|--------|-------------|
| `data/local_cache.py` | MODIFY | Add `format_logs` table and logging methods |
| `data/normalizer.py` | MODIFY | Add `detect_format()` to TickerParser |
| `data/resolution.py` | MODIFY | Add logging calls, pass `etf_isin` |
| `core/services/decomposer.py` | MODIFY | Pass `etf_isin` to resolver |
| `tests/test_resolution_phase5.py` | CREATE | Unit tests for format logging |
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


class TestFormatLogging:
    """Test format logging persistence."""

    def test_log_format_attempt(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.log_format_attempt(
            ticker_input="NVDA US",
            ticker_tried="NVDA",
            format_type="plain",
            api_source="api_finnhub",
            success=True,
            etf_isin="IE00B4L5Y983",
        )
        
        stats = cache.get_format_stats()
        assert len(stats["by_api_format"]) == 1
        assert stats["by_api_format"][0]["api"] == "api_finnhub"
        assert stats["by_api_format"][0]["format"] == "plain"
        assert stats["by_api_format"][0]["successes"] == 1

    def test_stats_aggregation(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        
        # Log multiple attempts
        cache.log_format_attempt("NVDA US", "NVDA US", "bloomberg", "api_finnhub", False)
        cache.log_format_attempt("NVDA US", "NVDA", "plain", "api_finnhub", True)
        cache.log_format_attempt("AAPL", "AAPL", "plain", "api_finnhub", True)
        
        stats = cache.get_format_stats()
        
        # Find plain format stats
        plain_stats = next(s for s in stats["by_api_format"] if s["format"] == "plain")
        assert plain_stats["successes"] == 2
        assert plain_stats["total"] == 2
        assert plain_stats["rate"] == 1.0
        
        # Find bloomberg format stats
        bloomberg_stats = next(s for s in stats["by_api_format"] if s["format"] == "bloomberg")
        assert bloomberg_stats["successes"] == 0
        assert bloomberg_stats["total"] == 1
        assert bloomberg_stats["rate"] == 0.0

    def test_cleanup_old_logs(self, tmp_path):
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.log_format_attempt("NVDA", "NVDA", "plain", "api_finnhub", True)
        
        # Cleanup with 0 days should delete everything
        deleted = cache.cleanup_old_format_logs(days=0)
        assert deleted == 1
        
        stats = cache.get_format_stats()
        assert len(stats["by_api_format"]) == 0
```

---

## 9. Verification Checklist

After implementation, verify:

- [ ] `format_logs` table created in LocalCache schema
- [ ] `detect_format()` correctly identifies all format types
- [ ] `log_format_attempt()` inserts records
- [ ] `get_format_stats()` returns correct aggregations
- [ ] `cleanup_old_format_logs()` removes old entries
- [ ] Logging integrated into `_resolve_via_api()`
- [ ] `etf_isin` passed through for context
- [ ] All Phase 5 tests pass
- [ ] All existing tests still pass

---

## 10. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Format attempts logged | No | Yes |
| Stats queryable | No | Yes |
| Data available for analysis | No | Yes |

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Log table grows too large | `cleanup_old_format_logs()` with 30-day default |
| Logging slows resolution | Single INSERT per attempt, minimal overhead |
| Wrong format detection | Conservative detection, prefer "plain" |

---

## 12. Next Steps (Phase 5b)

After collecting data for 2-4 weeks, analyze logs and decide whether to implement adaptive reordering.

See: [`identity_resolution_format_optimization.md`](identity_resolution_format_optimization.md) (backlog)

**Questions to answer with data:**
1. Do different formats have significantly different success rates?
2. Is there variation by ETF provider?
3. How many API calls could be saved with optimal ordering?

If the data shows meaningful patterns, proceed with Phase 5b.
