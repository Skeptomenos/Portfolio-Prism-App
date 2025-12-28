# Identity Resolution Phase 1: Normalizer Implementation Plan

> **Purpose:** Detailed implementation guide for NameNormalizer and TickerParser components.
> **Status:** Draft
> **Created:** 2025-12-27
> **Estimated Effort:** 4-5 hours
> **Priority:** P0 (Critical)
> **Related:**
> - `keystone/specs/identity_resolution.md` (requirements)
> - `keystone/plans/identity_resolution_schema_implementation.md` (schema - DONE)
> - `portfolio_src/data/resolution.py` (integration target)

---

## 1. Executive Summary

This plan implements the **missing normalization layer** that is the #1 cause of duplicate holdings. Without normalization:
- "NVIDIA CORP" ≠ "NVIDIA Corporation" (same company, different strings)
- "NVDA US" ≠ "NVDA.OQ" ≠ "NVDA" (same ticker, different formats)

**Deliverables:**
1. `NameNormalizer` class - Strips suffixes, normalizes company names
2. `TickerParser` class - Parses formats, generates search variants
3. Integration into `ISINResolver.resolve()`
4. Unit tests with 90%+ coverage

---

## 2. Current State

### 2.1 What Exists

**File:** `portfolio_src/data/resolution.py` lines 122-123

```python
ticker_clean = (ticker or "").strip()
name_clean = (name or "").strip()
```

This is the **entire normalization logic**. Just `strip()`.

### 2.2 What's Needed

Per spec (`keystone/specs/identity_resolution.md` Section 7):

**Name Normalization:**
- Uppercase
- Strip suffixes (CORP, INC, LTD, etc.)
- Remove punctuation
- Collapse whitespace

**Ticker Parsing:**
- Detect format (Bloomberg, Reuters, Yahoo, Local)
- Extract root ticker
- Generate search variants

---

## 3. Component Design

### 3.1 NameNormalizer

```python
class NameNormalizer:
    """
    Normalizes company names for consistent matching.
    
    Examples:
        "NVIDIA CORP" → "NVIDIA"
        "Alphabet Inc Class A" → "ALPHABET"
        "Taiwan Semiconductor Manufacturing Co., Ltd." → "TAIWAN SEMICONDUCTOR MANUFACTURING"
    """
    
    SUFFIXES: List[str]  # Ordered by length (longest first for greedy matching)
    
    def normalize(self, name: str) -> str:
        """Return canonical normalized form."""
        
    def generate_variants(self, name: str) -> List[str]:
        """Return list of search variants, ordered by specificity."""
```

### 3.2 TickerParser

```python
class TickerParser:
    """
    Parses ticker symbols from various formats.
    
    Formats supported:
        - Bloomberg: "NVDA US", "2330 TT"
        - Reuters: "NVDA.OQ", "AAPL.O"
        - Yahoo: "NVDA.DE", "BRK-B"
        - Local: "NVDA", "BRK/B"
    """
    
    def parse(self, ticker: str) -> Tuple[str, Optional[str]]:
        """Return (root_ticker, exchange_hint)."""
        
    def generate_variants(self, ticker: str) -> List[str]:
        """Return list of search variants for cascade lookup."""
```

---

## 4. Implementation Details

### 4.1 File to Create

**Path:** `src-tauri/python/portfolio_src/data/normalizer.py`

### 4.2 NameNormalizer Implementation

