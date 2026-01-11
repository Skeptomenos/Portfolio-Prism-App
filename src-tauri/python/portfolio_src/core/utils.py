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
    DEPRECATED: Use get_total_value_column() or get_unit_price_column().

    This function conflates total value and per-unit price semantics.
    Keeping for backward compatibility but will be removed in v2.0.

    Args:
        df: DataFrame to search

    Returns:
        Column name for value, or None if not found
    """
    import warnings

    warnings.warn(
        "get_value_column() is deprecated. Use get_total_value_column() "
        "or get_unit_price_column() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    return get_total_value_column(df)


def get_total_value_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find column containing TOTAL position value (quantity already factored in).

    Use this when you need the full monetary value of a position.
    Examples: market_value, net_value, tr_value

    NOT for per-unit prices - use get_unit_price_column() for that.

    NOTE: Call this ONCE per DataFrame, not per row.

    Args:
        df: DataFrame to search

    Returns:
        Column name for total value, or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    for col in ["market_value", "net_value", "tr_value", "total_value"]:
        if col in normalized_df.columns:
            return col
    return None


def get_unit_price_column(df: pd.DataFrame) -> Optional[str]:
    """
    Find column containing PER-UNIT price.

    Use this when you need to calculate value as: quantity * price
    Examples: price, current_price, unit_price

    NOT for total values - use get_total_value_column() for that.

    NOTE: Call this ONCE per DataFrame, not per row.

    Args:
        df: DataFrame to search

    Returns:
        Column name for unit price, or None if not found
    """
    normalized_df = SchemaNormalizer.normalize_columns(df)
    # Check both "price" and "current_price" to unify pipeline/aggregator logic
    for col in ["price", "current_price", "unit_price"]:
        if col in normalized_df.columns:
            return col
    return None


def calculate_position_values(df: pd.DataFrame) -> pd.Series:
    """
    Calculate total values for ALL positions in a DataFrame (VECTORIZED).

    Priority:
    1. If market_value column exists -> use it directly
    2. Else if quantity AND price columns exist -> compute quantity * price
    3. Else -> return zeros with warning

    This is the SINGLE SOURCE OF TRUTH for position value calculation.

    Args:
        df: DataFrame with position data

    Returns:
        pd.Series of total values, indexed same as input DataFrame
    """
    if df.empty:
        return pd.Series(dtype=float)

    normalized_df = SchemaNormalizer.normalize_columns(df)

    value_col = get_total_value_column(df)
    if value_col and value_col in normalized_df.columns:
        result = pd.to_numeric(normalized_df[value_col], errors="coerce").fillna(0.0)
        result.index = df.index
        return result

    qty_col = "quantity" if "quantity" in normalized_df.columns else None
    price_col = get_unit_price_column(df)

    if qty_col and price_col and price_col in normalized_df.columns:
        qty = pd.to_numeric(normalized_df[qty_col], errors="coerce").fillna(0.0)
        price = pd.to_numeric(normalized_df[price_col], errors="coerce").fillna(0.0)

        neg_qty_count = (qty < 0).sum()
        if neg_qty_count > 0:
            logger.warning(
                f"Found {neg_qty_count} positions with negative quantity (short positions). "
                f"Values will be negative."
            )

        if "currency" in normalized_df.columns:
            non_eur = normalized_df[
                normalized_df["currency"].fillna("EUR").str.upper() != "EUR"
            ]
            if not non_eur.empty:
                logger.warning(
                    f"Found {len(non_eur)} positions with non-EUR currency. "
                    f"Values may be incorrect. Currency conversion not implemented."
                )

        result = qty * price
        result.index = df.index
        return result

    logger.warning(
        f"Cannot calculate position values. "
        f"Available columns: {list(df.columns)}. "
        f"Need market_value OR (quantity + price/current_price)."
    )
    return pd.Series(0.0, index=df.index)


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
    # Check for standard names first
    if "weight" in df.columns:
        return "weight"
    if "weight_percentage" in df.columns:
        return "weight_percentage"

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
        normalized_df = df.copy()

        # Apply provider-specific mappings first
        if provider and provider.lower() in SchemaNormalizer.PROVIDER_MAPPINGS:
            provider_mapping = SchemaNormalizer.PROVIDER_MAPPINGS[provider.lower()]
            normalized_df = normalized_df.rename(columns=provider_mapping)
            logger.debug(f"Applied {provider} column mappings")

        # Apply standard mappings - convert any remaining columns to lowercase
        # and map common variations to standard names
        column_mapping = {}
        mapped_targets = set()

        # First pass: Exact matches (highest priority)
        for col in normalized_df.columns:
            col_str = str(col)
            col_lower = col_str.lower()
            if col_lower in SchemaNormalizer.STANDARD_COLUMNS:
                column_mapping[col] = col_lower
                mapped_targets.add(col_lower)

        # Second pass: Fuzzy matches (only if target not yet mapped)
        for col in normalized_df.columns:
            if col in column_mapping:
                continue

            col_str = str(col)
            col_lower = col_str.lower()

            target = None
            # Common variations
            if "isin" in col_lower and "shareclass" not in col_lower:
                target = "isin"
            elif (
                "market_value" in col_lower
                or "market value" in col_lower
                or "net_value" in col_lower
                or "netvalue" in col_lower
                or "total_value" in col_lower
                or "value" in col_lower
            ):
                target = "market_value"
            elif "name" in col_lower or "fund" in col_lower:
                target = "name"
            elif "ticker" in col_lower or "symbol" in col_lower:
                target = "ticker"
            elif "weight" in col_lower:
                target = "weight"
            elif "quantity" in col_lower or "shares" in col_lower:
                target = "quantity"
            elif "price" in col_lower:
                target = "price"
            elif (
                "asset_class" in col_lower
                or "asset type" in col_lower
                or "asset_type" in col_lower
            ):
                target = "asset_class"

            if target and target not in mapped_targets:
                column_mapping[col] = target
                mapped_targets.add(target)

        if column_mapping:
            normalized_df = normalized_df.rename(columns=column_mapping)
            # Drop duplicate columns if any (keep first)
            normalized_df = normalized_df.loc[:, ~normalized_df.columns.duplicated()]
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


def write_json_atomic(path, data: dict) -> None:
    """
    Write JSON file atomically using temp file + rename.

    This prevents file corruption if the process is interrupted mid-write.
    The original file remains untouched until the new data is fully written.
    """
    import tempfile
    import os
    import json
    from pathlib import Path

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(dir=path.parent, suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        os.replace(temp_path, path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


def write_csv_atomic(path, df: pd.DataFrame, **kwargs) -> None:
    """
    Write CSV file atomically using temp file + rename.

    This prevents file corruption if the process is interrupted mid-write.
    The original file remains untouched until the new data is fully written.

    Args:
        path: Target file path
        df: DataFrame to write
        **kwargs: Additional arguments passed to DataFrame.to_csv()
    """
    import tempfile
    import os
    from pathlib import Path

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if "index" not in kwargs:
        kwargs["index"] = False

    fd, temp_path = tempfile.mkstemp(dir=path.parent, suffix=".csv.tmp")
    try:
        with os.fdopen(fd, "w", newline="") as f:
            df.to_csv(f, **kwargs)
            f.flush()
            os.fsync(f.fileno())

        os.replace(temp_path, path)
        logger.debug(f"Wrote CSV atomically: {path}")
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
