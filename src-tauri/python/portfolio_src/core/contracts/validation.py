"""Validation Functions - Check data at phase boundaries and return issues without raising exceptions."""

from __future__ import annotations

from typing import List, Sequence, Union

from .quality import IssueCategory, IssueSeverity, ValidationIssue
from .schemas import (
    AggregatedExposureRecord,
    AggregatePhaseOutput,
    AssetClass,
    DecomposePhaseOutput,
    EnrichedHolding,
    EnrichPhaseOutput,
    ETFDecomposition,
    HoldingRecord,
    LoadedPosition,
    LoadPhaseOutput,
    ResolutionStatus,
)


def validate_loaded_positions(
    positions: List[LoadedPosition],
    phase: str = "DATA_LOADING",
) -> List[ValidationIssue]:
    """Validate a list of loaded positions."""
    issues: List[ValidationIssue] = []

    if not positions:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.SCHEMA,
                code="NO_POSITIONS",
                message="No positions found in portfolio",
                fix_hint="Ensure portfolio data is loaded correctly from the database",
                item="portfolio",
                phase=phase,
            )
        )
        return issues

    zero_value_count = 0
    unknown_asset_count = 0
    non_eur_currencies: List[str] = []

    for pos in positions:
        if pos.market_value <= 0:
            zero_value_count += 1

        if pos.asset_class == AssetClass.UNKNOWN:
            unknown_asset_count += 1

        if pos.currency != "EUR":
            if pos.currency not in non_eur_currencies:
                non_eur_currencies.append(pos.currency)

    if zero_value_count > 0:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.VALUE,
                code="ZERO_VALUE_POSITIONS",
                message=f"{zero_value_count} position(s) have zero or negative market value",
                fix_hint="Check that current_price or cost_basis is set for all positions",
                item="portfolio",
                phase=phase,
                expected="market_value > 0",
                actual=f"{zero_value_count} positions with value <= 0",
            )
        )

    if unknown_asset_count > 0:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.LOW,
                category=IssueCategory.ENRICHMENT,
                code="UNKNOWN_ASSET_CLASS",
                message=f"{unknown_asset_count} position(s) have unknown asset class",
                fix_hint="Asset class will be determined during enrichment",
                item="portfolio",
                phase=phase,
            )
        )

    if non_eur_currencies:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.CURRENCY,
                code="NON_EUR_CURRENCY",
                message=f"Positions with non-EUR currencies detected: {', '.join(non_eur_currencies)}",
                fix_hint="Currency conversion is required for accurate portfolio value",
                item="portfolio",
                phase=phase,
                expected="EUR",
                actual=", ".join(non_eur_currencies),
            )
        )

    return issues


def validate_load_phase_output(output: LoadPhaseOutput) -> List[ValidationIssue]:
    """Validate the complete Load phase output."""
    all_positions = output.direct_positions + output.etf_positions
    return validate_loaded_positions(all_positions, "DATA_LOADING")


