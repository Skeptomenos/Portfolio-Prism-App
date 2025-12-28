# phases/shared/validation.py
import pandas as pd
import numpy as np

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def validate_final_report(positions_df: pd.DataFrame, report_df: pd.DataFrame) -> bool:
    """
    Performs a series of checks to validate the integrity of the final report
    against the initial positions.

    Args:
        positions_df: The initial DataFrame of all positions from the database.
        report_df: The final, aggregated true exposure report.

    Returns:
        True if all validations pass, False otherwise.
    """
    logger.info("Validation: Running final checks on the report")
    is_valid = True

    # 1. Value Conservation Check
    initial_total_value = positions_df["market_value"].sum()
    final_total_value = report_df["total_exposure"].sum()

    # We use a relaxed tolerance of 2% (rtol=0.02) to account for:
    # 1. Time lags: ETF NAVs (yesterday) vs Live Stock Prices (today).
    # 2. Cash Drag: Cash components in ETFs often not listed in holdings.
    # 3. Rounding: Weight percentages often truncated to 2 decimals.
    if not np.isclose(initial_total_value, final_total_value, rtol=0.02):
        logger.warning("FAILED: Value Conservation Check")
        logger.warning(f"  Initial total market value: €{initial_total_value:,.2f}")
        logger.warning(f"  Final total exposure value: €{final_total_value:,.2f}")
        logger.warning(f"  Difference: €{final_total_value - initial_total_value:,.2f}")
        is_valid = False
    else:
        logger.info("PASSED: Value Conservation Check (within 2% tolerance)")

    # 2. No Negative Exposures Check
    if (report_df[["direct", "indirect", "total_exposure"]] < 0).any().any():
        logger.warning("FAILED: Negative Exposures Check")
        logger.warning("  Found negative values in one of the exposure columns.")
        is_valid = False
    else:
        logger.info("PASSED: No Negative Exposures Check")

    # 3. Completeness Check (Direct Holdings Only)
    # We only expect DIRECT holdings (Stocks) to remain as ISIN keys in the final report.
    # ETFs are looked through and replaced by their constituents, so they WON'T be in the final list.
    if "asset_type" in positions_df.columns:
        direct_holdings = positions_df[positions_df["asset_type"] != "ETF"]
        initial_direct_isins = set(direct_holdings["isin"])

        # Check if these direct ISINs are present in the report
        report_isins = set(report_df["isin"])
        missing_direct = initial_direct_isins - report_isins

        if missing_direct:
            logger.warning("FAILED: Completeness Check")
            logger.warning(f"  Missing Direct Holdings in report: {missing_direct}")
            is_valid = False
        else:
            logger.info("PASSED: Completeness Check (Direct Holdings verified)")
    else:
        logger.info(
            "SKIPPED: Completeness Check (Missing 'asset_type' in positions data)"
        )

    if is_valid:
        logger.info("Validation Successful")
    else:
        logger.warning("Validation Failed")

    return is_valid


if __name__ == "__main__":
    # Standalone test for the validation module
    mock_positions = pd.DataFrame(
        {"isin": ["A", "B", "C"], "market_value": [100, 200, 300]}
    )

    # Test Case 1: Success
    logger.info("Running Test Case 1: Success")
    mock_report_success = pd.DataFrame(
        {
            "isin": ["A", "B", "C", "D"],
            "direct": [100, 200, 300, 0],
            "indirect": [50, 0, 0, 150],
            "total_exposure": [150, 200, 300, 150],
        }
    )
    # This will fail value conservation, let's fix it
    mock_report_success["total_exposure"] = (
        mock_report_success["direct"] + mock_report_success["indirect"]
    )
    mock_positions["market_value"] = [100, 200, 300]  # Total 600
    mock_report_success = pd.DataFrame(
        {
            "isin": ["A", "B", "C", "D"],
            "direct": [100, 200, 300, 0],
            "indirect": [0, 0, 0, 0],
            "total_exposure": [100, 200, 300, 0],
        }
    )
    validate_final_report(mock_positions, mock_report_success)

    # Test Case 2: Failure
    logger.info("Running Test Case 2: Failure (Value Mismatch)")
    mock_report_fail = pd.DataFrame(
        {
            "isin": ["A", "B", "C"],
            "direct": [100, 200, 250],  # Should be 300
            "indirect": [0, 0, 0],
            "total_exposure": [100, 200, 250],
        }
    )
    validate_final_report(mock_positions, mock_report_fail)
