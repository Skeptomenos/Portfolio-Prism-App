"""
Unit tests for core/utils.py value calculation functions.

Tests the vectorized position value calculation that fixes GitHub issues #36, #37.
"""

import pytest
import pandas as pd
import numpy as np
import warnings

from portfolio_src.core.utils import (
    get_total_value_column,
    get_unit_price_column,
    get_value_column,
    calculate_position_values,
)


class TestGetTotalValueColumn:
    def test_finds_market_value(self):
        df = pd.DataFrame(
            {"isin": ["US123"], "market_value": [1000.0], "price": [100.0]}
        )
        assert get_total_value_column(df) == "market_value"

    def test_finds_net_value_normalized(self):
        df = pd.DataFrame({"isin": ["US123"], "net_value": [500.0]})
        result = get_total_value_column(df)
        assert result == "market_value"

    def test_finds_tr_value_normalized(self):
        df = pd.DataFrame({"isin": ["US123"], "tr_value": [750.0]})
        result = get_total_value_column(df)
        assert result == "market_value"

    def test_returns_none_when_only_price(self):
        df = pd.DataFrame({"isin": ["US123"], "price": [100.0], "quantity": [10]})
        assert get_total_value_column(df) is None

    def test_returns_none_for_empty_df(self):
        df = pd.DataFrame()
        assert get_total_value_column(df) is None

    def test_priority_market_value_over_net_value(self):
        df = pd.DataFrame({"market_value": [100.0], "net_value": [90.0]})
        assert get_total_value_column(df) == "market_value"


class TestGetUnitPriceColumn:
    def test_finds_price(self):
        df = pd.DataFrame({"isin": ["US123"], "price": [100.0], "quantity": [10]})
        assert get_unit_price_column(df) == "price"

    def test_finds_current_price_normalized(self):
        df = pd.DataFrame({"isin": ["US123"], "current_price": [150.0]})
        result = get_unit_price_column(df)
        assert result == "price"

    def test_finds_unit_price_normalized(self):
        df = pd.DataFrame({"isin": ["US123"], "unit_price": [200.0]})
        result = get_unit_price_column(df)
        assert result == "price"

    def test_returns_none_when_no_price_columns(self):
        df = pd.DataFrame({"isin": ["US123"], "name": ["Test"]})
        assert get_unit_price_column(df) is None

    def test_returns_none_for_empty_df(self):
        df = pd.DataFrame()
        assert get_unit_price_column(df) is None

    def test_priority_price_over_current_price(self):
        df = pd.DataFrame({"price": [100.0], "current_price": [110.0]})
        assert get_unit_price_column(df) == "price"