def validate_holdings_weights(
    decomposition: ETFDecomposition,
    phase: str = "ETF_DECOMPOSITION",
) -> List[ValidationIssue]:
    """Validate holdings weights for an ETF decomposition."""
    issues: List[ValidationIssue] = []

    if not decomposition.holdings:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.SCHEMA,
                code="NO_HOLDINGS",
                message=f"ETF {decomposition.etf_isin} has no holdings data",
                fix_hint="Check ETF data source or add holdings manually",
                item=decomposition.etf_isin,
                phase=phase,
            )
        )
        return issues

    weight_sum = decomposition.weight_sum

    if 0.5 <= weight_sum <= 1.5:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.CRITICAL,
                category=IssueCategory.WEIGHT,
                code="WEIGHT_DECIMAL_FORMAT",
                message=f"ETF {decomposition.etf_isin} weights appear to be in decimal format (sum: {weight_sum:.2f})",
                fix_hint="Weights should be percentages (0-100), not decimals (0-1)",
                item=decomposition.etf_isin,
                phase=phase,
                expected="sum ~100",
                actual=f"{weight_sum:.2f}",
            )
        )
    elif weight_sum < 50:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.CRITICAL,
                category=IssueCategory.WEIGHT,
                code="WEIGHT_SUM_VERY_LOW",
                message=f"ETF {decomposition.etf_isin} weight sum is critically low: {weight_sum:.1f}%",
                fix_hint="Holdings data may be incomplete or corrupted",
                item=decomposition.etf_isin,
                phase=phase,
                expected="sum ~100",
                actual=f"{weight_sum:.1f}%",
            )
        )
    elif weight_sum < 90:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.WEIGHT,
                code="WEIGHT_SUM_LOW",
                message=f"ETF {decomposition.etf_isin} weight sum is low: {weight_sum:.1f}%",
                fix_hint="Some holdings may be missing from the data source",
                item=decomposition.etf_isin,
                phase=phase,
                expected="sum ~100",
                actual=f"{weight_sum:.1f}%",
            )
        )
    elif weight_sum > 110:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.WEIGHT,
                code="WEIGHT_SUM_HIGH",
                message=f"ETF {decomposition.etf_isin} weight sum exceeds 100%: {weight_sum:.1f}%",
                fix_hint="This may be normal for leveraged ETFs, or indicates duplicate holdings",
                item=decomposition.etf_isin,
                phase=phase,
                expected="sum ~100",
                actual=f"{weight_sum:.1f}%",
            )
        )

    return issues


def validate_resolution_rate(
    decomposition: ETFDecomposition,
    min_rate: float = 0.80,
    phase: str = "ETF_DECOMPOSITION",
) -> List[ValidationIssue]:
    """Validate ISIN resolution rate for an ETF decomposition."""
    issues: List[ValidationIssue] = []

    if not decomposition.holdings:
        return issues

    total = len(decomposition.holdings)
    resolved = decomposition.resolved_count
    rate = resolved / total if total > 0 else 0.0

    if rate < 0.50:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.RESOLUTION,
                code="LOW_RESOLUTION_RATE",
                message=f"ETF {decomposition.etf_isin} has low ISIN resolution rate: {rate:.0%}",
                fix_hint="Consider contributing unresolved tickers to the community Hive",
                item=decomposition.etf_isin,
                phase=phase,
                expected=f">= {min_rate:.0%}",
                actual=f"{rate:.0%}",
            )
        )
    elif rate < min_rate:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.RESOLUTION,
                code="MODERATE_RESOLUTION_RATE",
                message=f"ETF {decomposition.etf_isin} resolution rate is below target: {rate:.0%}",
                fix_hint="Some holdings could not be resolved to ISINs",
                item=decomposition.etf_isin,
                phase=phase,
                expected=f">= {min_rate:.0%}",
                actual=f"{rate:.0%}",
            )
        )

    return issues


def validate_decompose_phase_output(
    output: DecomposePhaseOutput,
) -> List[ValidationIssue]:
    """Validate the complete Decompose phase output."""
    issues: List[ValidationIssue] = []
    for decomposition in output.decompositions:
        issues.extend(validate_holdings_weights(decomposition))
        issues.extend(validate_resolution_rate(decomposition))
    return issues


def validate_enrichment_coverage(
    holdings: Sequence[Union[HoldingRecord, EnrichedHolding]],
    etf_isin: str,
    phase: str = "ENRICHMENT",
) -> List[ValidationIssue]:
    """Validate enrichment coverage for holdings."""
    issues: List[ValidationIssue] = []

    if not holdings:
        return issues

    total = len(holdings)
    unknown_sector = sum(
        1 for h in holdings if getattr(h, "sector", "Unknown") == "Unknown"
    )
    unknown_geography = sum(
        1 for h in holdings if getattr(h, "geography", "Unknown") == "Unknown"
    )

    sector_coverage = 1 - (unknown_sector / total)
    geography_coverage = 1 - (unknown_geography / total)

    if sector_coverage < 0.50:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.ENRICHMENT,
                code="LOW_SECTOR_COVERAGE",
                message=f"ETF {etf_isin} has low sector coverage: {sector_coverage:.0%}",
                fix_hint="Sector data may be unavailable for some holdings",
                item=etf_isin,
                phase=phase,
                expected=">= 50%",
                actual=f"{sector_coverage:.0%}",
            )
        )

    if geography_coverage < 0.50:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.ENRICHMENT,
                code="LOW_GEOGRAPHY_COVERAGE",
                message=f"ETF {etf_isin} has low geography coverage: {geography_coverage:.0%}",
                fix_hint="Geography data may be unavailable for some holdings",
                item=etf_isin,
                phase=phase,
                expected=">= 50%",
                actual=f"{geography_coverage:.0%}",
            )
        )

    return issues


