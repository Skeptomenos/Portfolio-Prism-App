"""
Reporting module for portfolio exposure analysis.

Loads the aggregated exposure report, enriches resolved holdings
with sector/geography metadata, and generates analysis files.

Key changes in v2:
- Only enrich holdings with resolution_status == 'resolved'
- Generate separate unresolved_holdings.csv for user action
- Never pass UNRESOLVED:... patterns to external APIs
"""

import pandas as pd
from typing import Optional

from data.enrichment import enrich_securities
from utils.isin_validator import is_valid_isin
from utils.logging_config import get_logger

logger = get_logger(__name__)


def generate_report(
    input_filepath: str = "outputs/true_exposure_report.csv",
    total_portfolio_value: Optional[float] = None,
) -> None:
    """
    Load aggregated exposure report, enrich, and generate analysis files.

    Args:
        input_filepath: Path to the aggregated CSV report
        total_portfolio_value: Optional true total value of the portfolio.
                               If not provided, uses sum of exposed assets.
    """
    logger.info(f"--- Generating analysis from {input_filepath} ---")

    try:
        # Load the main report
        exposure_df = pd.read_csv(input_filepath)
        logger.info(f"  - Loaded exposure report with {len(exposure_df)} entries.")

        # Separate resolved and unresolved holdings
        resolved_df, unresolved_df = _split_by_resolution(exposure_df)

        logger.info(
            f"  - Resolved: {len(resolved_df)}, Unresolved: {len(unresolved_df)}"
        )

        # Generate unresolved report for user action
        if not unresolved_df.empty:
            _generate_unresolved_report(unresolved_df)

        # Only enrich resolved holdings with valid ISINs
        if resolved_df.empty:
            logger.warning("  - No resolved holdings to enrich.")
            final_df = exposure_df.copy()
        else:
            final_df = _enrich_resolved_holdings(resolved_df, unresolved_df)

        # Fill missing metadata
        final_df = _fill_missing_metadata(final_df)

        # Save enriched report
        _save_enriched_report(final_df)

        # Generate analysis reports
        calc_total = total_portfolio_value or final_df["total_exposure"].sum()
        _generate_analysis_reports(final_df, calc_total)

    except FileNotFoundError:
        logger.error(f"Input file not found at {input_filepath}")
    except Exception as e:
        logger.error(f'Error during reporting: "{e}"')
        raise


