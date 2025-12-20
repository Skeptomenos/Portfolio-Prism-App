import math
import os
from datetime import date
from typing import Any, List, Optional, Tuple, cast

import pandas as pd
from pydantic import ValidationError

from portfolio_src.models import DirectPosition, ETFPosition
from portfolio_src.core.utils import SchemaNormalizer
from portfolio_src.data.hive_client import get_hive_client
from portfolio_src.prism_utils.logging_config import get_logger

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


from portfolio_src.config import ASSET_UNIVERSE_PATH, WORKING_DIR

# Paths
UNIVERSE_PATH = ASSET_UNIVERSE_PATH
HOLDINGS_PATH = (
    WORKING_DIR / "calculated_holdings.csv"
)  # Calculated from PDF parser/TR Sync


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


def sync_asset_universe_with_hive(force: bool = False) -> None:
    """
    Synchronize the local asset universe CSV with the Supabase Hive.

    Args:
        force: If True, ignore cache and force download
    """
    hive_client = get_hive_client()
    if not hive_client.is_configured:
        logger.debug("Hive not configured, skipping asset universe sync")
        return

    logger.info("Synchronizing asset universe with Hive...")
    result = hive_client.sync_universe(force=force)

    if not result.success:
        logger.warning(f"Failed to sync asset universe with Hive: {result.error}")
        return

    # Load existing universe to merge
    if os.path.exists(UNIVERSE_PATH):
        try:
            df_local = pd.read_csv(UNIVERSE_PATH)
        except Exception as e:
            logger.error(f"Failed to read local universe for sync: {e}")
            df_local = pd.DataFrame()
    else:
        df_local = pd.DataFrame()

    # Map Hive entries to CSV schema
    hive_entries = []
    today = date.today().isoformat()

    for isin, asset in hive_client._universe_cache.items():
        hive_entries.append(
            {
                "ISIN": asset.isin,
                "TR_Ticker": "",  # Not in Hive yet
                "Yahoo_Ticker": asset.ticker or "",
                "Name": asset.name,
                "Aliases": "",
                "Provider": "",
                "Asset_Class": asset.asset_class,
                "Source": "hive",
                "Added_Date": asset.last_updated or today,
                "Last_Verified": asset.last_updated or today,
            }
        )

    if not hive_entries:
        return

    df_hive = pd.DataFrame(hive_entries)

    if df_local.empty:
        df_final = df_hive
    else:
        # Merge: Hive data takes precedence for common ISINs
        # We use ISIN as the key
        df_local = df_local.set_index("ISIN")
        df_hive = df_hive.set_index("ISIN")

        df_local.update(df_hive)

        # Add new ISINs from hive
        new_isins = df_hive.index.difference(df_local.index)
        if not new_isins.empty:
            df_local = pd.concat([df_local, df_hive.loc[new_isins]])

        df_final = df_local.reset_index()

    # Save back to CSV
    try:
        df_final.to_csv(UNIVERSE_PATH, index=False)
        logger.info(f"Asset universe synchronized: {len(df_final)} total entries")
    except Exception as e:
        logger.error(f"Failed to save synchronized asset universe: {e}")


