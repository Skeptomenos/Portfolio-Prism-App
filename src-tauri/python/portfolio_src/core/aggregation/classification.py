"""Asset classification for ETF holdings."""

import pandas as pd

from utils.classification import classify_holding
from utils.logging_config import get_logger

logger = get_logger(__name__)


def classify_etf_holdings(holdings: pd.DataFrame) -> pd.DataFrame:
    """
    Classify ETF holdings as Equity, Cash, or Derivative.

    Args:
        holdings: DataFrame with columns [ticker, name, ...]

    Returns:
        DataFrame with added 'asset_class' column
    """
    holdings = holdings.copy()

    holdings["asset_class"] = holdings.apply(
        lambda x: classify_holding(x.get("ticker", ""), x.get("name", "")),
        axis=1,
    )

    non_equity_count = len(holdings[holdings["asset_class"] != "Equity"])
    if non_equity_count > 0:
        logger.info(
            f"    - Classified {non_equity_count} rows as Non-Equity (Cash/Derivatives)."
        )

    return holdings