```python
"""
Name and Ticker Normalization for Identity Resolution.

Provides consistent normalization of company names and ticker symbols
to improve cache hit rates and reduce duplicate holdings.
"""

import re
from typing import List, Tuple, Optional

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class NameNormalizer:
    """
    Normalizes company names for consistent matching.
    
    Normalization steps:
    1. Uppercase
    2. Remove punctuation (except &)
    3. Collapse whitespace
    4. Strip common suffixes
    5. Strip share class indicators
    """
    
    # Ordered by length (longest first) for greedy matching
    SUFFIXES = [
        # Full words (longest first)
        "INCORPORATED",
        "CORPORATION",
        "HOLDINGS",
        "LIMITED",
        "COMPANY",
        "ORDINARY",
        "COMMON",
        # Abbreviations
        "CORP",
        "INC",
        "LTD",
        "PLC",
        "LLC",
        "LLP",
        "CO",
        "AG",
        "SA",
        "NV",
        "SE",
        "AB",
        "AS",
        "KK",  # Japanese Kabushiki Kaisha
        "BV",  # Dutch
        "CV",  # Dutch
        "LP",
        # Share class indicators
        "CLASS A",
        "CLASS B", 
        "CLASS C",
        "CL A",
        "CL B",
        "CL C",
        # ADR/GDR indicators
        "SPONSORED ADR",
        "UNSPONSORED ADR",
        "ADR",
        "ADS",
        "GDR",
        # Registration indicators
        "REGISTERED",
        "REG",
    ]
    
    # Compile regex for suffix removal (word boundaries)
    _suffix_pattern: Optional[re.Pattern] = None
    
    @classmethod
    def _get_suffix_pattern(cls) -> re.Pattern:
        """Lazily compile suffix removal pattern."""
        if cls._suffix_pattern is None:
            # Sort by length descending for greedy matching
            sorted_suffixes = sorted(cls.SUFFIXES, key=len, reverse=True)
            # Escape special regex chars and join with |
            escaped = [re.escape(s) for s in sorted_suffixes]
            pattern = r'\b(' + '|'.join(escaped) + r')\b\.?'
            cls._suffix_pattern = re.compile(pattern, re.IGNORECASE)
        return cls._suffix_pattern
    
    def normalize(self, name: str) -> str:
        """
        Return canonical normalized form of company name.
        
        Args:
            name: Raw company name (e.g., "NVIDIA CORP")
            
        Returns:
            Normalized name (e.g., "NVIDIA")
        """
        if not name:
            return ""
        
        # 1. Uppercase
        result = name.upper()
        
        # 2. Remove punctuation except & (for "AT&T", "S&P")
        # Keep alphanumeric, spaces, and &
        result = re.sub(r"[^\w\s&]", " ", result)
        
        # 3. Collapse whitespace
        result = re.sub(r"\s+", " ", result).strip()
        
        # 4. Strip suffixes (may need multiple passes)
        pattern = self._get_suffix_pattern()
        prev_result = None
        while prev_result != result:
            prev_result = result
            result = pattern.sub("", result).strip()
        
        # 5. Final whitespace cleanup
        result = re.sub(r"\s+", " ", result).strip()
        
        return result
    
    def generate_variants(self, name: str) -> List[str]:
        """
        Generate search variants ordered by specificity.
        
        Args:
            name: Raw company name
            
        Returns:
            List of variants to try, most specific first
        """
        if not name:
            return []
        
        variants = []
        seen = set()
        
        def add_variant(v: str) -> None:
            v = v.strip()
            if v and v not in seen:
                seen.add(v)
                variants.append(v)
        
        # 1. Original (uppercased, cleaned)
        original = re.sub(r"\s+", " ", name.upper().strip())
        add_variant(original)
        
        # 2. Fully normalized
        normalized = self.normalize(name)
        add_variant(normalized)
        
        # 3. First word only (for "NVIDIA CORP" -> "NVIDIA")
        if normalized:
            first_word = normalized.split()[0]
            if len(first_word) >= 3:  # Avoid single letters
                add_variant(first_word)
        
        # 4. Without "THE" prefix
        if normalized.startswith("THE "):
            add_variant(normalized[4:])
        
        return variants
```

### 4.3 TickerParser Implementation

