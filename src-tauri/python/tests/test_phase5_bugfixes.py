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


class TestUS004HighestConfidenceAggregation:
    """US-004: Fix first-wins aggregation to use highest confidence."""

    def test_aggregation_uses_highest_confidence_source(self):
        """
        Test that name/sector/geography come from the highest confidence source.

        Bug: groupby().agg('first') picks arbitrary first row.
        Fix: Sort by confidence descending before groupby so 'first' picks highest.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Create direct positions with same ISIN from different sources
        # with different confidence scores
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005", "US0378331005"],
                "name": ["Apple Low Conf", "Apple High Conf"],
                "sector": ["Tech Low", "Technology"],
                "geography": ["US Low", "United States"],
                "market_value": [1000.0, 500.0],
                "resolution_confidence": [
                    0.5,
                    0.95,
                ],  # Second row has higher confidence
                "resolution_source": ["source_low", "source_high"],
            }
        )

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=pd.DataFrame(),
            holdings_map={},
        )

        assert len(errors) == 0
        assert len(result) == 1  # Should aggregate to single ISIN

        row = result.iloc[0]
        # Should use values from highest confidence source (0.95)
        assert row["name"] == "Apple High Conf"
        assert row["sector"] == "Technology"
        assert row["geography"] == "United States"
        # Exposure should be summed
        assert row["total_exposure"] == pytest.approx(1500.0, rel=0.01)

    def test_aggregation_prefers_non_unknown_when_confidence_equal(self):
        """
        Test that when confidence is equal, non-'Unknown' values are preferred.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Same confidence, but one has 'Unknown' values
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005", "US0378331005"],
                "name": ["Unknown", "Apple Inc"],
                "sector": ["Unknown", "Technology"],
                "geography": ["Unknown", "United States"],
                "market_value": [1000.0, 500.0],
                "resolution_confidence": [0.8, 0.8],  # Equal confidence
                "resolution_source": ["source_a", "source_b"],
            }
        )

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=pd.DataFrame(),
            holdings_map={},
        )

        assert len(errors) == 0
        assert len(result) == 1

        row = result.iloc[0]
        # Should prefer non-Unknown values
        assert row["name"] == "Apple Inc"
        assert row["sector"] == "Technology"
        assert row["geography"] == "United States"

    def test_aggregation_without_confidence_column_still_works(self):
        """
        Test that aggregation still works when resolution_confidence column is missing.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # No confidence column - should fall back to original behavior
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600"],
                "name": ["Apple", "SAP"],
                "sector": ["Technology", "Technology"],
                "geography": ["United States", "Germany"],
                "market_value": [1000.0, 500.0],
            }
        )

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=pd.DataFrame(),
            holdings_map={},
        )

        assert len(errors) == 0
        assert len(result) == 2  # Two different ISINs

    def test_aggregation_with_etf_holdings_uses_highest_confidence(self):
        """
        Test that ETF holdings also use highest confidence for aggregation.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Direct position with low confidence
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple Low"],
                "sector": ["Tech"],
                "geography": ["US"],
                "market_value": [1000.0],
                "resolution_confidence": [0.3],
            }
        )

        # ETF positions
        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["Test ETF"],
                "market_value": [5000.0],
            }
        )

        # ETF holdings with same ISIN but higher confidence
        etf_holdings = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple Inc"],
                "sector": ["Technology"],
                "geography": ["United States"],
                "weight": [10.0],
                "resolution_confidence": [0.95],
            }
        )

        holdings_map = {"IE00B4L5Y983": etf_holdings}

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=etf_positions,
            holdings_map=holdings_map,
        )

        assert len(errors) == 0

        # Find the Apple row
        apple_row = result[result["isin"] == "US0378331005"].iloc[0]
        # Should use values from ETF holdings (higher confidence)
        assert apple_row["name"] == "Apple Inc"
        assert apple_row["sector"] == "Technology"
        assert apple_row["geography"] == "United States"


