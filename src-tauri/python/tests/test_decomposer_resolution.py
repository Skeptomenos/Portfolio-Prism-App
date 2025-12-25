"""Unit tests for Decomposer with ISIN resolution."""

import pytest
import pandas as pd
from unittest.mock import Mock, MagicMock, patch

from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.data.resolution import ResolutionResult


class TestDecomposerWithResolver:
    @pytest.fixture
    def mock_holdings_cache(self):
        cache = Mock()
        cache.get_holdings.return_value = None
        cache._save_to_local_cache = Mock()
        return cache

    @pytest.fixture
    def mock_adapter_registry(self):
        registry = Mock()
        adapter = Mock()
        adapter.fetch_holdings.return_value = pd.DataFrame(
            {
                "ticker": ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN"],
                "name": [
                    "Apple Inc",
                    "Microsoft Corp",
                    "Alphabet Inc",
                    "NVIDIA Corp",
                    "Amazon.com Inc",
                ],
                "weight": [5.0, 4.5, 4.0, 3.5, 3.0],
            }
        )
        registry.get_adapter.return_value = adapter
        return registry

    @pytest.fixture
    def mock_resolver(self):
        resolver = Mock()
        mappings = {
            "AAPL": "US0378331005",
            "MSFT": "US5949181045",
            "GOOGL": "US02079K3059",
            "NVDA": "US67066G1040",
            "AMZN": "US0231351067",
        }

        def mock_resolve(ticker, name, provider_isin=None, weight=0.0):
            isin = mappings.get(ticker.upper())
            if isin:
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="mock_cache",
                    source="mock",
                )
            return ResolutionResult(
                isin=None,
                status="unresolved",
                detail="not_found",
            )

        resolver.resolve.side_effect = mock_resolve
        return resolver

    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_decomposition_resolves_isins(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
        mock_resolver,
    ):
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive

        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=mock_resolver,
        )

        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["iShares Core MSCI World"],
                "weight": [100.0],
            }
        )

        holdings_map, errors = decomposer.decompose(etf_positions)

        assert len(holdings_map) == 1
        assert "IE00B4L5Y983" in holdings_map

        holdings = holdings_map["IE00B4L5Y983"]
        assert "isin" in holdings.columns

        resolved_isins = holdings["isin"].dropna()
        assert len(resolved_isins) == 5

        aapl_row = holdings[holdings["ticker"] == "AAPL"].iloc[0]
        assert aapl_row["isin"] == "US0378331005"

    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_partial_resolution_handled(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
    ):
        resolver = Mock()

        valid_isins = {
            "AAPL": "US0378331005",
            "MSFT": "US5949181045",
        }

        def partial_resolve(ticker, name, provider_isin=None, weight=0.0):
            isin = valid_isins.get(ticker.upper())
            if isin:
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="mock",
                    source="mock",
                )
            return ResolutionResult(
                isin=None,
                status="unresolved",
                detail="api_failed",
            )

        resolver.resolve.side_effect = partial_resolve

        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive

        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=resolver,
        )

        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["Test ETF"],
                "weight": [100.0],
            }
        )

        holdings_map, errors = decomposer.decompose(etf_positions)

        assert len(holdings_map) == 1
        holdings = holdings_map["IE00B4L5Y983"]

        resolved = holdings["isin"].notna().sum()
        assert resolved == 2

    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_resolution_stats_tracked(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
        mock_resolver,
    ):
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive

        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=mock_resolver,
        )

        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["Test ETF"],
                "weight": [100.0],
            }
        )

        holdings_map, errors = decomposer.decompose(etf_positions)

        stats = decomposer.get_resolution_stats()

        assert stats["total"] == 5
        assert stats["resolved"] == 5
        assert stats["unresolved"] == 0
        assert "mock" in stats["by_source"]

    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_no_resolver_legacy_behavior(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
        mock_adapter_registry,
    ):
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive

        decomposer = Decomposer(
            holdings_cache=mock_holdings_cache,
            adapter_registry=mock_adapter_registry,
            isin_resolver=None,
        )

        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["Test ETF"],
                "weight": [100.0],
            }
        )

        holdings_map, errors = decomposer.decompose(etf_positions)

        assert len(holdings_map) == 1
        holdings = holdings_map["IE00B4L5Y983"]

        if "isin" in holdings.columns:
            assert holdings["isin"].isna().all()

    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_existing_isins_preserved(
        self,
        mock_hive_client_fn,
        mock_holdings_cache,
    ):
        registry = Mock()
        adapter = Mock()
        adapter.fetch_holdings.return_value = pd.DataFrame(
            {
                "ticker": ["AAPL", "MSFT"],
                "name": ["Apple Inc", "Microsoft Corp"],
                "weight": [5.0, 4.5],
                "isin": ["US0378331005", None],
            }
        )
        registry.get_adapter.return_value = adapter

        resolver = Mock()
        resolver.resolve.return_value = ResolutionResult(
            isin="US5949181045",
            status="resolved",
            detail="mock",
            source="mock",
        )

        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive

        cache = Mock()
        cache.get_holdings.return_value = None
        cache._save_to_local_cache = Mock()

        decomposer = Decomposer(
            holdings_cache=cache,
            adapter_registry=registry,
            isin_resolver=resolver,
        )

        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["Test ETF"],
                "weight": [100.0],
            }
        )

        holdings_map, errors = decomposer.decompose(etf_positions)
        holdings = holdings_map["IE00B4L5Y983"]

        aapl_row = holdings[holdings["ticker"] == "AAPL"].iloc[0]
        assert aapl_row["isin"] == "US0378331005"

        stats = decomposer.get_resolution_stats()
        assert stats["by_source"].get("existing", 0) == 1


class TestResolutionStatsAggregation:
    @patch("portfolio_src.core.services.decomposer.get_hive_client")
    def test_multiple_etfs_stats_aggregated(self, mock_hive_client_fn):
        mock_hive = MagicMock()
        mock_hive.is_configured = False
        mock_hive_client_fn.return_value = mock_hive

        cache = Mock()
        cache.get_holdings.return_value = None
        cache._save_to_local_cache = Mock()

        registry = Mock()
        adapter = Mock()
        adapter.fetch_holdings.return_value = pd.DataFrame(
            {
                "ticker": ["AAPL", "MSFT"],
                "name": ["Apple", "Microsoft"],
                "weight": [5.0, 4.5],
            }
        )
        registry.get_adapter.return_value = adapter

        resolver = Mock()
        resolver.resolve.return_value = ResolutionResult(
            isin="US0378331005",
            status="resolved",
            detail="mock",
            source="mock",
        )

        decomposer = Decomposer(
            holdings_cache=cache,
            adapter_registry=registry,
            isin_resolver=resolver,
        )

        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983", "IE00B4L5YC18"],
                "name": ["ETF One", "ETF Two"],
                "weight": [50.0, 50.0],
            }
        )

        holdings_map, errors = decomposer.decompose(etf_positions)

        stats = decomposer.get_resolution_stats()

        assert stats["total"] == 4
        assert stats["resolved"] == 4
        assert len(stats["etfs"]) == 2
