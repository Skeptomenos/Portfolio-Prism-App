"""Test Fixture Factories for Contracts - Factory functions create valid objects with sensible defaults."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from portfolio_src.core.contracts import (
    AggregatedExposureRecord,
    AggregatePhaseOutput,
    AssetClass,
    DataQuality,
    DecomposePhaseOutput,
    ETFDecomposition,
    HoldingRecord,
    IssueCategory,
    IssueSeverity,
    LoadedPosition,
    LoadPhaseOutput,
    ResolutionStatus,
    ValidationIssue,
)


def make_loaded_position(**overrides: Any) -> LoadedPosition:
    """Create a valid LoadedPosition with sensible defaults."""
    defaults: Dict[str, Any] = {
        "isin": "US0378331005",
        "name": "Apple Inc",
        "quantity": 10.0,
        "current_price": 150.0,
        "cost_basis": 140.0,
        "asset_class": AssetClass.STOCK,
        "currency": "EUR",
    }
    defaults.update(overrides)
    return LoadedPosition(**defaults)


def make_holding_record(**overrides: Any) -> HoldingRecord:
    """Create a valid HoldingRecord with sensible defaults."""
    defaults: Dict[str, Any] = {
        "name": "Test Holding",
        "weight_percentage": 5.0,
        "ticker": "TEST",
        "resolution_status": ResolutionStatus.UNRESOLVED,
    }
    defaults.update(overrides)
    return HoldingRecord(**defaults)


def make_etf_decomposition(
    holdings_count: int = 3,
    weight_sum: float = 100.0,
    **overrides: Any,
) -> ETFDecomposition:
    """Create a valid ETFDecomposition with distributed holdings."""
    if "holdings" not in overrides:
        weight_per_holding = weight_sum / holdings_count if holdings_count > 0 else 0.0
        holdings = [
            make_holding_record(
                name=f"Holding {i + 1}",
                ticker=f"HOLD{i + 1}",
                weight_percentage=weight_per_holding,
            )
            for i in range(holdings_count)
        ]
        overrides["holdings"] = holdings

    defaults: Dict[str, Any] = {
        "etf_isin": "IE00B4L5Y983",
        "etf_name": "iShares Core MSCI World",
        "etf_value": 10000.0,
        "source": "test",
    }
    defaults.update(overrides)
    return ETFDecomposition(**defaults)


def make_aggregated_exposure(**overrides: Any) -> AggregatedExposureRecord:
    """Create a valid AggregatedExposureRecord with sensible defaults."""
    defaults: Dict[str, Any] = {
        "isin": "US0378331005",
        "name": "Apple Inc",
        "total_exposure": 1500.0,
        "portfolio_percentage": 15.0,
        "direct_exposure": 1500.0,
        "indirect_exposure": 0.0,
    }
    defaults.update(overrides)
    return AggregatedExposureRecord(**defaults)


def make_validation_issue(**overrides: Any) -> ValidationIssue:
    """Create a valid ValidationIssue with sensible defaults."""
    defaults: Dict[str, Any] = {
        "severity": IssueSeverity.MEDIUM,
        "category": IssueCategory.SCHEMA,
        "code": "TEST_ISSUE",
        "message": "Test issue message",
        "fix_hint": "Test fix hint",
        "item": "TEST",
        "phase": "TEST",
    }
    defaults.update(overrides)
    return ValidationIssue(**defaults)


def make_load_phase_output(
    direct_count: int = 2,
    etf_count: int = 1,
) -> LoadPhaseOutput:
    """Create a valid LoadPhaseOutput with specified number of positions."""
    direct_positions = [
        make_loaded_position(
            isin=f"US037833100{i}",
            name=f"Direct Position {i + 1}",
            asset_class=AssetClass.STOCK,
        )
        for i in range(direct_count)
    ]
    etf_positions = [
        make_loaded_position(
            isin=f"IE00B4L5Y98{i}",
            name=f"ETF Position {i + 1}",
            asset_class=AssetClass.ETF,
        )
        for i in range(etf_count)
    ]
    return LoadPhaseOutput(
        direct_positions=direct_positions,
        etf_positions=etf_positions,
    )


def make_decompose_phase_output(
    etf_count: int = 2,
    holdings_per_etf: int = 3,
) -> DecomposePhaseOutput:
    """Create a valid DecomposePhaseOutput with specified structure."""
    decompositions = [
        make_etf_decomposition(
            etf_isin=f"IE00B4L5Y98{i}",
            etf_name=f"ETF {i + 1}",
            holdings_count=holdings_per_etf,
        )
        for i in range(etf_count)
    ]
    return DecomposePhaseOutput(decompositions=decompositions)
