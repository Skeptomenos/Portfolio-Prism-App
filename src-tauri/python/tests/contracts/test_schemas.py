"""Tests for Pipeline Phase Schemas - Validates Pydantic model constraints and computed fields."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from portfolio_src.core.contracts import (
    AggregatedExposureRecord,
    AssetClass,
    ETFDecomposition,
    HoldingRecord,
    LoadedPosition,
    ResolutionStatus,
)
from tests.contracts.factories import (
    make_aggregated_exposure,
    make_etf_decomposition,
    make_holding_record,
    make_loaded_position,
)


class TestLoadedPosition:
    """Tests for LoadedPosition schema validation."""

    def test_valid_position(self) -> None:
        """Valid position should be created successfully."""
        pos = make_loaded_position()
        assert pos.isin == "US0378331005"
        assert pos.name == "Apple Inc"
        assert pos.quantity == 10.0
        assert pos.current_price == 150.0
        assert pos.asset_class == AssetClass.STOCK

    def test_invalid_isin_too_short(self) -> None:
        """ISIN with less than 12 characters should fail."""
        with pytest.raises(ValidationError) as exc_info:
            make_loaded_position(isin="US037833100")  # 11 chars
        assert "isin" in str(exc_info.value)

    def test_invalid_isin_wrong_format(self) -> None:
        """ISIN with invalid format should fail."""
        with pytest.raises(ValidationError) as exc_info:
            make_loaded_position(isin="12ABCDEFGHIJ")  # Starts with numbers
        assert "isin" in str(exc_info.value)

    def test_empty_name(self) -> None:
        """Empty name should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            make_loaded_position(name="")
        assert "name" in str(exc_info.value)

    def test_asset_class_normalization_lowercase(self) -> None:
        """Lowercase asset class should be normalized."""
        pos = make_loaded_position(asset_class="stock")
        assert pos.asset_class == AssetClass.STOCK

    def test_asset_class_normalization_none(self) -> None:
        """None asset class should become UNKNOWN."""
        pos = make_loaded_position(asset_class=None)
        assert pos.asset_class == AssetClass.UNKNOWN

    def test_asset_class_normalization_empty_string(self) -> None:
        """Empty string asset class should become UNKNOWN."""
        pos = make_loaded_position(asset_class="")
        assert pos.asset_class == AssetClass.UNKNOWN

    def test_asset_class_normalization_invalid_string(self) -> None:
        """Invalid string asset class should become UNKNOWN."""
        pos = make_loaded_position(asset_class="INVALID_TYPE")
        assert pos.asset_class == AssetClass.UNKNOWN

    def test_market_value_calculation(self) -> None:
        """Market value should be quantity * current_price."""
        pos = make_loaded_position(quantity=10.0, current_price=150.0)
        assert pos.market_value == 1500.0

    def test_market_value_fallback_to_cost_basis(self) -> None:
        """Market value should fallback to cost_basis when current_price is None."""
        pos = make_loaded_position(quantity=10.0, current_price=None, cost_basis=140.0)
        assert pos.market_value == 1400.0

    def test_market_value_fallback_to_zero(self) -> None:
        """Market value should be 0 when both prices are None."""
        pos = make_loaded_position(quantity=10.0, current_price=None, cost_basis=None)
        assert pos.market_value == 0.0


class TestHoldingRecord:
    """Tests for HoldingRecord schema validation."""

    def test_valid_holding(self) -> None:
        """Valid holding should be created successfully."""
        holding = make_holding_record()
        assert holding.name == "Test Holding"
        assert holding.weight_percentage == 5.0
        assert holding.resolution_status == ResolutionStatus.UNRESOLVED

    def test_weight_percentage_bounds(self) -> None:
        """Weight percentage at boundary (150) should be valid."""
        holding = make_holding_record(weight_percentage=150.0)
        assert holding.weight_percentage == 150.0

    def test_weight_percentage_negative_fails(self) -> None:
        """Negative weight percentage should fail."""
        with pytest.raises(ValidationError) as exc_info:
            make_holding_record(weight_percentage=-1.0)
        assert "weight_percentage" in str(exc_info.value)

    def test_optional_isin(self) -> None:
        """ISIN should be optional and default to None."""
        holding = make_holding_record()
        assert holding.isin is None

    def test_isin_validation_when_present(self) -> None:
        """When ISIN is provided, it should be validated."""
        holding = make_holding_record(isin="US0378331005")
        assert holding.isin == "US0378331005"

        with pytest.raises(ValidationError) as exc_info:
            make_holding_record(isin="INVALID")
        assert "isin" in str(exc_info.value)

    def test_empty_isin_becomes_none(self) -> None:
        """Empty string ISIN should become None."""
        holding = make_holding_record(isin="")
        assert holding.isin is None


class TestETFDecomposition:
    """Tests for ETFDecomposition schema validation."""

    def test_valid_decomposition(self) -> None:
        """Valid decomposition should be created successfully."""
        decomp = make_etf_decomposition()
        assert decomp.etf_isin == "IE00B4L5Y983"
        assert decomp.etf_name == "iShares Core MSCI World"
        assert decomp.etf_value == 10000.0

    def test_weight_sum_calculation(self) -> None:
        """Weight sum should be computed from holdings."""
        decomp = make_etf_decomposition(holdings_count=4, weight_sum=100.0)
        assert decomp.weight_sum == pytest.approx(100.0, rel=0.01)

    def test_holdings_count_calculation(self) -> None:
        """Holdings count should be computed from holdings list."""
        decomp = make_etf_decomposition(holdings_count=5)
        assert decomp.holdings_count == 5

    def test_resolved_count_calculation(self) -> None:
        """Resolved count should count holdings with RESOLVED status."""
        holdings = [
            make_holding_record(
                name=f"H{i}",
                resolution_status=ResolutionStatus.RESOLVED
                if i < 2
                else ResolutionStatus.UNRESOLVED,
            )
            for i in range(5)
        ]
        decomp = make_etf_decomposition(holdings=holdings)
        assert decomp.resolved_count == 2
        assert decomp.unresolved_count == 3

    def test_empty_holdings_valid(self) -> None:
        """ETF with no holdings should be valid."""
        decomp = make_etf_decomposition(holdings_count=0)
        assert decomp.holdings_count == 0
        assert decomp.weight_sum == 0.0


class TestAggregatedExposureRecord:
    """Tests for AggregatedExposureRecord schema validation."""

    def test_valid_record(self) -> None:
        """Valid exposure record should be created successfully."""
        exposure = make_aggregated_exposure()
        assert exposure.isin == "US0378331005"
        assert exposure.name == "Apple Inc"
        assert exposure.total_exposure == 1500.0
        assert exposure.portfolio_percentage == 15.0

    def test_portfolio_percentage_allows_leverage(self) -> None:
        """Portfolio percentage up to 200% should be valid (leveraged portfolios)."""
        exposure = make_aggregated_exposure(portfolio_percentage=180.0)
        assert exposure.portfolio_percentage == 180.0

        # Over 200% should fail
        with pytest.raises(ValidationError) as exc_info:
            make_aggregated_exposure(portfolio_percentage=201.0)
        assert "portfolio_percentage" in str(exc_info.value)

    def test_unresolved_pattern(self) -> None:
        """ISIN can be 'UNRESOLVED:...' pattern for unresolved holdings."""
        exposure = make_aggregated_exposure(isin="UNRESOLVED:AAPL")
        assert exposure.isin == "UNRESOLVED:AAPL"
        assert exposure.isin.startswith("UNRESOLVED:")
