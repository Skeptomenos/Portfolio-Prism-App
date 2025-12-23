"""Unit tests for dashboard handlers."""

import pytest
from unittest.mock import patch, MagicMock

from portfolio_src.headless.handlers.dashboard import (
    handle_get_dashboard_data,
    handle_get_positions,
)


class TestGetDashboardData:
    """Tests for handle_get_dashboard_data handler."""

    @patch("portfolio_src.data.database.get_positions")
    def test_empty_portfolio_returns_empty_data(self, mock_get_positions):
        """Should return empty dashboard data when no positions exist."""
        mock_get_positions.return_value = []

        result = handle_get_dashboard_data(cmd_id=1, payload={"portfolioId": 1})

        assert result["status"] == "success"
        assert result["id"] == 1
        assert result["data"]["isEmpty"] is True
        assert result["data"]["totalValue"] == 0
        assert result["data"]["positionCount"] == 0

    @patch("portfolio_src.data.database.get_positions")
    def test_calculates_totals_correctly(self, mock_get_positions):
        """Should calculate total value and gains correctly."""
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

        result = handle_get_dashboard_data(cmd_id=2, payload={"portfolioId": 1})

        assert result["status"] == "success"
        # Apple: 10 * 150 = 1500, Microsoft: 5 * 300 = 1500
        assert result["data"]["totalValue"] == 3000.0
        # Apple cost: 10 * 100 = 1000, Microsoft cost: 5 * 250 = 1250
        # Total cost: 2250, Total gain: 3000 - 2250 = 750
        assert result["data"]["totalGain"] == 750.0
        assert result["data"]["positionCount"] == 2
        assert result["data"]["isEmpty"] is False

    @patch("portfolio_src.data.database.get_positions")
    def test_response_structure_matches_ipc_contract(self, mock_get_positions):
        """Should return response matching IPC contract structure."""
        mock_get_positions.return_value = [
            {
                "isin": "TEST123",
                "name": "Test Stock",
                "quantity": 1,
                "current_price": 100.0,
                "cost_basis": 100.0,
            }
        ]

        result = handle_get_dashboard_data(cmd_id=3, payload={})

        # Verify IPC contract structure
        assert set(result.keys()) == {"id", "status", "data"}

        # Verify data fields
        data = result["data"]
        required_fields = {
            "totalValue",
            "totalGain",
            "gainPercentage",
            "allocations",
            "topHoldings",
            "lastUpdated",
            "isEmpty",
            "positionCount",
        }
        assert required_fields.issubset(set(data.keys()))


class TestGetPositions:
    """Tests for handle_get_positions handler."""

    @patch("portfolio_src.data.database.get_sync_state")
    @patch("portfolio_src.data.database.get_positions")
    def test_empty_portfolio_returns_empty_list(
        self, mock_get_positions, mock_get_sync_state
    ):
        """Should return empty positions list when no positions exist."""
        mock_get_positions.return_value = []
        mock_get_sync_state.return_value = None

        result = handle_get_positions(cmd_id=1, payload={"portfolioId": 1})

        assert result["status"] == "success"
        assert result["data"]["positions"] == []
        assert result["data"]["totalValue"] == 0

    @patch("portfolio_src.data.database.get_sync_state")
    @patch("portfolio_src.data.database.get_positions")
    def test_calculates_position_details(self, mock_get_positions, mock_get_sync_state):
        """Should calculate position details correctly."""
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

        result = handle_get_positions(cmd_id=2, payload={"portfolioId": 1})

        assert result["status"] == "success"
        assert len(result["data"]["positions"]) == 1

        pos = result["data"]["positions"][0]
        assert pos["isin"] == "US0378331005"
        assert pos["currentValue"] == 1500.0  # 10 * 150
        assert pos["totalCost"] == 1000.0  # 10 * 100
        assert pos["pnlEur"] == 500.0  # 1500 - 1000
        assert pos["pnlPercent"] == 50.0  # 500 / 1000 * 100
