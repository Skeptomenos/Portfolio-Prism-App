"""
End-to-End Pipeline Tests

Validates the full pipeline execution from data loading to report generation.
"""

import pytest
import os
import pandas as pd
from pathlib import Path
from unittest.mock import patch, MagicMock

# Import test fixtures
from tests.fixtures.e2e_mock_data import (
    mock_e2e_data_dir,
    create_mock_positions,
    create_mock_enrichment_cache,
    create_mock_etf_holdings,
    create_mock_asset_universe,
    setup_full_mock_environment,
)


class TestPipelineE2E:
    """End-to-end pipeline tests."""

    def test_pipeline_instantiation(self):
        """Test that Pipeline can be instantiated."""
        from portfolio_src.core.pipeline import Pipeline

        pipeline = Pipeline()
        assert pipeline is not None
        assert pipeline.data_dir is not None

    def test_pipeline_result_structure(self):
        """Test PipelineResult has expected attributes."""
        from portfolio_src.core.errors import PipelineResult

        result = PipelineResult(
            success=True,
            etfs_processed=5,
            etfs_failed=1,
            total_value=10000.0,
            errors=[],
            warnings=[],
            harvested_count=3,
        )

        assert result.success is True
        assert result.etfs_processed == 5
        assert result.etfs_failed == 1
        assert result.total_value == 10000.0
        assert result.harvested_count == 3
        assert result.has_errors is False

    def test_pipeline_error_structure(self):
        """Test PipelineError has expected methods."""
        from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType

        error = PipelineError(
            phase=ErrorPhase.ETF_DECOMPOSITION,
            error_type=ErrorType.NO_ADAPTER,
            item="IE00B4L5Y983",
            message="No adapter found for iShares ETF",
            fix_hint="Add manual holdings file",
        )

        assert error.phase == ErrorPhase.ETF_DECOMPOSITION
        assert error.item == "IE00B4L5Y983"

        # Test serialization
        error_dict = error.to_dict()
        assert "phase" in error_dict
        assert "message" in error_dict

        # Test anonymization
        anon = error.anonymize()
        assert "item" in anon
        assert anon["item"] == "IE00B4L5Y983"


class TestProgressCallback:
    """Test progress callback functionality."""

    def test_progress_callback_is_called(self):
        """Test that progress_callback is invoked during pipeline run."""
        from portfolio_src.core.pipeline import Pipeline

        progress_calls = []

        def mock_callback(msg: str, pct: float):
            progress_calls.append((msg, pct))

        pipeline = Pipeline()

        # Mock _load_portfolio to return empty data (avoids real file access)
        import pandas as pd

        with patch.object(
            pipeline, "_load_portfolio", return_value=(pd.DataFrame(), pd.DataFrame())
        ):
            with patch.object(pipeline, "_init_services"):
                result = pipeline.run(progress_callback=mock_callback)

        # Should have at least called progress_callback once
        assert len(progress_calls) > 0
        # First call should be initialization
        assert any("Initializing" in msg for msg, _ in progress_calls)


