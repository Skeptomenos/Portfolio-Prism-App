"""Integration Smoke Test - Verifies contracts work with real DataFrame data through the full pipeline."""

from __future__ import annotations

import pandas as pd

from portfolio_src.core.contracts import (
    AggregatePhaseOutput,
    DataQuality,
    DecomposePhaseOutput,
    EnrichPhaseOutput,
    ETFDecomposition,
    GateResult,
    HoldingRecord,
    LoadedPosition,
    LoadPhaseOutput,
    ResolutionStatus,
    ValidationGates,
)
from portfolio_src.core.contracts.converters import (
    dataframe_to_loaded_positions,
    loaded_positions_to_dataframe,
)
from tests.contracts.factories import make_aggregated_exposure


class TestSmokeIntegration:
    def test_full_pipeline_flow(self) -> None:
        df = pd.DataFrame(
            {
                "isin": ["US0378331005", "IE00B4L5Y983", "US5949181045"],
                "name": ["Apple Inc", "iShares MSCI World", "Microsoft Corp"],
                "quantity": [10.0, 50.0, 5.0],
                "current_price": [150.0, 80.0, 300.0],
                "asset_type": ["Stock", "ETF", "Stock"],
            }
        )

        positions, quality = dataframe_to_loaded_positions(df)
        assert len(positions) == 3
        assert quality.score == 1.0

        direct = [p for p in positions if p.asset_class.value != "ETF"]
        etfs = [p for p in positions if p.asset_class.value == "ETF"]
        load_output = LoadPhaseOutput(direct_positions=direct, etf_positions=etfs)
        assert load_output.total_positions == 3
        assert load_output.total_value > 0

        gates = ValidationGates()
        load_result = gates.validate_load_output(load_output)
        assert isinstance(load_result, GateResult)
        assert load_result.passed is True

        holdings = [
            HoldingRecord(
                name=f"Holding {i}",
                ticker=f"H{i}",
                weight_percentage=20.0,
                resolution_status=ResolutionStatus.RESOLVED
                if i < 4
                else ResolutionStatus.UNRESOLVED,
            )
            for i in range(5)
        ]
        decomposition = ETFDecomposition(
            etf_isin="IE00B4L5Y983",
            etf_name="iShares MSCI World",
            etf_value=4000.0,
            holdings=holdings,
            source="test",
        )
        decompose_output = DecomposePhaseOutput(decompositions=[decomposition])
        decompose_result = gates.validate_decompose_output(decompose_output)
        assert isinstance(decompose_result, GateResult)

        enrich_output = EnrichPhaseOutput(
            enriched_decompositions=[decomposition],
            enriched_direct=direct,
            total_enriched=len(holdings) + len(direct),
        )
        enrich_result = gates.validate_enrich_output(enrich_output)
        assert isinstance(enrich_result, GateResult)

        exposures = [
            make_aggregated_exposure(
                isin="US0378331005",
                name="Apple Inc",
                total_exposure=1500.0,
                portfolio_percentage=25.0,
            ),
            make_aggregated_exposure(
                isin="US5949181045",
                name="Microsoft Corp",
                total_exposure=1500.0,
                portfolio_percentage=25.0,
            ),
            make_aggregated_exposure(
                isin="UNRESOLVED:H4",
                name="Holding 4",
                total_exposure=800.0,
                portfolio_percentage=13.3,
            ),
        ]
        aggregate_output = AggregatePhaseOutput(
            exposures=exposures,
            total_portfolio_value=6000.0,
        )
        aggregate_result = gates.validate_aggregate_output(
            aggregate_output, expected_total=6000.0
        )
        assert isinstance(aggregate_result, GateResult)

        summary = gates.get_summary()
        assert "quality_score" in summary
        assert "is_trustworthy" in summary
        assert "total_issues" in summary
        assert "by_severity" in summary
        assert "by_category" in summary
        assert "issues" in summary

        pipeline_quality = gates.get_pipeline_quality()
        assert isinstance(pipeline_quality, DataQuality)

        result_df = loaded_positions_to_dataframe(positions)
        assert len(result_df) == 3
        assert "market_value" in result_df.columns

        print("Smoke test passed!")
