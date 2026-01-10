"""Tests for Validation Gates - Validates gate orchestration and quality accumulation."""

from __future__ import annotations

from portfolio_src.core.contracts import (
    AggregatePhaseOutput,
    DataQuality,
    DecomposePhaseOutput,
    EnrichPhaseOutput,
    GateResult,
    LoadPhaseOutput,
    ValidationGates,
)
from tests.contracts.factories import (
    make_aggregated_exposure,
    make_decompose_phase_output,
    make_etf_decomposition,
    make_load_phase_output,
    make_loaded_position,
)


class TestGateResult:
    def test_passed_true(self) -> None:
        result = GateResult(passed=True, quality=DataQuality(), data=None)
        assert result.passed is True

    def test_passed_false(self) -> None:
        result = GateResult(passed=False, quality=DataQuality(), data=None)
        assert result.passed is False

    def test_data_passthrough(self) -> None:
        data = {"key": "value"}
        result = GateResult(passed=True, quality=DataQuality(), data=data)
        assert result.data == data


class TestValidationGates:
    def test_initial_state(self) -> None:
        gates = ValidationGates()
        q = gates.get_pipeline_quality()
        assert q.score == 1.0
        assert len(q.issues) == 0

    def test_validate_load_output_valid(self) -> None:
        gates = ValidationGates()
        output = make_load_phase_output(direct_count=2, etf_count=1)
        result = gates.validate_load_output(output)
        assert result.passed is True
        assert result.data == output

    def test_validate_load_output_with_issues(self) -> None:
        gates = ValidationGates()
        output = LoadPhaseOutput(direct_positions=[], etf_positions=[])
        result = gates.validate_load_output(output)
        assert len(result.quality.issues) > 0

    def test_validate_decompose_output(self) -> None:
        gates = ValidationGates()
        output = make_decompose_phase_output(etf_count=2, holdings_per_etf=5)
        result = gates.validate_decompose_output(output)
        assert result.data == output

    def test_validate_enrich_output(self) -> None:
        gates = ValidationGates()
        output = EnrichPhaseOutput(
            enriched_decompositions=[make_etf_decomposition()],
            enriched_direct=[make_loaded_position()],
            total_enriched=10,
        )
        result = gates.validate_enrich_output(output)
        assert result.data == output

    def test_validate_aggregate_output(self) -> None:
        gates = ValidationGates()
        exposures = [
            make_aggregated_exposure(portfolio_percentage=50.0, total_exposure=5000.0),
            make_aggregated_exposure(
                isin="US5949181045",
                portfolio_percentage=50.0,
                total_exposure=5000.0,
            ),
        ]
        output = AggregatePhaseOutput(
            exposures=exposures,
            total_portfolio_value=10000.0,
        )
        result = gates.validate_aggregate_output(output, expected_total=10000.0)
        assert result.data == output

    def test_pipeline_quality_accumulates(self) -> None:
        gates = ValidationGates()
        load_output = LoadPhaseOutput(direct_positions=[], etf_positions=[])
        gates.validate_load_output(load_output)
        decompose_output = DecomposePhaseOutput(decompositions=[])
        gates.validate_decompose_output(decompose_output)
        q = gates.get_pipeline_quality()
        assert len(q.issues) >= 1

    def test_get_summary_format(self) -> None:
        gates = ValidationGates()
        output = make_load_phase_output()
        gates.validate_load_output(output)
        summary = gates.get_summary()
        assert "quality_score" in summary
        assert "is_trustworthy" in summary
        assert "total_issues" in summary
        assert "by_severity" in summary
        assert "by_category" in summary
        assert "issues" in summary

    def test_reset(self) -> None:
        gates = ValidationGates()
        output = LoadPhaseOutput(direct_positions=[], etf_positions=[])
        gates.validate_load_output(output)
        assert len(gates.get_pipeline_quality().issues) > 0
        gates.reset()
        q = gates.get_pipeline_quality()
        assert q.score == 1.0
        assert len(q.issues) == 0