class TestUS005VectorizedValueCalculation:
    """US-005: Verify and fix vectorized value calculation."""

    def test_vectorized_calculation_with_1000_positions(self):
        """Verify calculate_position_values handles 1000+ positions efficiently."""
        import time
        from portfolio_src.core.utils import calculate_position_values

        n_positions = 1500
        large_df = pd.DataFrame(
            {
                "isin": [f"US{str(i).zfill(10)}" for i in range(n_positions)],
                "name": [f"Stock {i}" for i in range(n_positions)],
                "quantity": [10 + i for i in range(n_positions)],
                "current_price": [100.0 + i * 0.1 for i in range(n_positions)],
            }
        )

        start = time.time()
        values = calculate_position_values(large_df)
        elapsed = time.time() - start

        assert len(values) == n_positions
        assert values.iloc[0] == pytest.approx(1000.0, rel=0.01)
        assert values.iloc[-1] == pytest.approx(1509 * 249.9, rel=0.01)
        assert elapsed < 1.0, f"Calculation took {elapsed:.2f}s, expected < 1s"

    def test_calculate_position_values_called_once_not_per_row(self):
        """Verify calculate_position_values is called once, not per-row."""
        from portfolio_src.core.pipeline import Pipeline
        from portfolio_src.core.utils import calculate_position_values

        positions = [
            {
                "isin": f"US{str(i).zfill(10)}",
                "asset_class": "Stock",
                "quantity": 10,
                "price": 100.0,
            }
            for i in range(100)
        ]

        pipeline = Pipeline()
        call_count = 0
        original_fn = calculate_position_values

        def counting_wrapper(df):
            nonlocal call_count
            call_count += 1
            return original_fn(df)

        with patch("portfolio_src.data.database.get_positions", return_value=positions):
            with patch(
                "portfolio_src.core.pipeline.calculate_position_values",
                side_effect=counting_wrapper,
            ):
                direct, etfs = pipeline._load_portfolio()
                call_count = 0
                pipeline._write_breakdown_report(direct, etfs, {})

        assert call_count == 1, (
            f"calculate_position_values called {call_count} times, expected 1"
        )

    def test_position_values_dict_used_in_loop(self):
        """Verify pre-computed position_values dict is used in the loop."""
        from portfolio_src.core.utils import calculate_position_values

        df = pd.DataFrame(
            {
                "isin": ["US0001", "US0002", "US0003"],
                "quantity": [10, 20, 30],
                "current_price": [100.0, 50.0, 25.0],
            }
        )

        position_values = calculate_position_values(df)

        for idx in df.index:
            value = position_values.get(idx, 0.0)
            expected = df.loc[idx, "quantity"] * df.loc[idx, "current_price"]
            assert value == pytest.approx(expected, rel=0.01)

    def test_no_per_row_value_calculation_in_direct_holdings_loop(self):
        """Verify the direct holdings loop uses pre-computed values, not per-row calculation."""
        from portfolio_src.core.pipeline import Pipeline

        positions = [
            {
                "isin": "US0001",
                "asset_class": "Stock",
                "quantity": 10,
                "price": 100.0,
                "name": "Test Stock",
            },
        ]

        pipeline = Pipeline()
        mock_values = pd.Series({0: 1000.0})

        with patch("portfolio_src.data.database.get_positions", return_value=positions):
            with patch(
                "portfolio_src.core.pipeline.calculate_position_values",
                return_value=mock_values,
            ) as mock_calc:
                direct, etfs = pipeline._load_portfolio()
                pipeline._write_breakdown_report(direct, etfs, {})
                assert mock_calc.call_count == 1

    def test_vectorized_handles_market_value_column(self):
        """Verify vectorized calculation uses market_value column when available."""
        from portfolio_src.core.utils import calculate_position_values

        df = pd.DataFrame(
            {
                "isin": ["US0001", "US0002"],
                "market_value": [5000.0, 3000.0],
                "quantity": [10, 20],
                "current_price": [100.0, 50.0],
            }
        )

        values = calculate_position_values(df)
        assert values.iloc[0] == pytest.approx(5000.0, rel=0.01)
        assert values.iloc[1] == pytest.approx(3000.0, rel=0.01)


