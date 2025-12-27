"""
Phase 5 Tests: Format Logging for Observability.

Tests for detect_format(), format_logs table, and logging integration.
"""

import pytest
import tempfile
import os
from pathlib import Path

from portfolio_src.data.normalizer import TickerParser
from portfolio_src.data.local_cache import LocalCache


class TestFormatDetection:
    """Test TickerParser.detect_format() method."""

    @pytest.fixture
    def parser(self):
        return TickerParser()

    def test_detect_bloomberg_format(self, parser):
        assert parser.detect_format("AAPL US") == "bloomberg"
        assert parser.detect_format("VOD LN") == "bloomberg"
        assert parser.detect_format("MSFT US") == "bloomberg"

    def test_detect_reuters_format(self, parser):
        assert parser.detect_format("AAPL.O") == "reuters"
        assert parser.detect_format("MSFT.OQ") == "reuters"
        assert parser.detect_format("VOD.L") == "reuters"

    def test_detect_yahoo_dash_format(self, parser):
        assert parser.detect_format("BRK-B") == "yahoo_dash"
        assert parser.detect_format("BF-A") == "yahoo_dash"

    def test_detect_numeric_format(self, parser):
        assert parser.detect_format("0700") == "numeric"
        assert parser.detect_format("9988") == "numeric"

    def test_detect_plain_format(self, parser):
        assert parser.detect_format("AAPL") == "plain"
        assert parser.detect_format("NVDA") == "plain"
        assert parser.detect_format("MSFT") == "plain"

    def test_detect_empty_returns_plain(self, parser):
        assert parser.detect_format("") == "plain"
        assert parser.detect_format("   ") == "plain"

    def test_detect_none_returns_plain(self, parser):
        assert parser.detect_format(None) == "plain"


class TestFormatLogging:
    """Test LocalCache format logging methods."""

    @pytest.fixture
    def cache(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "test_cache.db"
            cache = LocalCache(cache_path)
            yield cache
            cache.close()

    def test_log_format_attempt_success(self, cache):
        cache.log_format_attempt(
            ticker_input="AAPL US",
            ticker_tried="AAPL",
            format_type="bloomberg",
            api_source="api_finnhub",
            success=True,
            etf_isin="IE00B4L5Y983",
        )

        stats = cache.get_format_stats()
        assert len(stats["by_api_format"]) == 1
        assert stats["by_api_format"][0]["api"] == "api_finnhub"
        assert stats["by_api_format"][0]["format"] == "bloomberg"
        assert stats["by_api_format"][0]["successes"] == 1
        assert stats["by_api_format"][0]["total"] == 1
        assert stats["by_api_format"][0]["rate"] == 1.0

    def test_log_format_attempt_failure(self, cache):
        cache.log_format_attempt(
            ticker_input="UNKNOWN",
            ticker_tried="UNKNOWN",
            format_type="plain",
            api_source="api_yfinance",
            success=False,
        )

        stats = cache.get_format_stats()
        assert len(stats["by_api_format"]) == 1
        assert stats["by_api_format"][0]["successes"] == 0
        assert stats["by_api_format"][0]["total"] == 1
        assert stats["by_api_format"][0]["rate"] == 0.0

    def test_log_multiple_attempts_aggregation(self, cache):
        cache.log_format_attempt("T1", "T1", "plain", "api_finnhub", True)
        cache.log_format_attempt("T2", "T2", "plain", "api_finnhub", True)
        cache.log_format_attempt("T3", "T3", "plain", "api_finnhub", False)
        cache.log_format_attempt("T4", "T4", "bloomberg", "api_finnhub", True)

        stats = cache.get_format_stats()
        by_api_format = {(s["api"], s["format"]): s for s in stats["by_api_format"]}

        plain_stats = by_api_format[("api_finnhub", "plain")]
        assert plain_stats["total"] == 3
        assert plain_stats["successes"] == 2
        assert plain_stats["rate"] == pytest.approx(0.667, rel=0.01)

        bloomberg_stats = by_api_format[("api_finnhub", "bloomberg")]
        assert bloomberg_stats["total"] == 1
        assert bloomberg_stats["successes"] == 1

    def test_cleanup_old_format_logs(self, cache):
        cache.log_format_attempt("T1", "T1", "plain", "api_finnhub", True)
        cache.log_format_attempt("T2", "T2", "plain", "api_finnhub", True)

        conn = cache._get_connection()
        conn.execute("UPDATE format_logs SET created_at = datetime('now', '-31 days')")
        conn.commit()

        deleted = cache.cleanup_old_format_logs(days=30)
        assert deleted == 2

        stats = cache.get_format_stats()
        assert len(stats["by_api_format"]) == 0

    def test_cleanup_preserves_recent_logs(self, cache):
        cache.log_format_attempt("T1", "T1", "plain", "api_finnhub", True)

        deleted = cache.cleanup_old_format_logs(days=30)
        assert deleted == 0

        stats = cache.get_format_stats()
        assert len(stats["by_api_format"]) == 1

    def test_get_format_stats_empty(self, cache):
        stats = cache.get_format_stats()
        assert stats == {"by_api_format": []}

    def test_etf_isin_stored_correctly(self, cache):
        cache.log_format_attempt(
            ticker_input="AAPL",
            ticker_tried="AAPL",
            format_type="plain",
            api_source="api_finnhub",
            success=True,
            etf_isin="IE00B4L5Y983",
        )

        conn = cache._get_connection()
        cursor = conn.execute("SELECT etf_isin FROM format_logs LIMIT 1")
        row = cursor.fetchone()
        assert row["etf_isin"] == "IE00B4L5Y983"
