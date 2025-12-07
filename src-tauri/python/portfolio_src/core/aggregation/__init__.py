"""
Aggregation module for portfolio exposure calculation (v2).

This module decomposes ETF holdings and aggregates all exposures
(direct + indirect) into a single report.

Public API:
    run_aggregation(direct_positions, etf_positions, etf_holdings_map) -> DataFrame
"""

from typing import Dict

import pandas as pd

from config import HOLDINGS_BREAKDOWN_PATH, TRUE_EXPOSURE_REPORT
from models import AggregatedExposure
from utils.logging_config import get_logger

from .classification import classify_etf_holdings
from .direct import process_direct_holdings
from .enrichment import enrich_etf_holdings, reset_resolver, set_gap_collector
from .grouping import aggregate_indirect_holdings, calculate_indirect_values
from .output import finalize_and_save

logger = get_logger(__name__)

__all__ = ["run_aggregation"]


def run_aggregation(
    direct_positions: pd.DataFrame,
    etf_positions: pd.DataFrame,
    etf_holdings_map: Dict[str, pd.DataFrame],
) -> pd.DataFrame:
    """
    Run the entire exposure aggregation process.

    This function:
    1. Processes direct stock holdings
    2. Decomposes ETF holdings via classification, enrichment, and value calculation
    3. Aggregates all exposures by security
    4. Saves results to CSV

    Args:
        direct_positions: DataFrame with columns [isin, name, market_value]
        etf_positions: DataFrame with columns [isin, name, market_value]
        etf_holdings_map: Dict mapping ETF ISIN to holdings DataFrame

    Returns:
        DataFrame with aggregated true exposure per security
    """
    output_filepath = str(TRUE_EXPOSURE_REPORT)

    if direct_positions.empty and etf_positions.empty:
        logger.warning("No positions found. Exiting aggregation.")
        return pd.DataFrame()

    # Initialize aggregator
    exposures = AggregatedExposure()

    # Calculate True Portfolio Value (Top-Down) for correct percentage calculations
    # This prevents "leakage" from decomposition affecting portfolio-wide stats
    direct_val = (
        direct_positions["market_value"].sum() if not direct_positions.empty else 0.0
    )
    etf_val = etf_positions["market_value"].sum() if not etf_positions.empty else 0.0
    true_total = direct_val + etf_val

    exposures.true_total_value = true_total
    logger.info(
        f"Aggregation initialized with True Portfolio Value: €{true_total:,.2f}"
    )

    # Step 1: Process direct holdings
    process_direct_holdings(direct_positions, exposures)

    # Step 2: Process ETF holdings
    logger.info("Processing indirect holdings (via ETFs)...")
    logger.info(f"Total ETFs to process: {len(etf_positions)}")

    all_holdings = pd.DataFrame()

    # Calculate total portfolio value for weight calculations
    total_portfolio_value = etf_positions["market_value"].sum() + (
        direct_positions["market_value"].sum() if not direct_positions.empty else 0
    )

    if not etf_positions.empty:
        for etf in etf_positions.to_dict("records"):
            etf_isin = etf["isin"]
            etf_name = etf["name"]
            etf_market_value = etf["market_value"]

            # Calculate ETF weight in portfolio
            etf_portfolio_weight = (
                (etf_market_value / total_portfolio_value * 100)
                if total_portfolio_value > 0
                else 0.0
            )

            logger.info(
                f"  - Processing ETF: {etf_name} "
                f"(ISIN: {etf_isin}, Value: €{etf_market_value:,.2f})"
            )

            # Get holdings for this ETF
            holdings = etf_holdings_map.get(etf_isin)
            if holdings is None or holdings.empty:
                logger.warning(f"    - No holdings found for {etf_isin}. Skipping.")
                continue

            # Process: Classify -> Enrich -> Calculate values
            holdings = holdings.copy()
            holdings = classify_etf_holdings(holdings)
            holdings = enrich_etf_holdings(
                holdings,
                etf_market_value,
                etf_isin=etf_isin,
                etf_name=etf_name,
                etf_portfolio_weight=etf_portfolio_weight,
            )
            holdings = calculate_indirect_values(holdings, etf_market_value)

            # Add Parent Info for Lineage/Drill-down
            holdings["parent_isin"] = etf_isin
            holdings["parent_name"] = etf["name"]
            holdings["source"] = "ETF"

            # Debug: log large holdings
            _log_large_holdings(holdings, etf_isin, etf["name"])

            # Accumulate
            all_holdings = pd.concat([all_holdings, holdings], ignore_index=True)

    # Save detailed breakdown (Direct + Indirect)
    breakdown_df = all_holdings.copy()

    # Add Direct Holdings to breakdown
    if not direct_positions.empty:
        direct_rows = direct_positions.copy()
        direct_rows["parent_isin"] = "DIRECT"
        direct_rows["parent_name"] = "Direct Portfolio"
        direct_rows["source"] = "Direct"
        # Map market_value to 'indirect' to share the "Value" column concept
        direct_rows["indirect"] = direct_rows["market_value"]
        # Direct holdings effectively have 100% weight of themselves, but usually weight refers to parent
        direct_rows["weight_percentage"] = 0.0  # Not really applicable in the same way

        breakdown_df = pd.concat([breakdown_df, direct_rows], ignore_index=True)

    if not breakdown_df.empty:
        try:
            # Select and rename columns for clarity
            cols_to_keep = [
                "parent_isin",
                "parent_name",
                "source",
                "isin",
                "name",
                "asset_class",
                "sector",
                "geography",
                "weight_percentage",
                "indirect",
            ]
            # Ensure columns exist (direct might miss some)
            for col in cols_to_keep:
                if col not in breakdown_df.columns:
                    breakdown_df[col] = None

            output_breakdown = breakdown_df[cols_to_keep].rename(
                columns={
                    "isin": "child_isin",
                    "name": "child_name",
                    "indirect": "value_eur",
                    "weight_percentage": "weight_percent",
                }
            )

            output_breakdown.to_csv(HOLDINGS_BREAKDOWN_PATH, index=False)
            logger.info(
                f"Saved detailed holdings breakdown to {HOLDINGS_BREAKDOWN_PATH}"
            )
        except Exception as e:
            logger.error(f"Failed to save breakdown CSV: {e}")

    # Step 3: Aggregate all indirect holdings
    aggregate_indirect_holdings(all_holdings, exposures)

    # Step 4: Flush resolver (writes newly resolved ISINs to universe)
    reset_resolver()

    # Step 5: Finalize and save
    return finalize_and_save(exposures, output_filepath)


def _log_large_holdings(holdings: pd.DataFrame, etf_isin: str, etf_name: str) -> None:
    """Log holdings with indirect value > €1000 for debugging."""
    if "indirect" not in holdings.columns:
        return

    large = holdings[holdings["indirect"] > 1000]
    if large.empty:
        return

    logger.info(f"🔎 FOUND LARGE HOLDING in ETF {etf_isin} ({etf_name}):")
    for _, row in large.iterrows():
        weight = row.get("weight_percentage", 0)
        indirect = row.get("indirect", 0)
        name = row.get("name", "Unknown")
        isin = row.get("isin", "No ISIN")
        logger.info(f"    -> {name} ({isin}): {weight:.2f}% = €{indirect:,.2f}")
