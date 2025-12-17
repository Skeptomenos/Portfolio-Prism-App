"""
Holdings Normalizer - Handle messy files from any provider.

Handles:
- Different column names (Name, Issuer, Security Name -> name)
- German number format (1.234,56 -> 1234.56)
- Percentage vs decimal weights (0.05 -> 5.0)
- Header rows in wrong position
- Footer/summary rows
- BOM characters and encoding issues
"""

import re
from typing import Optional

import pandas as pd

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Column name mappings - map various provider names to standard names
COLUMN_MAPPINGS = {
    # Weight/percentage columns
    "weight_percentage": [
        "weight_percentage",
        "weight",
        "% of holdings",
        "% of fund",
        "portfolio weight",
        "portfolio %",
        "allocation",
        "weighting",
        "gewichtung",
        "anteil",
        "poids",
        "% net assets",
        "net assets (%)",
        "market value (%)",
        "% market value",
    ],
    # Name columns
    "name": [
        "name",
        "security name",
        "issuer",
        "issuer name",
        "holding name",
        "company",
        "company name",
        "bezeichnung",
        "titel",
        "security",
        "constituent name",
        "instrument name",
    ],
    # ISIN columns
    "isin": [
        "isin",
        "isin code",
        "isin-code",
        "security isin",
        "constituent isin",
    ],
    # Ticker columns
    "ticker": [
        "ticker",
        "symbol",
        "exchange ticker",
        "bloomberg ticker",
        "trading symbol",
        "ticker symbol",
    ],
    # Sector columns
    "sector": [
        "sector",
        "industry",
        "gics sector",
        "industry sector",
        "branche",
        "sektor",
    ],
    # Country columns
    "country": [
        "country",
        "country of risk",
        "country of domicile",
        "location",
        "land",
        "pays",
    ],
    # Currency columns
    "currency": [
        "currency",
        "ccy",
        "local currency",
        "währung",
        "devise",
    ],
}


def normalize_holdings(
    df: pd.DataFrame,
    source_provider: Optional[str] = None,
) -> pd.DataFrame:
    """
    Normalize a holdings DataFrame to standard format.

    Args:
        df: Raw holdings DataFrame from any provider
        source_provider: Optional provider name for logging

    Returns:
        Normalized DataFrame with standard column names and data formats
    """
    if df.empty:
        logger.warning("Empty DataFrame provided to normalizer")
        return df

    df = df.copy()
    provider = source_provider or "unknown"
    logger.debug(f"Normalizing holdings from {provider}: {len(df)} rows")

    # Step 1: Clean column names
    df = _normalize_column_names(df)

    # Step 2: Find and set header row if needed
    df = _fix_header_row(df)

    # Step 3: Map columns to standard names
    df = _map_columns(df)

    # Step 4: Normalize weight values
    df = _normalize_weights(df)

    # Step 5: Clean string columns
    df = _clean_strings(df)

    # Step 6: Remove invalid rows
    df = _remove_invalid_rows(df)

    # Step 7: Sort by weight
    if "weight_percentage" in df.columns:
        df = df.sort_values("weight_percentage", ascending=False)

    logger.debug(f"Normalization complete: {len(df)} rows remaining")
    return df.reset_index(drop=True)


def _normalize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to lowercase, strip whitespace."""
    df.columns = [
        str(col).lower().strip().replace("\n", " ").replace("\r", "")
        for col in df.columns
    ]
    return df


def _fix_header_row(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect if the actual header is in a data row and fix it.

    Some providers have metadata rows before the actual header.
    """
    # Check if first column looks like a header indicator
    if len(df) < 2:
        return df

    first_row = df.iloc[0]

    # Check if first row contains typical header words
    header_indicators = ["name", "isin", "ticker", "weight", "security"]

    for val in first_row:
        if isinstance(val, str):
            val_lower = val.lower()
            if any(indicator in val_lower for indicator in header_indicators):
                # This row looks like a header - use it
                logger.debug("Found header row in data, adjusting")
                df.columns = [str(v).lower().strip() for v in first_row]
                df = df.iloc[1:].reset_index(drop=True)
                break

    return df


def _map_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map provider-specific column names to standard names."""
    column_map = {}

    for standard_name, variants in COLUMN_MAPPINGS.items():
        for variant in variants:
            variant_lower = variant.lower()
            for col in df.columns:
                col_lower = str(col).lower()
                if col_lower == variant_lower or variant_lower in col_lower:
                    if col not in column_map:
                        column_map[col] = standard_name
                        break

    if column_map:
        df = df.rename(columns=column_map)
        logger.debug(f"Mapped columns: {column_map}")

    return df


def _normalize_weights(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize weight values to percentage format."""
    if "weight_percentage" not in df.columns:
        # Try to find any weight-like column
        for col in df.columns:
            if "weight" in str(col).lower() or "%" in str(col):
                df["weight_percentage"] = df[col]
                break
        else:
            logger.warning("No weight column found")
            return df

    # Convert to numeric
    weight_series = df["weight_percentage"]
    if isinstance(weight_series, pd.DataFrame):
        weight_series = weight_series.iloc[:, 0]
    df["weight_percentage"] = _parse_numbers(weight_series)

    # Check if weights are decimals (sum < 2) and convert to percentage
    total = df["weight_percentage"].sum()
    if 0 < total < 2:
        df["weight_percentage"] = df["weight_percentage"] * 100
        logger.debug(f"Converted decimal weights to percentage (sum was {total:.4f})")

    return df


