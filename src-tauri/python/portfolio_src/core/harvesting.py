# core/harvesting.py
import json
import csv
import os
from typing import Set
from portfolio_src.config import ENRICHMENT_CACHE_PATH, ASSET_UNIVERSE_PATH


def load_universe_isins() -> Set[str]:
    """Load existing ISINs from asset_universe.csv."""
    existing_isins = set()
    if os.path.exists(ASSET_UNIVERSE_PATH):
        try:
            with open(ASSET_UNIVERSE_PATH, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get("ISIN"):
                        existing_isins.add(row["ISIN"])
        except Exception:
            pass
    return existing_isins


def harvest_cache() -> int:
    """
    Harvest validated enrichment data and add to asset_universe.csv.
    
    Returns:
        Number of new securities added
    """
    if not os.path.exists(ENRICHMENT_CACHE_PATH):
        return 0

    try:
        with open(ENRICHMENT_CACHE_PATH, "r", encoding="utf-8") as f:
            cache_data = json.load(f)
    except Exception:
        return 0

    existing_isins = load_universe_isins()
    new_entries = []

    for key, data in cache_data.items():
        isin = data.get("isin")
        
        # Skip invalid entries
        if not isin or isin in ["N/A", "UNKNOWN"] or str(isin).startswith("UNKNOWN_"):
            continue
        if isin in existing_isins:
            continue

        new_entry = {
            "ISIN": isin,
            "TR_Ticker": data.get("raw_ticker") or data.get("ticker"),
            "Yahoo_Ticker": data.get("ticker"),
            "Name": data.get("name", "Unknown"),
            "Provider": "",
            "Asset_Class": "Stock",
        }
        new_entries.append(new_entry)
        existing_isins.add(isin)

    if not new_entries:
        return 0

    # Append to CSV
    fieldnames = ["ISIN", "TR_Ticker", "Yahoo_Ticker", "Name", "Provider", "Asset_Class"]
    file_exists = os.path.exists(ASSET_UNIVERSE_PATH) and os.path.getsize(ASSET_UNIVERSE_PATH) > 0

    try:
        with open(ASSET_UNIVERSE_PATH, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerows(new_entries)
    except Exception:
        return 0

    return len(new_entries)
