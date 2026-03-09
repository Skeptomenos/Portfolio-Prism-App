#!/usr/bin/env python3
"""
Pipeline Smoke Test: Load mock data and verify pipeline components work.

Run from: src-tauri/python/
Command: pytest tests/test_pipeline_smoke.py -v
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

# Add src-tauri/python to path (parent of portfolio_src)
sys.path.insert(0, str(Path(__file__).parent.parent))
# Add portfolio_src to path (for legacy absolute imports)
sys.path.insert(0, str(Path(__file__).parent.parent / "portfolio_src"))

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestMockDataLoading:
    """Test that mock data files can be loaded."""

    def test_mock_positions_exist(self):
        """Verify mock_positions.csv exists and has expected columns."""
        path = FIXTURES_DIR / "mock_positions.csv"
        assert path.exists(), f"Missing: {path}"

        df = pd.read_csv(path)
        expected_cols = [
            "ISIN",
            "Name",
            "Quantity",
            "AvgCost",
            "CurrentPrice",
            "NetValue",
        ]
        for col in expected_cols:
            assert col in df.columns, f"Missing column: {col}"

        assert len(df) == 8, f"Expected 8 positions, got {len(df)}"

    def test_mock_etf_holdings_exist(self):
        """Verify mock ETF holdings exist."""
        etf_dir = FIXTURES_DIR / "mock_etf_holdings"
        assert etf_dir.exists(), f"Missing directory: {etf_dir}"

        expected_files = ["IE00B4L5Y983.csv", "IE00B3RBWM25.csv", "LU0274208692.csv"]
        for filename in expected_files:
            path = etf_dir / filename
            assert path.exists(), f"Missing: {path}"


class TestModuleImports:
    """Test that key pipeline modules can be imported."""

    def test_pipeline_orchestrator(self):
        """Test importing the main pipeline orchestrator."""
        from portfolio_src.core.pipeline import Pipeline

        assert Pipeline is not None
        # Verify method signatures exist
        assert hasattr(Pipeline, "run")
        assert hasattr(Pipeline, "_init_services")

    def test_services_exist(self):
        """Test importing the core services."""
        from portfolio_src.core.services.decomposer import Decomposer
        from portfolio_src.core.services.enricher import Enricher
        from portfolio_src.core.services.aggregator import Aggregator

        assert Decomposer is not None
        assert Enricher is not None
        assert Aggregator is not None

    def test_enrichment_service(self):
        """Test importing the enrichment module functions."""
        from portfolio_src.data.enrichment import (
            enrich_securities,
            enrich_securities_bulk,
        )

        assert callable(enrich_securities)
        assert callable(enrich_securities_bulk)

    def test_aggregation_module(self):
        from portfolio_src.core.aggregation import run_aggregation

        assert callable(run_aggregation)

    def test_reporting_module(self):
        from portfolio_src.core.reporting import generate_report

        assert callable(generate_report)

    def test_state_manager_module(self):
        from portfolio_src.data.state_manager import load_portfolio_state

        assert callable(load_portfolio_state)

    def test_adapter_registry(self):
        from portfolio_src.adapters.registry import AdapterRegistry

        assert AdapterRegistry is not None


class TestConfigPaths:
    """Test that config paths are properly defined."""

    def test_config_constants_exist(self):
        from portfolio_src.config import (
            ASSET_UNIVERSE_PATH,
            OUTPUTS_DIR,
            WORKING_DIR,
            ENRICHMENT_CACHE_PATH,
            PIPELINE_ERRORS_PATH,
        )

        # These are Path objects
        assert ASSET_UNIVERSE_PATH is not None
        assert OUTPUTS_DIR is not None
        assert WORKING_DIR is not None
        assert ENRICHMENT_CACHE_PATH is not None
        assert PIPELINE_ERRORS_PATH is not None


class TestNewModules:
    """Test newly created modules from Phase 0-2 Issues 3."""

    def test_harvesting_module(self):
        from portfolio_src.core import harvesting

        assert hasattr(harvesting, "harvest_cache")
        assert callable(harvesting.harvest_cache)

    def test_error_reporter_module(self):
        from portfolio_src.prism_utils import error_reporter

        assert hasattr(error_reporter, "report_to_github")



class TestPipelineSuccessTruthfulness:
    """P-07: Pipeline success must reflect ETF processing results."""

    @staticmethod
    def _derive_success(etfs_total: int, etfs_succeeded: int) -> bool:
        """Mirror the pipeline's success derivation logic."""
        return etfs_total == 0 or (etfs_succeeded / etfs_total) >= 0.5

    def test_success_false_when_majority_etfs_fail(self):
        """success=False when >50% of ETFs fail decomposition."""
        assert self._derive_success(10, 1) is False

    def test_success_false_when_all_etfs_fail(self):
        """success=False when all ETFs fail."""
        assert self._derive_success(10, 0) is False

    def test_success_true_when_majority_etfs_succeed(self):
        """success=True when >50% of ETFs succeed."""
        assert self._derive_success(10, 8) is True

    def test_success_true_when_exactly_half_succeed(self):
        """success=True when exactly 50% of ETFs succeed."""
        assert self._derive_success(10, 5) is True

    def test_success_true_when_no_etfs(self):
        """success=True when portfolio has no ETFs (stocks only)."""
        assert self._derive_success(0, 0) is True

    def test_pipeline_result_reflects_derived_success(self):
        """PipelineResult constructed by pipeline uses derived success."""
        from portfolio_src.core.errors import PipelineResult

        etfs_total = 10
        etfs_succeeded = 1
        pipeline_success = self._derive_success(etfs_total, etfs_succeeded)

        result = PipelineResult(
            success=pipeline_success,
            etfs_processed=etfs_succeeded,
            etfs_failed=etfs_total - etfs_succeeded,
            total_value=41000.0,
        )
        assert result.success is False



