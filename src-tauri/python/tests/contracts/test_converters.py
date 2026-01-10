"""Tests for DataFrame/Pydantic Converters - Validates bidirectional conversion."""

from __future__ import annotations

import pandas as pd
import pytest

from portfolio_src.core.contracts import (
    HoldingRecord,
    LoadedPosition,
    ResolutionStatus,
)
from portfolio_src.core.contracts.converters import (
    dataframe_to_holdings,
    dataframe_to_loaded_positions,
    holdings_to_dataframe,
    loaded_positions_to_dataframe,
    safe_convert_row,
)
from tests.contracts.factories import make_holding_record, make_loaded_position


class TestDataframeToLoadedPositions:
    def test_valid_dataframe(self) -> None:
        df = pd.DataFrame(
            {
                "isin": ["US0378331005", "US5949181045"],
                "name": ["Apple Inc", "Microsoft Corp"],
                "quantity": [10.0, 20.0],
                "current_price": [150.0, 300.0],
            }
        )
        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 2
        assert positions[0].isin == "US0378331005"
        assert positions[1].name == "Microsoft Corp"
        assert len(quality.issues) == 0

    def test_column_name_normalization(self) -> None:
        df = pd.DataFrame(
            {
                "ISIN": ["US0378331005"],
                "Name": ["Apple Inc"],
                "Quantity": [10.0],
            }
        )
        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 1
        assert positions[0].isin == "US0378331005"

    def test_column_name_mapping(self) -> None:
        df = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple Inc"],
                "qty": [10.0],
                "tr_price": [150.0],
                "averageBuyIn": [140.0],
            }
        )
        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 1
        assert positions[0].quantity == 10.0
        assert positions[0].current_price == 150.0
        assert positions[0].cost_basis == 140.0

    def test_missing_required_column(self) -> None:
        df = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "quantity": [10.0],
            }
        )
        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 0
        assert len(quality.issues) == 1
        assert quality.issues[0].code == "CONVERSION_ERROR"

    def test_invalid_row_skipped(self) -> None:
        df = pd.DataFrame(
            {
                "isin": ["US0378331005", "INVALID"],
                "name": ["Apple Inc", "Bad Row"],
                "quantity": [10.0, 20.0],
            }
        )
        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 1
        assert len(quality.issues) == 1

    def test_empty_dataframe(self) -> None:
        df = pd.DataFrame()
        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 0
        assert len(quality.issues) == 0


class TestDataframeToHoldings:
    def test_valid_dataframe(self) -> None:
        df = pd.DataFrame(
            {
                "ticker": ["AAPL", "MSFT"],
                "name": ["Apple Inc", "Microsoft Corp"],
                "weight": [5.0, 10.0],
            }
        )
        holdings, quality = dataframe_to_holdings(df)
        assert len(holdings) == 2
        assert holdings[0].ticker == "AAPL"
        assert holdings[1].weight_percentage == 10.0

    def test_weight_column_aliases(self) -> None:
        df = pd.DataFrame(
            {
                "ticker": ["AAPL"],
                "name": ["Apple Inc"],
                "Weight": [5.0],
            }
        )
        holdings, quality = dataframe_to_holdings(df)
        assert len(holdings) == 1
        assert holdings[0].weight_percentage == 5.0


class TestLoadedPositionsToDataframe:
    def test_round_trip(self) -> None:
        positions = [
            make_loaded_position(),
            make_loaded_position(isin="US5949181045", name="Microsoft"),
        ]
        df = loaded_positions_to_dataframe(positions)
        assert len(df) == 2
        assert "isin" in df.columns
        assert "name" in df.columns
        assert "market_value" in df.columns
        assert df.iloc[0]["isin"] == "US0378331005"

    def test_empty_list(self) -> None:
        df = loaded_positions_to_dataframe([])
        assert len(df) == 0
        assert "isin" in df.columns


class TestHoldingsToDataframe:
    def test_round_trip(self) -> None:
        holdings = [
            make_holding_record(),
            make_holding_record(ticker="MSFT", name="Microsoft"),
        ]
        df = holdings_to_dataframe(holdings)
        assert len(df) == 2
        assert "ticker" in df.columns
        assert "name" in df.columns
        assert "weight_percentage" in df.columns

    def test_empty_list(self) -> None:
        df = holdings_to_dataframe([])
        assert len(df) == 0
        assert "ticker" in df.columns


class TestDataframeToHoldingsNaN:
    def test_nan_values_converted_to_none(self) -> None:
        df = pd.DataFrame(
            {
                "ticker": ["AAPL", None],
                "name": ["Apple Inc", "Unknown"],
                "weight": [5.0, None],
            }
        )
        holdings, quality = dataframe_to_holdings(df)
        assert len(holdings) == 2
        assert holdings[1].ticker is None
        assert holdings[1].weight_percentage == 0.0


class TestSafeConvertRow:
    def test_valid_row(self) -> None:
        row = {
            "isin": "US0378331005",
            "name": "Apple Inc",
            "quantity": 10.0,
        }
        position, issue = safe_convert_row(row, LoadedPosition, "TEST")
        assert position is not None
        assert position.isin == "US0378331005"
        assert issue is None

    def test_invalid_row(self) -> None:
        row = {
            "isin": "INVALID",
            "name": "Bad",
            "quantity": 10.0,
        }
        position, issue = safe_convert_row(row, LoadedPosition, "TEST")
        assert position is None
        assert issue is not None
        assert issue.code == "CONVERSION_ERROR"
