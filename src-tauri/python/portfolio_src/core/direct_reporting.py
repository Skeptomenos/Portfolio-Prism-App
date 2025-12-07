import pandas as pd
from src.utils.logging_config import get_logger

logger = get_logger(__name__)


def generate_direct_holdings_report(
    all_positions: pd.DataFrame, output_path: str = "outputs/direct_holdings_report.csv"
):
    """
    Generates a simple report of direct holdings (Level 1) with their market values and weights.

    Args:
        all_positions (pd.DataFrame): The joined dataframe containing Universe + Holdings + Prices.
                                      Expected columns: isin, name, ticker_src, asset_type, quantity,
                                      current_price, market_value, provider
        output_path (str): Path to save the CSV.
    """
    logger.info("--- Generating Direct Holdings Report ---")

    if all_positions.empty:
        logger.warning("No positions to report.")
        return

    # Create a clean copy
    df = all_positions.copy()

    # Ensure Market Value is float
    df["market_value"] = df["market_value"].fillna(0.0).astype(float)

    # Calculate Total
    total_value = df["market_value"].sum()

    if total_value == 0:
        logger.warning("Total Portfolio Value is 0. Cannot calculate weights.")
        df["portfolio_weight"] = 0.0
    else:
        df["portfolio_weight"] = df["market_value"] / total_value

    # Select and Rename Columns for Output
    cols_to_keep = [
        "isin",
        "name",
        "ticker_src",
        "asset_type",
        "quantity",
        "current_price",
        "market_value",
        "portfolio_weight",
        "provider",
    ]

    # Filter columns that actually exist (robustness)
    existing_cols = [c for c in cols_to_keep if c in df.columns]
    out_df = df[existing_cols].copy()

    # Sort by Value (High to Low)
    out_df = out_df.sort_values(by="market_value", ascending=False)

    # Formatting (Optional, but good for CSV readability if viewed in text editor)
    # We keep raw numbers for CSV, but maybe we round for cleanliness?
    # Let's keep full precision for audit.

    # Save
    out_df.to_csv(output_path, index=False)
    logger.info(f"Direct Holdings Report saved to: {output_path}")
    logger.info(f"Total Portfolio Value (Level 1): €{total_value:,.2f}")