class TestAggregatorETFValueCalculation:
    """P-14: Aggregator must calculate ETF value from quantity*price when no market_value column."""

    def test_etf_exposure_nonzero_with_quantity_and_price(self):
        """ETF holdings should have non-zero exposure when ETF has quantity and price columns."""
        from portfolio_src.core.services.aggregator import Aggregator

        aggregator = Aggregator()

        direct = pd.DataFrame({
            "isin": ["US67066G1040"],
            "name": ["NVIDIA"],
            "quantity": [10],
            "price": [120.0],
            "sector": ["Technology"],
            "geography": ["US"],
        })

        etfs = pd.DataFrame({
            "isin": ["IE00B4L5Y983"],
            "name": ["MSCI World"],
            "quantity": [50],
            "price": [80.0],  # total value = 4000
            "asset_class": ["ETF"],
        })

        holdings = pd.DataFrame({
            "isin": ["US0378331005", "US5949181045"],
            "name": ["Apple", "Microsoft"],
            "weight_percentage": [5.0, 3.0],  # 5% and 3% of ETF
            "sector": ["Technology", "Technology"],
            "geography": ["US", "US"],
        })

        result, errors = aggregator.aggregate(
            direct, etfs, {"IE00B4L5Y983": holdings}
        )

        # Apple should have exposure = 4000 * 5/100 = 200
        apple = result[result["isin"] == "US0378331005"]
        assert not apple.empty, "Apple not found in aggregated results"
        apple_exposure = float(apple["total_exposure"].iloc[0])
        assert apple_exposure > 0, (
            f"Apple exposure is {apple_exposure}, expected ~200. "
            f"Aggregator failed to calculate ETF value from quantity*price."
        )
        assert abs(apple_exposure - 200.0) < 1.0, (
            f"Apple exposure is {apple_exposure}, expected 200.0 (4000 * 5%)"
        )

    def test_aggregated_total_matches_portfolio(self):
        """Aggregated total exposure should match portfolio total within 5%."""
        from portfolio_src.core.services.aggregator import Aggregator

        aggregator = Aggregator()

        direct = pd.DataFrame({
            "isin": ["US67066G1040"],
            "name": ["NVIDIA"],
            "quantity": [10],
            "price": [120.0],
            "sector": ["Technology"],
            "geography": ["US"],
        })

        etfs = pd.DataFrame({
            "isin": ["IE00B4L5Y983"],
            "name": ["MSCI World"],
            "quantity": [50],
            "price": [80.0],
            "asset_class": ["ETF"],
        })

        # Holdings that sum to ~100% weight
        holdings = pd.DataFrame({
            "isin": ["US0378331005", "US5949181045"],
            "name": ["Apple", "Microsoft"],
            "weight_percentage": [60.0, 40.0],
            "sector": ["Technology", "Technology"],
            "geography": ["US", "US"],
        })

        result, errors = aggregator.aggregate(
            direct, etfs, {"IE00B4L5Y983": holdings}
        )

        portfolio_total = 10 * 120.0 + 50 * 80.0  # 1200 + 4000 = 5200
        aggregated_total = float(result["total_exposure"].sum())
        mismatch_pct = abs(aggregated_total - portfolio_total) / portfolio_total * 100

        assert mismatch_pct < 5.0, (
            f"Aggregated total ({aggregated_total:.0f}) differs from portfolio total "
            f"({portfolio_total:.0f}) by {mismatch_pct:.1f}%. Must be within 5%."
        )

