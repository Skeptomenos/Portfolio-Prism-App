import pytest
import pandas as pd
from decimal import Decimal

from portfolio_src.models.canonical import (
    CanonicalPosition,
    positions_to_dataframe,
    validate_positions,
)
from portfolio_src.adapters.tr_adapter import TradeRepublicAdapter
from portfolio_src.adapters.csv_adapter import ManualCSVAdapter


class TestCanonicalPosition:
    def test_market_value_computed(self):
        pos = CanonicalPosition(
            isin="US67066G1040",
            name="NVIDIA",
            quantity=Decimal("10.5"),
            unit_price=Decimal("159.84"),
        )
        assert pos.market_value == Decimal("10.5") * Decimal("159.84")

    def test_to_dict(self):
        pos = CanonicalPosition(
            isin="US67066G1040",
            name="NVIDIA",
            quantity=Decimal("10"),
            unit_price=Decimal("100"),
        )
        d = pos.to_dict()
        assert d["isin"] == "US67066G1040"
        assert d["market_value"] == 1000.0

    def test_validate_valid_position(self):
        pos = CanonicalPosition(
            isin="US67066G1040",
            name="NVIDIA",
            quantity=Decimal("10"),
            unit_price=Decimal("100"),
        )
        errors = pos.validate()
        assert len(errors) == 0

    def test_validate_invalid_isin_length(self):
        pos = CanonicalPosition(
            isin="INVALID",
            name="Test",
            quantity=Decimal("10"),
            unit_price=Decimal("100"),
        )
        errors = pos.validate()
        assert any("length" in e.lower() for e in errors)

    def test_validate_negative_price(self):
        pos = CanonicalPosition(
            isin="US67066G1040",
            name="Test",
            quantity=Decimal("10"),
            unit_price=Decimal("-100"),
        )
        errors = pos.validate()
        assert any("negative price" in e.lower() for e in errors)


class TestPositionsToDataframe:
    def test_empty_list(self):
        df = positions_to_dataframe([])
        assert df.empty

    def test_single_position(self):
        pos = CanonicalPosition(
            isin="US67066G1040",
            name="NVIDIA",
            quantity=Decimal("10"),
            unit_price=Decimal("100"),
        )
        df = positions_to_dataframe([pos])
        assert len(df) == 1
        assert df.iloc[0]["isin"] == "US67066G1040"
        assert df.iloc[0]["market_value"] == 1000.0

    def test_multiple_positions(self):
        positions = [
            CanonicalPosition(
                isin="US67066G1040",
                name="NVIDIA",
                quantity=Decimal("10"),
                unit_price=Decimal("100"),
            ),
            CanonicalPosition(
                isin="XF000BTC0017",
                name="Bitcoin",
                quantity=Decimal("0.001"),
                unit_price=Decimal("74000"),
            ),
        ]
        df = positions_to_dataframe(positions)
        assert len(df) == 2


class TestValidatePositions:
    def test_all_valid(self):
        positions = [
            CanonicalPosition(
                isin="US67066G1040",
                name="NVIDIA",
                quantity=Decimal("10"),
                unit_price=Decimal("100"),
            ),
        ]
        valid, errors = validate_positions(positions)
        assert len(valid) == 1
        assert len(errors) == 0

    def test_mixed_valid_invalid(self):
        positions = [
            CanonicalPosition(
                isin="US67066G1040",
                name="NVIDIA",
                quantity=Decimal("10"),
                unit_price=Decimal("100"),
            ),
            CanonicalPosition(
                isin="INVALID",
                name="Bad",
                quantity=Decimal("10"),
                unit_price=Decimal("100"),
            ),
        ]
        valid, errors = validate_positions(positions)
        assert len(valid) == 1
        assert len(errors) == 1


class TestTradeRepublicAdapter:
    def test_normalize_basic(self):
        adapter = TradeRepublicAdapter()
        raw = [
            {
                "instrumentId": "US67066G1040",
                "name": "NVIDIA",
                "netSize": 10.5,
                "currentPrice": 159.84,
            }
        ]
        positions = adapter.normalize(raw)
        assert len(positions) == 1
        assert positions[0].isin == "US67066G1040"
        assert positions[0].quantity == Decimal("10.5")

    def test_normalize_alternative_fields(self):
        adapter = TradeRepublicAdapter()
        raw = [
            {
                "isin": "US67066G1040",
                "name": "NVIDIA",
                "quantity": 10.5,
                "price": 159.84,
            }
        ]
        positions = adapter.normalize(raw)
        assert len(positions) == 1

    def test_detect_etf(self):
        adapter = TradeRepublicAdapter()
        raw = [
            {
                "instrumentId": "IE00B4L5Y983",
                "name": "iShares MSCI World",
                "netSize": 50,
                "currentPrice": 82.30,
            }
        ]
        positions = adapter.normalize(raw)
        assert positions[0].asset_type == "ETF"

    def test_detect_crypto(self):
        adapter = TradeRepublicAdapter()
        raw = [
            {
                "instrumentId": "XF000BTC0017",
                "name": "Bitcoin",
                "netSize": 0.001,
                "currentPrice": 74000,
            }
        ]
        positions = adapter.normalize(raw)
        assert positions[0].asset_type == "Crypto"

    def test_skip_invalid_isin(self):
        adapter = TradeRepublicAdapter()
        raw = [
            {
                "instrumentId": "INVALID",
                "name": "Bad",
                "netSize": 10,
                "currentPrice": 100,
            }
        ]
        positions = adapter.normalize(raw)
        assert len(positions) == 0


class TestManualCSVAdapter:
    def test_normalize_basic(self):
        adapter = ManualCSVAdapter()
        df = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "quantity": [10.5],
                "price": [159.84],
            }
        )
        positions = adapter.normalize(df)
        assert len(positions) == 1
        assert positions[0].isin == "US67066G1040"

    def test_normalize_with_column_mapping(self):
        adapter = ManualCSVAdapter()
        df = pd.DataFrame(
            {
                "ISIN_Code": ["US67066G1040"],
                "Security_Name": ["NVIDIA"],
                "Anzahl": [10.5],
                "Kurs": [159.84],
            }
        )
        mapping = {
            "ISIN_Code": "isin",
            "Security_Name": "name",
            "Anzahl": "quantity",
            "Kurs": "price",
        }
        positions = adapter.normalize(df, column_mapping=mapping)
        assert len(positions) == 1

    def test_derive_price_from_value(self):
        adapter = ManualCSVAdapter()
        df = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "quantity": [10],
                "value": [1000],
            }
        )
        positions = adapter.normalize(df)
        assert len(positions) == 1
        assert positions[0].unit_price == Decimal("100")

    def test_assume_quantity_one_when_only_value(self):
        adapter = ManualCSVAdapter()
        df = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "market_value": [1000],
            }
        )
        positions = adapter.normalize(df)
        assert len(positions) == 1
        assert positions[0].quantity == Decimal("1")
        assert positions[0].unit_price == Decimal("1000")

    def test_missing_isin_raises(self):
        adapter = ManualCSVAdapter()
        df = pd.DataFrame(
            {
                "name": ["NVIDIA"],
                "quantity": [10],
                "price": [100],
            }
        )
        with pytest.raises(ValueError, match="ISIN"):
            adapter.normalize(df)

    def test_empty_dataframe(self):
        adapter = ManualCSVAdapter()
        df = pd.DataFrame()
        positions = adapter.normalize(df)
        assert len(positions) == 0
