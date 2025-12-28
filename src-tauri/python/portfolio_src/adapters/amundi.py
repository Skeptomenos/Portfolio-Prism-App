# src/adapters/amundi.py
"""
Amundi ETF Adapter

Fetches holdings data for Amundi ETFs.
Requires manual file upload (CSV/XLSX in manual_inputs directory).
"""

import sys
import os
import pandas as pd
from typing import Optional

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

try:
    from python_calamine.pandas import pandas_monkeypatch

    pandas_monkeypatch()
    CALAMINE_AVAILABLE = True
except ImportError:
    CALAMINE_AVAILABLE = False

from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src import config
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR
from portfolio_src.data.holdings_cache import ManualUploadRequired

logger = get_logger(__name__)


class AmundiAdapter:
    """
    Adapter for fetching ETF holdings data from Amundi.

    Strategy:
    1. Try manual file first (CSV/XLSX in manual_inputs directory)
    2. Raise ManualUploadRequired if no file found
    """

    def fetch_holdings(self, isin: str) -> pd.DataFrame:
        """
        Fetches holdings for an Amundi ETF.
        Looks for manual files first, raises ManualUploadRequired if not found.
        """
        logger.info(f"--- Running Amundi holdings acquisition for {isin} ---")

        df = self._fetch_from_manual_file(isin)
        if df is not None:
            return df

        download_url = (
            f"https://www.amundietf.de/de/privatanleger/products/equity/{isin}"
        )
        raise ManualUploadRequired(
            isin=isin,
            provider="Amundi",
            message=f"Amundi ETF holdings require manual upload. Download from: {download_url}",
            download_url=download_url,
        )

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


if __name__ == "__main__":
    if len(sys.argv) != 2:
        logger.error("Usage: python amundi.py <isin>")
        sys.exit(1)

    isin_arg = sys.argv[1]
    adapter = AmundiAdapter()
    holdings = adapter.fetch_holdings(isin_arg)
    if not holdings.empty:
        logger.info(f"Successfully fetched {len(holdings)} holdings.")
        logger.info(f"\n{holdings.head()}")
    else:
        logger.warning("Failed to fetch holdings.")
