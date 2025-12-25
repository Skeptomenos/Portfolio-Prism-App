# src/adapters/vanguard.py
"""
Vanguard ETF Adapter

Fetches holdings data from Vanguard ETFs using multiple strategies:
1. Manual file (CSV/XLSX placed by user)
2. US Vanguard API (complete holdings via investor.vanguard.com)
3. German site scraping via Playwright (fallback)
4. German site via BeautifulSoup (last resort, top 10 only)

The US API strategy is preferred as it returns ALL holdings with ISINs.
"""

import os
import sys
import json
import re
import requests
import pandas as pd
from typing import Optional, List, Dict, Any

from portfolio_src.data.caching import cache_adapter_data
from portfolio_src.data.holdings_cache import ManualUploadRequired
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR

logger = get_logger(__name__)

# Mapping of European Vanguard ISINs to US equivalent funds
# European ETFs often track the same index as US-listed ETFs
# The US API provides complete holdings with ISINs
VANGUARD_US_EQUIVALENTS = {
    # FTSE All-World Index funds
    "IE00BK5BQT80": {  # VWCE - FTSE All-World UCITS ETF (Accumulating)
        "fund_id": "3141",
        "ticker": "VT",
        "name": "Vanguard Total World Stock ETF",
        "note": "Same index: FTSE Global All Cap",
    },
    "IE00B3RBWM25": {  # VWRL - FTSE All-World UCITS ETF (Distributing)
        "fund_id": "3141",
        "ticker": "VT",
        "name": "Vanguard Total World Stock ETF",
        "note": "Same index: FTSE Global All Cap",
    },
    # FTSE Developed World ex-US
    "IE00BKX55T58": {  # VEVE - FTSE Developed World UCITS ETF
        "fund_id": "3369",
        "ticker": "VXUS",
        "name": "Vanguard Total International Stock ETF",
        "note": "Similar: FTSE Developed ex-US",
    },
}

# Known Vanguard ETF product IDs for German site (fallback)
# Format: ISIN -> (product_id, product_slug)
VANGUARD_PRODUCTS = {
    "IE00BK5BQT80": ("9679", "ftse-all-world-ucits-etf-usd-accumulating"),
}

# HTTP headers for API requests
VANGUARD_API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}


