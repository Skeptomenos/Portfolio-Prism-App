"""
Harvesting module - pushes enrichment cache data to Hive.
"""

import json
import os
from typing import Set

from portfolio_src.config import ENRICHMENT_CACHE_PATH
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.prism_utils.isin_validator import is_valid_isin

logger = get_logger(__name__)


def load_universe_isins() -> Set[str]:
    """Load existing ISINs from LocalCache."""
    from portfolio_src.data.local_cache import get_local_cache

    cache = get_local_cache()
    if cache is None:
        return set()

    return cache.get_all_isins()


def harvest_cache() -> int:
    """
    Harvest validated enrichment data and push to Hive.

    Returns:
        Number of new securities contributed
    """
    if not os.path.exists(ENRICHMENT_CACHE_PATH):
        return 0

    try:
        with open(ENRICHMENT_CACHE_PATH, "r", encoding="utf-8") as f:
            cache_data = json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load enrichment cache: {e}")
        return 0

    from portfolio_src.data.hive_client import get_hive_client
    from portfolio_src.data.local_cache import get_local_cache

    hive_client = get_hive_client()
    local_cache = get_local_cache()

    if not hive_client or not hive_client.is_configured:
        logger.debug("Hive not configured, skipping harvest")
        return 0

    existing_isins = load_universe_isins()
    contributed = 0

    for key, data in cache_data.items():
        isin = data.get("isin")

        if not isin or not is_valid_isin(isin):
            continue
        if isin in existing_isins:
            continue

        ticker = data.get("ticker") or data.get("raw_ticker")
        name = data.get("name", "Unknown")

        if not ticker:
            continue

        try:
            hive_client.contribute_listing(
                isin=isin,
                ticker=ticker,
                exchange="UNKNOWN",
                currency="USD",
            )

            if local_cache:
                local_cache.upsert_listing(ticker, "UNKNOWN", isin, "USD")

            existing_isins.add(isin)
            contributed += 1

        except Exception as e:
            logger.debug(f"Failed to contribute {ticker}: {e}")

    if contributed > 0:
        logger.info(f"Harvested {contributed} new entries to Hive")

    return contributed
