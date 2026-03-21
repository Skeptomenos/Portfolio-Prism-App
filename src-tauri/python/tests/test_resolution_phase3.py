"""
Phase 3 Tests: Persistent Negative Cache.

Tests for SQLite-backed ISIN cache with TTL support.
"""

import pytest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

from portfolio_src.data.local_cache import LocalCache
from portfolio_src.data.resolution import (
    ISINResolver,
    NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS,
    NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS,
)


class TestISINCacheSchema:
    """Test isin_cache table schema."""

    def test_isin_cache_table_created(self, tmp_path):
        """isin_cache table should be created on init."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        conn = cache._get_connection()
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='isin_cache'"
        )
        assert cursor.fetchone() is not None

    def test_isin_cache_unique_constraint(self, tmp_path):
        """(alias, alias_type) should be unique - second insert updates."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata"
        )
        cache.set_isin_cache(
            "NVDA", "ticker", "US67066G1040", "resolved", 0.9, "finnhub"
        )
        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry["confidence"] == 0.9
        assert entry["source"] == "finnhub"


class TestPositiveCache:
    """Test positive (resolved) cache entries."""

    def test_positive_cache_stored(self, tmp_path):
        """Resolved entries should be stored."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata"
        )
        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry is not None
        assert entry["isin"] == "US67066G1040"
        assert entry["resolution_status"] == "resolved"
        assert entry["confidence"] == 0.8

    def test_positive_cache_never_expires(self, tmp_path):
        """Resolved entries should not have expires_at."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "NVDA",
            "ticker",
            "US67066G1040",
            "resolved",
            0.8,
            "wikidata",
            ttl_hours=None,
        )
        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry["expires_at"] is None

    def test_positive_cache_case_insensitive(self, tmp_path):
        """Lookup should be case-insensitive."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata"
        )
        entry = cache.get_isin_cache("nvda", "ticker")
        assert entry is not None
        assert entry["isin"] == "US67066G1040"


class TestNegativeCache:
    """Test negative (unresolved/rate_limited) cache entries."""

    def test_negative_cache_stored(self, tmp_path):
        """Unresolved entries should be stored with TTL."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "UNKNOWN", "ticker", None, "unresolved", 0.0, None, ttl_hours=24
        )
        entry = cache.get_isin_cache("UNKNOWN", "ticker")
        assert entry is not None
        assert entry["isin"] is None
        assert entry["resolution_status"] == "unresolved"
        assert entry["expires_at"] is not None

    def test_is_negative_cached_true(self, tmp_path):
        """is_negative_cached should return True for unexpired negative entry."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "UNKNOWN", "ticker", None, "unresolved", 0.0, None, ttl_hours=24
        )
        assert cache.is_negative_cached("UNKNOWN", "ticker") is True

    def test_is_negative_cached_false_for_positive(self, tmp_path):
        """is_negative_cached should return False for resolved entry."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "NVDA", "ticker", "US67066G1040", "resolved", 0.8, "wikidata"
        )
        assert cache.is_negative_cached("NVDA", "ticker") is False

    def test_is_negative_cached_false_for_missing(self, tmp_path):
        """is_negative_cached should return False for missing entry."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        assert cache.is_negative_cached("MISSING", "ticker") is False

    def test_rate_limited_cache_stored(self, tmp_path):
        """Rate-limited entries should be stored with shorter TTL."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "RATELIMITED", "ticker", None, "rate_limited", 0.0, None, ttl_hours=1
        )
        entry = cache.get_isin_cache("RATELIMITED", "ticker")
        assert entry is not None
        assert entry["resolution_status"] == "rate_limited"


