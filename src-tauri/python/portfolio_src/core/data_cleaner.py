"""
Data Cleaner Utility - Handles messy manual uploads (CSV, XLSX, JSON).

Includes heuristic header detection and junk row removal.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional, List, Tuple, Any, cast
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.core.utils import SchemaNormalizer

logger = get_logger(__name__)


class DataCleaner:
    """Heuristic cleaner for messy financial data exports."""

    REQUIRED_KEYWORDS = ["isin", "weight", "name"]

    @staticmethod
    def smart_load(file_path: str) -> pd.DataFrame:
        """Load file based on extension."""
        path = Path(file_path)
        ext = path.suffix.lower()

        if ext == ".csv":
            return pd.read_csv(path)
        elif ext in [".xlsx", ".xls"]:
            return pd.read_excel(path)
        elif ext == ".json":
            return pd.read_json(path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")

    @classmethod
    def cleanup(cls, df: pd.DataFrame) -> pd.DataFrame:
        """
        Clean up raw DataFrame:
        1. Find the header row.
        2. Drop metadata above header.
        3. Drop junk rows (totals, empty).
        """
        if df.empty:
            return df

        # 1. Find Header Row
        header_idx = cls._find_header_row(df)
        if header_idx >= 0:
            # Re-promote the found row as header
            new_header = df.iloc[header_idx]
            df = cast(pd.DataFrame, df.iloc[header_idx + 1 :].copy())
            df.columns = cast(Any, new_header)

        # 2. Normalize Columns (Initial pass to find ISIN/Weight)
        df = SchemaNormalizer.normalize_columns(df)

        # 3. Drop Junk Rows
        # Drop rows where ISIN is missing or invalid
        if "isin" in df.columns:
            df = cast(pd.DataFrame, df[df["isin"].notna()])
            df = cast(
                pd.DataFrame, df[df["isin"].astype(str).str.len() >= 12]
            )  # Valid ISINs are 12 chars

        # Drop rows that look like "Total" or "Subtotal"
        if "name" in df.columns:
            df = cast(
                pd.DataFrame,
                df[
                    ~df["name"]
                    .astype(str)
                    .str.contains("total|sum|aggregate", case=False, na=False)
                ],
            )

        # 4. Force Types
        if "weight" in df.columns:
            df["weight"] = pd.to_numeric(df["weight"], errors="coerce")
            df["weight"] = cast(Any, df["weight"]).fillna(0.0)

        return df.reset_index(drop=True)

    @classmethod
    def _find_header_row(cls, df: pd.DataFrame) -> int:
        """Scan first N rows to find the one containing most keywords."""
        max_scan = min(20, len(df))
        best_row = -1

        # Check the current columns first
        current_cols = " ".join(df.columns.astype(str)).lower()
        max_matches = sum(1 for kw in cls.REQUIRED_KEYWORDS if kw in current_cols)

        for i in range(max_scan):
            row_str = " ".join(df.iloc[i].astype(str)).lower()
            matches = sum(1 for kw in cls.REQUIRED_KEYWORDS if kw in row_str)
            if matches > max_matches:
                max_matches = matches
                best_row = i

        return best_row
