"""Tests for Validation Functions - Validates issue detection at phase boundaries."""

from __future__ import annotations

import pytest

from portfolio_src.core.contracts import (
    AssetClass,
    IssueSeverity,
    ResolutionStatus,
)
from portfolio_src.core.contracts.validation import (
    validate_aggregation_totals,
    validate_enrichment_coverage,
    validate_holdings_weights,
    validate_loaded_positions,
    validate_percentage_sum,
    validate_resolution_rate,
)
from tests.contracts.factories import (
    make_aggregated_exposure,
    make_decompose_phase_output,
    make_etf_decomposition,
    make_holding_record,
    make_loaded_position,
)


class TestValidateLoadedPositions:
    def test_empty_list(self) -> None:
        issues = validate_loaded_positions([])
        assert len(issues) == 1
        assert issues[0].code == "NO_POSITIONS"
        assert issues[0].severity == IssueSeverity.HIGH

    def test_valid_positions(self) -> None:
        positions = [make_loaded_position(), make_loaded_position(isin="US5949181045")]
        issues = validate_loaded_positions(positions)
        assert len(issues) == 0

    def test_zero_value_positions(self) -> None:
        positions = [
            make_loaded_position(current_price=None, cost_basis=None),
            make_loaded_position(),
        ]
        issues = validate_loaded_positions(positions)
        assert any(i.code == "ZERO_VALUE_POSITIONS" for i in issues)

    def test_unknown_asset_class(self) -> None:
        positions = [make_loaded_position(asset_class=AssetClass.UNKNOWN)]
        issues = validate_loaded_positions(positions)
        assert any(i.code == "UNKNOWN_ASSET_CLASS" for i in issues)

    def test_non_eur_currency(self) -> None:
        positions = [make_loaded_position(currency="USD")]
        issues = validate_loaded_positions(positions)
        assert any(i.code == "NON_EUR_CURRENCY" for i in issues)
        assert any(i.severity == IssueSeverity.HIGH for i in issues)

    def test_multiple_issues(self) -> None:
        positions = [
            make_loaded_position(
                current_price=None,
                cost_basis=None,
                asset_class=AssetClass.UNKNOWN,
                currency="USD",
            )
        ]
        issues = validate_loaded_positions(positions)
        codes = [i.code for i in issues]
        assert "ZERO_VALUE_POSITIONS" in codes
        assert "UNKNOWN_ASSET_CLASS" in codes
        assert "NON_EUR_CURRENCY" in codes


class TestValidateHoldingsWeights:
    def test_valid_weights(self) -> None:
        decomp = make_etf_decomposition(holdings_count=4, weight_sum=100.0)
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 0

    def test_no_holdings(self) -> None:
        decomp = make_etf_decomposition(holdings_count=0)
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 1
        assert issues[0].code == "NO_HOLDINGS"

    def test_decimal_format_detected(self) -> None:
        holdings = [make_holding_record(weight_percentage=0.25) for _ in range(4)]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert any(i.code == "WEIGHT_DECIMAL_FORMAT" for i in issues)
        assert any(i.severity == IssueSeverity.CRITICAL for i in issues)

    def test_very_low_sum(self) -> None:
        holdings = [make_holding_record(weight_percentage=10.0) for _ in range(3)]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert any(i.code == "WEIGHT_SUM_VERY_LOW" for i in issues)

    def test_low_sum(self) -> None:
        holdings = [make_holding_record(weight_percentage=20.0) for _ in range(4)]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert any(i.code == "WEIGHT_SUM_LOW" for i in issues)

    def test_high_sum(self) -> None:
        holdings = [make_holding_record(weight_percentage=30.0) for _ in range(4)]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert any(i.code == "WEIGHT_SUM_HIGH" for i in issues)

    def test_zero_weight_holding_valid(self) -> None:
        holdings = [
            make_holding_record(weight_percentage=60.0),
            make_holding_record(weight_percentage=40.0),
            HoldingRecord(name="Zero Weight", weight_percentage=0.0, ticker="ZERO"),
        ]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 0

    def test_boundary_90(self) -> None:
        holdings = [make_holding_record(weight_percentage=22.5) for _ in range(4)]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 0

    def test_boundary_110(self) -> None:
        holdings = [make_holding_record(weight_percentage=27.5) for _ in range(4)]
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 0


class TestValidateResolutionRate:
    def test_high_resolution(self) -> None:
        holdings = [
            make_holding_record(resolution_status=ResolutionStatus.RESOLVED)
            for _ in range(9)
        ]
        holdings.append(
            make_holding_record(resolution_status=ResolutionStatus.UNRESOLVED)
        )
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_resolution_rate(decomp)
        assert len(issues) == 0

    def test_low_resolution(self) -> None:
        holdings = [
            make_holding_record(resolution_status=ResolutionStatus.RESOLVED)
            for _ in range(2)
        ]
        holdings.extend(
            [
                make_holding_record(resolution_status=ResolutionStatus.UNRESOLVED)
                for _ in range(8)
            ]
        )
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_resolution_rate(decomp)
        assert any(i.code == "LOW_RESOLUTION_RATE" for i in issues)

    def test_moderate_resolution(self) -> None:
        holdings = [
            make_holding_record(resolution_status=ResolutionStatus.RESOLVED)
            for _ in range(7)
        ]
        holdings.extend(
            [
                make_holding_record(resolution_status=ResolutionStatus.UNRESOLVED)
                for _ in range(3)
            ]
        )
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_resolution_rate(decomp)
        assert any(i.code == "MODERATE_RESOLUTION_RATE" for i in issues)

    def test_custom_min_rate(self) -> None:
        holdings = [
            make_holding_record(resolution_status=ResolutionStatus.RESOLVED)
            for _ in range(9)
        ]
        holdings.append(
            make_holding_record(resolution_status=ResolutionStatus.UNRESOLVED)
        )
        decomp = make_etf_decomposition(holdings=holdings)
        issues = validate_resolution_rate(decomp, min_rate=0.95)
        assert any(i.code == "MODERATE_RESOLUTION_RATE" for i in issues)