```python
class TickerParser:
    """
    Parses ticker symbols from various formats.
    
    Supported formats:
        - Bloomberg: "NVDA US", "2330 TT", "VOD LN"
        - Reuters: "NVDA.OQ", "AAPL.O", "VOD.L"
        - Yahoo: "NVDA.DE", "BRK-B", "005930.KS"
        - Local: "NVDA", "BRK/B", "BRKB"
    """
    
    # Bloomberg exchange suffixes
    BLOOMBERG_EXCHANGES = {
        "US": "US",      # United States
        "UN": "US",      # NYSE
        "UQ": "US",      # NASDAQ
        "TT": "TW",      # Taiwan
        "LN": "GB",      # London
        "GR": "DE",      # Germany (Xetra)
        "FP": "FR",      # France
        "JP": "JP",      # Japan
        "HK": "HK",      # Hong Kong
        "CN": "CA",      # Canada
        "AU": "AU",      # Australia
    }
    
    # Reuters exchange suffixes
    REUTERS_EXCHANGES = {
        "OQ": "NASDAQ",
        "O": "NYSE",
        "N": "NYSE",
        "L": "LSE",
        "DE": "XETRA",
        "PA": "EURONEXT",
        "T": "TSE",
        "HK": "HKEX",
        "KS": "KRX",
        "TW": "TWSE",
    }
    
    # Pattern for Bloomberg format: "NVDA US" or "2330 TT"
    _bloomberg_pattern = re.compile(
        r'^([A-Z0-9/.-]+)\s+([A-Z]{2})$',
        re.IGNORECASE
    )
    
    # Pattern for Reuters/Yahoo format: "NVDA.OQ" or "005930.KS"
    _reuters_pattern = re.compile(
        r'^([A-Z0-9/-]+)\.([A-Z]{1,2})$',
        re.IGNORECASE
    )
    
    # Pattern for Yahoo dash format: "BRK-B"
    _yahoo_dash_pattern = re.compile(
        r'^([A-Z]+)-([A-Z])$',
        re.IGNORECASE
    )
    
    def parse(self, ticker: str) -> Tuple[str, Optional[str]]:
        """
        Parse ticker into root symbol and exchange hint.
        
        Args:
            ticker: Raw ticker string (e.g., "NVDA US", "NVDA.OQ")
            
        Returns:
            Tuple of (root_ticker, exchange_hint or None)
        """
        if not ticker:
            return ("", None)
        
        ticker = ticker.strip().upper()
        
        # Try Bloomberg format: "NVDA US"
        match = self._bloomberg_pattern.match(ticker)
        if match:
            root = match.group(1)
            exchange = match.group(2)
            return (root, self.BLOOMBERG_EXCHANGES.get(exchange, exchange))
        
        # Try Reuters/Yahoo format: "NVDA.OQ"
        match = self._reuters_pattern.match(ticker)
        if match:
            root = match.group(1)
            exchange = match.group(2)
            return (root, self.REUTERS_EXCHANGES.get(exchange, exchange))
        
        # Try Yahoo dash format: "BRK-B"
        match = self._yahoo_dash_pattern.match(ticker)
        if match:
            # Keep as-is, it's a share class indicator
            return (ticker, None)
        
        # Local format: just the ticker
        return (ticker, None)
    
    def generate_variants(self, ticker: str) -> List[str]:
        """
        Generate search variants for cascade lookup.
        
        Args:
            ticker: Raw ticker string
            
        Returns:
            List of variants to try, most likely first
        """
        if not ticker:
            return []
        
        ticker = ticker.strip().upper()
        root, exchange = self.parse(ticker)
        
        variants = []
        seen = set()
        
        def add_variant(v: str) -> None:
            v = v.strip().upper()
            if v and v not in seen:
                seen.add(v)
                variants.append(v)
        
        # 1. Original ticker
        add_variant(ticker)
        
        # 2. Root ticker (without exchange suffix)
        add_variant(root)
        
        # 3. Handle special characters in root
        if "/" in root:
            # "BRK/B" -> "BRKB", "BRK.B", "BRK-B"
            no_slash = root.replace("/", "")
            add_variant(no_slash)
            add_variant(root.replace("/", "."))
            add_variant(root.replace("/", "-"))
        
        if "-" in root:
            # "BRK-B" -> "BRKB", "BRK/B", "BRK.B"
            no_dash = root.replace("-", "")
            add_variant(no_dash)
            add_variant(root.replace("-", "/"))
            add_variant(root.replace("-", "."))
        
        if "." in root:
            # "BRK.B" -> "BRKB", "BRK/B", "BRK-B"
            no_dot = root.replace(".", "")
            add_variant(no_dot)
            add_variant(root.replace(".", "/"))
            add_variant(root.replace(".", "-"))
        
        # 4. Common exchange suffixes for US stocks
        if exchange is None or exchange == "US":
            # Try with common suffixes
            for suffix in ["", ".US", " US"]:
                add_variant(root + suffix)
        
        return variants
```

### 4.4 Convenience Functions

