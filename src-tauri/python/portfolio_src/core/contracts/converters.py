"""DataFrame to Pydantic Converters - Utilities for converting between pandas DataFrames and Pydantic models."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Type, TypeVar

import pandas as pd
from pydantic import BaseModel, ValidationError

from .quality import DataQuality, IssueCategory, IssueSeverity, ValidationIssue
from .schemas import HoldingRecord, LoadedPosition, ResolutionStatus

T = TypeVar("T", bound=BaseModel)

POSITION_COLUMN_ALIASES: Dict[str, List[str]] = {
    "isin": ["isin", "ISIN"],
    "name": ["name", "Name"],
    "quantity": ["quantity", "Quantity", "qty"],
    "current_price": ["current_price", "price", "tr_price"],
    "cost_basis": ["cost_basis", "avg_cost", "averageBuyIn"],
    "asset_class": ["asset_type", "asset_class"],
    "symbol": ["symbol", "ticker"],
    "sector": ["sector"],
    "region": ["region"],
    "currency": ["currency"],
}

HOLDING_COLUMN_ALIASES: Dict[str, List[str]] = {
    "ticker": ["ticker", "Ticker"],
    "name": ["name", "Name", "holding_name"],
    "weight_percentage": ["weight", "weight_percentage", "Weight"],
    "isin": ["isin", "ISIN"],
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to lowercase."""
    df = df.copy()
    df.columns = [str(c).lower() for c in df.columns]
    return df


def _find_column(df: pd.DataFrame, aliases: List[str]) -> Optional[str]:
    """Find a column in the DataFrame using a list of aliases."""
    for alias in aliases:
        if alias.lower() in df.columns:
            return alias.lower()
    return None


def _map_columns(df: pd.DataFrame, alias_map: Dict[str, List[str]]) -> Dict[str, Any]:
    """Map DataFrame columns to model field names using aliases."""
    result: Dict[str, Any] = {}
    for field_name, aliases in alias_map.items():
        col = _find_column(df, aliases)
        if col is not None:
            result[field_name] = col
    return result


def safe_convert_row(
    row: Dict[str, Any],
    model_class: Type[T],
    phase: str,
) -> Tuple[Optional[T], Optional[ValidationIssue]]:
    """Safely convert a row dict to a Pydantic model, returning an issue on failure."""
    try:
        return model_class(**row), None
    except ValidationError as e:
        item = row.get("isin", row.get("name", "unknown"))
        return None, ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.SCHEMA,
            code="CONVERSION_ERROR",
            message=f"Failed to convert row: {e.errors()[0]['msg'] if e.errors() else str(e)}",
            fix_hint="Check that all required fields are present and have valid values",
            item=str(item),
            phase=phase,
        )


def dataframe_to_loaded_positions(
    df: pd.DataFrame,
    phase: str = "DATA_LOADING",
) -> Tuple[List[LoadedPosition], DataQuality]:
    """Convert a DataFrame to a list of LoadedPosition models."""
    quality = DataQuality()
    positions: List[LoadedPosition] = []

    if df.empty:
        return positions, quality

    df = _normalize_columns(df)
    col_map = _map_columns(df, POSITION_COLUMN_ALIASES)

    for idx, row in df.iterrows():
        row_dict: Dict[str, Any] = {}
        for field_name, col_name in col_map.items():
            if col_name in df.columns:
                val = row[col_name]
                if pd.isna(val):
                    val = None
                row_dict[field_name] = val

        position, issue = safe_convert_row(row_dict, LoadedPosition, phase)
        if position is not None:
            positions.append(position)
        if issue is not None:
            quality.add_issue(issue)

    return positions, quality


def dataframe_to_holdings(
    df: pd.DataFrame,
    phase: str = "ETF_DECOMPOSITION",
) -> Tuple[List[HoldingRecord], DataQuality]:
    """Convert a DataFrame to a list of HoldingRecord models."""
    quality = DataQuality()
    holdings: List[HoldingRecord] = []

    if df.empty:
        return holdings, quality

    df = _normalize_columns(df)
    col_map = _map_columns(df, HOLDING_COLUMN_ALIASES)

    for idx, row in df.iterrows():
        row_dict: Dict[str, Any] = {}
        for field_name, col_name in col_map.items():
            if col_name in df.columns:
                val = row[col_name]
                if pd.isna(val):
                    val = None
                row_dict[field_name] = val

        if "resolution_status" not in row_dict:
            row_dict["resolution_status"] = ResolutionStatus.UNRESOLVED

        holding, issue = safe_convert_row(row_dict, HoldingRecord, phase)
        if holding is not None:
            holdings.append(holding)
        if issue is not None:
            quality.add_issue(issue)

    return holdings, quality


def loaded_positions_to_dataframe(positions: List[LoadedPosition]) -> pd.DataFrame:
    """Convert a list of LoadedPosition models to a DataFrame."""
    if not positions:
        return pd.DataFrame(
            columns=[
                "isin",
                "name",
                "quantity",
                "current_price",
                "cost_basis",
                "asset_class",
                "symbol",
                "sector",
                "region",
                "currency",
                "market_value",
            ]
        )

    data = []
    for pos in positions:
        data.append(
            {
                "isin": pos.isin,
                "name": pos.name,
                "quantity": pos.quantity,
                "current_price": pos.current_price,
                "cost_basis": pos.cost_basis,
                "asset_class": pos.asset_class.value,
                "symbol": pos.symbol,
                "sector": pos.sector,
                "region": pos.region,
                "currency": pos.currency,
                "market_value": pos.market_value,
            }
        )
    return pd.DataFrame(data)


def holdings_to_dataframe(holdings: List[HoldingRecord]) -> pd.DataFrame:
    """Convert a list of HoldingRecord models to a DataFrame."""
    if not holdings:
        return pd.DataFrame(
            columns=[
                "ticker",
                "raw_ticker",
                "name",
                "weight_percentage",
                "isin",
                "resolution_status",
                "resolution_source",
                "resolution_confidence",
            ]
        )

    data = []
    for h in holdings:
        data.append(
            {
                "ticker": h.ticker,
                "raw_ticker": h.raw_ticker,
                "name": h.name,
                "weight_percentage": h.weight_percentage,
                "isin": h.isin,
                "resolution_status": h.resolution_status.value,
                "resolution_source": h.resolution_source,
                "resolution_confidence": h.resolution_confidence,
            }
        )
    return pd.DataFrame(data)