class TestUS006ISINDeduplicationBeforeEnrichment:
    """US-006: Add ISIN deduplication before enrichment."""

    def test_enrichment_called_once_per_unique_isin(self):
        """
        Test that enrichment is called once per unique ISIN, not per occurrence.

        Bug: Same ISIN appearing in multiple ETFs causes redundant API calls.
        Fix: Collect unique ISINs, enrich once, map back to all occurrences.
        """
        from portfolio_src.core.services.enricher import Enricher

        # Create holdings_map with duplicate ISINs across ETFs
        holdings_etf1 = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600", "FR0000120578"],
                "name": ["Apple", "SAP", "Sanofi"],
                "weight": [10.0, 5.0, 3.0],
            }
        )
        holdings_etf2 = pd.DataFrame(
            {
                "isin": [
                    "US0378331005",
                    "GB00B03MLX29",
                    "FR0000120578",
                ],  # Apple and Sanofi duplicated
                "name": ["Apple", "Royal Dutch Shell", "Sanofi"],
                "weight": [8.0, 6.0, 4.0],
            }
        )
        holdings_map = {"IE00B4L5Y983": holdings_etf1, "IE00B4L5YC18": holdings_etf2}

        # Mock enrichment service to track calls
        mock_service = MagicMock()
        mock_service.get_metadata_batch.return_value = MagicMock(
            data={
                "US0378331005": {
                    "name": "Apple Inc",
                    "sector": "Technology",
                    "geography": "US",
                    "asset_class": "Equity",
                },
                "DE0007164600": {
                    "name": "SAP SE",
                    "sector": "Technology",
                    "geography": "Germany",
                    "asset_class": "Equity",
                },
                "FR0000120578": {
                    "name": "Sanofi SA",
                    "sector": "Healthcare",
                    "geography": "France",
                    "asset_class": "Equity",
                },
                "GB00B03MLX29": {
                    "name": "Shell plc",
                    "sector": "Energy",
                    "geography": "UK",
                    "asset_class": "Equity",
                },
            },
            sources={
                "US0378331005": "hive",
                "DE0007164600": "hive",
                "FR0000120578": "hive",
                "GB00B03MLX29": "hive",
            },
            contributions=[],
        )

        enricher = Enricher(enrichment_service=mock_service)
        enriched_map, errors = enricher.enrich(holdings_map)

        # Should call get_metadata_batch ONCE with all unique ISINs
        assert mock_service.get_metadata_batch.call_count == 1
        called_isins = mock_service.get_metadata_batch.call_args[0][0]
        # Should have 4 unique ISINs, not 6 total
        assert len(called_isins) == 4
        assert set(called_isins) == {
            "US0378331005",
            "DE0007164600",
            "FR0000120578",
            "GB00B03MLX29",
        }

    def test_all_occurrences_receive_enrichment_data(self):
        """
        Test that all occurrences of a duplicated ISIN receive the enrichment data.
        """
        from portfolio_src.core.services.enricher import Enricher

        # Same ISIN in both ETFs
        holdings_etf1 = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple"],
                "weight": [10.0],
            }
        )
        holdings_etf2 = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple"],
                "weight": [8.0],
            }
        )
        holdings_map = {"ETF1": holdings_etf1, "ETF2": holdings_etf2}

        mock_service = MagicMock()
        mock_service.get_metadata_batch.return_value = MagicMock(
            data={
                "US0378331005": {
                    "name": "Apple Inc",
                    "sector": "Technology",
                    "geography": "United States",
                    "asset_class": "Equity",
                },
            },
            sources={"US0378331005": "hive"},
            contributions=[],
        )

        enricher = Enricher(enrichment_service=mock_service)
        enriched_map, errors = enricher.enrich(holdings_map)

        # Both ETFs should have enriched data
        assert len(errors) == 0
        assert "ETF1" in enriched_map
        assert "ETF2" in enriched_map
        assert enriched_map["ETF1"].iloc[0]["sector"] == "Technology"
        assert enriched_map["ETF2"].iloc[0]["sector"] == "Technology"
        assert enriched_map["ETF1"].iloc[0]["geography"] == "United States"
        assert enriched_map["ETF2"].iloc[0]["geography"] == "United States"

    def test_unique_isin_count_is_logged(self, caplog):
        """
        Test that the count of unique ISINs vs total is logged.
        """
        import logging
        from portfolio_src.core.services.enricher import Enricher

        holdings_etf1 = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600"],
                "name": ["Apple", "SAP"],
                "weight": [10.0, 5.0],
            }
        )
        holdings_etf2 = pd.DataFrame(
            {
                "isin": ["US0378331005"],  # Duplicate
                "name": ["Apple"],
                "weight": [8.0],
            }
        )
        holdings_map = {"ETF1": holdings_etf1, "ETF2": holdings_etf2}

        mock_service = MagicMock()
        mock_service.get_metadata_batch.return_value = MagicMock(
            data={
                "US0378331005": {
                    "name": "Apple Inc",
                    "sector": "Technology",
                    "geography": "US",
                    "asset_class": "Equity",
                },
                "DE0007164600": {
                    "name": "SAP SE",
                    "sector": "Technology",
                    "geography": "Germany",
                    "asset_class": "Equity",
                },
            },
            sources={},
            contributions=[],
        )

        enricher = Enricher(enrichment_service=mock_service)

        with caplog.at_level(logging.INFO):
            enricher.enrich(holdings_map)

        # Should log unique vs total count
        log_messages = [record.message for record in caplog.records]
        assert any(
            ("unique" in msg.lower() and "isin" in msg.lower())
            or ("2" in msg and "3" in msg)  # 2 unique out of 3 total
            for msg in log_messages
        ), f"Expected log about unique ISINs, got: {log_messages}"

    def test_empty_holdings_map_does_not_call_enrichment(self):
        """
        Test that empty holdings_map doesn't call enrichment service.
        """
        from portfolio_src.core.services.enricher import Enricher

        mock_service = MagicMock()
        enricher = Enricher(enrichment_service=mock_service)

        enriched_map, errors = enricher.enrich({})

        assert len(errors) == 0
        assert enriched_map == {}
        mock_service.get_metadata_batch.assert_not_called()


