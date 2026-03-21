"""Unit tests for DashboardService."""

import pytest
from unittest.mock import patch, MagicMock

from portfolio_src.core.services.dashboard_service import DashboardService
from portfolio_src.models.dashboard import DashboardSummary, PositionsResponse


class TestDashboardServiceGetDashboardSummary:
    """Tests for DashboardService.get_dashboard_summary()."""

    @patch("portfolio_src.data.database.get_positions")
    def test_empty_portfolio_returns_empty_summary(self, mock_get_positions):
        mock_get_positions.return_value = []
        service = DashboardService()

        result = service.get_dashboard_summary(portfolio_id=1)

        assert isinstance(result, DashboardSummary)
        assert result.is_empty is True
        assert result.total_value == 0
        assert result.position_count == 0
        assert result.top_holdings == []

    @patch("portfolio_src.data.database.get_positions")
    def test_calculates_totals_correctly(self, mock_get_positions):
        mock_get_positions.return_value = [
            {
                "isin": "US0378331005",
                "name": "Apple Inc.",
                "quantity": 10,
                "current_price": 150.0,
                "cost_basis": 100.0,
                "asset_class": "Equity",
            },
            {
                "isin": "US5949181045",
                "name": "Microsoft Corp.",
                "quantity": 5,
                "current_price": 300.0,
                "cost_basis": 250.0,
                "asset_class": "Equity",
            },
        ]
        service = DashboardService()

        result = service.get_dashboard_summary(portfolio_id=1)

        assert isinstance(result, DashboardSummary)
        assert result.total_value == 3000.0
        assert result.total_gain == 750.0
        assert result.position_count == 2
        assert result.is_empty is False

    @patch("portfolio_src.data.database.get_positions")
    def test_calculates_weights(self, mock_get_positions):
        mock_get_positions.return_value = [
            {
                "isin": "US0378331005",
                "name": "Apple",
                "quantity": 10,
                "current_price": 100.0,
                "cost_basis": 100.0,
            },
            {
                "isin": "US5949181045",
                "name": "Microsoft",
                "quantity": 10,
                "current_price": 100.0,
                "cost_basis": 100.0,
            },
        ]
        service = DashboardService()

        result = service.get_dashboard_summary(portfolio_id=1)

        assert len(result.top_holdings) == 2
        for h in result.top_holdings:
            assert h.weight == 0.5

    @patch("portfolio_src.data.database.get_positions")
    def test_returns_top_10_holdings(self, mock_get_positions):
        mock_get_positions.return_value = [
            {"isin": f"TEST{i:08d}", "name": f"Stock {i}", "quantity": 1, "current_price": float(i)}
            for i in range(15, 0, -1)
        ]
        service = DashboardService()

        result = service.get_dashboard_summary(portfolio_id=1)

        assert len(result.top_holdings) == 10
        assert result.top_holdings[0].name == "Stock 15"


class TestDashboardServiceGetPositions:
    """Tests for DashboardService.get_positions()."""

    @patch("portfolio_src.data.database.get_sync_state")
    @patch("portfolio_src.data.database.get_positions")
    def test_empty_portfolio_returns_empty_response(self, mock_get_positions, mock_get_sync_state):
        mock_get_positions.return_value = []
        mock_get_sync_state.return_value = None
        service = DashboardService()

        result = service.get_positions(portfolio_id=1)

        assert isinstance(result, PositionsResponse)
        assert result.positions == []
        assert result.total_value == 0

    @patch("portfolio_src.data.database.get_sync_state")
    @patch("portfolio_src.data.database.get_positions")
    def test_calculates_position_details(self, mock_get_positions, mock_get_sync_state):
        mock_get_positions.return_value = [
            {
                "isin": "US0378331005",
                "name": "Apple Inc.",
                "symbol": "AAPL",
                "quantity": 10,
                "current_price": 150.0,
                "cost_basis": 100.0,
                "asset_class": "Equity",
            }
        ]
        mock_get_sync_state.return_value = {"last_sync": "2025-01-01T00:00:00Z"}
        service = DashboardService()

        result = service.get_positions(portfolio_id=1)

        assert len(result.positions) == 1
        pos = result.positions[0]
        assert pos.isin == "US0378331005"
        assert pos.current_value == 1500.0
        assert pos.total_cost == 1000.0
        assert pos.pnl_eur == 500.0
        assert pos.pnl_percent == 50.0

    @patch("portfolio_src.data.database.get_sync_state")
    @patch("portfolio_src.data.database.get_positions")
    def test_determines_instrument_type(self, mock_get_positions, mock_get_sync_state):
        mock_get_positions.return_value = [
            {
                "isin": "TEST1",
                "name": "Stock",
                "quantity": 1,
                "current_price": 100.0,
                "asset_class": "Equity",
            },
            {
                "isin": "TEST2",
                "name": "ETF",
                "quantity": 1,
                "current_price": 100.0,
                "asset_class": "ETF",
            },
            {
                "isin": "TEST3",
                "name": "Crypto",
                "quantity": 1,
                "current_price": 100.0,
                "asset_class": "Crypto",
            },
            {
                "isin": "TEST4",
                "name": "Bond",
                "quantity": 1,
                "current_price": 100.0,
                "asset_class": "Bond",
            },
        ]
        mock_get_sync_state.return_value = None
        service = DashboardService()

        result = service.get_positions(portfolio_id=1)

        types = {p.name: p.instrument_type for p in result.positions}
        assert types["Stock"] == "stock"
        assert types["ETF"] == "etf"
        assert types["Crypto"] == "crypto"
        assert types["Bond"] == "bond"