```python
# Module-level singletons for convenience
_name_normalizer: Optional[NameNormalizer] = None
_ticker_parser: Optional[TickerParser] = None


def get_name_normalizer() -> NameNormalizer:
    """Get singleton NameNormalizer instance."""
    global _name_normalizer
    if _name_normalizer is None:
        _name_normalizer = NameNormalizer()
    return _name_normalizer


def get_ticker_parser() -> TickerParser:
    """Get singleton TickerParser instance."""
    global _ticker_parser
    if _ticker_parser is None:
        _ticker_parser = TickerParser()
    return _ticker_parser


def normalize_name(name: str) -> str:
    """Convenience function for name normalization."""
    return get_name_normalizer().normalize(name)


def parse_ticker(ticker: str) -> Tuple[str, Optional[str]]:
    """Convenience function for ticker parsing."""
    return get_ticker_parser().parse(ticker)
```

---

## 5. Integration into ISINResolver

### 5.1 File to Modify

**Path:** `src-tauri/python/portfolio_src/data/resolution.py`

### 5.2 Changes Required

#### 5.2.1 Add Import

```python
# Add after line 29
from portfolio_src.data.normalizer import (
    get_name_normalizer,
    get_ticker_parser,
    NameNormalizer,
    TickerParser,
)
```

#### 5.2.2 Add Normalizers to ISINResolver.__init__

```python
# Modify __init__ (around line 54)
def __init__(self, tier1_threshold: float = 1.0):
    self.tier1_threshold = tier1_threshold
    self.cache = self._load_cache()
    self.newly_resolved: List[Dict[str, Any]] = []
    self.stats = {
        "total": 0,
        "resolved": 0,
        "unresolved": 0,
        "skipped": 0,
        "by_source": {},
    }

    self._local_cache: Optional[LocalCache] = get_local_cache()
    self._hive_client: Optional[HiveClient] = get_hive_client()
    
    # NEW: Add normalizers
    self._name_normalizer: NameNormalizer = get_name_normalizer()
    self._ticker_parser: TickerParser = get_ticker_parser()

    if self._local_cache and self._local_cache.is_stale():
        logger.info("Local cache stale, starting background sync...")
        threading.Thread(
            target=self._background_sync, daemon=True, name="hive_sync_bg"
        ).start()
```

#### 5.2.3 Modify resolve() Method

Replace lines 122-123:

```python
# OLD:
ticker_clean = (ticker or "").strip()
name_clean = (name or "").strip()

# NEW:
ticker_raw = (ticker or "").strip()
name_raw = (name or "").strip()

# Parse ticker to get root and variants
ticker_root, exchange_hint = self._ticker_parser.parse(ticker_raw)
ticker_variants = self._ticker_parser.generate_variants(ticker_raw)

# Normalize name and get variants
name_normalized = self._name_normalizer.normalize(name_raw)
name_variants = self._name_normalizer.generate_variants(name_raw)

# Use root ticker and normalized name as primary
ticker_clean = ticker_root
name_clean = name_normalized
```

#### 5.2.4 Modify _resolve_via_hive() to Use Variants

```python
def _resolve_via_hive(
    self, ticker: str, name: str, skip_network: bool = False,
    ticker_variants: Optional[List[str]] = None,
    name_variants: Optional[List[str]] = None,
) -> ResolutionResult:
    if self._local_cache is None:
        return ResolutionResult(isin=None, status="unresolved", detail="no_cache")

    # Try all ticker variants
    tickers_to_try = ticker_variants or [ticker] if ticker else []
    for t in tickers_to_try:
        isin = self._local_cache.get_isin_by_ticker(t)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="local_cache_ticker",
                source=None,
            )

    # Try all name variants
    names_to_try = name_variants or [name] if name else []
    for n in names_to_try:
        isin = self._local_cache.get_isin_by_alias(n)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="local_cache_alias",
                source=None,
            )

    if skip_network:
        return ResolutionResult(
            isin=None, status="unresolved", detail="local_cache_miss"
        )

    # Try Hive network with variants
    if self._hive_client and self._hive_client.is_configured:
        for t in tickers_to_try:
            isin = self._hive_client.resolve_ticker(t)
            if isin:
                self._local_cache.upsert_listing(t, "UNKNOWN", isin, "USD")
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="hive_ticker",
                    source=None,
                )

        for n in names_to_try:
            alias_result = self._hive_client.lookup_by_alias(n)
            if alias_result:
                self._local_cache.upsert_alias(n, alias_result.isin)
                return ResolutionResult(
                    isin=alias_result.isin,
                    status="resolved",
                    detail="hive_alias",
                    source=alias_result.source,
                )

    return ResolutionResult(isin=None, status="unresolved", detail="hive_miss")
```