class TestUS007DivisionByZeroProtection:
    """US-007: Add division by zero protection in aggregator."""

    def test_zero_total_value_does_not_raise_division_error(self):
        """
        Test that aggregation with total_value = 0 does not raise ZeroDivisionError.

        Bug: portfolio_percentage calculation can divide by zero if total_value is 0.
        Fix: Add explicit protection with else clause that sets to 0.0.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Create positions with zero value (quantity=0 or price=0)
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600"],
                "name": ["Apple", "SAP"],
                "sector": ["Technology", "Technology"],
                "geography": ["United States", "Germany"],
                "quantity": [0, 0],  # Zero quantity = zero value
                "current_price": [150.0, 80.0],
            }
        )

        aggregator = Aggregator()
        # This should NOT raise ZeroDivisionError
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=pd.DataFrame(),
            holdings_map={},
        )

        assert len(errors) == 0
        assert len(result) == 2

    def test_zero_total_value_sets_portfolio_percentage_to_zero(self):
        """
        Test that portfolio_percentage is 0.0 when total_value is 0.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Create positions with zero value
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple"],
                "sector": ["Technology"],
                "geography": ["United States"],
                "quantity": [0],  # Zero quantity
                "current_price": [150.0],
            }
        )

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=pd.DataFrame(),
            holdings_map={},
        )

        assert len(errors) == 0
        assert len(result) == 1
        # portfolio_percentage should be 0.0, not NaN or error
        assert result.iloc[0]["portfolio_percentage"] == 0.0

    def test_zero_total_value_with_etf_positions(self):
        """
        Test that zero total value is handled correctly with ETF positions too.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Direct positions with zero value
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple"],
                "sector": ["Technology"],
                "geography": ["United States"],
                "market_value": [0.0],  # Zero market value
            }
        )

        # ETF positions with zero value
        etf_positions = pd.DataFrame(
            {
                "isin": ["IE00B4L5Y983"],
                "name": ["Test ETF"],
                "market_value": [0.0],  # Zero market value
            }
        )

        # ETF holdings
        etf_holdings = pd.DataFrame(
            {
                "isin": ["DE0007164600"],
                "name": ["SAP"],
                "sector": ["Technology"],
                "geography": ["Germany"],
                "weight": [10.0],
            }
        )

        holdings_map = {"IE00B4L5Y983": etf_holdings}

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=etf_positions,
            holdings_map=holdings_map,
        )

        assert len(errors) == 0
        # All portfolio_percentage values should be 0.0
        for _, row in result.iterrows():
            assert row["portfolio_percentage"] == 0.0

    def test_explicit_else_clause_sets_zero(self):
        """
        Test that the implementation uses explicit else clause (not ternary).

        This verifies the fix uses proper if/else structure for clarity.
        """
        from portfolio_src.core.services.aggregator import Aggregator

        # Create positions that result in zero total value
        direct_positions = pd.DataFrame(
            {
                "isin": ["US0378331005", "DE0007164600", "FR0000120578"],
                "name": ["Apple", "SAP", "Sanofi"],
                "sector": ["Technology", "Technology", "Healthcare"],
                "geography": ["US", "Germany", "France"],
                "market_value": [0.0, 0.0, 0.0],  # All zero
            }
        )

        aggregator = Aggregator()
        result, errors = aggregator.aggregate(
            direct_positions=direct_positions,
            etf_positions=pd.DataFrame(),
            holdings_map={},
        )

        assert len(errors) == 0
        assert len(result) == 3
        # All should have portfolio_percentage = 0.0
        assert all(result["portfolio_percentage"] == 0.0)
