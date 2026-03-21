import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from portfolio_src.data.market import resolve_ticker, get_price_map
from portfolio_src.data.hive_client import AssetEntry


class TestMarketResolution:
    @pytest.fixture
    def mock_deps(self):
        with (
            patch("portfolio_src.data.market.load_ticker_map") as mock_load,
            patch("portfolio_src.data.market.save_ticker_map") as mock_save,
            patch("portfolio_src.data.market.get_hive_client") as mock_get_hive,
            patch("portfolio_src.data.market.yf.Ticker") as mock_yf,
        ):
            hive_client = mock_get_hive.return_value
            yield mock_load, mock_save, hive_client, mock_yf

    def test_resolve_ticker_local_hit(self, mock_deps):
        """Verify local cache is prioritized."""
        mock_load, _, hive_client, _ = mock_deps
        mock_load.return_value = {"ISIN1": "TICKER1"}

        result = resolve_ticker("ISIN1")

        assert result == "TICKER1"
        hive_client.lookup.assert_not_called()

    def test_resolve_ticker_hive_hit(self, mock_deps):
        """Verify Hive is checked if local cache misses."""
        mock_load, mock_save, hive_client, _ = mock_deps
        mock_load.return_value = {}
        hive_client.lookup.return_value = AssetEntry(
            isin="ISIN1",
            name="Test",
            asset_class="Stock",
            base_currency="EUR",
            ticker="HIVE_TICKER",
        )

        result = resolve_ticker("ISIN1")

        assert result == "HIVE_TICKER"
        mock_save.assert_called_once()
        assert mock_save.call_args[0][0]["ISIN1"] == "HIVE_TICKER"

    def test_resolve_ticker_discovery_and_contribution(self, mock_deps):
        """Verify yfinance discovery and Hive contribution."""
        mock_load, _, hive_client, mock_yf = mock_deps
        mock_load.return_value = {}
        hive_client.lookup.return_value = None

        # Mock yfinance discovery
        mock_ticker = mock_yf.return_value
        mock_ticker.fast_info = {"last_price": 100.0, "currency": "EUR"}

        with patch(
            "portfolio_src.data.market._get_ticker_currency", return_value="EUR"
        ):
            result = resolve_ticker("ISIN_NEW")

        assert result == "ISIN_NEW"
        # Verify contribution to Hive
        hive_client.contribute_listing.assert_called_once()
        args = hive_client.contribute_listing.call_args[0]
        assert args[0] == "ISIN_NEW"
        assert args[1] == "ISIN_NEW"

    def test_get_price_map_batch_hive_lookup(self, mock_deps):
        """Verify get_price_map batch-queries Hive for missing locals."""
        mock_load, mock_save, hive_client, _ = mock_deps
        mock_load.return_value = {}  # All missing locally

        hive_client.batch_lookup.return_value = {
            "ISIN1": AssetEntry(
                isin="ISIN1", name="A1", asset_class="S", base_currency="E", ticker="T1"
            ),
            "ISIN2": AssetEntry(
                isin="ISIN2", name="A2", asset_class="S", base_currency="E", ticker="T2"
            ),
        }

        with patch(
            "portfolio_src.data.market._fetch_prices_batch",
            return_value={"T1": 10.0, "T2": 20.0},
        ):
            prices = get_price_map(["ISIN1", "ISIN2"])

        assert prices["ISIN1"] == 10.0
        assert prices["ISIN2"] == 20.0
        hive_client.batch_lookup.assert_called_once_with(["ISIN1", "ISIN2"])
        mock_save.assert_called()