class VanguardAdapter:
    """
    Adapter for fetching ETF holdings data from Vanguard.

    Strategy (in order of preference):
    1. Manual file (CSV/XLSX in manual_inputs directory)
    2. US Vanguard API (complete holdings via investor.vanguard.com)
    3. German site via BeautifulSoup (top 10 only)
    4. Raise ManualUploadRequired if all fail

    The US API is preferred as it returns ALL holdings with ISINs included.
    European ISINs are mapped to their US equivalent funds.
    """

    def __init__(self, isin: Optional[str] = None):
        """
        Initialize the adapter.

        Args:
            isin: Optional ISIN for validation. If provided, checks if supported.
        """
        self.isin = isin
        # Check if we have a mapping for this ISIN
        if (
            isin
            and isin not in VANGUARD_US_EQUIVALENTS
            and isin not in VANGUARD_PRODUCTS
        ):
            logger.warning(
                f"ISIN {isin} not in known Vanguard mappings. "
                "Will attempt fallback strategies."
            )

    @cache_adapter_data(ttl_hours=24)
    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        """
        Fetches holdings for a given Vanguard ETF ISIN.

        Args:
            isin: The ISIN of the ETF.

        Returns:
            A pandas DataFrame containing the ETF holdings,
            or an empty DataFrame if fetching fails.
        """
        logger.info(f"--- Running Vanguard holdings acquisition for {isin} ---")

        # 1. Try Manual File first
        df = self._fetch_from_manual_file(isin)
        if df is not None:
            return df

        # 2. Try US API (preferred - complete holdings with ISINs)
        logger.info("  - No manual file found. Trying US Vanguard API...")
        df = self._fetch_via_us_api(isin)
        if df is not None and not df.empty:
            logger.info(f"  - Success! Got {len(df)} holdings from US API")
            return df

        # 3. Fallback to BeautifulSoup (German site, top 10 only)
        logger.info("  - US API not available. Trying BeautifulSoup scraping...")
        df = self._fetch_via_beautifulsoup(isin)
        if df is not None and not df.empty:
            return df

        # 4. All methods failed - require manual upload
        product_info = VANGUARD_PRODUCTS.get(isin)
        if product_info:
            product_id, product_slug = product_info
            download_url = f"https://www.de.vanguard/professionell/anlageprodukte/etf/aktien/{product_id}/{product_slug}"
        else:
            download_url = "https://www.de.vanguard/professionell/anlageprodukte/etf"

        raise ManualUploadRequired(
            isin=isin,
            provider="Vanguard",
            message=f"Vanguard ETF holdings require manual upload. Download from: {download_url}",
            download_url=download_url,
        )

    def _fetch_via_us_api(self, isin: str) -> Optional[pd.DataFrame]:
        """
        Fetches complete holdings from Vanguard US API.

        This method maps European ISINs to their US equivalent funds
        and fetches all holdings via the investor.vanguard.com API.

        Benefits:
        - Simple HTTP requests (no browser automation needed)
        - Returns ALL holdings (not just top 10)
        - Includes ISINs, tickers, weights, market values

        Args:
            isin: The ISIN of the ETF (European or US).

        Returns:
            DataFrame with all holdings, or None if not available.
        """
        # Look up US equivalent fund
        us_fund = VANGUARD_US_EQUIVALENTS.get(isin)
        if not us_fund:
            logger.info(f"    No US equivalent mapping for {isin}")
            return None

        fund_id = us_fund["fund_id"]
        us_ticker = us_fund["ticker"]
        logger.info(f"    Mapped {isin} -> US fund {us_ticker} (ID: {fund_id})")

        # Fetch holdings with pagination
        # Note: The API uses 1-based 'start' and 'count' params, not 'offset' and 'limit'
        all_holdings: List[Dict[str, Any]] = []
        start = 1  # 1-based indexing
        count = 500  # Max per request
        total_size = None  # Will be set from API response

        base_url = f"https://investor.vanguard.com/investment-products/etfs/profile/api/{fund_id}/portfolio-holding/stock"

        try:
            while True:
                params = {
                    "start": start,
                    "count": count,
                    "sortColumn": "percentWeight",
                    "sortOrder": "desc",
                }

                logger.info(f"    Fetching holdings (start={start}, count={count})...")
                response = requests.get(
                    base_url,
                    params=params,
                    headers=VANGUARD_API_HEADERS,
                    timeout=30,
                )
                response.raise_for_status()

                data = response.json()

                # Get total size from first response
                if total_size is None:
                    total_size = data.get("size", 0)
                    logger.info(f"    API reports {total_size} total holdings")

                holdings = data.get("fund", {}).get("entity", [])

                if not holdings:
                    break

                all_holdings.extend(holdings)
                logger.info(
                    f"    Got {len(holdings)} holdings (total: {len(all_holdings)}/{total_size})"
                )

                # Check if we've fetched all holdings
                if len(all_holdings) >= total_size:
                    break

                if len(holdings) < count:
                    break

                start += count

            if not all_holdings:
                logger.warning("    US API returned no holdings")
                return None

            # Convert to DataFrame
            df = self._normalize_us_api_response(all_holdings)
            logger.info(f"    Total holdings from US API: {len(df)}")
            return df

        except requests.exceptions.RequestException as e:
            logger.error(f"    US API request failed: {e}")
            return None
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"    Failed to parse US API response: {e}")
            return None

    def _normalize_us_api_response(
        self, holdings: List[Dict[str, Any]]
    ) -> pd.DataFrame:
        """
        Normalizes the US Vanguard API response to our standard DataFrame format.

        Args:
            holdings: List of holding dicts from the API.

        Returns:
            Normalized DataFrame with standard columns.
        """
        if not holdings:
            return pd.DataFrame()

        # Extract relevant fields
        rows = []
        for h in holdings:
            # The API returns weight as string percentage (e.g., "4.54")
            weight_str = h.get("percentWeight", "0")
            try:
                weight = float(weight_str)
            except (ValueError, TypeError):
                weight = 0.0

            rows.append(
                {
                    "ticker": h.get("ticker"),
                    "isin": h.get("isin"),
                    "name": h.get("longName") or h.get("shortName"),
                    "weight_percentage": weight,  # Already in percentage format
                    "sector": h.get("secMainType"),
                    "location": None,  # Not provided by US API
                    "market_value": h.get("marketValue"),
                    "shares": h.get("sharesHeld"),
                    "cusip": h.get("cusip"),
                    "sedol": h.get("sedol"),
                }
            )

        df = pd.DataFrame(rows)

        # Filter out invalid rows
        df = df.dropna(subset=["name"])
        df = df[df["weight_percentage"] > 0]

        # Ensure standard column order
        standard_cols = [
            "ticker",
            "isin",
            "name",
            "weight_percentage",
            "sector",
            "location",
        ]
        for col in standard_cols:
            if col not in df.columns:
                df[col] = None

        return pd.DataFrame(df[standard_cols])

    def _fetch_via_beautifulsoup(self, isin: str) -> Optional[pd.DataFrame]:
        """
        Lightweight scraping using requests + BeautifulSoup.

        Note: This method only gets the top 10 holdings displayed on the page.
        For complete holdings, provide a manual file or use Hive community data.
        """
        try:
            import requests
            from bs4 import BeautifulSoup
        except ImportError:
            logger.error(
                "BeautifulSoup not available. Install with: pip install beautifulsoup4"
            )
            return None

        product_info = VANGUARD_PRODUCTS.get(isin)
        if not product_info:
            logger.error(f"ISIN {isin} not found in known Vanguard products.")
            return None

        product_id, product_slug = product_info
        url = f"https://www.de.vanguard/professionell/anlageprodukte/etf/aktien/{product_id}/{product_slug}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        }

        try:
            logger.info(f"   Fetching page: {url}")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "lxml")
            tables = soup.find_all("table")

            if len(tables) < 3:
                logger.warning(f"   Expected 4 tables, found {len(tables)}")
                return None

            # Holdings table is typically the 3rd table (index 2)
            holdings_table = tables[2]
            rows = holdings_table.find_all("tr")

            if len(rows) < 2:
                logger.warning("   Holdings table has no data rows")
                return None

            # Parse header
            header_row = rows[0]
            headers_list = [
                th.get_text(strip=True) for th in header_row.find_all(["th", "td"])
            ]

            # Parse data rows
            data = []
            for row in rows[1:]:
                cells = row.find_all("td")
                if len(cells) >= 2:
                    row_data = [cell.get_text(strip=True) for cell in cells]
                    data.append(row_data)

            if not data:
                logger.warning("   No holdings data found in table")
                return None

            # Create DataFrame
            col_count = len(data[0]) if data else len(headers_list)
            df = pd.DataFrame(data)
            df.columns = headers_list[:col_count]

            # Rename columns to standard names
            col_map = {
                "Wertpapiere": "name",
                "% der Assets": "weight_percentage",
                "Sektor": "sector",
                "Region": "location",
            }
            df = df.rename(columns=col_map)

            # Clean weight column
            if "weight_percentage" in df.columns:
                df["weight_percentage"] = (
                    df["weight_percentage"]
                    .str.replace("%", "")
                    .str.replace(",", ".")
                    .str.replace("\xa0", "")
                    .str.strip()
                )
                df["weight_percentage"] = pd.to_numeric(
                    df["weight_percentage"], errors="coerce"
                )

            # Filter valid rows
            df = pd.DataFrame(df.dropna(subset=["name", "weight_percentage"]))
            df = pd.DataFrame(df[df["weight_percentage"] > 0])

            # Add missing columns
            for col in ["ticker", "isin"]:
                if col not in df.columns:
                    df[col] = None

            logger.info(
                f"   Successfully scraped {len(df)} holdings (top holdings only)"
            )
            logger.warning(
                "   Note: BeautifulSoup only gets top 10 holdings. "
                "For complete data, provide a manual CSV file."
            )

            return pd.DataFrame(df)

        except Exception as e:
            logger.error(f"   BeautifulSoup scraping failed: {e}")
            return None

    def _fetch_from_manual_file(self, isin: str) -> Optional[pd.DataFrame]:
        """Attempts to load and parse a manually placed file."""
        manual_dir = MANUAL_INPUTS_DIR
        xlsx_path = os.path.join(manual_dir, f"{isin}.xlsx")
        csv_path = os.path.join(manual_dir, f"{isin}.csv")

        df = None

        # A. Try CSV
        if os.path.exists(csv_path):
            logger.info(f"  - Found manual file: {csv_path}")
            df = self._read_manual_csv(csv_path)

        # B. Try XLSX
        if df is None and os.path.exists(xlsx_path):
            logger.info(f"  - Found manual file: {xlsx_path}")
            df = self._read_manual_xlsx(xlsx_path)

        # C. Process DataFrame
        if df is not None:
            return self._process_manual_dataframe(df)

        return None

    def _read_manual_csv(self, path: str) -> Optional[pd.DataFrame]:
        """Reads CSV with separator detection."""
        try:
            try:
                df = pd.read_csv(path, sep=";")
                if len(df.columns) < 2:
                    raise ValueError("Not enough columns with ';'")
                return df
            except (ValueError, pd.errors.ParserError):
                return pd.read_csv(path, sep=",")
        except Exception as e:
            logger.error(f"    - Failed to read manual CSV: {e}")
            return None

    def _read_manual_xlsx(self, path: str) -> Optional[pd.DataFrame]:
        """Reads XLSX with header hunting."""
        try:
            temp_df = pd.read_excel(path, header=None, nrows=30)

            header_row_idx: int = 0
            for idx in range(len(temp_df)):
                row = temp_df.iloc[idx]
                row_str = row.astype(str).str.lower().tolist()
                if any(
                    kw in row_str
                    for kw in ["wertpapiere", "securities", "name", "ticker"]
                ):
                    header_row_idx = idx
                    break

            logger.info(f"    - Detected header at row {header_row_idx}")
            return pd.read_excel(path, header=header_row_idx)

        except Exception as e:
            logger.error(f"    - Failed to read manual XLSX: {e}")
            return None

    def _process_manual_dataframe(self, df: pd.DataFrame) -> Optional[pd.DataFrame]:
        """Cleans and normalizes the manually loaded dataframe."""
        df.columns = df.columns.str.strip().str.lower()

        col_map = {
            "wertpapiere": "name",
            "securities": "name",
            "name": "name",
            "ticker": "ticker",
            "% der assets": "weight_percentage",
            "% of assets": "weight_percentage",
            "weight": "weight_percentage",
            "gewichtung": "weight_percentage",
            "sektor": "sector",
            "sector": "sector",
            "region": "location",
            "land": "location",
            "country": "location",
            "isin": "isin",
        }
        df = df.rename(columns=col_map)

        if "name" not in df.columns or "weight_percentage" not in df.columns:
            logger.error(
                f"    - Manual file missing required columns. Found: {df.columns.tolist()}"
            )
            return None

        # Clean weight column
        if df["weight_percentage"].dtype == object:
            df["weight_percentage"] = (
                df["weight_percentage"]
                .astype(str)
                .str.replace("%", "")
                .str.replace(",", ".")
                .str.replace("\xa0", "")
                .str.strip()
            )

        df["weight_percentage"] = pd.to_numeric(
            df["weight_percentage"], errors="coerce"
        )

        # Drop invalid rows
        df = pd.DataFrame(df.dropna(subset=["name", "weight_percentage"]))
        df = pd.DataFrame(df[df["weight_percentage"] > 0])

        # Ensure required columns exist
        for col in ["ticker", "isin", "sector", "location"]:
            if col not in df.columns:
                df[col] = None

        logger.info(f"    - Successfully parsed manual file with {len(df)} rows.")
        return pd.DataFrame(
            df[["ticker", "isin", "name", "weight_percentage", "sector", "location"]]
        )


if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_isin = sys.argv[1]
    else:
        test_isin = "IE00BK5BQT80"

    adapter = VanguardAdapter()
    holdings = adapter.fetch_holdings(test_isin)

    if not holdings.empty:
        print(f"\n--- Successfully fetched {len(holdings)} holdings ---")
        print(holdings.head(10))
        print(f"\nTotal weight: {holdings['weight_percentage'].sum():.2f}%")
    else:
        print("\n--- Failed to fetch holdings ---")
