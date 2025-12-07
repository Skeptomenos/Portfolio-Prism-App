"""
Manual Enrichments Store

Manages user-provided ISIN mappings that persist across pipeline runs.
These mappings take priority over API lookups.
"""

import json
import os
import re
from typing import Dict, List, Optional, Tuple

from prism_utils.logging_config import get_logger

logger = get_logger(__name__)

MANUAL_ENRICHMENTS_PATH = "config/manual_enrichments.json"
SUGGESTED_ISINS_PATH = "config/suggested_isins.json"


def _validate_isin_format(isin: str) -> bool:
    """
    Validate ISIN format (12 characters, starts with 2 letters).

    Note: This only validates format, not checksum.
    """
    if not isin or not isinstance(isin, str):
        return False

    isin = isin.strip().upper()

    # ISIN format: 2 letter country code + 9 alphanumeric + 1 check digit
    pattern = r"^[A-Z]{2}[A-Z0-9]{10}$"
    return bool(re.match(pattern, isin))


def load_manual_enrichments() -> Dict[str, str]:
    """
    Load user-provided ticker -> ISIN mappings.

    Returns:
        Dict mapping ticker (uppercase) to ISIN.
    """
    if not os.path.exists(MANUAL_ENRICHMENTS_PATH):
        return {}

    try:
        with open(MANUAL_ENRICHMENTS_PATH, "r") as f:
            data = json.load(f)

        # Normalize keys to uppercase
        return {k.upper(): v for k, v in data.items() if v}

    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Failed to load manual enrichments: {e}")
        return {}


def save_manual_enrichment(ticker: str, isin: str) -> Tuple[bool, Optional[str]]:
    """
    Add or update a single ticker -> ISIN mapping.

    Args:
        ticker: The ticker symbol (will be uppercased)
        isin: The ISIN to map to

    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    if not ticker or not isinstance(ticker, str):
        return False, "Invalid ticker"

    ticker = ticker.strip().upper()
    isin = isin.strip().upper() if isin else ""

    if not isin:
        return False, "ISIN is required"

    if not _validate_isin_format(isin):
        return False, f"Invalid ISIN format: {isin}"

    # Load existing mappings
    mappings = load_manual_enrichments()

    # Add/update mapping
    mappings[ticker] = isin

    # Save
    try:
        os.makedirs(os.path.dirname(MANUAL_ENRICHMENTS_PATH), exist_ok=True)
        with open(MANUAL_ENRICHMENTS_PATH, "w") as f:
            json.dump(mappings, f, indent=2, sort_keys=True)

        logger.info(f"Saved manual enrichment: {ticker} -> {isin}")
        return True, None

    except IOError as e:
        return False, f"Failed to save: {e}"


def save_manual_enrichments_bulk(mappings: Dict[str, str]) -> Tuple[int, List[str]]:
    """
    Bulk save multiple ticker -> ISIN mappings.

    Args:
        mappings: Dict of ticker -> ISIN

    Returns:
        Tuple of (success_count, list of error messages)
    """
    success_count = 0
    errors = []

    # Load existing
    existing = load_manual_enrichments()

    for ticker, isin in mappings.items():
        ticker = ticker.strip().upper() if ticker else ""
        isin = isin.strip().upper() if isin else ""

        if not ticker:
            continue

        if not isin:
            continue  # Skip empty ISINs (user left blank)

        if not _validate_isin_format(isin):
            errors.append(f"Invalid ISIN format for {ticker}: {isin}")
            continue

        existing[ticker] = isin
        success_count += 1

    # Save if any updates
    if success_count > 0:
        try:
            os.makedirs(os.path.dirname(MANUAL_ENRICHMENTS_PATH), exist_ok=True)
            with open(MANUAL_ENRICHMENTS_PATH, "w") as f:
                json.dump(existing, f, indent=2, sort_keys=True)

            logger.info(f"Saved {success_count} manual enrichments")

        except IOError as e:
            errors.append(f"Failed to save file: {e}")
            success_count = 0

    return success_count, errors


def delete_manual_enrichment(ticker: str) -> bool:
    """
    Remove a manual enrichment.

    Args:
        ticker: The ticker to remove

    Returns:
        True if removed, False if not found
    """
    mappings = load_manual_enrichments()
    ticker = ticker.strip().upper()

    if ticker not in mappings:
        return False

    del mappings[ticker]

    try:
        with open(MANUAL_ENRICHMENTS_PATH, "w") as f:
            json.dump(mappings, f, indent=2, sort_keys=True)
        return True
    except IOError:
        return False


def load_suggested_isins() -> Dict[str, Dict[str, str]]:
    """
    Load pre-populated ISIN suggestions for common tickers.

    Returns:
        Dict mapping ticker to {"isin": "...", "name": "..."}
    """
    if not os.path.exists(SUGGESTED_ISINS_PATH):
        return {}

    try:
        with open(SUGGESTED_ISINS_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Failed to load suggested ISINs: {e}")
        return {}


def get_suggestion_for_ticker(ticker: str) -> Optional[Dict[str, str]]:
    """
    Get ISIN suggestion for a ticker if available.

    Args:
        ticker: The ticker to look up

    Returns:
        Dict with "isin" and "name" keys, or None if no suggestion
    """
    suggestions = load_suggested_isins()
    ticker = ticker.strip().upper()
    return suggestions.get(ticker)
