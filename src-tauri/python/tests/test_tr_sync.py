# tests/test_tr_sync.py
"""
Unit tests for TRDataFetcher (Trade Republic sync module).

Tests cover:
- Position transformation (string to float conversion)
- Malformed position handling (skip behavior)
- Empty portfolio handling
- CSV generation correctness (using stdlib csv)
- Edge cases in instrument names (commas, quotes, newlines)
"""

import csv
import pytest
from pathlib import Path
from unittest.mock import Mock

from portfolio_src.data.tr_sync import TRDataFetcher


class TestTRDataFetcherFetchPortfolio:
    """Tests for fetch_portfolio_sync() method."""

    @pytest.fixture
    def mock_bridge(self):
        """Create a mock bridge for testing."""
        return Mock()

    def test_fetch_portfolio_success(self, mock_bridge):
        """Test successful portfolio fetch with valid positions."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Siemens AG",
                        "netSize": "10.5",
                        "averageBuyIn": "120.50",
                        "netValue": 1300.25,
                    }
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert len(positions) == 1
        assert positions[0]["isin"] == "DE0007236101"
        assert positions[0]["name"] == "Siemens AG"
        assert positions[0]["quantity"] == 10.5
        assert positions[0]["avg_cost"] == 120.50
        # current_price = net_value / quantity = 1300.25 / 10.5
        assert abs(positions[0]["current_price"] - 123.833333) < 0.001
        assert positions[0]["net_value"] == 1300.25

    def test_fetch_portfolio_multiple_positions(self, mock_bridge):
        """Test fetching multiple positions."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Siemens AG",
                        "netSize": "10",
                        "averageBuyIn": "100",
                        "netValue": 1100.0,
                    },
                    {
                        "instrumentId": "US0378331005",
                        "name": "Apple Inc.",
                        "netSize": "5",
                        "averageBuyIn": "150",
                        "netValue": 800.0,
                    },
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert len(positions) == 2
        assert positions[0]["isin"] == "DE0007236101"
        assert positions[1]["isin"] == "US0378331005"

    def test_fetch_portfolio_skips_malformed_missing_instrument_id(self, mock_bridge):
        """Test that positions missing instrumentId are skipped."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "VALID123456789",
                        "name": "Valid Position",
                        "netSize": "10",
                        "averageBuyIn": "100",
                        "netValue": 1000,
                    },
                    {
                        "name": "Missing ID",
                        "netSize": "10",
                        "averageBuyIn": "100",
                        "netValue": 1000,
                    },  # Missing instrumentId
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert len(positions) == 1  # Malformed position skipped
        assert positions[0]["isin"] == "VALID123456789"

    def test_fetch_portfolio_skips_malformed_invalid_values(self, mock_bridge):
        """Test that positions with invalid numeric values are skipped."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "VALID123456789",
                        "name": "Valid Position",
                        "netSize": "10",
                        "averageBuyIn": "100",
                        "netValue": 1000,
                    },
                    {
                        "instrumentId": "INVALID1234567",
                        "name": "Invalid Quantity",
                        "netSize": "not-a-number",  # Invalid float
                        "averageBuyIn": "100",
                        "netValue": 1000,
                    },
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert len(positions) == 1
        assert positions[0]["isin"] == "VALID123456789"

    def test_fetch_portfolio_empty_with_cash(self, mock_bridge):
        """Test empty portfolio with cash returns empty list without warning."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {"positions": [], "cash": [{"amount": 1000}]},
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert positions == []

    def test_fetch_portfolio_empty_no_cash(self, mock_bridge):
        """Test empty portfolio without cash returns empty list."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {"positions": [], "cash": []},
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert positions == []

    def test_fetch_portfolio_zero_quantity(self, mock_bridge):
        """Test that zero quantity positions get current_price of 0."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Zero Position",
                        "netSize": "0",
                        "averageBuyIn": "100",
                        "netValue": 0,
                    }
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert len(positions) == 1
        assert positions[0]["quantity"] == 0
        assert positions[0]["current_price"] == 0  # Division by zero fallback

    def test_fetch_portfolio_failure_status(self, mock_bridge):
        """Test that non-success status raises RuntimeError."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "error",
            "message": "Session expired",
        }
        fetcher = TRDataFetcher(mock_bridge)

        with pytest.raises(RuntimeError, match="Session expired"):
            fetcher.fetch_portfolio_sync()

    def test_fetch_portfolio_uses_default_name(self, mock_bridge):
        """Test that missing name gets default value 'Unknown'."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        # name is missing
                        "netSize": "10",
                        "averageBuyIn": "100",
                        "netValue": 1000,
                    }
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()

        assert len(positions) == 1
        assert positions[0]["name"] == "Unknown"


class TestTRDataFetcherSaveToCsv:
    """Tests for save_to_csv() method."""

    @pytest.fixture
    def mock_bridge(self):
        """Create a mock bridge for testing."""
        return Mock()

    def test_save_to_csv_basic(self, mock_bridge, tmp_path):
        """Test basic CSV save functionality."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": "Test Stock",
                "quantity": 10.0,
                "avg_cost": 50.0,
                "current_price": 55.0,
                "net_value": 550.0,
            }
        ]
        output_path = tmp_path / "output.csv"

        count = fetcher.save_to_csv(positions, output_path)

        assert count == 1
        assert output_path.exists()

        # Verify CSV structure using csv reader
        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert len(rows) == 2  # Header + 1 data row
        assert rows[0] == [
            "ISIN",
            "Quantity",
            "AvgCost",
            "CurrentPrice",
            "NetValue",
            "TR_Name",
        ]
        assert rows[1][0] == "US1234567890"
        assert rows[1][5] == "Test Stock"

    def test_save_to_csv_creates_directories(self, mock_bridge, tmp_path):
        """Test that save_to_csv creates parent directories."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": "Test",
                "quantity": 1.0,
                "avg_cost": 10.0,
                "current_price": 10.0,
                "net_value": 10.0,
            }
        ]
        output_path = tmp_path / "deep" / "nested" / "dir" / "output.csv"

        count = fetcher.save_to_csv(positions, output_path)

        assert count == 1
        assert output_path.exists()

    def test_save_to_csv_handles_comma_in_name(self, mock_bridge, tmp_path):
        """Test that names with commas are properly escaped."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": "Company, Inc.",  # Contains comma
                "quantity": 10.0,
                "avg_cost": 50.0,
                "current_price": 55.0,
                "net_value": 550.0,
            }
        ]
        output_path = tmp_path / "output.csv"

        fetcher.save_to_csv(positions, output_path)

        # Use csv reader to verify proper escaping
        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert rows[1][5] == "Company, Inc."  # Correctly parsed despite comma

    def test_save_to_csv_handles_quotes_in_name(self, mock_bridge, tmp_path):
        """Test that names with double quotes are properly escaped."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": 'O"Reilly Media',  # Contains quote
                "quantity": 10.0,
                "avg_cost": 50.0,
                "current_price": 55.0,
                "net_value": 550.0,
            }
        ]
        output_path = tmp_path / "output.csv"

        fetcher.save_to_csv(positions, output_path)

        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert rows[1][5] == 'O"Reilly Media'

    def test_save_to_csv_handles_newline_in_name(self, mock_bridge, tmp_path):
        """Test that names with embedded newlines are properly escaped."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": "Line1\nLine2",  # Contains newline
                "quantity": 10.0,
                "avg_cost": 50.0,
                "current_price": 55.0,
                "net_value": 550.0,
            }
        ]
        output_path = tmp_path / "output.csv"

        fetcher.save_to_csv(positions, output_path)

        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert rows[1][5] == "Line1\nLine2"  # Newline preserved in value

    def test_save_to_csv_handles_complex_name(self, mock_bridge, tmp_path):
        """Test that names with multiple special chars are properly escaped."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": 'Test, "Inc."\nSubsidiary',  # Comma, quotes, and newline
                "quantity": 10.0,
                "avg_cost": 50.0,
                "current_price": 55.0,
                "net_value": 550.0,
            }
        ]
        output_path = tmp_path / "output.csv"

        fetcher.save_to_csv(positions, output_path)

        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert rows[1][5] == 'Test, "Inc."\nSubsidiary'

    def test_save_to_csv_number_formatting(self, mock_bridge, tmp_path):
        """Test that numbers are formatted with correct precision."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US1234567890",
                "name": "Test",
                "quantity": 10.123456789,  # Should be .6f
                "avg_cost": 50.12346,  # Should be .4f -> 50.1235
                "current_price": 55.12346,  # Should be .4f -> 55.1235
                "net_value": 550.126,  # Should be .2f -> 550.13
            }
        ]
        output_path = tmp_path / "output.csv"

        fetcher.save_to_csv(positions, output_path)

        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert rows[1][1] == "10.123457"  # 6 decimal places
        assert rows[1][2] == "50.1235"  # 4 decimal places
        assert rows[1][3] == "55.1235"  # 4 decimal places
        assert rows[1][4] == "550.13"  # 2 decimal places

    def test_save_to_csv_multiple_positions(self, mock_bridge, tmp_path):
        """Test saving multiple positions."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {
                "isin": "US0001111111",
                "name": "Stock A",
                "quantity": 10.0,
                "avg_cost": 100.0,
                "current_price": 110.0,
                "net_value": 1100.0,
            },
            {
                "isin": "US0002222222",
                "name": "Stock B",
                "quantity": 20.0,
                "avg_cost": 50.0,
                "current_price": 55.0,
                "net_value": 1100.0,
            },
            {
                "isin": "US0003333333",
                "name": "Stock C",
                "quantity": 5.0,
                "avg_cost": 200.0,
                "current_price": 220.0,
                "net_value": 1100.0,
            },
        ]
        output_path = tmp_path / "output.csv"

        count = fetcher.save_to_csv(positions, output_path)

        assert count == 3

        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert len(rows) == 4  # Header + 3 data rows

    def test_save_to_csv_empty_positions(self, mock_bridge, tmp_path):
        """Test saving empty positions list creates file with header only."""
        fetcher = TRDataFetcher(mock_bridge)
        positions = []
        output_path = tmp_path / "output.csv"

        count = fetcher.save_to_csv(positions, output_path)

        assert count == 0
        assert output_path.exists()

        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        assert len(rows) == 1  # Header only
        assert rows[0] == [
            "ISIN",
            "Quantity",
            "AvgCost",
            "CurrentPrice",
            "NetValue",
            "TR_Name",
        ]


class TestTRDataFetcherIntegration:
    """Integration tests combining fetch and save."""

    @pytest.fixture
    def mock_bridge(self):
        """Create a mock bridge for testing."""
        return Mock()

    def test_fetch_and_save_roundtrip(self, mock_bridge, tmp_path):
        """Test full roundtrip: fetch positions and save to CSV."""
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Siemens AG",
                        "netSize": "10.5",
                        "averageBuyIn": "120.50",
                        "netValue": 1300.25,
                    },
                    {
                        "instrumentId": "US0378331005",
                        "name": "Apple, Inc.",  # Has comma
                        "netSize": "5",
                        "averageBuyIn": "150.00",
                        "netValue": 800.0,
                    },
                ]
            },
        }

        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        output_path = tmp_path / "portfolio.csv"
        count = fetcher.save_to_csv(positions, output_path)

        assert count == 2

        # Verify CSV is readable
        with open(output_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            saved = list(reader)

        assert len(saved) == 2
        assert saved[0]["ISIN"] == "DE0007236101"
        assert saved[0]["TR_Name"] == "Siemens AG"
        assert saved[1]["ISIN"] == "US0378331005"
        assert saved[1]["TR_Name"] == "Apple, Inc."  # Comma handled correctly
