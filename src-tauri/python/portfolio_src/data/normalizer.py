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

    Examples:
        "NVIDIA CORP" -> "NVIDIA"
        "Alphabet Inc Class A" -> "ALPHABET"
        "Taiwan Semiconductor Manufacturing Co., Ltd." -> "TAIWAN SEMICONDUCTOR MANUFACTURING"
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

    # Pattern to preserve "& CO" as it's part of company name (e.g., "JPMORGAN CHASE & CO")
    _and_co_placeholder = "___AND_CO___"

    @classmethod
    def _get_suffix_pattern(cls) -> re.Pattern:
        """Lazily compile suffix removal pattern."""
        if cls._suffix_pattern is None:
            # Sort by length descending for greedy matching
            sorted_suffixes = sorted(cls.SUFFIXES, key=len, reverse=True)
            # Escape special regex chars and join with |
            escaped = [re.escape(s) for s in sorted_suffixes]
            pattern = r"\b(" + "|".join(escaped) + r")\b\.?"
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

        # 4. Protect "& CO" pattern before suffix stripping
        result = re.sub(r"&\s*CO\b", self._and_co_placeholder, result)

        # 5. Strip suffixes (may need multiple passes)
        pattern = self._get_suffix_pattern()
        prev_result = None
        while prev_result != result:
            prev_result = result
            result = pattern.sub("", result).strip()

        # 6. Restore "& CO" pattern
        result = result.replace(self._and_co_placeholder, "& CO")

        # 7. Final whitespace cleanup
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
        seen: set = set()

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
        "US": "US",  # United States
        "UN": "US",  # NYSE
        "UQ": "US",  # NASDAQ
        "TT": "TW",  # Taiwan
        "LN": "GB",  # London
        "GR": "DE",  # Germany (Xetra)
        "FP": "FR",  # France
        "JP": "JP",  # Japan
        "HK": "HK",  # Hong Kong
        "CN": "CA",  # Canada
        "AU": "AU",  # Australia
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
    _bloomberg_pattern = re.compile(r"^([A-Z0-9/.-]+)\s+([A-Z]{2})$", re.IGNORECASE)

    # Known single-letter exchange codes (not share classes)
    SINGLE_LETTER_EXCHANGES = {"O", "N", "L", "T"}

    # Pattern for Reuters/Yahoo format: "NVDA.OQ" or "005930.KS"
    _reuters_pattern = re.compile(r"^([A-Z0-9/-]+)\.([A-Z]{1,2})$", re.IGNORECASE)

    # Pattern for Yahoo dash format: "BRK-B"
    _yahoo_dash_pattern = re.compile(r"^([A-Z]+)-([A-Z])$", re.IGNORECASE)

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
            suffix = match.group(2).upper()
            # Only treat as exchange if it's a known exchange code
            # Single letters A, B, C are share classes, not exchanges
            if len(suffix) == 2 or suffix in self.SINGLE_LETTER_EXCHANGES:
                return (root, self.REUTERS_EXCHANGES.get(suffix, suffix))
            # Otherwise treat as local format (e.g., "BRK.B" is share class)
            return (ticker, None)

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
        seen: set = set()

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