#### 5.2.5 Update resolve() to Pass Variants

```python
# In resolve() method, update the call to _resolve_via_hive:
result = self._resolve_via_hive(
    ticker_clean, 
    name_clean, 
    skip_network=is_tier2,
    ticker_variants=ticker_variants,
    name_variants=name_variants,
)
```

---

## 6. Unit Tests

### 6.1 File to Create

**Path:** `src-tauri/python/tests/test_normalizer.py`

### 6.2 Test Cases

```python
"""Unit tests for NameNormalizer and TickerParser."""

import pytest
from portfolio_src.data.normalizer import (
    NameNormalizer,
    TickerParser,
    normalize_name,
    parse_ticker,
)


class TestNameNormalizer:
    """Tests for NameNormalizer class."""

    @pytest.fixture
    def normalizer(self):
        return NameNormalizer()

    # Basic normalization
    @pytest.mark.parametrize("input_name,expected", [
        ("NVIDIA CORP", "NVIDIA"),
        ("NVIDIA Corporation", "NVIDIA"),
        ("nvidia corp", "NVIDIA"),
        ("Apple Inc.", "APPLE"),
        ("Apple Inc", "APPLE"),
        ("Microsoft Corporation", "MICROSOFT"),
        ("Alphabet Inc Class A", "ALPHABET"),
        ("Alphabet Inc. Class C", "ALPHABET"),
        ("Taiwan Semiconductor Manufacturing Co., Ltd.", "TAIWAN SEMICONDUCTOR MANUFACTURING"),
        ("TSMC", "TSMC"),
        ("AT&T Inc.", "AT&T"),
        ("S&P Global Inc", "S&P GLOBAL"),
        ("The Coca-Cola Company", "COCA COLA"),
        ("3M Company", "3M"),
        ("", ""),
        (None, ""),
    ])
    def test_normalize(self, normalizer, input_name, expected):
        result = normalizer.normalize(input_name or "")
        assert result == expected

    # Suffix stripping
    @pytest.mark.parametrize("input_name,expected", [
        ("NVIDIA CORP", "NVIDIA"),
        ("NVIDIA CORPORATION", "NVIDIA"),
        ("NVIDIA INC", "NVIDIA"),
        ("NVIDIA INCORPORATED", "NVIDIA"),
        ("NVIDIA LTD", "NVIDIA"),
        ("NVIDIA LIMITED", "NVIDIA"),
        ("NVIDIA PLC", "NVIDIA"),
        ("NVIDIA AG", "NVIDIA"),
        ("NVIDIA SA", "NVIDIA"),
        ("NVIDIA SE", "NVIDIA"),
        ("NVIDIA HOLDINGS", "NVIDIA"),
        ("NVIDIA HOLDINGS INC", "NVIDIA"),
    ])
    def test_suffix_stripping(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # Share class stripping
    @pytest.mark.parametrize("input_name,expected", [
        ("ALPHABET CLASS A", "ALPHABET"),
        ("ALPHABET CLASS B", "ALPHABET"),
        ("ALPHABET CL A", "ALPHABET"),
        ("BERKSHIRE HATHAWAY CLASS B", "BERKSHIRE HATHAWAY"),
    ])
    def test_share_class_stripping(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # ADR/GDR stripping
    @pytest.mark.parametrize("input_name,expected", [
        ("TSMC ADR", "TSMC"),
        ("TSMC SPONSORED ADR", "TSMC"),
        ("ALIBABA ADS", "ALIBABA"),
        ("GAZPROM GDR", "GAZPROM"),
    ])
    def test_adr_stripping(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # Variant generation
    def test_generate_variants(self, normalizer):
        variants = normalizer.generate_variants("NVIDIA CORP")
        assert "NVIDIA CORP" in variants
        assert "NVIDIA" in variants
        # First word should be included
        assert variants[-1] == "NVIDIA" or "NVIDIA" in variants

    def test_generate_variants_with_the(self, normalizer):
        variants = normalizer.generate_variants("The Coca-Cola Company")
        assert "THE COCA COLA COMPANY" in variants or "THE COCA COLA" in variants
        assert "COCA COLA" in variants


class TestTickerParser:
    """Tests for TickerParser class."""

    @pytest.fixture
    def parser(self):
        return TickerParser()

    # Format detection
    @pytest.mark.parametrize("ticker,expected_root,expected_exchange", [
        # Bloomberg format
        ("NVDA US", "NVDA", "US"),
        ("2330 TT", "2330", "TW"),
        ("VOD LN", "VOD", "GB"),
        # Reuters format
        ("NVDA.OQ", "NVDA", "NASDAQ"),
        ("AAPL.O", "AAPL", "NYSE"),
        ("VOD.L", "VOD", "LSE"),
        ("005930.KS", "005930", "KRX"),
        # Yahoo dash format
        ("BRK-B", "BRK-B", None),
        ("BRK-A", "BRK-A", None),
        # Local format
        ("NVDA", "NVDA", None),
        ("AAPL", "AAPL", None),
        ("BRK/B", "BRK/B", None),
        # Edge cases
        ("", "", None),
    ])
    def test_parse(self, parser, ticker, expected_root, expected_exchange):
        root, exchange = parser.parse(ticker)
        assert root == expected_root
        assert exchange == expected_exchange

    # Variant generation
    def test_generate_variants_simple(self, parser):
        variants = parser.generate_variants("NVDA")
        assert "NVDA" in variants

    def test_generate_variants_bloomberg(self, parser):
        variants = parser.generate_variants("NVDA US")
        assert "NVDA US" in variants
        assert "NVDA" in variants

    def test_generate_variants_slash(self, parser):
        variants = parser.generate_variants("BRK/B")
        assert "BRK/B" in variants
        assert "BRKB" in variants
        assert "BRK.B" in variants
        assert "BRK-B" in variants

    def test_generate_variants_dash(self, parser):
        variants = parser.generate_variants("BRK-B")
        assert "BRK-B" in variants
        assert "BRKB" in variants
        assert "BRK/B" in variants

    def test_generate_variants_no_duplicates(self, parser):
        variants = parser.generate_variants("NVDA")
        assert len(variants) == len(set(variants))


class TestConvenienceFunctions:
    """Tests for module-level convenience functions."""

    def test_normalize_name(self):
        assert normalize_name("NVIDIA CORP") == "NVIDIA"

    def test_parse_ticker(self):
        root, exchange = parse_ticker("NVDA US")
        assert root == "NVDA"
        assert exchange == "US"
```

