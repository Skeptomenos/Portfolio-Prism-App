"""Direct holdings processing."""

import pandas as pd

from models import AggregatedExposure
from utils.logging_config import get_logger

logger = get_logger(__name__)


def process_direct_holdings(
    direct_positions: pd.DataFrame, exposures: AggregatedExposure
) -> None:
    """
    Process direct stock holdings and add to exposure aggregator.

    Args:
        direct_positions: DataFrame with columns [isin, name, market_value]
        exposures: AggregatedExposure instance to add records to
    """
    logger.info("Processing direct holdings...")

    if direct_positions.empty:
        logger.info("No direct holdings to process.")
        return

    for _, row in direct_positions.iterrows():
        record = exposures.get_or_create_record(
            isin=str(row["isin"]), name=str(row["name"]), asset_class="Equity"
        )
        record.direct = float(row["market_value"])
        record.sector = "Direct Holding"
        record.geography = "Global"

    logger.info(f"Processed {len(direct_positions)} direct holdings.")
