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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