def load_portfolio_state():
    """
    Loads the portfolio state from the Relational CSVs (Universe + Holdings).
    Prioritizes the new model, falls back to legacy if needed.

    Auto-adds unmapped ISINs to the universe using TR_Name as fallback.

    Returns:
        (direct_positions, etf_positions) - Tuple of DataFrames
    """
    # Sync with Hive first (non-blocking/graceful)
    try:
        sync_asset_universe_with_hive()
    except Exception as e:
        logger.warning(f"Asset universe sync failed: {e}")

    # 1. Strategy: SQLite Database (Primary)
    try:
        from portfolio_src.data.database import get_positions

        db_positions = get_positions()

        if db_positions:
            logger.info(
                f"Loading {len(db_positions)} positions from SQLite Database..."
            )

            # Convert DB dicts to DataFrame with expected columns
            df = pd.DataFrame(db_positions)

            # DB has columns: isin, quantity, cost_basis, current_price, name, symbol, asset_class...
            # Pipeline expects: isin, name, quantity, asset_type, ticker_src, provider, avg_cost, tr_price

            # Rename for pipeline compatibility
            df_clean = df.rename(
                columns={
                    "asset_class": "asset_type",
                    "cost_basis": "avg_cost",
                    "current_price": "tr_price",
                    "tr_ticker": "ticker_src",  # If available
                }
            )

            # Ensure required columns exist
            required_cols = [
                "isin",
                "name",
                "quantity",
                "asset_type",
                "avg_cost",
                "tr_price",
            ]
            for col in required_cols:
                if col not in df_clean.columns:
                    df_clean[col] = None

            # Fill missing
            df_clean["name"] = df_clean["name"].fillna("Unknown Asset")
            df_clean["asset_type"] = df_clean["asset_type"].fillna("Stock")

            # Apply Heuristics: Map "Equity" to "Stock" or "ETF" based on name
            # The DB currently stores everything as "Equity" if not specified
            def refine_asset_type(row):
                current_type = str(row["asset_type"])
                name = str(row["name"]).lower()

                if current_type == "Equity":
                    is_etf_name = any(
                        k in name
                        for k in [
                            "etf",
                            "ishares",
                            "msci",
                            "s&p",
                            "nasdaq",
                            "stoxx",
                            "core",
                            "amundi",
                            "vanguard",
                        ]
                    )
                    return "ETF" if is_etf_name else "Stock"
                return current_type

            df_clean["asset_type"] = df_clean.apply(refine_asset_type, axis=1)

            # Split
            direct_positions = df_clean[df_clean["asset_type"] == "Stock"].copy()
            etf_positions = df_clean[df_clean["asset_type"] == "ETF"].copy()

            logger.info(
                f"Loaded {len(direct_positions)} Stocks and {len(etf_positions)} ETFs from database."
            )

            # Validate
            direct_positions = _validate_positions(
                cast(pd.DataFrame, direct_positions), asset_type="Stock"
            )
            etf_positions = _validate_positions(
                cast(pd.DataFrame, etf_positions), asset_type="ETF"
            )

            return direct_positions, etf_positions

    except Exception as e:
        logger.warning(f"Failed to load from DB: {e}. Falling back to CSV.")

    # 2. Strategy: Legacy CSV (Fallback)
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
                _auto_add_to_universe(cast(pd.DataFrame, unmapped), df_uni)

                # Reload universe and re-merge
                df_uni = pd.read_csv(UNIVERSE_PATH)
                df = pd.merge(df_hold, df_uni, on="ISIN", how="left")

            return _process_csv_dataframe(df)

        else:
            logger.warning(f"Calculated holdings file not found: {HOLDINGS_PATH}")
            return pd.DataFrame(), pd.DataFrame()

    else:
        logger.warning("No portfolio state found (DB empty, CSV missing).")
        return pd.DataFrame(), pd.DataFrame()


def _process_csv_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Helper to process DataFrame from CSV source.
    Adapts legacy CSV schema to Pipeline schema.
    """
    # Normalize schema using SchemaNormalizer
    normalized_df = SchemaNormalizer.normalize_columns(df)

    # Ensure required columns exist with proper mappings
    column_mapping = {
        "ISIN": "isin",
        "Name": "name",
        "Quantity": "quantity",
        "Asset_Class": "asset_type",
        "Yahoo_Ticker": "ticker_src",
        "Provider": "provider",
        "AvgCost": "avg_cost",
        "CurrentPrice": "tr_price",
        "NetValue": "tr_value",
    }

    # Apply any remaining manual mappings
    for old_col, new_col in column_mapping.items():
        if old_col in normalized_df.columns and new_col not in normalized_df.columns:
            normalized_df = normalized_df.rename(columns={old_col: new_col})

    # Fill NAs
    normalized_df["name"] = normalized_df["name"].fillna("Unknown Asset")
    normalized_df["asset_type"] = normalized_df["asset_type"].fillna("Stock")

    # Ensure performance columns exist
    for col in ["avg_cost", "tr_price", "tr_value"]:
        if col not in normalized_df.columns:
            normalized_df[col] = None

    # Split
    direct_positions = normalized_df[normalized_df["asset_type"] == "Stock"].copy()
    etf_positions = normalized_df[normalized_df["asset_type"] == "ETF"].copy()

    logger.info(
        f"Loaded {len(direct_positions)} Stocks and {len(etf_positions)} ETFs from CSV source."
    )

    # Validate positions using Pydantic models
    direct_positions = _validate_positions(
        cast(pd.DataFrame, direct_positions), asset_type="Stock"
    )
    etf_positions = _validate_positions(
        cast(pd.DataFrame, etf_positions), asset_type="ETF"
    )

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
    validated_df = cast(pd.DataFrame, df.loc[valid_indices].copy())
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
                    isin=cast(str, row["isin"]),
                    name=cast(str, row["name"]),
                    quantity=cast(float, row["quantity"]),
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
                    isin=cast(str, row["isin"]),
                    name=cast(str, row["name"]),
                    quantity=cast(float, row["quantity"]),
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
