# phases/shared/caching.py
import os
import json
import pandas as pd
from functools import wraps
from datetime import datetime, timedelta
from prism_utils.logging_config import get_logger
from prism_utils.metrics import tracker
from prism_utils.isin_validator import is_valid_isin, is_placeholder_isin

logger = get_logger(__name__)

CACHE_DIR = "data/working/cache/adapter_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

ENRICHMENT_CACHE_FILE = "data/working/cache/enrichment_cache.json"


def get_cache_key(identifier: str) -> str:
    """Generates a standardized cache key."""
    return str(identifier).upper().strip()


def is_valid_cache_key(key: str) -> bool:
    """
    Validate that a cache key is acceptable.

    Rejects:
    - Keys containing pipe characters (old composite keys)
    - Keys starting with FALLBACK/UNRESOLVED patterns
    - Keys that are placeholder values
    """
    if not key or not isinstance(key, str):
        return False

    key_upper = key.upper().strip()

    # Reject composite/placeholder patterns
    if is_placeholder_isin(key_upper):
        return False

    return True


def auto_clean_cache() -> dict:
    """
    Remove invalid entries from the enrichment cache.

    Returns:
        dict with cleanup statistics
    """
    cache = _load_json_cache()
    if not cache:
        return {"total": 0, "removed": 0, "retained": 0}

    original_count = len(cache)
    cleaned_cache = {}
    removed_keys = []

    for key, value in cache.items():
        # Check key validity
        if not is_valid_cache_key(key):
            removed_keys.append(key)
            continue

        # Check if value has valid ISIN (if it claims to have one)
        isin = value.get("isin") if isinstance(value, dict) else None
        if isin and not is_valid_isin(isin):
            removed_keys.append(key)
            continue

        cleaned_cache[key] = value

    # Save cleaned cache if any removals occurred
    removed_count = len(removed_keys)
    if removed_count > 0:
        _save_json_cache(cleaned_cache)
        logger.info(
            f"Cache auto-cleanup: removed {removed_count} invalid entries, "
            f"retained {len(cleaned_cache)}"
        )

    return {
        "total": original_count,
        "removed": removed_count,
        "retained": len(cleaned_cache),
        "removed_keys": removed_keys[:10],  # Sample for logging
    }


def _load_json_cache():
    """Helper to load the entire JSON cache."""
    if not os.path.exists(ENRICHMENT_CACHE_FILE):
        return {}
    try:
        with open(ENRICHMENT_CACHE_FILE, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        logger.error(
            f"Corrupt cache file at {ENRICHMENT_CACHE_FILE}. Returning empty cache."
        )
        return {}


def _save_json_cache(cache_data):
    """Helper to save the entire JSON cache."""
    os.makedirs(os.path.dirname(ENRICHMENT_CACHE_FILE), exist_ok=True)
    with open(ENRICHMENT_CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=2)


def load_from_cache(key: str):
    """Retrieves a value from the JSON cache."""
    cache = _load_json_cache()
    return cache.get(key)


def save_to_cache(key: str, data: dict) -> bool:
    """
    Saves a key-value pair to the JSON cache.

    Validates:
    - Key is not a composite/placeholder pattern
    - ISIN value (if present) is valid

    Returns:
        True if saved successfully, False if rejected
    """
    # Validate key
    if not is_valid_cache_key(key):
        logger.warning(f"Rejected invalid cache key: {key}")
        return False

    # Validate ISIN in data if present
    isin = data.get("isin") if isinstance(data, dict) else None
    if isin and not is_valid_isin(isin):
        logger.warning(f"Rejected invalid ISIN in cache data: {isin} for key {key}")
        return False

    cache = _load_json_cache()
    cache[key] = data
    _save_json_cache(cache)
    return True


def cache_adapter_data(ttl_hours: int = 24):
    """
    A decorator to cache the DataFrame returned by an adapter's fetch_holdings method.

    The cache is considered "fresh" if the file is less than ttl_hours old.
    It saves the DataFrame to a CSV file named after the ISIN and the adapter class.
    """

    def decorator(func):
        @wraps(func)
        def wrapper(self, isin: str, *args, **kwargs):
            class_name = self.__class__.__name__
            cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")

            # Check if a fresh cache file exists
            if os.path.exists(cache_file):
                modified_time = datetime.fromtimestamp(os.path.getmtime(cache_file))
                if datetime.now() - modified_time < timedelta(hours=ttl_hours):
                    logger.info(
                        f"Loading fresh data for {isin} from cache: {cache_file}"
                    )
                    tracker.increment_system_metric("cache_hits")
                    return pd.read_csv(cache_file)

            # If no fresh cache, run the original function
            logger.info(
                f"No fresh cache for {isin}. Fetching live data using {class_name}."
            )
            tracker.increment_system_metric("api_calls_providers")
            result_df = func(self, isin, *args, **kwargs)

            # Save the new result to cache, but only if it's valid (not empty)
            if not result_df.empty:
                logger.info(f"Saving new data for {isin} to cache: {cache_file}")
                result_df.to_csv(cache_file, index=False)
            else:
                logger.warning(
                    f"Adapter {class_name} returned an empty DataFrame for {isin}. Not caching."
                )

            return result_df

        return wrapper

    return decorator
