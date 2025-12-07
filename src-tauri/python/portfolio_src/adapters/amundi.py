# src/adapters/amundi.py
"""
Amundi ETF Adapter

Fetches holdings data from Amundi's ETF website using Playwright.
Supports manual file fallback for offline/cached data.
"""

import sys
import os
import pandas as pd
from typing import Optional

try:
    from python_calamine.pandas import pandas_monkeypatch

    pandas_monkeypatch()
    CALAMINE_AVAILABLE = True
except ImportError:
    CALAMINE_AVAILABLE = False

from prism_utils.logging_config import get_logger
from config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR
from data.holdings_cache import ManualUploadRequired

logger = get_logger(__name__)


class AmundiAdapter:
    """
    Adapter for fetching ETF holdings data from Amundi.

    Strategy:
    1. Try manual file first (CSV/XLSX in manual_inputs directory)
    2. Fallback to Playwright browser automation
    """

    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        """
        Navigates the Amundi website to download the holdings XLSX file.
        Implements a 'Manual Escape Hatch' to look for local files first.
        """
        logger.info(f"--- Running Amundi holdings acquisition for {isin} ---")

        # 1. Try Manual File
        df = self._fetch_from_manual_file(isin)
        if df is not None:
            return df

        # 2. Docker mode: manual files only (no browser)
        if os.getenv("DOCKER_MODE") == "true":
            download_url = (
                f"https://www.amundietf.de/de/privatanleger/products/equity/{isin}"
            )
            raise ManualUploadRequired(
                isin=isin,
                provider="Amundi",
                message=f"Amundi ETFs require manual upload in Docker mode. Download from: {download_url}",
                download_url=download_url,
            )

        # 3. Fallback to Automation
        logger.info("  - No manual file found. Proceeding to automated download...")
        return self._fetch_via_playwright(isin)

    def _fetch_from_manual_file(self, isin: str) -> Optional[pd.DataFrame]:
        """Attempts to load and parse a manually placed file."""
        manual_dir = MANUAL_INPUTS_DIR
        xlsx_path = os.path.join(manual_dir, f"{isin}.xlsx")
        csv_path = os.path.join(manual_dir, f"{isin}.csv")

        df = None

        # A. Try XLSX
        if os.path.exists(xlsx_path):
            logger.info(f"  - Found manual file: {xlsx_path}")
            df = self._read_manual_xlsx(xlsx_path)

        # B. Try CSV
        if df is None and os.path.exists(csv_path):
            logger.info(f"  - Found manual file: {csv_path}")
            df = self._read_manual_csv(csv_path)

        # C. Process Dataframe
        if df is not None:
            return self._process_manual_dataframe(df)

        return None

    def _read_manual_xlsx(self, path: str) -> Optional[pd.DataFrame]:
        """Reads XLSX with header hunting and calamine fallback."""
        try:
            # Header Hunting
            temp_df = None
            try:
                temp_df = pd.read_excel(path, header=None, nrows=30)
            except Exception as e_default:
                if CALAMINE_AVAILABLE:
                    logger.warning(
                        f"    - Default engine failed ({e_default}). Retrying with 'calamine'..."
                    )
                    temp_df = pd.read_excel(
                        path, header=None, nrows=30, engine="calamine"
                    )
                else:
                    raise e_default

            header_row_idx: int = 0
            for idx in range(len(temp_df)):
                row = temp_df.iloc[idx]
                row_str = row.astype(str).str.lower().tolist()
                if "isin" in row_str and "name" in row_str:
                    header_row_idx = idx
                    break

            engine = "calamine" if CALAMINE_AVAILABLE else None

            logger.info(f"    - Detected header at row {header_row_idx}")
            return pd.read_excel(path, header=header_row_idx, engine=engine)

        except Exception as e:
            logger.error(f"    - Failed to read manual XLSX: {e}")
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

    def _process_manual_dataframe(self, df: pd.DataFrame) -> Optional[pd.DataFrame]:
        """Cleans and normalizes the manually loaded dataframe."""
        # 1. Normalize Columns
        df.columns = df.columns.str.strip().str.lower()

        col_map = {
            "isin": "isin",
            "name": "name",
            "gewichtung": "weight_percentage",
            "gewichtung (%)": "weight_percentage",
            "weight": "weight_percentage",
            "sektor": "sector",
            "land": "country",
            "währung": "currency",
            "currency": "currency",
        }
        df = df.rename(columns=col_map)

        if "isin" not in df.columns or "weight_percentage" not in df.columns:
            logger.error(
                f"    - Manual file missing required columns. Found: {df.columns.tolist()}"
            )
            return None

        # 2. Clean Data
        initial_len = len(df)
        df = pd.DataFrame(df.dropna(subset=["name", "weight_percentage"]))
        df = pd.DataFrame(df[df["isin"].astype(str).str.len() > 5])
        df = pd.DataFrame(
            df[~df["name"].astype(str).str.contains("Total", case=False, na=False)]
        )
        df = pd.DataFrame(
            df[~df["name"].astype(str).str.contains("Assets", case=False, na=False)]
        )

        if len(df) < initial_len:
            logger.info(f"    - Dropped {initial_len - len(df)} footer/invalid rows.")

        # Clean Weight
        if df["weight_percentage"].dtype == object:
            df["weight_percentage"] = (
                df["weight_percentage"]
                .astype(str)
                .str.replace("%", "")
                .str.replace(",", ".")
                .str.strip()
            )

        df["weight_percentage"] = pd.to_numeric(
            df["weight_percentage"], errors="coerce"
        )

        # Auto-Scale
        total_weight = df["weight_percentage"].sum()
        if 0.0 < total_weight <= 1.5:
            logger.info(
                f"    - Detected decimal weights (Sum={total_weight:.4f}). Scaling by 100."
            )
            df["weight_percentage"] = df["weight_percentage"] * 100

        df["weight_percentage"] = df["weight_percentage"].clip(lower=0.0)

        # Ensure Schema
        for col in ["ticker", "sector", "country", "currency"]:
            if col not in df.columns:
                df[col] = None

        cols_to_return = [
            "ticker",
            "isin",
            "name",
            "weight_percentage",
            "sector",
            "country",
            "currency",
        ]
        logger.info(f"    - Successfully parsed manual file with {len(df)} rows.")
        return pd.DataFrame(df[cols_to_return])

    def _fetch_via_playwright(self, isin: str) -> pd.DataFrame:
        """Executes Playwright automation to download the holdings file."""
        try:
            from prism_utils.browser import (
                BrowserContext,
                handle_cookie_consent,
                wait_for_download,
                save_debug_screenshot,
                PlaywrightNotInstalledError,
            )
        except ImportError as e:
            logger.error(f"Failed to import browser utilities: {e}")
            return pd.DataFrame()

        # Build the target URL
        target_url = self._build_amundi_url(isin)

        try:
            with BrowserContext(headless=True) as ctx:
                page = ctx.new_page()

                # Navigate to product page
                logger.info(f"1. Navigating to: {target_url}")
                page.goto(target_url)
                page.wait_for_load_state("networkidle")

                # Handle profile selection modal
                logger.info("2. Handling profile selection modal...")
                try:
                    profile_button = page.locator("button[data-profile='RETAIL']")
                    if profile_button.is_visible(timeout=5000):
                        profile_button.click()
                        page.wait_for_timeout(1000)

                    confirm_button = page.locator("#confirmDisclaimer")
                    if confirm_button.is_visible(timeout=3000):
                        confirm_button.click()
                        page.wait_for_timeout(2000)
                except Exception as e:
                    logger.debug(f"   Profile modal handling: {e}")

                # Handle cookie consent
                logger.info("3. Handling cookie consent...")
                handle_cookie_consent(page)
                page.wait_for_timeout(2000)

                # Click on the composition tab
                logger.info("4. Opening the 'Zusammensetzung' tab...")
                try:
                    # Try multiple selectors for the composition tab
                    tab_selectors = [
                        "button:has-text('ZUSAMMENSETZUNG')",
                        "button:has-text('Zusammensetzung')",
                        "[data-tab='composition']",
                        "a:has-text('Zusammensetzung')",
                    ]

                    for selector in tab_selectors:
                        tab = page.locator(selector).first
                        if tab.is_visible(timeout=2000):
                            tab.click()
                            page.wait_for_timeout(2000)
                            break
                except Exception as e:
                    logger.warning(f"   Could not click composition tab: {e}")

                # Find and click the download link
                logger.info("5. Finding and clicking the download link...")
                download_selectors = [
                    "a:has-text('KOMPONENTEN DES ETFS HERUNTERLADEN')",
                    "a:has-text('Komponenten des ETFs herunterladen')",
                    "a:has-text('Download')",
                    "a[href*='.xlsx']",
                    "button:has-text('Download')",
                ]

                download_path = None
                for selector in download_selectors:
                    try:
                        download_link = page.locator(selector).first
                        if download_link.is_visible(timeout=3000):
                            download_path = wait_for_download(
                                page, lambda s=selector: page.locator(s).first.click()
                            )
                            break
                    except Exception as e:
                        logger.debug(f"   Download selector {selector} failed: {e}")
                        continue

                if download_path and os.path.exists(download_path):
                    logger.info(f"6. Download successful: {download_path}")
                    return self._parse_downloaded_file(download_path)
                else:
                    logger.error("   - Download failed. Saving debug screenshot...")
                    save_debug_screenshot(page, f"amundi_{isin}_error")
                    return pd.DataFrame()

        except PlaywrightNotInstalledError as e:
            logger.error(str(e))
            return pd.DataFrame()
        except Exception as e:
            logger.error(f"An unexpected error occurred in Amundi acquisition: {e}")
            return pd.DataFrame()

    def _build_amundi_url(self, isin: str) -> str:
        """Builds the Amundi product page URL for a given ISIN."""
        # Amundi URL patterns vary by product
        # Common pattern for German retail site
        base_url = "https://www.amundietf.de/de/privatanleger/products"

        # Known product slugs (can be expanded)
        product_slugs = {
            "FR0010361683": "equity/amundi-stoxx-europe-600-ucits-etf-acc",
            "LU0908500753": "equity/amundi-prime-global-ucits-etf-dr-c",
        }

        slug = product_slugs.get(isin, f"equity/{isin}")
        return f"{base_url}/{slug}/{isin}"

    def _parse_downloaded_file(self, file_path: str) -> pd.DataFrame:
        """Parses the standard Amundi download format."""
        try:
            # Amundi files typically have headers on row 9
            df = pd.read_excel(file_path, header=9)

            # Try to find the right columns
            possible_columns = {
                "Name": "name",
                "ISIN": "isin",
                "Gewichtung (%)": "weight_percentage",
                "Weight": "weight_percentage",
                "Weight (%)": "weight_percentage",
            }

            # Rename columns that exist
            rename_map = {}
            for old, new in possible_columns.items():
                if old in df.columns:
                    rename_map[old] = new

            if rename_map:
                df = df.rename(columns=rename_map)

            # Ensure required columns exist
            if "name" not in df.columns or "weight_percentage" not in df.columns:
                # Try alternative header positions
                for header_row in [0, 1, 2, 8, 9, 10]:
                    try:
                        df = pd.read_excel(file_path, header=header_row)
                        df.columns = df.columns.str.strip()
                        if "Name" in df.columns or "name" in df.columns:
                            df = df.rename(columns=possible_columns)
                            break
                    except Exception:
                        continue

            # Clean up
            if "name" in df.columns and "weight_percentage" in df.columns:
                df = pd.DataFrame(df.dropna(subset=["name", "weight_percentage"]))
                logger.info(f"   - Parsed {len(df)} holdings from downloaded file.")
                return pd.DataFrame(df[["name", "isin", "weight_percentage"]])

            logger.error(f"   - Could not find required columns in {file_path}")
            return pd.DataFrame()

        except Exception as e:
            logger.error(f"Failed to parse downloaded file: {e}")
            return pd.DataFrame()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python amundi.py <isin>", file=sys.stderr)
        sys.exit(1)

    isin_arg = sys.argv[1]
    adapter = AmundiAdapter()
    holdings = adapter.fetch_holdings(isin_arg)
    if not holdings.empty:
        print(f"Successfully fetched {len(holdings)} holdings.")
        print(holdings.head())
    else:
        print("Failed to fetch holdings.")
