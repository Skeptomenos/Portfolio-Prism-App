"""Unit tests for NameNormalizer and TickerParser."""

import pytest
from portfolio_src.data.normalizer import (
    NameNormalizer,
    TickerParser,
    normalize_name,
    parse_ticker,
    get_name_normalizer,
    get_ticker_parser,
)


class TestNameNormalizer:
    """Tests for NameNormalizer class."""

    @pytest.fixture
    def normalizer(self):
        return NameNormalizer()

    # Basic normalization
    @pytest.mark.parametrize(
        "input_name,expected",
        [
            ("NVIDIA CORP", "NVIDIA"),
            ("NVIDIA Corporation", "NVIDIA"),
            ("nvidia corp", "NVIDIA"),
            ("Apple Inc.", "APPLE"),
            ("Apple Inc", "APPLE"),
            ("Microsoft Corporation", "MICROSOFT"),
            ("Alphabet Inc Class A", "ALPHABET"),
            ("Alphabet Inc. Class C", "ALPHABET"),
            (
                "Taiwan Semiconductor Manufacturing Co., Ltd.",
                "TAIWAN SEMICONDUCTOR MANUFACTURING",
            ),
            ("TSMC", "TSMC"),
            ("AT&T Inc.", "AT&T"),
            ("S&P Global Inc", "S&P GLOBAL"),
            ("The Coca-Cola Company", "THE COCA COLA"),
            ("3M Company", "3M"),
            ("", ""),
        ],
    )
    def test_normalize(self, normalizer, input_name, expected):
        result = normalizer.normalize(input_name)
        assert result == expected

    # Suffix stripping
    @pytest.mark.parametrize(
        "input_name,expected",
        [
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
        ],
    )
    def test_suffix_stripping(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # Share class stripping
    @pytest.mark.parametrize(
        "input_name,expected",
        [
            ("ALPHABET CLASS A", "ALPHABET"),
            ("ALPHABET CLASS B", "ALPHABET"),
            ("ALPHABET CL A", "ALPHABET"),
            ("BERKSHIRE HATHAWAY CLASS B", "BERKSHIRE HATHAWAY"),
        ],
    )
    def test_share_class_stripping(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # ADR/GDR stripping
    @pytest.mark.parametrize(
        "input_name,expected",
        [
            ("TSMC ADR", "TSMC"),
            ("TSMC SPONSORED ADR", "TSMC"),
            ("ALIBABA ADS", "ALIBABA"),
            ("GAZPROM GDR", "GAZPROM"),
        ],
    )
    def test_adr_stripping(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # Variant generation
    def test_generate_variants(self, normalizer):
        variants = normalizer.generate_variants("NVIDIA CORP")
        assert "NVIDIA CORP" in variants
        assert "NVIDIA" in variants
        # Should have at least 2 variants
        assert len(variants) >= 2

    def test_generate_variants_includes_first_word(self, normalizer):
        variants = normalizer.generate_variants("NVIDIA CORP")
        # First word should be included as a variant
        assert "NVIDIA" in variants

    def test_generate_variants_empty(self, normalizer):
        variants = normalizer.generate_variants("")
        assert variants == []

    def test_generate_variants_no_duplicates(self, normalizer):
        variants = normalizer.generate_variants("NVIDIA CORP")
        assert len(variants) == len(set(variants))


class TestTickerParser:
    """Tests for TickerParser class."""

    @pytest.fixture
    def parser(self):
        return TickerParser()

    # Format detection - Bloomberg
    @pytest.mark.parametrize(
        "ticker,expected_root,expected_exchange",
        [
            ("NVDA US", "NVDA", "US"),
            ("2330 TT", "2330", "TW"),
            ("VOD LN", "VOD", "GB"),
            ("SAP GR", "SAP", "DE"),
        ],
    )
    def test_parse_bloomberg(self, parser, ticker, expected_root, expected_exchange):
        root, exchange = parser.parse(ticker)
        assert root == expected_root
        assert exchange == expected_exchange

    # Format detection - Reuters
    @pytest.mark.parametrize(
        "ticker,expected_root,expected_exchange",
        [
            ("NVDA.OQ", "NVDA", "NASDAQ"),
            ("AAPL.O", "AAPL", "NYSE"),
            ("VOD.L", "VOD", "LSE"),
            ("005930.KS", "005930", "KRX"),
        ],
    )
    def test_parse_reuters(self, parser, ticker, expected_root, expected_exchange):
        root, exchange = parser.parse(ticker)
        assert root == expected_root
        assert exchange == expected_exchange

    # Format detection - Yahoo dash
    @pytest.mark.parametrize(
        "ticker,expected_root",
        [
            ("BRK-B", "BRK-B"),
            ("BRK-A", "BRK-A"),
        ],
    )
    def test_parse_yahoo_dash(self, parser, ticker, expected_root):
        root, exchange = parser.parse(ticker)
        assert root == expected_root
        assert exchange is None

    # Format detection - Local
    @pytest.mark.parametrize(
        "ticker,expected_root",
        [
            ("NVDA", "NVDA"),
            ("AAPL", "AAPL"),
            ("BRK/B", "BRK/B"),
        ],
    )
    def test_parse_local(self, parser, ticker, expected_root):
        root, exchange = parser.parse(ticker)
        assert root == expected_root
        assert exchange is None

    # Edge cases
    def test_parse_empty(self, parser):
        root, exchange = parser.parse("")
        assert root == ""
        assert exchange is None

    def test_parse_lowercase(self, parser):
        root, exchange = parser.parse("nvda us")
        assert root == "NVDA"
        assert exchange == "US"

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

    def test_generate_variants_empty(self, parser):
        variants = parser.generate_variants("")
        assert variants == []


class TestConvenienceFunctions:
    """Tests for module-level convenience functions."""

    def test_normalize_name(self):
        assert normalize_name("NVIDIA CORP") == "NVIDIA"

    def test_normalize_name_empty(self):
        assert normalize_name("") == ""

    def test_parse_ticker(self):
        root, exchange = parse_ticker("NVDA US")
        assert root == "NVDA"
        assert exchange == "US"

    def test_parse_ticker_empty(self):
        root, exchange = parse_ticker("")
        assert root == ""
        assert exchange is None


class TestSingletons:
    """Tests for singleton getters."""

    def test_get_name_normalizer_returns_same_instance(self):
        n1 = get_name_normalizer()
        n2 = get_name_normalizer()
        assert n1 is n2

    def test_get_ticker_parser_returns_same_instance(self):
        p1 = get_ticker_parser()
        p2 = get_ticker_parser()
        assert p1 is p2


class TestEdgeCases:
    """Tests for edge cases and real-world examples."""

    @pytest.fixture
    def normalizer(self):
        return NameNormalizer()

    @pytest.fixture
    def parser(self):
        return TickerParser()

    # Real-world company names
    @pytest.mark.parametrize(
        "input_name,expected",
        [
            ("NVIDIA CORP", "NVIDIA"),
            ("Apple Inc.", "APPLE"),
            ("AMAZON.COM INC", "AMAZON COM"),
            ("META PLATFORMS INC CLASS A", "META PLATFORMS"),
            ("BERKSHIRE HATHAWAY INC CLASS B", "BERKSHIRE HATHAWAY"),
            ("JPMORGAN CHASE & CO", "JPMORGAN CHASE & CO"),
            ("JOHNSON & JOHNSON", "JOHNSON & JOHNSON"),
            ("PROCTER & GAMBLE CO", "PROCTER & GAMBLE"),
        ],
    )
    def test_real_world_names(self, normalizer, input_name, expected):
        assert normalizer.normalize(input_name) == expected

    # Real-world tickers
    @pytest.mark.parametrize(
        "ticker,expected_root",
        [
            ("AAPL", "AAPL"),
            ("GOOGL", "GOOGL"),
            ("BRK.B", "BRK.B"),  # Local format with dot
            ("BRK/B", "BRK/B"),  # Local format with slash
            ("BRK-B", "BRK-B"),  # Yahoo format with dash
        ],
    )
    def test_real_world_tickers(self, parser, ticker, expected_root):
        root, _ = parser.parse(ticker)
        assert root == expected_root

    # Ensure variants cover common formats
    def test_berkshire_variants_comprehensive(self, parser):
        # All these should generate overlapping variants
        variants_slash = set(parser.generate_variants("BRK/B"))
        variants_dash = set(parser.generate_variants("BRK-B"))
        variants_dot = set(parser.generate_variants("BRK.B"))

        # They should all include BRKB (no separator)
        assert "BRKB" in variants_slash
        assert "BRKB" in variants_dash
        assert "BRKB" in variants_dot

        # They should have significant overlap
        common = variants_slash & variants_dash & variants_dot
        assert len(common) >= 2  # At least BRKB and one other
