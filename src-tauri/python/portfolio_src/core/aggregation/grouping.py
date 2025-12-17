"""Grouping and aggregation logic for indirect holdings."""

from typing import Literal

import pandas as pd

from portfolio_src.models import AggregatedExposure
from portfolio_src.prism_utils.isin_validator import is_valid_isin, generate_group_key
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def calculate_indirect_values(
    holdings: pd.DataFrame, etf_market_value: float
) -> pd.DataFrame:
    """
    Calculate indirect EUR value for each holding based on weight.

    Args:
        holdings: DataFrame with weight_percentage column
        etf_market_value: Total market value of the ETF position

    Returns:
        DataFrame with 'indirect' column added
    """
    holdings = holdings.copy()

    if "weight_percentage" in holdings.columns:
        holdings["weight_percentage"] = (
            holdings["weight_percentage"]
            .astype(str)
            .str.replace(",", ".")
            .apply(pd.to_numeric, errors="coerce")
            .fillna(0.0)
        )
    else:
        holdings["weight_percentage"] = 0.0

    holdings["indirect"] = holdings["weight_percentage"] / 100 * etf_market_value

    return holdings


def generate_group_id(row: pd.Series) -> str:
    """
    Generate unique group ID for aggregation.

    Uses ISIN if valid, otherwise generates a deterministic hash-based
    key for unresolved holdings.

    Args:
        row: DataFrame row with isin, ticker, name columns

    Returns:
        Group ID string (ISIN or UNRESOLVED:{ticker}:{hash10})
    """
    isin = row.get("isin")

    # Check for valid ISIN using proper validation
    if isin and is_valid_isin(str(isin)):
        return str(isin)

    # Deterministic fallback with 10-digit hash (1 in 10 million collision)
    ticker = str(row.get("ticker", "")).strip()
    name = str(row.get("name", "")).strip()
    return generate_group_key(ticker, name)


def normalize_special_assets(holdings: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize Cash and other special asset ISINs for proper aggregation.

    Args:
        holdings: DataFrame with asset_class column

    Returns:
        DataFrame with normalized ISINs for special assets
    """
    if holdings.empty:
        return holdings

    holdings = holdings.copy()

    # Ensure asset_class column exists
    if "asset_class" not in holdings.columns:
        return holdings

    cash_mask = holdings["asset_class"] == "Cash"
    holdings.loc[cash_mask, "isin"] = "CASH_USD"
    holdings.loc[cash_mask, "name"] = "Cash & Equivalents"

    return holdings


def aggregate_indirect_holdings(
    all_holdings: pd.DataFrame, exposures: AggregatedExposure
) -> None:
    """
    Group indirect holdings by ID and add to exposure aggregator.

    Args:
        all_holdings: Combined holdings from all ETFs
        exposures: AggregatedExposure instance to add records to
    """
    if all_holdings.empty:
        logger.info("No indirect holdings to aggregate.")
        return

    # Normalize special assets (Cash, etc.)
    all_holdings = normalize_special_assets(all_holdings)

    # Generate group IDs
    all_holdings = all_holdings.copy()
    all_holdings["group_id"] = all_holdings.apply(generate_group_id, axis=1)

    # Also preserve resolution_status if present
    agg_dict = {
        "indirect": ("indirect", "sum"),
        "name": ("name", "first"),
        "isin": ("isin", "first"),
        "asset_class": ("asset_class", "first"),
    }

    if "resolution_status" in all_holdings.columns:
        agg_dict["resolution_status"] = ("resolution_status", "first")

    # Aggregate by group
    aggregated = all_holdings.groupby("group_id").agg(**agg_dict).reset_index()

    # Add to exposures
    for _, row in aggregated.iterrows():
        raw_asset_class = row.get("asset_class", "Equity")
        asset_class: Literal["Equity", "Cash", "Derivative"] = (
            "Cash"
            if raw_asset_class == "Cash"
            else "Derivative"
            if raw_asset_class == "Derivative"
            else "Equity"
        )

        record = exposures.get_or_create_record(
            isin=str(row["group_id"]), name=str(row["name"]), asset_class=asset_class
        )
        record.add_indirect(float(row["indirect"]))

    logger.info("Indirect holdings aggregated.")