def validate_enrich_phase_output(output: EnrichPhaseOutput) -> List[ValidationIssue]:
    """Validate the complete Enrich phase output."""
    issues: List[ValidationIssue] = []
    for decomposition in output.enriched_decompositions:
        issues.extend(
            validate_enrichment_coverage(
                decomposition.holdings,
                decomposition.etf_isin,
            )
        )
    return issues


def validate_aggregation_totals(
    calculated_total: float,
    expected_total: float,
    tolerance: float = 0.01,
    phase: str = "AGGREGATION",
) -> List[ValidationIssue]:
    """Validate that aggregated totals match expected values."""
    issues: List[ValidationIssue] = []

    if expected_total <= 0:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.CRITICAL,
                category=IssueCategory.VALUE,
                code="ZERO_PORTFOLIO_VALUE",
                message="Expected portfolio value is zero or negative",
                fix_hint="Check that positions have valid prices and quantities",
                item="portfolio",
                phase=phase,
                expected="> 0",
                actual=f"{expected_total:.2f}",
            )
        )
        return issues

    difference = abs(calculated_total - expected_total) / expected_total

    if difference > 0.10:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.CRITICAL,
                category=IssueCategory.VALUE,
                code="TOTAL_MISMATCH_LARGE",
                message=f"Aggregated total differs from expected by {difference:.1%}",
                fix_hint="Large discrepancy indicates calculation errors or missing data",
                item="portfolio",
                phase=phase,
                expected=f"{expected_total:.2f}",
                actual=f"{calculated_total:.2f}",
            )
        )
    elif difference > tolerance:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.VALUE,
                code="TOTAL_MISMATCH",
                message=f"Aggregated total differs from expected by {difference:.1%}",
                fix_hint="Minor discrepancy may be due to rounding or timing differences",
                item="portfolio",
                phase=phase,
                expected=f"{expected_total:.2f}",
                actual=f"{calculated_total:.2f}",
            )
        )

    return issues


def validate_percentage_sum(
    exposures: List[AggregatedExposureRecord],
    phase: str = "AGGREGATION",
) -> List[ValidationIssue]:
    """Validate that portfolio percentages sum to approximately 100%."""
    issues: List[ValidationIssue] = []

    if not exposures:
        return issues

    percentage_sum = sum(e.portfolio_percentage for e in exposures)

    if percentage_sum < 95:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.HIGH,
                category=IssueCategory.VALUE,
                code="PERCENTAGE_SUM_LOW",
                message=f"Portfolio percentages sum to only {percentage_sum:.1f}%",
                fix_hint="Some exposures may be missing from the aggregation",
                item="portfolio",
                phase=phase,
                expected="~100%",
                actual=f"{percentage_sum:.1f}%",
            )
        )
    elif percentage_sum > 105:
        issues.append(
            ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.VALUE,
                code="PERCENTAGE_SUM_HIGH",
                message=f"Portfolio percentages sum to {percentage_sum:.1f}%",
                fix_hint="This may indicate overlapping exposures or leveraged positions",
                item="portfolio",
                phase=phase,
                expected="~100%",
                actual=f"{percentage_sum:.1f}%",
            )
        )

    return issues


def validate_aggregate_phase_output(
    output: AggregatePhaseOutput,
    expected_total: float,
) -> List[ValidationIssue]:
    """Validate the complete Aggregate phase output."""
    issues: List[ValidationIssue] = []
    calculated_total = sum(e.total_exposure for e in output.exposures)
    issues.extend(validate_aggregation_totals(calculated_total, expected_total))
    issues.extend(validate_percentage_sum(output.exposures))
    return issues
