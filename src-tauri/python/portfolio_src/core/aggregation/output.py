"""Output formatting and file saving."""

import pandas as pd

from models import AggregatedExposure
from prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def finalize_and_save(
    exposures: AggregatedExposure, output_filepath: str
) -> pd.DataFrame:
    """
    Calculate totals, format output DataFrame, and save to CSV.

    Args:
        exposures: Aggregated exposure data
        output_filepath: Path to save CSV

    Returns:
        Final DataFrame with portfolio percentages
    """
    logger.info("--- Finalizing and Formatting Output ---")

    exposures.calculate_total()

    if not exposures.records:
        logger.warning("No holdings to process. Output file will be empty.")
        empty_df = pd.DataFrame(
            columns=[
                "isin",
                "name",
                "direct",
                "indirect",
                "total_exposure",
                "portfolio_percentage",
            ]
        )
        empty_df.to_csv(output_filepath, index=False)
        return empty_df

    final_df = exposures.to_dataframe()
    final_df.to_csv(output_filepath, index=False)
    logger.info(f"Report saved to {output_filepath}")

    return final_df
