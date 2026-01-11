"""
Phase 5 Bug Fix Tests

TDD tests for the 12 identified calculation and reliability bugs.
Each test is written FIRST to fail, then the fix is implemented.
"""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock


class TestUS001NaNAssetClass:
    """US-001: Fix NaN handling in asset_class split."""

    def test_nan_asset_class_does_not_raise_attribute_error(self):
        """
        Test that _load_portfolio handles NaN asset_class values without crashing.

        Bug: df['asset_class'].str.upper() fails with AttributeError on NaN values.
        Fix: Use .fillna('').str.upper() pattern.
        """
        from portfolio_src.core.pipeline import Pipeline

        # Create positions with NaN asset_class values
        positions_with_nan = [
            {
                "isin": "US0378331005",
                "asset_class": "Stock",
                "quantity": 10,
                "price": 150.0,
            },
            {
                "isin": "IE00B4L5Y983",
                "asset_class": "ETF",
                "quantity": 5,
                "price": 50.0,
            },
            {
                "isin": "DE0007164600",
                "asset_class": None,
                "quantity": 20,
                "price": 80.0,
            },  # NaN
            {
                "isin": "FR0000120578",
                "asset_class": float("nan"),
                "quantity": 15,
                "price": 200.0,
            },  # NaN
        ]

        pipeline = Pipeline()

        # Mock get_positions to return our test data
        with patch(
            "portfolio_src.data.database.get_positions", return_value=positions_with_nan
        ):
            # This should NOT raise AttributeError
            direct, etfs = pipeline._load_portfolio()

            # Verify results
            assert len(direct) == 3  # Stock + 2 NaN (treated as direct holdings)
            assert len(etfs) == 1  # Only the ETF

    def test_nan_asset_class_treated_as_direct_holdings(self):
        """
        Test that positions with NaN asset_class are treated as direct holdings (not ETFs).
        """
        from portfolio_src.core.pipeline import Pipeline

        positions_with_nan = [
            {
                "isin": "US0378331005",
                "asset_class": None,
                "quantity": 10,
                "price": 150.0,
            },
        ]

        pipeline = Pipeline()

        with patch(
            "portfolio_src.data.database.get_positions", return_value=positions_with_nan
        ):
            direct, etfs = pipeline._load_portfolio()

            # NaN should be in direct, not ETFs
            assert len(direct) == 1
            assert len(etfs) == 0
            assert direct.iloc[0]["isin"] == "US0378331005"
