import json
import os
import sys
import re
import pandas as pd
import requests
from io import StringIO
from data.caching import cache_adapter_data
from utils.logging_config import get_logger

logger = get_logger(__name__)

# Path to the external configuration file
ISHARES_CONFIG_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "config", "ishares_config.json"
)


class ISharesAdapter:
    """
    Adapter for fetching ETF holdings data from iShares.
    This adapter uses the "Layer 1: Direct Download" strategy based on a
    predictable URL pattern discovered during the feasibility spike.
    """

    def __init__(self):
        self.config = self._load_config()

    def _load_config(self):
        if os.path.exists(ISHARES_CONFIG_PATH):
            try:
                with open(ISHARES_CONFIG_PATH, "r") as f:
                    return json.load(f)
            except json.JSONDecodeError:
                logger.error(f"Error decoding JSON from {ISHARES_CONFIG_PATH}")
                return {}
        return {}

    def _save_config(self):
        try:
            os.makedirs(os.path.dirname(ISHARES_CONFIG_PATH), exist_ok=True)
            with open(ISHARES_CONFIG_PATH, "w") as f:
                json.dump(self.config, f, indent=4)
            logger.info(f"Updated iShares config saved to {ISHARES_CONFIG_PATH}")
        except Exception as e:
            logger.error(f"Failed to save iShares config: {e}")

    def _discover_product_id(self, isin: str) -> str:
        """
        Automated discovery of the iShares Product ID using the site's search feature.
        """
        logger.info(f"Attempting to auto-discover Product ID for {isin}...")
        search_url = f"https://www.ishares.com/de/privatanleger/de/suche/search-results?searchTerm={isin}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        try:
            response = requests.get(search_url, headers=headers, timeout=10)
            response.raise_for_status()

            # Simple Regex to find the product page link
            # Pattern looks for: /produkte/251795/
            match = re.search(r"/produkte/(\d+)/", response.text)

            if match:
                product_id = match.group(1)
                logger.info(f"✅ Auto-discovered Product ID: {product_id}")
                return product_id
            else:
                logger.warning(
                    f"Could not find Product ID in search results for {isin}."
                )
                return None
        except Exception as e:
            logger.error(f"Auto-discovery failed: {e}")
            return None

    def _prompt_for_product_id(self, isin: str) -> str:
        """
        Interactively prompts the user for the missing Product ID.
        """
        print(f"\n⚠️  Missing Product ID for iShares ETF: {isin}")
        print(
            "   Please visit the iShares website, find the ETF page, and look at the URL."
        )
        print(
            "   Example URL: .../produkte/251882/ishares-msci-world-ucits-etf-acc-fund"
        )
        print("   The Product ID is the number (e.g., 251882).")

        while True:
            product_id = input(
                f"   Enter Product ID for {isin} (or 's' to skip): "
            ).strip()
            if product_id.lower() == "s":
                return None
            if product_id.isdigit():
                return product_id
            print("   Invalid input. Please enter a numeric ID.")

    @cache_adapter_data(ttl_hours=24)
    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        """
        Fetches the holdings for a given iShares ETF ISIN.

        Args:
            isin: The ISIN of the ETF.

        Returns:
            A pandas DataFrame containing the ETF holdings, or an empty DataFrame if fetching fails.
        """
        logger.info(f"--- Fetching holdings for {isin} ---")

        # 1. Check Config
        etf_info = self.config.get(isin)

        # 2. Discovery & Fallback
        if not etf_info:
            # A) Try Auto-Discovery
            product_id = self._discover_product_id(isin)

            # B) Try Manual Prompt (if auto fails and interactive)
            if not product_id and sys.stdout.isatty():
                product_id = self._prompt_for_product_id(isin)

            if product_id:
                # Default to private investor / de region for now
                self.config[isin] = {
                    "product_id": product_id,
                    "region": "de",
                    "user_type": "privatanleger",
                }
                self._save_config()
                etf_info = self.config[isin]
            else:
                logger.warning(f"Skipped configuration for {isin}. Cannot fetch data.")
                return pd.DataFrame()

        product_id = etf_info.get("product_id")
        region = etf_info.get("region", "de")

        user_type = etf_info.get("user_type", "privatanleger")

        # Ticker might be missing in config if freshly added, but we don't strictly need it for the URL
        # We assume the CSV download provides the ticker.

        # Construct the URL based on the discovered pattern from the spike
        # Use a generic fileName to avoid needing the specific ticker symbol in the URL parameters if possible,
        # or rely on the ID being the primary key.
        # The original code used `fileName={ticker}_holdings`. Let's see if `holdings` works or if we need a ticker.
        # Testing suggests the fileName param is often ignored or can be anything. Let's use the ISIN.
        url = (
            f"https://www.ishares.com/{region}/{user_type}/{region}/produkte/"
            f"{product_id}/fund/1478358465952.ajax?fileType=csv&fileName={isin}_holdings&dataType=fund"
        )
        logger.info(f"1. Constructed URL: {url}")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        try:
            logger.info("2. Making direct request to download CSV...")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            logger.info("3. Download successful. Parsing raw CSV content...")

            # Use StringIO to treat the string response as a file
            csv_data = StringIO(response.text)

            # Skip initial rows and parse the main data
            holdings_df = pd.read_csv(csv_data, skiprows=2)
            logger.info(f"   - Successfully parsed CSV. Found {len(holdings_df)} rows.")

            # We need: Ticker (raw from provider), Name, Weight, Location, and Exchange.
            # Note: iShares CSV does NOT contain ISIN, so we preserve raw ticker and construct Yahoo-compatible ticker.
            holdings_df = holdings_df[
                ["Emittententicker", "Name", "Gewichtung (%)", "Standort", "Börse"]
            ].copy()

            # Preserve the raw ticker from provider before any transformations
            holdings_df["raw_ticker"] = holdings_df["Emittententicker"]

            holdings_df.rename(
                columns={
                    "Emittententicker": "ticker",
                    "Name": "name",
                    "Gewichtung (%)": "weight_percentage",
                    "Standort": "location",
                    "Börse": "exchange",
                },
                inplace=True,
            )

            logger.info("4. Standardized column names.")

            # Drop rows with missing Name (often footer rows)
            holdings_df.dropna(subset=["name"], inplace=True)

            # --- Data Cleaning ---
            # Convert weight percentage to float
            holdings_df["weight_percentage"] = (
                holdings_df["weight_percentage"].str.replace(",", ".").astype(float)
            )

            # Clip negative weights to 0.0
            holdings_df["weight_percentage"] = holdings_df["weight_percentage"].clip(
                lower=0.0
            )

            # --- Ticker Suffixing for YFinance ---
            # Map iShares "Börse" / "Standort" to Yahoo Finance Suffixes
            def get_yahoo_suffix(row):
                exchange = str(row["exchange"])
                location = str(row["location"])

                # US Assets - No suffix needed
                if (
                    location == "Vereinigte Staaten"
                    or "NASDAQ" in exchange
                    or "New York" in exchange
                ):
                    return ""

                # European & Global Mapping
                mapping = {
                    "SIX Swiss Exchange": ".SW",
                    "Xetra": ".DE",
                    "London Stock Exchange": ".L",
                    "Euronext Amsterdam": ".AS",
                    "Nyse Euronext - Euronext Paris": ".PA",
                    "Borsa Italiana": ".MI",
                    "Bolsa De Madrid": ".MC",
                    "Omx Nordic Exchange Copenhagen A/S": ".CO",
                    "Tokyo Stock Exchange": ".T",
                    "Toronto Stock Exchange": ".TO",
                    "Hong Kong Exchanges And Clearing Ltd": ".HK",
                    "Asx - All Markets": ".AX",
                    "Singapore Exchange": ".SI",
                    "Oslo Bors Asa": ".OL",
                    "Wiener Boerse Ag": ".VI",
                    "Nyse Euronext - Euronext Brussels": ".BR",
                    "Nyse Euronext - Euronext Lisbon": ".LS",
                    "Irish Stock Exchange - All Market": ".IR",  # Often falls back to London .L or just raw
                    "Nasdaq Omx Helsinki Ltd.": ".HE",
                    "Nasdaq Omx Nordic": ".ST",  # Stockholm
                    "Tel Aviv Stock Exchange": ".TA",
                }

                return mapping.get(exchange, "")

            # Apply suffix to ticker
            holdings_df["suffix"] = holdings_df.apply(get_yahoo_suffix, axis=1)

            def clean_and_suffix_ticker(row):
                ticker = str(row["ticker"])
                suffix = row["suffix"]

                # 1. Handle UK/Trailing Dot (e.g., RR. -> RR.L)
                if suffix == ".L" and ticker.endswith("."):
                    ticker = ticker[:-1]  # Remove trailing dot

                # 2. Handle Spaces (NOVO B -> NOVO-B)
                ticker = ticker.replace(" ", "-")

                # 3. Handle Hong Kong Padding (388 -> 0388.HK)
                if suffix == ".HK" and ticker.isdigit() and len(ticker) < 4:
                    ticker = ticker.zfill(4)

                # 4. Handle Canadian/UK Internal Dots (GIB.A -> GIB-A)
                if (
                    suffix in [".TO", ".L"]
                    and "." in ticker
                    and not ticker.endswith(".")
                ):
                    ticker = ticker.replace(".", "-")

                # 5. Apply Suffix
                # Only apply if not already present
                if suffix and not ticker.endswith(suffix):
                    ticker = f"{ticker}{suffix}"

                return ticker

            holdings_df["ticker"] = holdings_df.apply(clean_and_suffix_ticker, axis=1)

            # Clean up temp columns
            holdings_df.drop(columns=["location", "exchange", "suffix"], inplace=True)

            logger.info("5. Cleaned, converted weights, and applied ticker suffixes.")

            return holdings_df

        except requests.exceptions.RequestException as e:
            logger.error(
                f"Network request failed for {isin} (ID: {product_id}). Details: {e}"
            )
            return pd.DataFrame()
        except Exception as e:
            logger.error(
                f"An unexpected error occurred in ISharesAdapter for {isin}: {e}"
            )
            return pd.DataFrame()


if __name__ == "__main__":
    adapter = ISharesAdapter()
    # Test with a known ISIN
    adapter.fetch_holdings("IE00B4L5Y983")
