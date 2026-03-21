#!/usr/bin/env python3
"""
Integration tests for the full Analytics Pipeline.
Run with: pytest tests/test_pipeline_integration.py -v
"""

import sys
import json
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

# Add paths for package resolution
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "portfolio_src"))

from portfolio_src.core.pipeline import Pipeline
from portfolio_src.core.errors import ErrorPhase, ErrorType


class TestPipelineIntegration:
    """Integration tests for full pipeline execution."""

    @pytest.fixture
    def mock_portfolio_data(self):
        """Create mock portfolio DataFrames."""
        direct = pd.DataFrame([
            {"ISIN": "Direct1", "Name": "Stock A", "NetValue": 1000.0, "sector": "Tech"}
        ])
        etf = pd.DataFrame([
            {"ISIN": "IE00B4L5Y983", "Name": "World ETF", "NetValue": 5000.0}
        ])
        return direct, etf

    @pytest.fixture
    def mock_holdings_data(self):
        return pd.DataFrame([
            {"ISIN": "Sub1", "Name": "Sub Stock 1", "Weight": 60.0, "sector": "Energy"},
            {"ISIN": "Sub2", "Name": "Sub Stock 2", "Weight": 40.0, "sector": "Tech"},
        ])

    @patch("portfolio_src.core.pipeline.Pipeline._load_portfolio")
    @patch("portfolio_src.core.pipeline.Pipeline._write_reports")
    @patch("portfolio_src.core.pipeline.Pipeline._write_errors")
    def test_full_pipeline_success(
        self, 
        mock_write_errors, 
        mock_write_reports, 
        mock_load, 
        mock_portfolio_data,
        mock_holdings_data
    ):
        """Test happy path execution of the entire pipeline."""
        direct, etf = mock_portfolio_data
        mock_load.return_value = (direct, etf)

        # Mock dependencies inside _init_services
        with patch("portfolio_src.data.holdings_cache.get_holdings_cache") as mock_cache_factory, \
             patch("portfolio_src.adapters.registry.AdapterRegistry") as mock_registry_cls, \
             patch("portfolio_src.data.enrichment.EnrichmentService") as mock_enrich_cls, \
             patch("portfolio_src.core.pipeline.calculate_portfolio_total_value") as mock_calc:
             
            # Setup mocks
            mock_cache = MagicMock()
            mock_cache.get.return_value = None # Cache miss
            mock_cache_factory.return_value = mock_cache
            
            mock_adapter = MagicMock()
            mock_adapter.fetch_holdings.return_value = mock_holdings_data
            
            mock_registry = mock_registry_cls.return_value
            # Return adapter only for our ETF ISIN
            mock_registry.get_adapter.side_effect = lambda isin: mock_adapter if isin == "IE00B4L5Y983" else None
            
            mock_enrich = mock_enrich_cls.return_value
            mock_enrich.get_metadata_batch.return_value = {}  # No extra metadata
            
            mock_calc.return_value = 6000.0

            # Run Pipeline
            pipeline = Pipeline()
            result = pipeline.run()

            # Verification
            assert result.success is True
            assert result.etfs_processed == 1
            assert result.etfs_failed == 0
            assert result.total_value == 6000.0
            assert len(result.errors) == 0

            # Check if report was generated
            assert mock_write_reports.called
            args, _ = mock_write_reports.call_args
            exposure_df = args[0]
            
            # 1 Direct + 2 ETF holdings = 3 rows in aggregated view? 
            # Aggregator groups by ISIN. 
            # Direct1 (Tech), Sub1 (Energy), Sub2 (Tech).
            # If Sub2 is same ISIN as Direct1? Assume different here.
            assert not exposure_df.empty
            assert exposure_df["total_exposure"].sum() == 6000.0

    @patch("portfolio_src.core.pipeline.Pipeline._load_portfolio")
    def test_pipeline_no_data(self, mock_load):
        """Test pipeline handles empty portfolio gracefully."""
        mock_load.return_value = (pd.DataFrame(), pd.DataFrame())
        
        with patch("portfolio_src.core.pipeline.Pipeline._write_errors") as mock_write_errors:
            pipeline = Pipeline()
            result = pipeline.run()
            
            assert result.success is False
            assert len(result.errors) == 1
            assert result.errors[0].phase == ErrorPhase.DATA_LOADING
            assert result.errors[0].error_type == ErrorType.FILE_NOT_FOUND
