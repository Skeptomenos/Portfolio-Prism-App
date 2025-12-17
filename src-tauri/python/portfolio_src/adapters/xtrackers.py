# holdings_engine/adapters/xtrackers.py

import requests
import pandas as pd
import io
from portfolio_src.data.caching import cache_adapter_data
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# --- Configuration ---
# This can be expanded or moved to a central config file
XTRACKERS_ETF_DATA = {
    "XDEM": {"isin": "IE00BL25JP72"},
    # Add other Xtrackers ETFs here as needed
}
OUTPUT_DIR = "outputs"


class XtrackersAdapter:
    """
    Adapter for fetching ETF holdings data from Xtrackers (DWS).
    This adapter uses the "Direct Download" strategy based on a predictable URL pattern.
    """

    @cache_adapter_data(ttl_hours=24)
    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        """
        Fetches the holdings for a given Xtrackers ETF ISIN.

        Args:
            isin: The ISIN of the ETF.

        Returns:
            A pandas DataFrame containing the ETF holdings, or an empty DataFrame if fetching fails.
        """
        logger.info(f"--- Fetching holdings for {isin} ---")

        # Construct the URL based on the discovered API pattern
        url = f"https://etf.dws.com/etfdata/export/DEU/DEU/csv/product/constituent/{isin}/"
        logger.info(f"1. Constructed URL: {url}")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        try:
            logger.info("2. Making direct request to download CSV...")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

            logger.info(
                "3. Successfully downloaded CSV data. Parsing into DataFrame..."
            )
            # Use StringIO to treat the CSV string as a file for pandas
            csv_data = io.StringIO(response.text)

            # Read the CSV data, specifying the delimiter
            holdings_df = pd.read_csv(csv_data, sep=";")

            logger.info(f"4. Successfully parsed {len(holdings_df)} holdings.")

            # --- Data Cleaning and Standardization ---
            holdings_df.rename(
                columns={
                    "Constituent Name": "name",
                    "Constituent ISIN": "isin",
                    "Constituent Weighting": "weight_percentage",
                },
                inplace=True,
            )

            # Fill missing names with ISIN, or "Unknown Asset" if ISIN is also missing
            holdings_df["name"] = (
                holdings_df["name"].fillna(holdings_df["isin"]).fillna("Unknown Asset")
            )

            # Auto-Scale Weights: Check if weights are decimal (sum ~ 1.0) or percentage (sum ~ 100.0)
            weight_sum = holdings_df["weight_percentage"].sum()
            if weight_sum <= 1.5:
                logger.info(
                    f"   - Detected decimal weights (Sum={weight_sum:.4f}). Scaling by 100."
                )
                holdings_df["weight_percentage"] = (
                    holdings_df["weight_percentage"] * 100
                )
            else:
                logger.info(
                    f"   - Detected percentage weights (Sum={weight_sum:.2f}). No scaling needed."
                )

            # Clip negative weights to 0.0 to ensure validation compliance
            holdings_df["weight_percentage"] = holdings_df["weight_percentage"].clip(
                lower=0.0
            )

            # Ensure ticker column exists (nullable in schema)
            if "ticker" not in holdings_df.columns:
                holdings_df["ticker"] = None

            return holdings_df

        except requests.exceptions.RequestException as e:
            logger.error(f"Network request failed for {isin}. Details: {e}")
            return pd.DataFrame()
        except pd.errors.ParserError as e:
            logger.error(f"Failed to parse CSV data for {isin}. Details: {e}")
            return pd.DataFrame()
        except Exception as e:
            logger.error(
                f"An unexpected error occurred in XtrackersAdapter for {isin}: {e}"
            )
            return pd.DataFrame()


# --- Example Usage (for testing) ---
if __name__ == "__main__":
    import os

    adapter = XtrackersAdapter()
    # Use the ISIN for XDEM (Xtrackers MSCI World Momentum ETF)
    xdem_holdings = adapter.fetch_holdings("IE00BL25JP72")

    if not xdem_holdings.empty:
        print("\n--- Successfully fetched XDEM holdings ---")
        print(xdem_holdings.head())

        # Save to a new CSV for verification
        save_path = os.path.join(OUTPUT_DIR, "XDEM_adapter_output.csv")
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        xdem_holdings.to_csv(save_path, index=False)
        print(f"\nSaved adapter output to {save_path}")