---

## 7. Implementation Order

Execute in this exact order:

```
1. Create normalizer.py
   └── NameNormalizer class
   └── TickerParser class
   └── Convenience functions
   
2. Create test_normalizer.py
   └── Run tests, verify all pass
   
3. Modify resolution.py
   └── Add imports
   └── Add normalizers to __init__
   └── Update resolve() method
   └── Update _resolve_via_hive() method
   
4. Run existing tests
   └── Verify no regressions
   
5. Run full test suite
   └── pytest tests/
```

---

## 8. Verification Checklist

After implementation, verify:

- [ ] `normalizer.py` created with both classes
- [ ] `test_normalizer.py` passes (30+ test cases)
- [ ] `resolution.py` imports normalizer module
- [ ] `ISINResolver.__init__` creates normalizer instances
- [ ] `ISINResolver.resolve()` uses normalization
- [ ] `ISINResolver._resolve_via_hive()` tries variants
- [ ] Existing tests still pass
- [ ] No regressions in pipeline

---

## 9. Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| "NVIDIA CORP" == "NVIDIA Corporation" | ❌ No | ✅ Yes |
| "NVDA US" finds "NVDA" cache entry | ❌ No | ✅ Yes |
| "BRK/B" finds "BRKB" cache entry | ❌ No | ✅ Yes |
| Cache hit rate | ~60% | >80% |
| Duplicate holdings | Common | Rare |

---

## 10. Rollback Plan

If issues occur:

1. Revert `resolution.py` to previous version
2. Delete `normalizer.py`
3. Delete `test_normalizer.py`

No database changes required - this is pure Python logic.

---

## 11. Next Steps After Implementation

1. **Phase 2:** Reorder API cascade (Wikidata before Finnhub)
2. **Phase 2:** Add OpenFIGI resolver
3. **Phase 3:** Wire negative caching
4. **Phase 3:** Remove legacy `enrichment_cache.json`
