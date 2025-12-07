import pandas as pd
import requests
import io
from src.data.caching import cache_adapter_data
from src.utils.logging_config import get_logger

logger = get_logger(__name__)


class VanEckAdapter:
    def __init__(self, isin: str):
        if isin != "IE000YYE6WK5":
            raise ValueError("VanEckAdapter only supports DFNS (IE000YYE6WK5)")
        self.isin = isin
        self.download_url = (
            "https://www.vaneck.com/de/de/investments/defense-etf/downloads/holdings/"
        )

    @cache_adapter_data(ttl_hours=24)
    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        logger.info(f"--- Fetching holdings for {isin} (Direct Download) ---")
        try:
            logger.info(f"1. Downloading holdings file from: {self.download_url}")
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
            }
            response = requests.get(self.download_url, headers=headers)
            response.raise_for_status()

            logger.info("2. File downloaded successfully. Parsing Excel content...")
            with io.BytesIO(response.content) as bio:
                # Per user feedback, the actual headers are on the 3rd row (index 2)
                holdings_df = pd.read_excel(bio, header=2)

            logger.info(
                f"3. Successfully parsed Excel file. Found {len(holdings_df)} rows."
            )

            # Data Cleaning and Standardization
            holdings_df = holdings_df[
                ["Bezeichnung der Position", "Ticker", "% des Fondsvolumens", "ISIN"]
            ].copy()
            holdings_df.rename(
                columns={
                    "Bezeichnung der Position": "name",
                    "Ticker": "ticker",
                    "% des Fondsvolumens": "weight_percentage",
                    "ISIN": "isin",
                },
                inplace=True,
            )
            logger.info("4. Standardized column names.")

            # Clean the weight column
            holdings_df["weight_percentage"] = (
                holdings_df["weight_percentage"]
                .astype(str)
                .str.replace("%", "", regex=False)
                .str.replace(",", ".", regex=False)
            )
            holdings_df["weight_percentage"] = pd.to_numeric(
                holdings_df["weight_percentage"], errors="coerce"
            )

            # Clip negative weights to 0.0 (e.g. small cash overdrafts or rounding errors)
            holdings_df["weight_percentage"] = holdings_df["weight_percentage"].clip(
                lower=0.0
            )

            holdings_df.dropna(subset=["name", "weight_percentage"], inplace=True)
            holdings_df.reset_index(drop=True, inplace=True)
            logger.info("5. Cleaned and validated data.")

            return holdings_df

        except requests.exceptions.RequestException as e:
            logger.error(f"An error occurred during download: {e}")
            return pd.DataFrame()
        except Exception as e:
            logger.error(f"An error occurred during parsing: {e}")
            return pd.DataFrame()


if __name__ == "__main__":
    # Standalone test for the adapter
    adapter = VanEckAdapter(isin="IE000YYE6WK5")
    df = adapter.fetch_holdings("IE000YYE6WK5")

    if not df.empty:
        print("\n--- Standalone test successful ---")
        print(df.head())
        print(f"\nTotal rows: {len(df)}")
        print(f"Total weight: {df['weight_percentage'].sum():.2f}%")
        # Save to CSV for inspection
        df.to_csv(
            "data/working/raw_downloads/DFNS_vaneck_direct_download.csv", index=False
        )
        print(
            "--- Saved to data/working/raw_downloads/DFNS_vaneck_direct_download.csv ---"
        )
    else:
        print("\n--- Standalone test failed. ---")
