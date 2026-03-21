"""Integration tests for ValidationGates in Pipeline."""

import pandas as pd
import pytest
from unittest.mock import MagicMock, patch

from portfolio_src.core.contracts import ValidationGates
from portfolio_src.core.pipeline import Pipeline


class TestPipelineValidationIntegration:
    """Tests for ValidationGates integration with Pipeline."""

    def test_gates_initialized_on_run(self):
        """Verify _validation_gates is not None after initialization."""
        pipeline = Pipeline()

        pipeline._validation_gates = ValidationGates()

        assert pipeline._validation_gates is not None
        assert isinstance(pipeline._validation_gates, ValidationGates)

    def test_quality_in_health_report(self):
        """Verify gates.get_summary() returns expected structure."""
        gates = ValidationGates()
        summary = gates.get_summary()

        assert "quality_score" in summary
        assert "is_trustworthy" in summary
        assert "issues" in summary
        assert isinstance(summary["quality_score"], float)
        assert isinstance(summary["is_trustworthy"], bool)
        assert isinstance(summary["issues"], list)

    def test_build_load_phase_output(self):
        """Test _build_load_phase_output helper method."""
        pipeline = Pipeline()
        pipeline._validation_gates = ValidationGates()

        direct_df = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple Inc"],
                "quantity": [10],
                "price": [150.0],
            }
        )
        etf_df = pd.DataFrame()

        result = pipeline._build_load_phase_output(direct_df, etf_df)

        assert hasattr(result, "direct_positions")
        assert hasattr(result, "etf_positions")

    def test_build_aggregate_phase_output(self):
        """Test _build_aggregate_phase_output helper method."""
        pipeline = Pipeline()
        pipeline._validation_gates = ValidationGates()

        exposure_df = pd.DataFrame(
            {
                "isin": ["US0378331005"],
                "name": ["Apple Inc"],
                "sector": ["Technology"],
                "geography": ["United States"],
                "total_exposure": [1500.0],
                "portfolio_percentage": [10.0],
            }
        )

        result = pipeline._build_aggregate_phase_output(exposure_df)

        assert hasattr(result, "exposures")
        assert hasattr(result, "total_portfolio_value")
        assert len(result.exposures) == 1
        assert result.total_portfolio_value == 1500.0
