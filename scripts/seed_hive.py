"""
Seed Hive Script - TASK-453

Reads the local asset_universe.csv and uploads normalized asset and listing data
to the Supabase Hive using the HiveClient.

This script tests the HiveClient's contribute_asset RPC wrapper.
"""

import os
import sys
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

# Add project root to path for module imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src-tauri" / "python"))

from portfolio_src.data.hive_client import get_hive_client, HiveResult

load_dotenv()

# --- Configuration ---
# NOTE: Path is set relative to the project root
CSV_PATH = (
    Path(__file__).parent.parent
    / "src-tauri"
    / "python"
    / "default_config"
    / "asset_universe.csv"
)
# ASSUMPTION: Since CSV lacks explicit currency/exchange, we use defaults.
DEFAULT_CURRENCY = "EUR"
DEFAULT_EXCHANGE = "GLOBAL"
BATCH_SIZE = 50
# ---------------------


def seed_hive() -> None:
    """Orchestrates the data seeding process."""
    if not CSV_PATH.exists():
        print(f"ERROR: Source file not found at {CSV_PATH.resolve()}")
        return

    client = get_hive_client()
    if not client.is_configured:
        print("ERROR: Supabase URL or Key not configured in .env. Cannot seed Hive.")
        return

    # Map CSV terms to PostgreSQL ENUM terms (e.g., "Stock" -> "Equity")
    ASSET_CLASS_MAP = {
        "Stock": "Equity",
        "ETC": "ETF",
        "Fund": "Fund",
        "Crypto": "Crypto",
        "ETF": "ETF",
    }

    print(f"Loading data from: {CSV_PATH.resolve()}")
    try:
        df = pd.read_csv(CSV_PATH)
        df = df.dropna(subset=["ISIN", "Name"])
        print(f"Found {len(df)} assets to process.")
    except Exception as e:
        print(f"ERROR: Failed to read CSV: {e}")
        return

    successful_count = 0

    # Iterate in batches to allow for progress tracking
    for start in range(0, len(df), BATCH_SIZE):
        batch = df.iloc[start : start + BATCH_SIZE]
        results = []

        print(f"\n--- Processing Batch {start} to {start + len(batch)} ---")

        for index, row in batch.iterrows():
            isin = row["ISIN"]
            name = row["Name"]
            asset_class = row["Asset_Class"]
            asset_class = ASSET_CLASS_MAP.get(
                asset_class, asset_class
            )  # Apply normalization

            # Use TR_Ticker as primary, fall back to Yahoo_Ticker, then ISIN
            ticker = row.get("TR_Ticker")
            if pd.isna(ticker) or not ticker:
                ticker = row.get("Yahoo_Ticker")
            if pd.isna(ticker) or not ticker:
                ticker = isin  # Fallback to ISIN as ticker if none found

            # NOTE: We assume base and trading currency are EUR/EUR with GLOBAL exchange.
            # This must be refined in the CSV long-term.

            # 1. PRIMARY CONTRIBUTION (Asset + Listing)
            # This covers the TR_Ticker and the core asset metadata
            result_asset: HiveResult = client.contribute_asset(
                isin=isin,
                ticker=ticker,
                exchange=DEFAULT_EXCHANGE,
                name=name,
                asset_class=asset_class,
                base_currency=DEFAULT_CURRENCY,
                trading_currency=DEFAULT_CURRENCY,
            )

            # Use original TR_Ticker for logging if it was the primary ticker
            primary_ticker = row.get("TR_Ticker", ticker)

            if result_asset.success:
                successful_count += 1

                # 2. SECONDARY LISTINGS (Yahoo Ticker)
                yahoo_ticker = row.get("Yahoo_Ticker")
                if pd.notna(yahoo_ticker) and yahoo_ticker:
                    # We assume Yahoo ticker is US-based for US stocks, or EUR-based for German/EU stocks for simplicity
                    yahoo_exchange = "YAHOO_API"
                    yahoo_currency = "USD" if isin.startswith("US") else "EUR"

                    result_listing = client.contribute_listing(
                        isin=isin,
                        ticker=yahoo_ticker,
                        exchange=yahoo_exchange,
                        currency=yahoo_currency,
                    )
                    if not result_listing.success:
                        results.append(
                            f"  ⚠️ Listing Failure (Yahoo): {isin} - {result_listing.error}"
                        )

                # 3. NAME ALIASES (Provider Mappings)
                aliases_str = row.get("Aliases")
                if pd.notna(aliases_str) and aliases_str:
                    # Aliases are split by comma in the CSV
                    for alias in aliases_str.split(","):
                        alias = alias.strip()
                        if alias:
                            result_mapping = client.contribute_mapping(
                                isin=isin,
                                provider="ManualAlias",
                                provider_id=alias,
                            )
                            if not result_mapping.success:
                                results.append(
                                    f"  ⚠️ Alias Failure: {isin} ({alias}) - {result_mapping.error}"
                                )

                results.append(f"  ✅ SUCCESS: {isin} ({primary_ticker})")
            else:
                results.append(f"  ❌ FAILURE: {isin} - {result_asset.error}")

        for r in results:
            print(r)

    print(f"\n========================================================")
    print(f"Hive Seeding Complete: {successful_count} assets successfully contributed.")
    print(f"========================================================")


if __name__ == "__main__":
    seed_hive()
