"""Unit tests for ISINResolver with Hive integration."""

import pytest
from unittest.mock import MagicMock, patch

from portfolio_src.data.resolution import ISINResolver, ResolutionResult


class TestFeatureFlagBehavior:
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", True)
    def test_legacy_flag_uses_csv(self):
        with patch("portfolio_src.data.resolution.AssetUniverse") as mock_universe:
            mock_instance = MagicMock()
            mock_instance.lookup_by_ticker.return_value = "US0378331005"
            mock_universe.load.return_value = mock_instance

            resolver = ISINResolver()
            result = resolver.resolve("AAPL", "Apple Inc")

            assert result.isin == "US0378331005"
            assert result.detail == "universe_ticker"

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_new_flag_uses_hive(self):
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

                assert result.isin == "US0378331005"
                assert result.detail == "local_cache_ticker"


class TestHiveResolutionChain:
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_cache_miss_hits_hive(self):
        """Test that tier1 holdings (weight > threshold) hit Hive when local cache misses."""
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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_tier2_resolves_via_local_cache(self):
        """Test that tier2 holdings still resolve if found in local cache."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                # Pass weight <= threshold (0.1)
                result = resolver.resolve("AAPL", "Apple Inc", weight=0.1)

                assert result.isin == "US0378331005"
                assert result.detail == "local_cache_ticker"
                # Should not have needed to call Hive network
                mock_hive.resolve_ticker.assert_not_called()

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_tier2_miss_skips_network_calls(self):
        """Test that tier2 holdings that miss local cache skip network calls."""
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
                # Pass weight <= threshold (0.1)
                result = resolver.resolve("UNKNOWN", "Unknown Co", weight=0.1)

                assert result.status == "skipped"
                assert result.detail == "tier2_skipped"
                # CRITICAL: Must NOT call Hive network
                mock_hive.resolve_ticker.assert_not_called()

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_tier2_falls_back_to_enrichment_cache(self):
        """Test that tier2 holdings check enrichment cache (step 4) before skipping."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                # Pre-populate enrichment cache
                resolver.cache = {"AAPL": {"isin": "US0378331005"}}

                # Pass weight <= threshold (0.1)
                result = resolver.resolve("AAPL", "Apple Inc", weight=0.1)

                assert result.isin == "US0378331005"
                assert result.detail == "cache"
                assert result.status == "resolved"
                # Should not have needed to call Hive network
                mock_hive.resolve_ticker.assert_not_called()


class TestCacheUpdates:
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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
                resolver.cache = {}  # Clear cache to force API lookup

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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
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


class TestLegacyPath:
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", True)
    def test_csv_ticker_resolution(self):
        with patch("portfolio_src.data.resolution.AssetUniverse") as mock_universe:
            mock_instance = MagicMock()
            mock_instance.lookup_by_ticker.return_value = "US0378331005"
            mock_universe.load.return_value = mock_instance

            resolver = ISINResolver()
            result = resolver._resolve_via_csv("AAPL", "Apple Inc")

            assert result.isin == "US0378331005"
            assert result.detail == "universe_ticker"

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", True)
    def test_csv_alias_resolution(self):
        with patch("portfolio_src.data.resolution.AssetUniverse") as mock_universe:
            mock_instance = MagicMock()
            mock_instance.lookup_by_ticker.return_value = None
            mock_instance.lookup_by_alias.return_value = "US0378331005"
            mock_universe.load.return_value = mock_instance

            resolver = ISINResolver()
            result = resolver._resolve_via_csv("AAPL", "Apple Inc")

            assert result.isin == "US0378331005"
            assert result.detail == "universe_alias"

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", True)
    def test_csv_miss(self):
        with patch("portfolio_src.data.resolution.AssetUniverse") as mock_universe:
            mock_instance = MagicMock()
            mock_instance.lookup_by_ticker.return_value = None
            mock_instance.lookup_by_alias.return_value = None
            mock_universe.load.return_value = mock_instance

            resolver = ISINResolver()
            result = resolver._resolve_via_csv("UNKNOWN", "Unknown Company")

            assert result.status == "unresolved"
            assert result.detail == "csv_miss"


class TestStaleCacheSync:
    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_stale_cache_triggers_sync(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.is_stale.return_value = True
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                ISINResolver()

                mock_cache.sync_from_hive.assert_called_once_with(mock_hive)

    @patch("portfolio_src.data.resolution.USE_LEGACY_CSV", False)
    def test_fresh_cache_skips_sync(self):
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.is_stale.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive_fn.return_value = mock_hive

                ISINResolver()

                mock_cache.sync_from_hive.assert_not_called()
