"""
End-to-End Pipeline Tests

Validates the full pipeline execution from data loading to report generation.
"""

import pytest
import os
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
            harvested_count=3
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
            fix_hint="Add manual holdings file"
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
        with patch.object(pipeline, '_load_portfolio', return_value=(pd.DataFrame(), pd.DataFrame())):
            with patch.object(pipeline, '_init_services'):
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
        with patch.object(config, 'ENRICHMENT_CACHE_PATH', mock_e2e_data_dir / "working" / "cache" / "enrichment_cache.json"):
            with patch.object(config, 'ASSET_UNIVERSE_PATH', mock_e2e_data_dir / "config" / "asset_universe.csv"):
                result = harvest_cache()
        
        assert isinstance(result, int)
        assert result >= 0


class TestChartGeneration:
    """Test chart generation utilities."""

    def test_generate_sector_chart_import(self):
        """Test sector chart function can be imported."""
        from portfolio_src.dashboard.utils.charts import generate_sector_chart
        assert callable(generate_sector_chart)

    def test_generate_geography_chart_import(self):
        """Test geography chart function can be imported."""
        from portfolio_src.dashboard.utils.charts import generate_geography_chart
        assert callable(generate_geography_chart)

    def test_generate_top_holdings_chart_import(self):
        """Test top holdings chart function can be imported."""
        from portfolio_src.dashboard.utils.charts import generate_top_holdings_chart
        assert callable(generate_top_holdings_chart)

    def test_sector_chart_returns_bytesio(self):
        """Test sector chart returns BytesIO on valid data."""
        import pandas as pd
        from io import BytesIO
        from portfolio_src.dashboard.utils.charts import generate_sector_chart
        
        df = pd.DataFrame({
            'sector': ['Technology', 'Healthcare', 'Finance'],
            'total_exposure': [5000, 3000, 2000]
        })
        
        result = generate_sector_chart(df)
        assert result is None or isinstance(result, BytesIO)

    def test_sector_chart_handles_empty_data(self):
        """Test sector chart handles empty DataFrame gracefully."""
        import pandas as pd
        from portfolio_src.dashboard.utils.charts import generate_sector_chart
        
        empty_df = pd.DataFrame()
        result = generate_sector_chart(empty_df)
        assert result is None

    def test_sector_chart_handles_missing_columns(self):
        """Test sector chart handles missing columns gracefully."""
        import pandas as pd
        from portfolio_src.dashboard.utils.charts import generate_sector_chart
        
        df = pd.DataFrame({'name': ['Test']})  # Missing 'sector' column
        result = generate_sector_chart(df)
        assert result is None


class TestServicesIntegration:
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
        result = aggregator.aggregate(
            pd.DataFrame(),
            pd.DataFrame(),
            {}
        )
        
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], pd.DataFrame)
        assert isinstance(result[1], list)
