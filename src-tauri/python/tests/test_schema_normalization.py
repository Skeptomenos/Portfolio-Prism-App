import pytest
import pandas as pd
from typing import cast, Any
from portfolio_src.core.utils import SchemaNormalizer
from portfolio_src.core.errors import SchemaError


class TestSchemaNormalization:
    def test_ishares_normalization(self):
        """Verify iShares specific column mapping."""
        raw_data = pd.DataFrame(
            [
                {
                    "ISIN": "IE00B4L5Y983",
                    "Name": "iShares Core MSCI World",
                    "Weight (%)": 1.5,
                    "Asset Class": "Equity",
                }
            ]
        )

        normalized = SchemaNormalizer.normalize_columns(raw_data, provider="ishares")

        assert "isin" in normalized.columns
        assert "name" in normalized.columns
        assert "weight" in normalized.columns
        assert normalized.iloc[0]["isin"] == "IE00B4L5Y983"
        assert normalized.iloc[0]["weight"] == 1.5

    def test_vanguard_normalization(self):
        """Verify Vanguard specific column mapping."""
        raw_data = pd.DataFrame(
            [
                {
                    "isin": "IE00B3RBWM25",
                    "fund_name": "Vanguard FTSE All-World",
                    "allocation_pct": 2.0,
                }
            ]
        )

        normalized = SchemaNormalizer.normalize_columns(raw_data, provider="vanguard")

        assert "isin" in normalized.columns
        assert "name" in normalized.columns
        assert "weight" in normalized.columns
        assert normalized.iloc[0]["name"] == "Vanguard FTSE All-World"

    def test_amundi_normalization(self):
        """Verify Amundi specific column mapping (French labels)."""
        raw_data = pd.DataFrame(
            [
                {
                    "Code ISIN": "LU1681043599",
                    "Libellé": "Amundi MSCI World",
                    "Poids": 0.8,
                }
            ]
        )

        normalized = SchemaNormalizer.normalize_columns(raw_data, provider="amundi")

        assert "isin" in normalized.columns
        assert "name" in normalized.columns
        assert "weight" in normalized.columns
        assert normalized.iloc[0]["isin"] == "LU1681043599"

    def test_heuristic_normalization(self):
        """Verify fuzzy matching for unknown providers."""
        raw_data = pd.DataFrame(
            [
                {
                    "Security ISIN": "US0378331005",
                    "Instrument Name": "Apple Inc",
                    "Market Value (EUR)": 1000.0,
                }
            ]
        )

        normalized = SchemaNormalizer.normalize_columns(raw_data)

        assert "isin" in normalized.columns
        assert "name" in normalized.columns
        assert "market_value" in normalized.columns
        assert normalized.iloc[0]["isin"] == "US0378331005"

    def test_schema_validation_success(self):
        """Verify validation passes for correct schema."""
        df = pd.DataFrame(columns=cast(Any, ["isin", "name", "weight"]))
        # Should not raise
        SchemaNormalizer.validate_schema(df, ["isin", "name"], context="test")

    def test_schema_validation_failure(self):
        """Verify SchemaError is raised for missing columns."""
        df = pd.DataFrame(columns=cast(Any, ["name", "weight"]))
        with pytest.raises(SchemaError) as excinfo:
            SchemaNormalizer.validate_schema(df, ["isin"], context="test_context")

        assert "isin" in str(excinfo.value)
        assert "test_context" in str(excinfo.value)

    def test_empty_dataframe_handling(self):
        """Verify empty DataFrames are handled gracefully."""
        df = pd.DataFrame()
        normalized = SchemaNormalizer.normalize_columns(df)
        assert normalized.empty

        with pytest.raises(SchemaError):
            SchemaNormalizer.validate_schema(df, ["isin"])
