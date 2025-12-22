import os
import sys
import pandas as pd
from pathlib import Path

# Add src-tauri/python to sys.path
sys.path.append(str(Path(__file__).parent.parent / "src-tauri" / "python"))

from portfolio_src.data.ingestion import DataIngestion
from portfolio_src.config import ASSET_UNIVERSE_PATH, WORKING_DIR


def migrate():
    universe_path = ASSET_UNIVERSE_PATH
    holdings_path = WORKING_DIR / "calculated_holdings.csv"

    if universe_path.exists():
        print(f"Migrating universe from {universe_path}...")
        try:
            df_uni = pd.read_csv(universe_path)
            # Map old CSV columns to new schema
            df_uni = df_uni.rename(
                columns={
                    "ISIN": "isin",
                    "Yahoo_Ticker": "ticker",
                    "Name": "name",
                    "Asset_Class": "asset_type",
                }
            )
            # Filter out columns not in schema to avoid validation errors
            valid_cols = ["isin", "ticker", "name", "asset_type"]
            df_uni = df_uni[[c for c in valid_cols if c in df_uni.columns]]

            result = DataIngestion.ingest_metadata(df_uni)
            print(f"Universe migration result: {result}")
        except Exception as e:
            print(f"Failed to migrate universe: {e}")

    if holdings_path.exists():
        print(f"Migrating holdings from {holdings_path}...")
        try:
            df_hold = pd.read_csv(holdings_path)
            # Map old CSV columns to new schema
            df_hold = df_hold.rename(
                columns={
                    "ISIN": "isin",
                    "Name": "name",
                    "Quantity": "quantity",
                    "Asset_Class": "asset_type",
                    "CurrentPrice": "price",
                }
            )
            # Filter out columns not in schema
            valid_cols = ["isin", "name", "quantity", "asset_type", "price"]
            df_hold = df_hold[[c for c in valid_cols if c in df_hold.columns]]

            result = DataIngestion.ingest_positions(df_hold, source="migration")
            print(f"Holdings migration result: {result}")
        except Exception as e:
            print(f"Failed to migrate holdings: {e}")


if __name__ == "__main__":
    migrate()