class TestCalculatePositionValues:
    """Core bug fix tests for GitHub issues #36, #37."""

    def test_bitcoin_fractional_quantity_bug_36(self):
        """Bug #36: Bitcoin showed 74372 instead of 17.18 (0.000231 * 74372.29)."""
        df = pd.DataFrame(
            {
                "isin": ["XF000BTC0017"],
                "name": ["Bitcoin"],
                "quantity": [0.000231],
                "price": [74372.29],
            }
        )

        values = calculate_position_values(df)

        assert len(values) == 1
        assert abs(values.iloc[0] - 17.18) < 0.01

    def test_nvidia_fractional_shares_bug_37(self):
        """Bug #37: NVIDIA showed 159.84 instead of 1679.41 (10.506795 * 159.84)."""
        df = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "quantity": [10.506795],
                "price": [159.84],
            }
        )

        values = calculate_position_values(df)

        assert len(values) == 1
        assert abs(values.iloc[0] - 1679.41) < 0.01

    def test_zero_quantity(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": [0],
                "price": [100.0],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == 0.0

    def test_zero_price(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": [10],
                "price": [0],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == 0.0

    def test_missing_price_column_returns_zero(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": [10],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == 0.0

    def test_missing_quantity_column_returns_zero(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "price": [100.0],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == 0.0

    def test_market_value_takes_priority_over_calculation(self):
        """market_value (100) should win over quantity*price (5*10=50)."""
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "market_value": [100.0],
                "price": [10.0],
                "quantity": [5],
            }
        )

        values = calculate_position_values(df)

        assert values.iloc[0] == 100.0

    def test_only_market_value(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "market_value": [500.0],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == 500.0

    def test_negative_quantity_short_position(self):
        """Short position: -5 * 100 = -500."""
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": [-5],
                "price": [100.0],
            }
        )

        values = calculate_position_values(df)

        assert values.iloc[0] == -500.0

    def test_nan_values_treated_as_zero(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": [np.nan],
                "price": [100.0],
            }
        )

        values = calculate_position_values(df)

        assert values.iloc[0] == 0.0

    def test_string_values_coerced_to_numeric(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": ["10"],
                "price": ["100"],
            }
        )

        values = calculate_position_values(df)

        assert values.iloc[0] == 1000.0

    def test_empty_dataframe(self):
        df = pd.DataFrame()

        values = calculate_position_values(df)

        assert len(values) == 0
        assert isinstance(values, pd.Series)

    def test_multiple_positions_vectorized(self):
        df = pd.DataFrame(
            {
                "isin": ["US123", "US456", "US789"],
                "quantity": [10, 20, 30],
                "price": [100.0, 50.0, 25.0],
            }
        )

        values = calculate_position_values(df)

        assert len(values) == 3
        assert values.iloc[0] == 1000.0
        assert values.iloc[1] == 1000.0
        assert values.iloc[2] == 750.0

    def test_preserves_dataframe_index(self):
        df = pd.DataFrame(
            {
                "isin": ["US123", "US456"],
                "quantity": [10, 20],
                "price": [100.0, 50.0],
            }
        )
        df.index = pd.Index([5, 10])

        values = calculate_position_values(df)

        assert list(values.index) == [5, 10]

    def test_preserves_index_with_market_value_column(self):
        df = pd.DataFrame(
            {
                "isin": ["US123", "US456"],
                "market_value": [1000.0, 2000.0],
            }
        )
        df.index = pd.Index([5, 10])

        values = calculate_position_values(df)

        assert list(values.index) == [5, 10]
        assert values.loc[5] == 1000.0
        assert values.loc[10] == 2000.0

    def test_uses_current_price_column(self):
        df = pd.DataFrame(
            {
                "isin": ["US123"],
                "quantity": [10],
                "current_price": [100.0],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == 1000.0


class TestDeprecatedGetValueColumn:
    def test_emits_deprecation_warning(self):
        df = pd.DataFrame({"market_value": [100.0]})

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            get_value_column(df)

            assert len(w) == 1
            assert issubclass(w[0].category, DeprecationWarning)
            assert "deprecated" in str(w[0].message).lower()

    def test_returns_total_value_column(self):
        df = pd.DataFrame({"market_value": [100.0], "price": [10.0]})

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = get_value_column(df)

        assert result == "market_value"


class TestRealWorldScenarios:
    def test_mixed_portfolio(self):
        df = pd.DataFrame(
            {
                "isin": [
                    "US67066G1040",
                    "IE00B4L5Y983",
                    "XF000BTC0017",
                    "DE0007164600",
                ],
                "name": ["NVIDIA", "iShares MSCI World", "Bitcoin", "SAP"],
                "quantity": [10.506795, 50.0, 0.000231, 25.0],
                "price": [159.84, 82.30, 74372.29, 180.50],
            }
        )

        values = calculate_position_values(df)

        assert abs(values.iloc[0] - 1679.41) < 0.01
        assert abs(values.iloc[1] - 4115.00) < 0.01
        assert abs(values.iloc[2] - 17.18) < 0.01
        assert abs(values.iloc[3] - 4512.50) < 0.01

    def test_trade_republic_format(self):
        df = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "quantity": [10.506795],
                "current_price": [159.84],
            }
        )

        values = calculate_position_values(df)
        assert abs(values.iloc[0] - 1679.41) < 0.01

    def test_with_market_value_from_provider(self):
        df = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "quantity": [10.506795],
                "price": [159.84],
                "market_value": [1679.41],
            }
        )

        values = calculate_position_values(df)

        assert values.iloc[0] == 1679.41