class TestHarvesting:
    """Test harvesting functionality."""

    def test_harvest_cache_function_exists(self):
        """Test harvest_cache function can be imported."""
        from portfolio_src.core.harvesting import harvest_cache

        assert callable(harvest_cache)

    def test_load_universe_isins_function_exists(self):
        """Test load_universe_isins function can be imported."""
        from portfolio_src.core.harvesting import load_universe_isins

        assert callable(load_universe_isins)

    def test_harvest_returns_int(self, mock_e2e_data_dir):
        """Test harvest_cache returns an integer count."""
        from portfolio_src.core.harvesting import harvest_cache
        from portfolio_src import config

        # Patch config paths to use mock directory
        with patch.object(
            config,
            "ENRICHMENT_CACHE_PATH",
            mock_e2e_data_dir / "working" / "cache" / "enrichment_cache.json",
        ):
            with patch.object(
                config,
                "ASSET_UNIVERSE_PATH",
                mock_e2e_data_dir / "config" / "asset_universe.csv",
            ):
                result = harvest_cache()

        assert isinstance(result, int)
        assert result >= 0

    def test_full_pipeline_execution(self, tmp_path):
        """Verify full pipeline execution with mock data."""
        from portfolio_src.core.pipeline import Pipeline
        from portfolio_src import config

        # Setup temporary data directory
        data_dir = tmp_path / "data"
        config_dir = data_dir / "config"
        working_dir = data_dir / "working"
        outputs_dir = data_dir / "outputs"

        for d in [config_dir, working_dir, outputs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # Copy mock portfolio to temp dir
        mock_portfolio_src = Path(__file__).parent / "fixtures" / "mock_portfolio.csv"
        mock_portfolio_dest = working_dir / "calculated_holdings.csv"
        import shutil

        shutil.copy(mock_portfolio_src, mock_portfolio_dest)

        (config_dir / "asset_universe.csv").write_text("ISIN,Name,Asset_Class\n")
        (config_dir / "adapter_registry.json").write_text("{}")

        # Mock external dependencies
        with (
            patch("portfolio_src.core.pipeline.DATA_DIR", data_dir),
            patch(
                "portfolio_src.core.pipeline.TRUE_EXPOSURE_REPORT",
                outputs_dir / "true_exposure_report.csv",
            ),
            patch(
                "portfolio_src.core.pipeline.PIPELINE_HEALTH_PATH",
                outputs_dir / "pipeline_health.json",
            ),
            patch(
                "portfolio_src.core.pipeline.PIPELINE_ERRORS_PATH",
                outputs_dir / "pipeline_errors.json",
            ),
            patch("portfolio_src.config.DATA_DIR", data_dir),
            patch("portfolio_src.config.CONFIG_DIR", config_dir),
            patch("portfolio_src.config.WORKING_DIR", working_dir),
            patch("portfolio_src.config.OUTPUTS_DIR", outputs_dir),
            patch(
                "portfolio_src.data.state_manager.UNIVERSE_PATH",
                config_dir / "asset_universe.csv",
            ),
            patch(
                "portfolio_src.data.state_manager.HOLDINGS_PATH", mock_portfolio_dest
            ),
            patch("portfolio_src.data.hive_client.get_hive_client") as mock_get_hive,
            patch("portfolio_src.data.enrichment.requests.Session.get") as mock_get,
            patch("portfolio_src.data.market.yf.download") as mock_yf_dl,
            patch("portfolio_src.data.database.get_positions") as mock_get_pos,
        ):
            mock_get_pos.return_value = [
                {
                    "isin": "US0378331005",
                    "name": "Apple Inc.",
                    "quantity": 10,
                    "cost_basis": 150.0,
                    "current_price": 170.0,
                    "asset_class": "Stock",
                },
                {
                    "isin": "IE00B4L5Y983",
                    "name": "World ETF",
                    "quantity": 5,
                    "cost_basis": 70.0,
                    "current_price": 80.0,
                    "asset_class": "ETF",
                },
            ]
            hive_client = mock_get_hive.return_value
            hive_client.is_configured = False
            hive_client.batch_lookup.return_value = {}

            mock_yf_dl.return_value = pd.DataFrame()

            # Run Pipeline
            pipeline = Pipeline(data_dir=data_dir)
            result = pipeline.run()

            # Verification
            assert result.success is True
            assert (outputs_dir / "true_exposure_report.csv").exists()
            assert (outputs_dir / "pipeline_health.json").exists()

            # Verify health report content
            import json

            with open(outputs_dir / "pipeline_health.json", "r") as f:
                health = json.load(f)
                assert "metrics" in health
                assert health["metrics"]["etf_positions"] > 0

    """Test service components integration."""

    def test_decomposer_import(self):
        """Test Decomposer can be imported."""
        from portfolio_src.core.services.decomposer import Decomposer

        assert Decomposer is not None

    def test_enricher_import(self):
        """Test Enricher can be imported."""
        from portfolio_src.core.services.enricher import Enricher

        assert Enricher is not None

    def test_aggregator_import(self):
        """Test Aggregator can be imported."""
        from portfolio_src.core.services.aggregator import Aggregator

        assert Aggregator is not None

    def test_aggregator_returns_tuple(self):
        """Test Aggregator.aggregate returns (DataFrame, List)."""
        import pandas as pd
        from portfolio_src.core.services.aggregator import Aggregator

        aggregator = Aggregator()
        result = aggregator.aggregate(pd.DataFrame(), pd.DataFrame(), {})

        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], pd.DataFrame)
        assert isinstance(result[1], list)
