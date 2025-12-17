import json
import os
import yfinance as yf
import pandas as pd
from typing import Dict, Optional
from portfolio_src.config import CONFIG_DIR
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Path to the cache file
ASSET_NAMES_CACHE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "config", "asset_names.json"
)
# Path to the ticker map
TICKER_MAP_PATH = CONFIG_DIR / "ticker_map.json"


def _load_cache():
    if os.path.exists(ASSET_NAMES_CACHE_PATH):
        try:
            with open(ASSET_NAMES_CACHE_PATH, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.error(f"Error decoding JSON from {ASSET_NAMES_CACHE_PATH}")
            return {}
    return {}


def _load_ticker_map():
    if os.path.exists(TICKER_MAP_PATH):
        try:
            with open(TICKER_MAP_PATH, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_cache(cache):
    try:
        os.makedirs(os.path.dirname(ASSET_NAMES_CACHE_PATH), exist_ok=True)
        with open(ASSET_NAMES_CACHE_PATH, "w") as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save asset names cache: {e}")


def _fetch_name_yfinance(isin):
    """
    Fetches the official long name from Yahoo Finance using the ISIN or mapped Ticker.
    """
    ticker_symbol = isin
    ticker_map = _load_ticker_map()
    if isin in ticker_map:
        ticker_symbol = ticker_map[isin]

    try:
        ticker = yf.Ticker(ticker_symbol)
        # Check info for longName or shortName
        info = ticker.info
        # Validate that we actually got a name (yfinance sometimes returns empty objects)
        if info and ("longName" in info or "shortName" in info):
            name = info.get("longName") or info.get("shortName")
            return name
    except Exception as e:
        logger.warning(
            f"YFinance name lookup failed for {isin} (Ticker: {ticker_symbol}): {e}"
        )
        # pass
    return None


def _fetch_name_llm_stub(raw_name):
    """
    Placeholder for LLM-based cleaning.
    Currently implements a heuristic regex fallback to keep it fast and free
    until an LLM client is fully integrated.
    """
    # Remove leading "Buy trade" / "Sell trade"
    clean = re.sub(r"^(Buy|Sell) trade\s*", "", raw_name, flags=re.IGNORECASE)

    # Remove "ISHS-" prefix (common in iShares names)
    clean = re.sub(r"^ISHS\-\s*", "", clean, flags=re.IGNORECASE)

    # Remove leading prices/currencies (e.g. "10,00 € 1.234,56" or "-38,94")
    # Includes standard minus (-), en-dash (\u2013), em-dash (\u2014)
    clean = re.sub(r"^[\d.,\s€\-\u2013\u2014]+", "", clean)

    # Remove trailing transaction IDs (long sequences of digits/dates)
    # Example: 3411422620220916 KW
    clean = re.sub(r"\s+\d{10,}\s*.*$", "", clean)

    return clean.strip()


def normalize_asset_names(positions_df):
    """
    Normalizes the 'name' column in the positions DataFrame.
    Uses a Waterfall approach: Cache -> Yahoo Finance -> LLM/Regex Fallback.
    """
    logger.info("--- Normalizing Asset Names ---")

    cache = _load_cache()
    cache_updates = 0

    for index, row in positions_df.iterrows():
        isin = row.get("ISIN")
        raw_name = row.get("name")

        if not isin or pd.isna(isin):
            # No ISIN: Use Fallback cleaner on raw name
            clean_name = _fetch_name_llm_stub(raw_name)
            positions_df.at[index, "name"] = clean_name
            continue

        # 1. Check Cache
        if isin in cache:
            positions_df.at[index, "name"] = cache[isin]
            continue

        # 2. Yahoo Finance
        official_name = _fetch_name_yfinance(isin)
        if official_name:
            logger.info(f"  - Fetched official name for {isin}: {official_name}")
            cache[isin] = official_name
            positions_df.at[index, "name"] = official_name
            cache_updates += 1
            continue

        # 3. Fallback (LLM/Regex)
        # If Yahoo fails, we clean the raw name and cache THAT to avoid retrying Yahoo every time
        clean_name = _fetch_name_llm_stub(raw_name)
        logger.info(f"  - cleaned name for {isin}: {clean_name} (Yahoo failed)")

        # Only cache if it looks reasonable (not empty)
        if clean_name:
            cache[isin] = clean_name
            positions_df.at[index, "name"] = clean_name
            cache_updates += 1

    if cache_updates > 0:
        _save_cache(cache)

    return positions_df