class TestValidateEnrichmentCoverage:
    def test_good_coverage(self) -> None:
        from portfolio_src.core.contracts import EnrichedHolding

        holdings = [
            EnrichedHolding(
                name=f"H{i}",
                sector="Technology",
                geography="United States",
            )
            for i in range(10)
        ]
        issues = validate_enrichment_coverage(holdings, "IE00B4L5Y983")
        assert len(issues) == 0

    def test_low_sector_coverage(self) -> None:
        from portfolio_src.core.contracts import EnrichedHolding

        holdings = [
            EnrichedHolding(
                name=f"H{i}",
                sector="Unknown" if i < 6 else "Technology",
                geography="United States",
            )
            for i in range(10)
        ]
        issues = validate_enrichment_coverage(holdings, "IE00B4L5Y983")
        assert any(i.code == "LOW_SECTOR_COVERAGE" for i in issues)

    def test_low_geography_coverage(self) -> None:
        from portfolio_src.core.contracts import EnrichedHolding

        holdings = [
            EnrichedHolding(
                name=f"H{i}",
                sector="Technology",
                geography="Unknown" if i < 6 else "United States",
            )
            for i in range(10)
        ]
        issues = validate_enrichment_coverage(holdings, "IE00B4L5Y983")
        assert any(i.code == "LOW_GEOGRAPHY_COVERAGE" for i in issues)

    def test_empty_holdings(self) -> None:
        issues = validate_enrichment_coverage([], "IE00B4L5Y983")
        assert len(issues) == 0


class TestValidateAggregationTotals:
    def test_matching_totals(self) -> None:
        issues = validate_aggregation_totals(10000.0, 10000.0)
        assert len(issues) == 0

    def test_zero_expected(self) -> None:
        issues = validate_aggregation_totals(10000.0, 0.0)
        assert any(i.code == "ZERO_PORTFOLIO_VALUE" for i in issues)
        assert any(i.severity == IssueSeverity.CRITICAL for i in issues)

    def test_large_mismatch(self) -> None:
        issues = validate_aggregation_totals(5000.0, 10000.0)
        assert any(i.code == "TOTAL_MISMATCH_LARGE" for i in issues)
        assert any(i.severity == IssueSeverity.CRITICAL for i in issues)

    def test_small_mismatch(self) -> None:
        issues = validate_aggregation_totals(9500.0, 10000.0)
        assert any(i.code == "TOTAL_MISMATCH" for i in issues)
        assert any(i.severity == IssueSeverity.HIGH for i in issues)

    def test_custom_tolerance(self) -> None:
        issues = validate_aggregation_totals(9900.0, 10000.0, tolerance=0.02)
        assert len(issues) == 0


class TestValidatePercentageSum:
    def test_valid_sum(self) -> None:
        exposures = [
            make_aggregated_exposure(portfolio_percentage=50.0),
            make_aggregated_exposure(portfolio_percentage=50.0),
        ]
        issues = validate_percentage_sum(exposures)
        assert len(issues) == 0

    def test_low_sum(self) -> None:
        exposures = [
            make_aggregated_exposure(portfolio_percentage=40.0),
            make_aggregated_exposure(portfolio_percentage=40.0),
        ]
        issues = validate_percentage_sum(exposures)
        assert any(i.code == "PERCENTAGE_SUM_LOW" for i in issues)

    def test_high_sum(self) -> None:
        exposures = [
            make_aggregated_exposure(portfolio_percentage=60.0),
            make_aggregated_exposure(portfolio_percentage=60.0),
        ]
        issues = validate_percentage_sum(exposures)
        assert any(i.code == "PERCENTAGE_SUM_HIGH" for i in issues)

    def test_empty_exposures(self) -> None:
        issues = validate_percentage_sum([])
        assert len(issues) == 0


from portfolio_src.core.contracts import HoldingRecord


class TestValidateDecomposePhaseOutput:
    def test_validates_all_decompositions(self) -> None:
        from portfolio_src.core.contracts.validation import (
            validate_decompose_phase_output,
        )

        output = make_decompose_phase_output(etf_count=2, holdings_per_etf=5)
        issues = validate_decompose_phase_output(output)
        assert isinstance(issues, list)


class TestValidateEnrichPhaseOutput:
    def test_validates_enriched_decompositions(self) -> None:
        from portfolio_src.core.contracts import EnrichPhaseOutput
        from portfolio_src.core.contracts.validation import validate_enrich_phase_output

        output = EnrichPhaseOutput(
            enriched_decompositions=[make_etf_decomposition()],
            enriched_direct=[],
            total_enriched=3,
        )
        issues = validate_enrich_phase_output(output)
        assert isinstance(issues, list)


class TestValidateAggregatePhaseOutput:
    def test_validates_complete_output(self) -> None:
        from portfolio_src.core.contracts import AggregatePhaseOutput
        from portfolio_src.core.contracts.validation import (
            validate_aggregate_phase_output,
        )

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
        issues = validate_aggregate_phase_output(output, expected_total=10000.0)
        assert isinstance(issues, list)
