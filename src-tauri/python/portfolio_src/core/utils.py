# core/utils.py
"""
Shared utility functions for the analytics pipeline.

These functions are used across multiple services to ensure consistency.
"""

import pandas as pd
from typing import Dict, List, Optional

from portfolio_src.core.errors import SchemaError
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def get_value_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find the value column name in a DataFrame.

    Args:
        df: DataFrame to search

    Returns:
        Column name for value, or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    for col in ["market_value", "price"]:
        if col in normalized_df.columns:
            return col
    return None


def get_isin_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find the ISIN column name in a DataFrame.

    Args:
        df: DataFrame to search

    Returns:
        Column name for ISIN or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    return "isin" if "isin" in normalized_df.columns else None


def get_name_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find the name column name in a DataFrame.

    Args:
        df: DataFrame to search

    Returns:
        Column name for name or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    return "name" if "name" in normalized_df.columns else None


def get_weight_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find the weight column name in a DataFrame.

    Args:
        df: DataFrame to search

    Returns:
        Column name for weight, or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    return "weight" if "weight" in normalized_df.columns else None


class SchemaNormalizer:
    """Centralizes schema normalization and validation for the entire pipeline."""

    # Standard column names (all lowercase)
    STANDARD_COLUMNS = {
        "isin": "isin",
        "name": "name",
        "ticker": "ticker",
        "exchange": "exchange",
        "currency": "currency",
        "weight": "weight",
        "quantity": "quantity",
        "price": "price",
        "sector": "sector",
        "geography": "geography",
        "asset_class": "asset_class",
        "cost_basis": "cost_basis",
        "market_value": "market_value",
        "last_updated": "last_updated",
    }

    # Provider-specific column mappings
    PROVIDER_MAPPINGS = {
        "ishares": {
            "ISIN": "isin",
            "Name": "name",
            "Weight (%)": "weight",
            "Fund Name": "name",
            "Ticker": "ticker",
        },
        "vanguard": {"isin": "isin", "fund_name": "name", "allocation_pct": "weight"},
        "amundi": {
            "Code ISIN": "isin",
            "Libellé": "name",
            "Poids": "weight",
            "Devise": "currency",
        },
    }

    @staticmethod
    def normalize_columns(
        df: pd.DataFrame, provider: Optional[str] = None
    ) -> pd.DataFrame:
        """Normalize DataFrame columns to standard lowercase names."""
        if df.empty:
            return df

        normalized_df = df.copy()

        # Apply provider-specific mappings first
        if provider and provider.lower() in SchemaNormalizer.PROVIDER_MAPPINGS:
            provider_mapping = SchemaNormalizer.PROVIDER_MAPPINGS[provider.lower()]
            normalized_df = normalized_df.rename(columns=provider_mapping)
            logger.debug(f"Applied {provider} column mappings")

        # Apply standard mappings - convert any remaining columns to lowercase
        # and map common variations to standard names
        column_mapping = {}
        for col in normalized_df.columns:
            col_str = str(col)
            col_lower = col_str.lower()

            # Direct matches
            if col_lower in ["isin", "name", "weight", "ticker", "sector", "geography"]:
                column_mapping[col] = col_lower

            # Common variations
            elif "isin" in col_lower:
                column_mapping[col] = "isin"
            elif (
                "market_value" in col_lower
                or "market value" in col_lower
                or "net_value" in col_lower
                or "netvalue" in col_lower
                or "total_value" in col_lower
                or "value" in col_lower
            ):
                column_mapping[col] = "market_value"
            elif "name" in col_lower or "fund" in col_lower:
                column_mapping[col] = "name"
            elif "ticker" in col_lower or "symbol" in col_lower:
                column_mapping[col] = "ticker"
            elif "weight" in col_lower:
                column_mapping[col] = "weight"
            elif "quantity" in col_lower or "shares" in col_lower:
                column_mapping[col] = "quantity"
            elif "price" in col_lower:
                column_mapping[col] = "price"

        if column_mapping:
            normalized_df = normalized_df.rename(columns=column_mapping)
            logger.debug(f"Normalized columns: {column_mapping}")

        return normalized_df

    @staticmethod
    def validate_schema(
        df: pd.DataFrame, required_columns: List[str], context: str = "Unknown"
    ) -> None:
        """Validate DataFrame has required columns."""
        df_columns = df.columns.tolist()
        missing_columns = [col for col in required_columns if col not in df_columns]

        if missing_columns:
            raise SchemaError(df_columns, required_columns, context)

    @staticmethod
    def get_standard_columns(
        df: pd.DataFrame, column_keys: List[str]
    ) -> Dict[str, Optional[str]]:
        """Get standard column names from DataFrame."""
        normalized_df = SchemaNormalizer.normalize_columns(df)
        available_columns = normalized_df.columns.tolist()

        result = {}
        for key in column_keys:
            if key in SchemaNormalizer.STANDARD_COLUMNS:
                std_name = SchemaNormalizer.STANDARD_COLUMNS[key]
                result[key] = std_name if std_name in available_columns else None
            else:
                result[key] = None

        return result


def calculate_portfolio_total_value(
    direct_positions: pd.DataFrame, etf_positions: pd.DataFrame
) -> float:
    """
    Calculate total portfolio value from positions DataFrames.

    Args:
        direct_positions: DataFrame of direct stock holdings
        etf_positions: DataFrame of ETF positions

    Returns:
        Total portfolio value as float
    """
    if not isinstance(direct_positions, pd.DataFrame):
        direct_positions = pd.DataFrame()
    if not isinstance(etf_positions, pd.DataFrame):
        etf_positions = pd.DataFrame()

    direct_value = 0
    etf_value = 0

    if not direct_positions.empty:
        normalized_direct = SchemaNormalizer.normalize_columns(direct_positions)
        if "market_value" in normalized_direct.columns:
            vals = normalized_direct["market_value"]
            if isinstance(vals, pd.DataFrame):
                vals = vals.iloc[:, 0]
            direct_value = float(vals.sum())
        elif (
            "price" in normalized_direct.columns
            and "quantity" in normalized_direct.columns
        ):
            prices = normalized_direct["price"]
            qtys = normalized_direct["quantity"]
            if isinstance(prices, pd.DataFrame):
                prices = prices.iloc[:, 0]
            if isinstance(qtys, pd.DataFrame):
                qtys = qtys.iloc[:, 0]
            direct_value = float((prices * qtys).sum())

    if not etf_positions.empty:
        normalized_etf = SchemaNormalizer.normalize_columns(etf_positions)
        if "market_value" in normalized_etf.columns:
            vals = normalized_etf["market_value"]
            if isinstance(vals, pd.DataFrame):
                vals = vals.iloc[:, 0]
            etf_value = float(vals.sum())
        elif "price" in normalized_etf.columns and "quantity" in normalized_etf.columns:
            prices = normalized_etf["price"]
            qtys = normalized_etf["quantity"]
            if isinstance(prices, pd.DataFrame):
                prices = prices.iloc[:, 0]
            if isinstance(qtys, pd.DataFrame):
                qtys = qtys.iloc[:, 0]
            etf_value = float((prices * qtys).sum())

    return float(direct_value + etf_value)