class TestCacheExpiration:
    """Test cache expiration behavior."""

    def test_expired_entry_returns_none(self, tmp_path):
        """Expired entries should return None and be deleted."""
        cache = LocalCache(db_path=tmp_path / "test.db")

        conn = cache._get_connection()
        past_time = (datetime.now() - timedelta(hours=1)).isoformat()
        conn.execute(
            """
            INSERT INTO isin_cache (alias, alias_type, isin, resolution_status, confidence, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("EXPIRED", "ticker", None, "unresolved", 0.0, past_time),
        )
        conn.commit()

        entry = cache.get_isin_cache("EXPIRED", "ticker")
        assert entry is None

    def test_cleanup_expired_cache(self, tmp_path):
        """cleanup_expired_cache should delete expired entries."""
        cache = LocalCache(db_path=tmp_path / "test.db")

        conn = cache._get_connection()
        past_time = (datetime.now() - timedelta(hours=1)).isoformat()
        future_time = (datetime.now() + timedelta(hours=1)).isoformat()

        conn.execute(
            "INSERT INTO isin_cache (alias, alias_type, resolution_status, expires_at) VALUES (?, ?, ?, ?)",
            ("EXPIRED1", "ticker", "unresolved", past_time),
        )
        conn.execute(
            "INSERT INTO isin_cache (alias, alias_type, resolution_status, expires_at) VALUES (?, ?, ?, ?)",
            ("EXPIRED2", "ticker", "unresolved", past_time),
        )
        conn.execute(
            "INSERT INTO isin_cache (alias, alias_type, resolution_status, expires_at) VALUES (?, ?, ?, ?)",
            ("VALID", "ticker", "unresolved", future_time),
        )
        conn.commit()

        deleted = cache.cleanup_expired_cache()
        assert deleted == 2

        entry = cache.get_isin_cache("VALID", "ticker")
        assert entry is not None


class TestResolverIntegration:
    """Test ISINResolver integration with persistent cache."""

    def test_negative_cache_prevents_api_calls(self, tmp_path):
        """Negative cached ticker should not trigger API calls."""
        cache = LocalCache(db_path=tmp_path / "test.db")
        cache.set_isin_cache(
            "UNKNOWN", "ticker", None, "unresolved", 0.0, None, ttl_hours=24
        )

        resolver = ISINResolver()
        resolver._local_cache = cache

        with patch.object(resolver, "_call_wikidata_batch") as mock_wiki:
            with patch.object(resolver, "_call_finnhub_with_status") as mock_finnhub:
                result = resolver._resolve_via_api("UNKNOWN", "", ["UNKNOWN"], [])

                mock_wiki.assert_not_called()
                mock_finnhub.assert_not_called()

                assert result.status == "unresolved"
                assert result.detail == "negative_cached"

    def test_cache_persists_across_instances(self, tmp_path):
        """Cache should persist across resolver instances."""
        cache = LocalCache(db_path=tmp_path / "test.db")

        resolver1 = ISINResolver()
        resolver1._local_cache = cache
        resolver1._add_negative_cache("UNKNOWN", "ticker", "unresolved")

        resolver2 = ISINResolver()
        resolver2._local_cache = cache
        assert resolver2._is_negative_cached("UNKNOWN", "ticker") is True

    def test_positive_result_cached(self, tmp_path):
        """Successful resolution should be cached."""
        cache = LocalCache(db_path=tmp_path / "test.db")

        resolver = ISINResolver()
        resolver._local_cache = cache
        resolver._cache_positive_result(
            "NVDA", "ticker", "US67066G1040", "api_wikidata", 0.8
        )

        entry = cache.get_isin_cache("NVDA", "ticker")
        assert entry is not None
        assert entry["isin"] == "US67066G1040"
        assert entry["resolution_status"] == "resolved"
        assert entry["expires_at"] is None


class TestLegacyCacheRemoval:
    """Test that legacy cache is no longer used."""

    def test_no_cache_path_constant(self):
        """CACHE_PATH constant should not exist."""
        from portfolio_src.data import resolution

        assert not hasattr(resolution, "CACHE_PATH")

    def test_no_load_cache_method(self):
        """_load_cache method should not exist."""
        resolver = ISINResolver()
        assert not hasattr(resolver, "_load_cache")

    def test_no_cache_dict(self):
        """self.cache dict should not exist."""
        resolver = ISINResolver()
        assert not hasattr(resolver, "cache")


class TestTTLConstants:
    """Test TTL constants are correctly defined."""

    def test_unresolved_ttl_is_24_hours(self):
        assert NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS == 24

    def test_rate_limited_ttl_is_1_hour(self):
        assert NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS == 1
