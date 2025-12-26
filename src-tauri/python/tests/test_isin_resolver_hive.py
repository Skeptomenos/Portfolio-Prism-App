"""Unit tests for ISINResolver with Hive integration."""

import pytest
from unittest.mock import MagicMock, patch

from portfolio_src.data.resolution import ISINResolver, ResolutionResult


class TestHiveResolutionChain:
    def test_local_cache_ticker_hit(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                result = resolver.resolve("AAPL", "Apple Inc")

                mock_hive.resolve_ticker.assert_not_called()
                assert result.isin == "US0378331005"

    def test_local_cache_alias_hit(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                result = resolver.resolve("AAPL", "Apple Inc")

                assert result.isin == "US0378331005"
                assert result.detail == "local_cache_alias"

    def test_cache_miss_hits_hive(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = "US0378331005"
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                result = resolver.resolve("AAPL", "Apple Inc", weight=1.0)

                assert result.isin == "US0378331005"
                assert result.detail == "hive_ticker"
                mock_hive.resolve_ticker.assert_called_once_with("AAPL")

    def test_hive_alias_fallback(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = "US0378331005"
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                result = resolver.resolve("AAPL", "Apple Inc", weight=1.0)

                assert result.isin == "US0378331005"
                assert result.detail == "hive_alias"

    def test_hive_miss_returns_unresolved(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                result = resolver._resolve_via_hive("UNKNOWN", "Unknown Company")

                assert result.status == "unresolved"
                assert result.detail == "hive_miss"

    def test_tier2_resolves_via_local_cache(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                result = resolver.resolve("AAPL", "Apple Inc", weight=0.1)

                assert result.isin == "US0378331005"
                assert result.detail == "local_cache_ticker"
                mock_hive.resolve_ticker.assert_not_called()

    def test_tier2_miss_skips_network_calls(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                result = resolver.resolve("UNKNOWN", "Unknown Co", weight=0.1)

                assert result.status == "skipped"
                assert result.detail == "tier2_skipped"
                mock_hive.resolve_ticker.assert_not_called()

    def test_tier2_falls_back_to_enrichment_cache(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                resolver.cache = {"AAPL": {"isin": "US0378331005"}}

                result = resolver.resolve("AAPL", "Apple Inc", weight=0.1)

                assert result.isin == "US0378331005"
                assert result.detail == "cache"
                assert result.status == "resolved"
                mock_hive.resolve_ticker.assert_not_called()


class TestCacheUpdates:
    def test_hive_hit_updates_local_cache(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = "US0378331005"
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                resolver._resolve_via_hive("AAPL", "Apple Inc")

                mock_cache.upsert_listing.assert_called_once_with(
                    "AAPL", "UNKNOWN", "US0378331005", "USD"
                )


class TestPushToHive:
    def test_push_to_hive_on_api_success(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                resolver.cache = {}

                with patch.object(resolver, "_resolve_via_api") as mock_api:
                    mock_api.return_value = ResolutionResult(
                        isin="US0378331005",
                        status="resolved",
                        detail="api_finnhub",
                        source="api_finnhub",
                    )

                    result = resolver.resolve("AAPL", "Apple Inc", weight=5.0)

                    mock_hive.contribute_listing.assert_called_once()
                    mock_cache.upsert_listing.assert_called()

    def test_push_to_hive_includes_alias(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                resolver._push_to_hive(
                    "AAPL", "Apple Inc", "US0378331005", "api_finnhub"
                )

                mock_hive.contribute_alias.assert_called_once()
                call_args = mock_hive.contribute_alias.call_args
                assert call_args[1]["p_alias"] == "Apple Inc"
                assert call_args[1]["p_isin"] == "US0378331005"

    def test_push_to_hive_skips_short_names(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()
                resolver._push_to_hive("A", "AB", "US0378331005", "api_finnhub")

                mock_hive.contribute_alias.assert_not_called()


class TestStaleCacheSync:
    def test_stale_cache_triggers_background_sync(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                with patch(
                    "portfolio_src.data.resolution.threading.Thread"
                ) as mock_thread:
                    mock_cache = MagicMock()
                    mock_cache.is_stale.return_value = True
                    mock_cache_fn.return_value = mock_cache

                    mock_hive = MagicMock()
                    mock_hive_fn.return_value = mock_hive

                    ISINResolver()

                    mock_thread.assert_called_once()

    def test_fresh_cache_skips_sync(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                with patch(
                    "portfolio_src.data.resolution.threading.Thread"
                ) as mock_thread:
                    mock_cache = MagicMock()
                    mock_cache.is_stale.return_value = False
                    mock_cache_fn.return_value = mock_cache

                    mock_hive = MagicMock()
                    mock_hive_fn.return_value = mock_hive

                    ISINResolver()

                    mock_thread.assert_not_called()