def _split_by_resolution(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split DataFrame into resolved and unresolved holdings.

    Uses resolution_status column if present, otherwise checks ISIN validity.
    """
    if "resolution_status" in df.columns:
        resolved_mask = df["resolution_status"] == "resolved"
    else:
        # Fallback: check ISIN validity
        resolved_mask = df["isin"].apply(
            lambda x: is_valid_isin(str(x)) if pd.notna(x) else False
        )

    return df[resolved_mask].copy(), df[~resolved_mask].copy()


def _generate_unresolved_report(unresolved_df: pd.DataFrame) -> None:
    """
    Generate actionable report of unresolved holdings.

    Sorted by total_exposure descending so users can prioritize.
    """
    # Sort by value (highest first)
    sorted_df = unresolved_df.sort_values("total_exposure", ascending=False)

    # Select relevant columns
    output_cols = ["isin", "name", "total_exposure", "asset_class"]
    if "resolution_status" in sorted_df.columns:
        output_cols.append("resolution_status")

    output = sorted_df[[c for c in output_cols if c in sorted_df.columns]].copy()
    output = output.rename(columns={"isin": "group_key"})

    output.to_csv("outputs/unresolved_holdings.csv", index=False)
    logger.info(
        f"  - Saved {len(output)} unresolved holdings to outputs/unresolved_holdings.csv"
    )

    # Log top 5 for visibility
    if len(output) > 0:
        logger.info("  - Top 5 unresolved by value:")
        for i, (_, row) in enumerate(output.head(5).iterrows()):
            value = row.get("total_exposure", 0)
            name = row.get("name", "Unknown")
            logger.info(f"      {i + 1}. {name}: €{value:,.2f}")


def _enrich_resolved_holdings(
    resolved_df: pd.DataFrame,
    unresolved_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Enrich resolved holdings with sector/geography metadata.

    Only sends valid ISINs to the enrichment API.
    """
    # Filter to valid ISINs only
    valid_mask = resolved_df["isin"].apply(
        lambda x: is_valid_isin(str(x)) if pd.notna(x) else False
    )
    valid_df = resolved_df[valid_mask].copy()

    if valid_df.empty:
        logger.warning("  - No valid ISINs to enrich.")
        return pd.concat([resolved_df, unresolved_df], ignore_index=True)

    # Get unique ISINs for enrichment
    unique_isins = valid_df["isin"].drop_duplicates().tolist()
    securities_to_enrich = [{"isin": isin} for isin in unique_isins]

    logger.info(f"  - Enriching {len(securities_to_enrich)} unique ISINs...")

    enriched_data = enrich_securities(securities_to_enrich)

    if not enriched_data:
        logger.warning("  - Enrichment returned no data.")
        return pd.concat([resolved_df, unresolved_df], ignore_index=True)

    # Merge enrichment back
    enriched_df = pd.DataFrame(enriched_data)

    # Rename columns to avoid conflicts
    if "name" in enriched_df.columns:
        enriched_df = enriched_df.rename(columns={"name": "enriched_name"})

    merged = pd.merge(resolved_df, enriched_df, on="isin", how="left")

    # Combine with unresolved (no enrichment for those)
    final_df = pd.concat([merged, unresolved_df], ignore_index=True)

    return final_df


def _fill_missing_metadata(df: pd.DataFrame) -> pd.DataFrame:
    """Fill missing sector/geography based on asset class."""
    df = df.copy()

    # Ensure columns exist
    if "sector" not in df.columns:
        df["sector"] = None
    if "geography" not in df.columns:
        df["geography"] = None

    # Fill based on asset class
    if "asset_class" in df.columns:
        # Cash
        cash_mask = df["asset_class"] == "Cash"
        df.loc[cash_mask, "sector"] = df.loc[cash_mask, "sector"].fillna(
            "Cash & Equivalents"
        )
        df.loc[cash_mask, "geography"] = df.loc[cash_mask, "geography"].fillna("Global")

        # Derivatives
        deriv_mask = df["asset_class"] == "Derivative"
        df.loc[deriv_mask, "sector"] = df.loc[deriv_mask, "sector"].fillna(
            "Derivatives"
        )
        df.loc[deriv_mask, "geography"] = df.loc[deriv_mask, "geography"].fillna(
            "Global"
        )

    # Fill remaining gaps
    df["sector"] = df["sector"].fillna("Unknown")
    df["geography"] = df["geography"].fillna("Unknown")

    return df


def _save_enriched_report(df: pd.DataFrame) -> None:
    """Save the enriched exposure report."""
    # Determine columns to include
    base_cols = [
        "isin",
        "name",
        "asset_class",
        "resolution_status",
        "sector",
        "geography",
        "direct",
        "indirect",
        "total_exposure",
        "portfolio_percentage",
    ]

    # Only include columns that exist
    output_cols = [c for c in base_cols if c in df.columns]

    # Handle name column (may be name_x or name_y from merge)
    if "name" not in df.columns:
        if "name_x" in df.columns:
            df["name"] = df["name_x"]
        elif "name_y" in df.columns:
            df["name"] = df["name_y"]

    output = df[[c for c in output_cols if c in df.columns]].copy()
    output.to_csv("outputs/enriched_exposure_report.csv", index=False)
    logger.info("  - Enriched report saved to outputs/enriched_exposure_report.csv")


def _generate_analysis_reports(df: pd.DataFrame, total_value: float) -> None:
    """Generate sector, geography, and top holdings reports."""
    logger.info(f"  - Using Total Portfolio Value: €{total_value:,.2f}")

    # Fill NaN values for aggregation
    df = df.copy()
    df["total_exposure"] = df["total_exposure"].fillna(0.0)
    df["direct"] = df["direct"].fillna(0.0)
    df["indirect"] = df["indirect"].fillna(0.0)

    # 1. Top 10 Holdings
    top_10 = df.nlargest(10, "total_exposure")
    top_10.to_csv("outputs/top_10_holdings.csv", index=False)
    logger.info("  - Top 10 holdings report generated.")

    # 2. Sector Exposure
    sector_exp = df.groupby("sector")["total_exposure"].sum().reset_index()
    if total_value > 0:
        sector_exp["portfolio_percentage"] = (
            sector_exp["total_exposure"] / total_value * 100
        )
    else:
        sector_exp["portfolio_percentage"] = 0.0
    sector_exp.to_csv("outputs/sector_exposure.csv", index=False)
    logger.info("  - Sector exposure report generated.")

    # 3. Geography Exposure
    geo_exp = df.groupby("geography")["total_exposure"].sum().reset_index()
    if total_value > 0:
        geo_exp["portfolio_percentage"] = geo_exp["total_exposure"] / total_value * 100
    else:
        geo_exp["portfolio_percentage"] = 0.0
    geo_exp.to_csv("outputs/geography_exposure.csv", index=False)
    logger.info("  - Geography exposure report generated.")


if __name__ == "__main__":
    generate_report()