def _parse_numbers(series: pd.Series) -> pd.Series:
    """
    Parse a series of numbers handling various formats.

    Handles:
    - German format: 1.234,56 -> 1234.56
    - Percentage signs: 5.5% -> 5.5
    - Spaces and other separators
    """

    def parse_value(val):
        if pd.isna(val):
            return float("nan")

        val_str = str(val).strip()

        # Remove percentage sign
        val_str = val_str.replace("%", "")

        # Remove currency symbols and spaces
        val_str = re.sub(r"[€$£¥\s]", "", val_str)

        # Handle empty strings
        if not val_str or val_str in ["-", "N/A", "n/a", "nan", "None"]:
            return float("nan")

        # Detect German number format (comma as decimal separator)
        # German: 1.234,56 (dot = thousands, comma = decimal)
        # US: 1,234.56 (comma = thousands, dot = decimal)
        if "," in val_str and "." in val_str:
            # Both present - check which comes last
            last_comma = val_str.rfind(",")
            last_dot = val_str.rfind(".")
            if last_comma > last_dot:
                # German format: 1.234,56
                val_str = val_str.replace(".", "").replace(",", ".")
            else:
                # US format: 1,234.56
                val_str = val_str.replace(",", "")
        elif "," in val_str:
            # Only comma - could be German decimal or US thousands
            # If there's exactly one comma with 2 digits after, assume decimal
            parts = val_str.split(",")
            if len(parts) == 2 and len(parts[1]) <= 2:
                val_str = val_str.replace(",", ".")
            else:
                val_str = val_str.replace(",", "")

        try:
            return float(val_str)
        except ValueError:
            return float("nan")

    return pd.Series(series.apply(parse_value))


def _clean_strings(df: pd.DataFrame) -> pd.DataFrame:
    """Clean string columns - strip whitespace, normalize encoding."""
    string_cols = ["isin", "name", "ticker", "sector", "country", "currency"]

    for col in string_cols:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.strip()
                .str.replace(r"\s+", " ", regex=True)
                .replace(["nan", "None", "N/A", "-", ""], pd.NA)
            )

    # Validate ISIN format
    if "isin" in df.columns:
        df["isin"] = df["isin"].apply(_validate_isin)

    return df


def _validate_isin(val) -> Optional[str]:
    """Validate and normalize ISIN format."""
    if pd.isna(val) or val in [None, "nan", "None", ""]:
        return None

    val = str(val).strip().upper()

    # Basic ISIN format: 2 letters + 9 alphanumeric + 1 check digit
    if re.match(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$", val):
        return val

    return None


def _remove_invalid_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Remove rows that are clearly invalid (footers, totals, etc.)."""
    initial_count = len(df)

    # Remove rows with no weight
    if "weight_percentage" in df.columns:
        df = pd.DataFrame(df.dropna(subset=["weight_percentage"]))
        df = pd.DataFrame(df[df["weight_percentage"] > 0])

    # Remove total/summary rows
    if "name" in df.columns:
        summary_patterns = [
            r"^total",
            r"^sum",
            r"^cash",
            r"^other",
            r"^residual",
            r"^margin",
            r"^accrued",
        ]
        for pattern in summary_patterns:
            mask = df["name"].astype(str).str.lower().str.match(pattern, na=False)
            if mask.any():
                logger.debug(f"Removing {mask.sum()} rows matching '{pattern}'")
                df = pd.DataFrame(df[~mask])

    removed = initial_count - len(df)
    if removed > 0:
        logger.debug(f"Removed {removed} invalid rows")

    return df


def detect_file_format(file_path: str) -> dict:
    """
    Analyze a file to detect its format characteristics.

    Returns dict with:
    - encoding: detected encoding
    - delimiter: detected delimiter for CSV
    - header_row: row index of header
    - skip_rows: rows to skip at start
    """
    import chardet
    from pathlib import Path

    path = Path(file_path)
    result = {
        "encoding": "utf-8",
        "delimiter": ",",
        "header_row": 0,
        "skip_rows": 0,
    }

    # Detect encoding
    try:
        with open(path, "rb") as f:
            raw = f.read(10000)
            detected = chardet.detect(raw)
            if detected["encoding"]:
                result["encoding"] = detected["encoding"]
    except Exception:
        pass

    # Try to detect delimiter and header for CSV
    if path.suffix.lower() == ".csv":
        try:
            with open(path, "r", encoding=result["encoding"]) as f:
                first_lines = [f.readline() for _ in range(10)]

            # Detect delimiter
            import csv

            sniffer = csv.Sniffer()
            sample = "\n".join(first_lines)
            try:
                dialect = sniffer.sniff(sample)
                result["delimiter"] = dialect.delimiter
            except Exception:
                # Default to comma, but check for semicolon
                if first_lines and ";" in first_lines[0]:
                    result["delimiter"] = ";"

        except Exception:
            pass

    return result


def read_holdings_file(
    file_path: str,
    sheet_name: Optional[str] = None,
) -> pd.DataFrame:
    """
    Read a holdings file with automatic format detection.

    Args:
        file_path: Path to the file
        sheet_name: Sheet name for Excel files (optional)

    Returns:
        Raw DataFrame (not normalized)
    """
    from pathlib import Path

    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".csv":
        format_info = detect_file_format(file_path)
        return pd.read_csv(
            file_path,
            encoding=format_info["encoding"],
            delimiter=format_info["delimiter"],
            skiprows=format_info["skip_rows"],
        )
    elif suffix in [".xlsx", ".xls"]:
        return pd.read_excel(file_path, sheet_name=sheet_name or 0)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")
