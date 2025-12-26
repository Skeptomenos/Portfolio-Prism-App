import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.data.hive_client import HiveClient


class TestETFHoldingsSync:
    @pytest.fixture
    def mock_deps(self):
        cache = MagicMock()
        registry = MagicMock()
        with patch(
            "portfolio_src.core.services.decomposer.get_hive_client"
        ) as mock_get_hive:
            hive_client = mock_get_hive.return_value
            yield Decomposer(cache, registry), cache, registry, hive_client

    def test_hierarchy_local_cache_hit(self, mock_deps):
        """Verify local cache is prioritized."""
        decomposer, cache, registry, hive_client = mock_deps
        isin = "IE00BK5BQT80"

        cache.get_holdings.return_value = pd.DataFrame(
            [{"isin": "AAPL", "weight": 100.0}]
        )

        holdings, source, error = decomposer._get_holdings(isin)

        assert error is None
        assert not holdings.empty
        assert source == "cached"
        hive_client.get_etf_holdings.assert_not_called()

    def test_hierarchy_hive_hit(self, mock_deps):
        """Verify Hive is checked if local cache misses."""
        decomposer, cache, registry, hive_client = mock_deps
        isin = "IE00BK5BQT80"

        cache.get_holdings.return_value = None
        hive_client.is_configured = True
        hive_client.get_etf_holdings.return_value = pd.DataFrame(
            [{"isin": "MSFT", "weight": 100.0}]
        )

        holdings, source, error = decomposer._get_holdings(isin)

        assert error is None
        assert holdings.iloc[0]["isin"] == "MSFT"
        assert source == "hive"
        cache._save_to_local_cache.assert_called_once()
        registry.get_adapter.assert_not_called()

    def test_hierarchy_scraper_and_contribution(self, mock_deps):
        """Verify scraper fallback and Hive contribution."""
        decomposer, cache, registry, hive_client = mock_deps
        isin = "IE00BK5BQT80"

        cache.get_holdings.return_value = None
        hive_client.is_configured = True
        hive_client.get_etf_holdings.return_value = None

        mock_adapter = MagicMock()
        mock_adapter.fetch_holdings.return_value = pd.DataFrame(
            [{"isin": "GOOG", "weight": 100.0}]
        )
        registry.get_adapter.return_value = mock_adapter

        holdings, source, error = decomposer._get_holdings(isin)

        assert error is None
        assert holdings.iloc[0]["isin"] == "GOOG"
        assert "_adapter" in source
        hive_client.contribute_etf_holdings.assert_called_once()
        assert cache._save_to_local_cache.call_count == 1

    def test_hive_failure_resilience(self, mock_deps):
        """Verify pipeline continues if Hive lookup crashes."""
        decomposer, cache, registry, hive_client = mock_deps
        isin = "IE00BK5BQT80"

        cache.get_holdings.return_value = None
        hive_client.is_configured = True
        hive_client.get_etf_holdings.side_effect = Exception("Supabase Down")

        mock_adapter = MagicMock()
        mock_adapter.fetch_holdings.return_value = pd.DataFrame(
            [{"isin": "AMZN", "weight": 100.0}]
        )
        registry.get_adapter.return_value = mock_adapter

        holdings, source, error = decomposer._get_holdings(isin)

        assert error is None
        assert holdings.iloc[0]["isin"] == "AMZN"
        assert "_adapter" in source
        registry.get_adapter.assert_called_once()
