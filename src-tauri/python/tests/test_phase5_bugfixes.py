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


class TestUS002WeightFormatAutoDetection:
    """US-002: Add weight format auto-detection in decomposer."""

    def test_decimal_weights_are_converted_to_percentage(self):
        """
        Test that holdings with decimal weights (0.05 = 5%) are auto-converted.

        Detection heuristic: if max(weights) <= 1.0 AND sum(weights) <= 2.0,
        it's decimal format and should be multiplied by 100.
        """
        from portfolio_src.core.services.decomposer import Decomposer

        # Create holdings with decimal weights (sum = 0.15, max = 0.10)
        holdings_decimal = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600", "FR0000120578"],
                "name": ["Apple", "SAP", "Sanofi"],
                "weight": [0.10, 0.03, 0.02],  # Decimal format (10%, 3%, 2%)
            }
        )

        # Mock dependencies
        mock_cache = MagicMock()
        mock_cache.get_holdings.return_value = holdings_decimal
        mock_registry = MagicMock()

        decomposer = Decomposer(mock_cache, mock_registry)

        # Decompose a single ETF
        etf_positions = pd.DataFrame({"isin": ["IE00B4L5Y983"], "name": ["Test ETF"]})
        holdings_map, errors = decomposer.decompose(etf_positions)

        # Verify weights were converted to percentage format
        assert "IE00B4L5Y983" in holdings_map
        result = holdings_map["IE00B4L5Y983"]
        assert result["weight"].iloc[0] == pytest.approx(10.0, rel=0.01)
        assert result["weight"].iloc[1] == pytest.approx(3.0, rel=0.01)
        assert result["weight"].iloc[2] == pytest.approx(2.0, rel=0.01)

    def test_percentage_weights_are_not_modified(self):
        """
        Test that holdings already in percentage format are not modified.

        If max(weights) > 1.0 OR sum(weights) > 2.0, it's already percentage format.
        """
        from portfolio_src.core.services.decomposer import Decomposer

        # Create holdings with percentage weights (sum = 15, max = 10)
        holdings_percentage = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600", "FR0000120578"],
                "name": ["Apple", "SAP", "Sanofi"],
                "weight": [10.0, 3.0, 2.0],  # Already percentage format
            }
        )

        mock_cache = MagicMock()
        mock_cache.get_holdings.return_value = holdings_percentage
        mock_registry = MagicMock()

        decomposer = Decomposer(mock_cache, mock_registry)

        etf_positions = pd.DataFrame({"isin": ["IE00B4L5Y983"], "name": ["Test ETF"]})
        holdings_map, errors = decomposer.decompose(etf_positions)

        # Verify weights were NOT modified
        assert "IE00B4L5Y983" in holdings_map
        result = holdings_map["IE00B4L5Y983"]
        assert result["weight"].iloc[0] == pytest.approx(10.0, rel=0.01)
        assert result["weight"].iloc[1] == pytest.approx(3.0, rel=0.01)
        assert result["weight"].iloc[2] == pytest.approx(2.0, rel=0.01)

    def test_weights_summing_to_one_are_converted(self):
        """
        Test that holdings where weights sum to ~1.0 are detected as decimal format.
        """
        from portfolio_src.core.services.decomposer import Decomposer

        # Create holdings that sum to exactly 1.0 (100%)
        holdings_sum_one = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600", "FR0000120578"],
                "name": ["Apple", "SAP", "Sanofi"],
                "weight": [0.50, 0.30, 0.20],  # Sum = 1.0, decimal format
            }
        )

        mock_cache = MagicMock()
        mock_cache.get_holdings.return_value = holdings_sum_one
        mock_registry = MagicMock()

        decomposer = Decomposer(mock_cache, mock_registry)

        etf_positions = pd.DataFrame({"isin": ["IE00B4L5Y983"], "name": ["Test ETF"]})
        holdings_map, errors = decomposer.decompose(etf_positions)

        # Verify weights were converted to percentage format
        assert "IE00B4L5Y983" in holdings_map
        result = holdings_map["IE00B4L5Y983"]
        assert result["weight"].iloc[0] == pytest.approx(50.0, rel=0.01)
        assert result["weight"].iloc[1] == pytest.approx(30.0, rel=0.01)
        assert result["weight"].iloc[2] == pytest.approx(20.0, rel=0.01)

    def test_conversion_is_logged(self, caplog):
        """
        Test that weight format conversion is logged.
        """
        import logging
        from portfolio_src.core.services.decomposer import Decomposer

        holdings_decimal = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple"],
                "weight": [0.10],  # Decimal format
            }
        )

        mock_cache = MagicMock()
        mock_cache.get_holdings.return_value = holdings_decimal
        mock_registry = MagicMock()

        decomposer = Decomposer(mock_cache, mock_registry)

        with caplog.at_level(logging.INFO):
            etf_positions = pd.DataFrame(
                {"isin": ["IE00B4L5Y983"], "name": ["Test ETF"]}
            )
            decomposer.decompose(etf_positions)

        # Verify conversion was logged
        assert any(
            "decimal" in record.message.lower() or "weight" in record.message.lower()
            for record in caplog.records
        )


