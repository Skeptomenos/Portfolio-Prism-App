from typing import Tuple, cast, Any, Optional
import pandas as pd
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.config import ASSET_UNIVERSE_PATH, WORKING_DIR

logger = get_logger(__name__)

UNIVERSE_PATH = ASSET_UNIVERSE_PATH
HOLDINGS_PATH = WORKING_DIR / "calculated_holdings.csv"


def get_hive_client():
    from portfolio_src.data.hive_client import get_hive_client as real_get_hive_client

    return real_get_hive_client()


def sync_asset_universe_with_hive(force: bool = False) -> None:
    client = get_hive_client()
    client.sync_universe(force=force)


logger = get_logger(__name__)


def load_portfolio_state() -> Tuple[pd.DataFrame, pd.DataFrame]:
    from portfolio_src.data.database import get_positions

    try:
        db_positions = get_positions()
        if not db_positions:
            return pd.DataFrame(), pd.DataFrame()

        df = pd.DataFrame(db_positions)

        direct = cast(pd.DataFrame, df[df["asset_class"].str.upper() != "ETF"].copy())
        etfs = cast(pd.DataFrame, df[df["asset_class"].str.upper() == "ETF"].copy())

        return direct, etfs
    except Exception as e:
        logger.error(f"Failed to load portfolio from database: {e}")
        return pd.DataFrame(), pd.DataFrame()
