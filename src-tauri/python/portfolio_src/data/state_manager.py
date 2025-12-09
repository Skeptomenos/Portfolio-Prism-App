import math
import os
from datetime import date
from typing import Any, List, Optional, Tuple

import pandas as pd
from pydantic import ValidationError

from models import DirectPosition, ETFPosition
from prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def _to_optional_str(value: Any) -> Optional[str]:
    """Convert pandas value to optional string, handling NaN."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    return str(value) if value else None


from ..config import ASSET_UNIVERSE_PATH, WORKING_DIR

# Paths
UNIVERSE_PATH = ASSET_UNIVERSE_PATH
HOLDINGS_PATH = WORKING_DIR / "calculated_holdings.csv"  # Calculated from PDF parser/TR Sync


def _auto_add_to_universe(unmapped_df: pd.DataFrame, universe_df: pd.DataFrame) -> None:
    """
    Auto-add unmapped ISINs to the asset universe using TR_Name as the name.

    This ensures the universe grows to include all positions from Trade Republic,
    making it the ultimate source of truth for asset metadata.

    Args:
        unmapped_df: DataFrame of holdings that couldn't be mapped to universe
        universe_df: Current universe DataFrame (for column reference)
    """
    new_entries = []
    today = date.today().isoformat()

    for _, row in unmapped_df.iterrows():
        isin = row.get("ISIN", "")
        tr_name = row.get("TR_Name", "Unknown")

        if not isin:
            continue

        # Determine asset class heuristically
        # ETF ISINs typically start with IE, LU, DE (for European ETFs)
        # and often have "ETF" or fund-like names
        name_lower = str(tr_name).lower()
        is_etf = any(
            keyword in name_lower
            for keyword in ["etf", "ishares", "msci", "s&p", "nasdaq", "stoxx", "core"]
        )
        asset_class = "ETF" if is_etf else "Stock"

        new_entry = {
            "ISIN": isin,
            "TR_Ticker": "",  # Unknown, can be enriched later
            "Yahoo_Ticker": "",  # Unknown, can be enriched later
            "Name": tr_name,
            "Aliases": "",
            "Provider": "ishares" if "ishares" in name_lower else "",
            "Asset_Class": asset_class,
            "Source": "auto_tr",
            "Added_Date": today,
            "Last_Verified": "",
        }
        new_entries.append(new_entry)
        logger.info(f"  Auto-adding to universe: {isin} ({tr_name}) as {asset_class}")

    if new_entries:
        # Append to universe CSV
        new_df = pd.DataFrame(new_entries)

        # Ensure columns match universe
        for col in universe_df.columns:
            if col not in new_df.columns:
                new_df[col] = ""

        # Reorder columns to match universe
        new_df = new_df[universe_df.columns]

        # Append to file
        new_df.to_csv(UNIVERSE_PATH, mode="a", header=False, index=False)
        logger.info(f"Added {len(new_entries)} new entries to asset universe.")


def load_portfolio_state():
    """
    Loads the portfolio state from the Relational CSVs (Universe + Holdings).
    Prioritizes the new model, falls back to legacy if needed.

    Auto-adds unmapped ISINs to the universe using TR_Name as fallback.

    Returns:
        (direct_positions, etf_positions) - Tuple of DataFrames
    """
    # 1. Strategy: Relational Model
    if os.path.exists(UNIVERSE_PATH):
        if os.path.exists(HOLDINGS_PATH):
            logger.info(
                f"Loading portfolio from Calculated Holdings ({HOLDINGS_PATH})..."
            )
            df_uni = pd.read_csv(UNIVERSE_PATH)
            df_hold = pd.read_csv(HOLDINGS_PATH)

            # Merge on ISIN
            df = pd.merge(df_hold, df_uni, on="ISIN", how="left")

            # Check for unmapped assets and auto-add to universe
            unmapped = df[df["Name"].isna()]
            if not unmapped.empty:
                logger.warning(
                    f"{len(unmapped)} assets in Holdings not in Universe. Auto-adding..."
                )
                _auto_add_to_universe(unmapped, df_uni)

                # Reload universe and re-merge
                df_uni = pd.read_csv(UNIVERSE_PATH)
                df = pd.merge(df_hold, df_uni, on="ISIN", how="left")

                # Verify all mapped now
                still_unmapped = df[df["Name"].isna()]
                if not still_unmapped.empty:
                    logger.error(
                        f"{len(still_unmapped)} assets still unmapped after auto-add!"
                    )
        else:
            logger.warning(f"Calculated holdings file not found: {HOLDINGS_PATH}")
            logger.warning(
                "Please run the PDF parser first: python -m scripts.parse_pdfs_to_csv"
            )
            return pd.DataFrame(), pd.DataFrame()

    else:
        logger.warning("No portfolio state found.")
        return pd.DataFrame(), pd.DataFrame()

    # 2. Standardize for Pipeline
    # Pipeline expects columns: isin, name, quantity, asset_type, ticker_src, provider

    # Rename columns to match pipeline standard (lowercase)
    # Universe has: ISIN, TR_Ticker, Yahoo_Ticker, Name, Provider, Asset_Class
    # Holdings has: ISIN, Quantity

    df_clean = df.rename(
        columns={
            "ISIN": "isin",
            "Name": "name",
            "Quantity": "quantity",
            "Asset_Class": "asset_type",
            "Yahoo_Ticker": "ticker_src",  # Important for market.py
            "Provider": "provider",
            # Performance fields from pytr (if available)
            "AvgCost": "avg_cost",
            "CurrentPrice": "tr_price",
            "NetValue": "tr_value",
        }
    )

    # Fill NAs
    df_clean["name"] = df_clean["name"].fillna("Unknown Asset")
    df_clean["asset_type"] = df_clean["asset_type"].fillna("Stock")

    # Ensure performance columns exist (may be missing in old CSV format)
    for col in ["avg_cost", "tr_price", "tr_value"]:
        if col not in df_clean.columns:
            df_clean[col] = None

    # Split
    direct_positions = df_clean[df_clean["asset_type"] == "Stock"].copy()
    etf_positions = df_clean[df_clean["asset_type"] == "ETF"].copy()

    logger.info(
        f"Loaded {len(direct_positions)} Stocks and {len(etf_positions)} ETFs from database."
    )

    # Validate positions using Pydantic models
    direct_positions = _validate_positions(direct_positions, asset_type="Stock")
    etf_positions = _validate_positions(etf_positions, asset_type="ETF")

    return direct_positions, etf_positions


def _validate_positions(df: pd.DataFrame, asset_type: str) -> pd.DataFrame:
    """
    Validate DataFrame rows against Pydantic Position model.

    Logs validation errors but keeps valid rows to maintain pipeline continuity.
    Invalid rows are dropped with a warning.

    Args:
        df: DataFrame with position data
        asset_type: Expected asset type ("Stock" or "ETF")

    Returns:
        DataFrame with only valid positions
    """
    if df.empty:
        return df

    valid_indices = []
    validation_errors = []

    for idx, row in df.iterrows():
        try:
            # Build position dict from row, converting NaN to None for optional fields
            position_data = {
                "isin": row.get("isin", ""),
                "name": row.get("name", "Unknown"),
                "quantity": row.get("quantity", 0),
                "asset_type": asset_type,
                "ticker_src": _to_optional_str(row.get("ticker_src")),
                "provider": _to_optional_str(row.get("provider")),
            }

            # Validate using appropriate model
            if asset_type == "ETF":
                ETFPosition(**position_data)
            else:
                DirectPosition(**position_data)

            valid_indices.append(idx)

        except ValidationError as e:
            isin = row.get("isin", "unknown")
            validation_errors.append((isin, str(e)))

    # Log validation summary
    if validation_errors:
        logger.warning(
            f"Validation errors in {len(validation_errors)} {asset_type} positions:"
        )
        for isin, error in validation_errors[:5]:  # Show first 5
            logger.warning(f"  - {isin}: {error}")
        if len(validation_errors) > 5:
            logger.warning(f"  ... and {len(validation_errors) - 5} more")

    # Return only valid rows
    validated_df = df.loc[valid_indices].copy()
    logger.debug(
        f"Validated {len(validated_df)}/{len(df)} {asset_type} positions successfully."
    )

    return validated_df


def load_positions_as_models() -> Tuple[List[DirectPosition], List[ETFPosition]]:
    """
    Load portfolio positions as typed Pydantic model instances.

    Alternative to load_portfolio_state() for when you need strongly-typed
    Position objects instead of DataFrames.

    Returns:
        Tuple of (direct_positions, etf_positions) as lists of Position models
    """
    direct_df, etf_df = load_portfolio_state()

    direct_positions: List[DirectPosition] = []
    etf_positions: List[ETFPosition] = []

    for _, row in direct_df.iterrows():
        try:
            direct_positions.append(
                DirectPosition(
                    isin=row["isin"],
                    name=row["name"],
                    quantity=row["quantity"],
                    asset_type="Stock",
                    ticker_src=_to_optional_str(row.get("ticker_src")),
                    provider=_to_optional_str(row.get("provider")),
                )
            )
        except ValidationError:
            pass  # Already logged in load_portfolio_state

    for _, row in etf_df.iterrows():
        try:
            etf_positions.append(
                ETFPosition(
                    isin=row["isin"],
                    name=row["name"],
                    quantity=row["quantity"],
                    asset_type="ETF",
                    ticker_src=_to_optional_str(row.get("ticker_src")),
                    provider=_to_optional_str(row.get("provider")),
                )
            )
        except ValidationError:
            pass  # Already logged in load_portfolio_state

    logger.info(
        f"Created {len(direct_positions)} DirectPosition and {len(etf_positions)} ETFPosition models."
    )

    return direct_positions, etf_positions