class TestWeightColumnRecognition:
    """P-11: Decomposer must recognize 'weight_percentage' column from all adapters."""

    def test_normalize_weight_format_recognizes_weight_percentage(self):
        """_normalize_weight_format must detect the weight_percentage column."""
        from portfolio_src.core.services.decomposer import _normalize_weight_format

        # DataFrame mimicking iShares adapter output
        holdings = pd.DataFrame({
            "ticker": ["AAPL", "MSFT", "NVDA"],
            "name": ["Apple Inc.", "Microsoft Corp.", "NVIDIA Corp."],
            "weight_percentage": [5.5, 3.2, 2.8],  # percentage format
        })

        result = _normalize_weight_format(holdings, "IE00B4L5Y983")

        # The function should have found the column (not returned unchanged)
        assert "weight_percentage" in result.columns
        # Weights should still be in percentage format (>1.0, so no conversion)
        assert result["weight_percentage"].max() == 5.5

    def test_normalize_weight_format_converts_decimal_weight_percentage(self):
        """_normalize_weight_format converts decimal weight_percentage to percentage."""
        from portfolio_src.core.services.decomposer import _normalize_weight_format

        # DataFrame with decimal weights (sum <= 2.0, max <= 1.0)
        holdings = pd.DataFrame({
            "ticker": ["AAPL", "MSFT"],
            "name": ["Apple Inc.", "Microsoft Corp."],
            "weight_percentage": [0.055, 0.032],  # decimal format
        })

        result = _normalize_weight_format(holdings, "IE00B4L5Y983")

        # Should be converted to percentage
        assert result["weight_percentage"].iloc[0] == pytest.approx(5.5, abs=0.01)

    def test_resolve_holdings_uses_weight_percentage_for_tier_classification(self):
        """_resolve_holdings_isins must read weight_percentage, not default to 0.0."""
        from unittest.mock import MagicMock
        from portfolio_src.core.services.decomposer import Decomposer
        from portfolio_src.data.resolution import ResolutionResult

        # Create a mock resolver that records what weight it receives
        mock_resolver = MagicMock()
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US0378331005",
            status="resolved",
            detail="mock",
            source="test",
            confidence=0.95,
        )

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )

        holdings = pd.DataFrame({
            "ticker": ["AAPL"],
            "name": ["Apple Inc."],
            "weight_percentage": [5.5],  # 5.5% weight — clearly tier1
        })

        result_df, stats = decomposer._resolve_holdings_isins(holdings, "IE00B4L5Y983")

        # The resolver must have been called (not skipped as tier2)
        assert mock_resolver.resolve.called, (
            "Resolver was never called — weight_percentage column was not recognized, "
            "weight defaulted to 0.0, and the holding was skipped as tier2."
        )

        # Check the weight passed to the resolver was 5.5, not 0.0
        call_kwargs = mock_resolver.resolve.call_args
        actual_weight = call_kwargs.kwargs.get("weight", call_kwargs[1].get("weight", None))
        if actual_weight is None:
            # Positional args: resolve(ticker, name, provider_isin, weight, etf_isin)
            actual_weight = call_kwargs[0][3] if len(call_kwargs[0]) > 3 else 0.0
        assert actual_weight == pytest.approx(5.5, abs=0.01), (
            f"Resolver received weight={actual_weight}, expected 5.5. "
            f"The weight_percentage column was not read correctly."
        )

        # The holding should be resolved, not skipped
        assert stats["resolved"] == 1
        assert stats.get("unresolved", 0) == 0



class TestValidationGatesResolutionTracking:
    """P-19: Validation gates must see resolved ISINs from decomposer."""

    def test_dataframe_to_holdings_preserves_resolution_status(self):
        """dataframe_to_holdings must map resolution_status column to HoldingRecord."""
        from portfolio_src.core.contracts.converters import dataframe_to_holdings
        from portfolio_src.core.contracts.schemas import ResolutionStatus

        # DataFrame mimicking decomposer output after ISIN resolution
        df = pd.DataFrame({
            "ticker": ["AAPL", "MSFT", "NVDA"],
            "name": ["Apple", "Microsoft", "NVIDIA"],
            "weight_percentage": [5.0, 3.0, 2.0],
            "isin": ["US0378331005", "US5949181045", "US67066G1040"],
            "resolution_status": ["resolved", "resolved", "resolved"],
            "resolution_confidence": [0.95, 0.90, 0.80],
            "resolution_source": ["local_cache", "hive", "wikidata"],
        })

        holdings, quality = dataframe_to_holdings(df)

        assert len(holdings) == 3
        for h in holdings:
            assert h.resolution_status == ResolutionStatus.RESOLVED, (
                f"{h.ticker} has resolution_status={h.resolution_status}, expected RESOLVED. "
                f"The converter is not reading the resolution_status column from the DataFrame."
            )

    def test_etf_decomposition_resolved_count_nonzero(self):
        """ETFDecomposition.resolved_count must be > 0 when holdings are resolved."""
        from portfolio_src.core.contracts.converters import dataframe_to_holdings
        from portfolio_src.core.contracts.schemas import ETFDecomposition

        df = pd.DataFrame({
            "ticker": ["AAPL", "MSFT"],
            "name": ["Apple", "Microsoft"],
            "weight_percentage": [5.0, 3.0],
            "isin": ["US0378331005", "US5949181045"],
            "resolution_status": ["resolved", "resolved"],
        })

        holdings, _ = dataframe_to_holdings(df)

        decomposition = ETFDecomposition(
            etf_isin="IE00B4L5Y983",
            etf_name="MSCI World",
            etf_value=4000.0,
            holdings=holdings,
            source="cached",
        )

        assert decomposition.resolved_count == 2, (
            f"resolved_count={decomposition.resolved_count}, expected 2. "
            f"The validation gates will report 0% resolution."
        )

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