class TestUS003AsyncHiveContribution:
    """US-003: Make Hive contribution asynchronous."""

    def test_decompose_does_not_wait_for_hive_contribution(self):
        """
        Test that decompose_etf returns quickly even when Hive contribution is slow.

        Bug: Hive contribution blocks pipeline execution.
        Fix: Use daemon thread for fire-and-forget contribution.
        """
        import time
        from portfolio_src.core.services.decomposer import Decomposer

        # Create holdings that will be returned by adapter
        adapter_holdings = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600"],
                "name": ["Apple", "SAP"],
                "weight": [10.0, 5.0],
            }
        )

        # Mock cache to return None (force adapter path)
        mock_cache = MagicMock()
        mock_cache.get_holdings.return_value = None

        # Mock adapter to return holdings
        mock_adapter = MagicMock()
        mock_adapter.fetch_holdings.return_value = adapter_holdings

        mock_registry = MagicMock()
        mock_registry.get_adapter.return_value = mock_adapter

        decomposer = Decomposer(mock_cache, mock_registry)

        # Mock Hive client with 1 second delay
        mock_hive = MagicMock()
        mock_hive.is_configured = True

        def slow_contribute(*args, **kwargs):
            time.sleep(1.0)  # Simulate slow network call

        mock_hive.contribute_etf_holdings.side_effect = slow_contribute

        etf_positions = pd.DataFrame({"isin": ["IE00B4L5Y983"], "name": ["Test ETF"]})

        with patch(
            "portfolio_src.core.services.decomposer.get_hive_client",
            return_value=mock_hive,
        ):
            start_time = time.time()
            holdings_map, errors = decomposer.decompose(etf_positions)
            elapsed = time.time() - start_time

        # Should return in < 0.5s (not wait for 1s contribution)
        assert elapsed < 0.5, f"Decompose took {elapsed:.2f}s, expected < 0.5s"
        assert "IE00B4L5Y983" in holdings_map
        assert len(errors) == 0

    def test_hive_contribution_errors_are_logged_not_raised(self, caplog):
        """
        Test that Hive contribution errors are logged but don't affect pipeline.
        """
        import logging
        from portfolio_src.core.services.decomposer import Decomposer

        adapter_holdings = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple"],
                "weight": [10.0],
            }
        )

        mock_cache = MagicMock()
        mock_cache.get_holdings.return_value = None

        mock_adapter = MagicMock()
        mock_adapter.fetch_holdings.return_value = adapter_holdings

        mock_registry = MagicMock()
        mock_registry.get_adapter.return_value = mock_adapter

        decomposer = Decomposer(mock_cache, mock_registry)

        # Mock Hive client that raises an error
        mock_hive = MagicMock()
        mock_hive.is_configured = True
        mock_hive.contribute_etf_holdings.side_effect = Exception("Network error")

        etf_positions = pd.DataFrame({"isin": ["IE00B4L5Y983"], "name": ["Test ETF"]})

        with patch(
            "portfolio_src.core.services.decomposer.get_hive_client",
            return_value=mock_hive,
        ):
            with caplog.at_level(logging.DEBUG):
                holdings_map, errors = decomposer.decompose(etf_positions)

        # Pipeline should succeed despite Hive error
        assert "IE00B4L5Y983" in holdings_map
        assert len(errors) == 0

    def test_contribute_to_hive_async_helper_exists(self):
        """
        Test that _contribute_to_hive_async helper function exists.
        """
        from portfolio_src.core.services.decomposer import _contribute_to_hive_async

        # Function should exist and be callable
        assert callable(_contribute_to_hive_async)
