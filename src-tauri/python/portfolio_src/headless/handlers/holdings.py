"""Holdings and Overlap Analysis Handlers.

Handles ETF holdings upload, true holdings decomposition, and pipeline reporting.
"""

import json
import os
from typing import Any

import pandas as pd

from portfolio_src.core.contracts import validate_pipeline_health_report
from portfolio_src.headless.responses import success_response, error_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)
PIPELINE_REPORT_VERSION = 1


class HoldingsUploadError(Exception):
    """Typed upload error that preserves stable IPC error codes."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _build_preview_rows(df_clean: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ticker_series = df_clean["ticker"] if "ticker" in df_clean.columns else None

    for index, row in df_clean.iterrows():
        ticker = None
        if ticker_series is not None:
            raw_ticker = row.get("ticker")
            if raw_ticker is not None and not pd.isna(raw_ticker):
                ticker = str(raw_ticker).strip() or None

        rows.append(
            {
                "rowId": index,
                "isin": str(row.get("isin", "")).strip(),
                "name": str(row.get("name", "")).strip(),
                "ticker": ticker,
                "weight": round(float(row.get("weight", 0.0) or 0.0), 6),
            }
        )

    return rows


def _build_preview_warnings(df_clean: pd.DataFrame, total_weight: float) -> list[str]:
    warnings: list[str] = []

    if abs(total_weight - 100.0) > 0.5:
        warnings.append(
            f"Total weight is {round(total_weight, 2)}%, which differs from the expected 100%."
        )

    duplicate_isins = int(df_clean.duplicated(subset=["isin"]).sum()) if "isin" in df_clean.columns else 0
    if duplicate_isins > 0:
        warnings.append(f"Detected {duplicate_isins} duplicate ISIN rows. Review before saving.")

    missing_names = int(df_clean["name"].astype(str).str.strip().eq("").sum()) if "name" in df_clean.columns else 0
    if missing_names > 0:
        warnings.append(f"Detected {missing_names} rows with missing names.")

    return warnings


def _prepare_clean_holdings(file_path: str) -> pd.DataFrame:
    from portfolio_src.core.data_cleaner import DataCleaner

    df_raw = DataCleaner.smart_load(file_path)
    df_clean = DataCleaner.cleanup(df_raw)

    if df_clean.empty:
        raise HoldingsUploadError("CLEANUP_FAILED", "No valid holdings found in file")

    missing_columns = [column for column in ("isin", "name", "weight") if column not in df_clean.columns]
    if missing_columns:
        joined = ", ".join(missing_columns)
        raise ValueError(f"Missing required normalized columns: {joined}")

    df_clean = df_clean.copy()
    df_clean["isin"] = df_clean["isin"].astype(str).str.strip()
    df_clean["name"] = df_clean["name"].astype(str).str.strip()
    df_clean["weight"] = pd.to_numeric(df_clean["weight"], errors="coerce").fillna(0.0)

    df_clean = df_clean[
        df_clean["isin"].ne("")
        & df_clean["name"].ne("")
        & (df_clean["weight"] > 0)
    ].reset_index(drop=True)

    if df_clean.empty:
        raise HoldingsUploadError(
            "CLEANUP_FAILED", "No valid holdings remained after normalization"
        )

    return df_clean


def _save_holdings_to_cache(etf_isin: str, df_clean: pd.DataFrame) -> bool:
    from portfolio_src.data.holdings_cache import get_holdings_cache
    from portfolio_src.data.hive_client import get_hive_client

    cache = get_holdings_cache()
    cache._save_to_local_cache(etf_isin, df_clean, source="manual_upload")

    hive_client = get_hive_client()
    return hive_client.contribute_etf_holdings(etf_isin, df_clean) if hive_client.is_configured else False


def handle_upload_holdings(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Upload manual ETF holdings from a file.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'filePath' and 'etfIsin'.

    Returns:
        Success response with upload results, or error response.
    """
    file_path = payload.get("filePath")
    etf_isin = payload.get("etfIsin")

    if not file_path or not etf_isin:
        return error_response(cmd_id, "INVALID_PARAMS", "filePath and etfIsin are required")

    try:
        logger.info(
            "Uploading holdings for ETF", extra={"etf_isin": etf_isin, "file_path": file_path}
        )

        df_clean = _prepare_clean_holdings(file_path)
        total_weight = float(df_clean["weight"].sum())
        contribution_success = _save_holdings_to_cache(etf_isin, df_clean)

        logger.info(
            f"Holdings upload complete: {len(df_clean)} holdings, "
            f"total weight {total_weight:.1f}%, contributed to Hive: {contribution_success}"
        )

        return success_response(
            cmd_id,
            {
                "success": True,
                "isin": etf_isin,
                "holdingsCount": len(df_clean),
                "totalWeight": round(total_weight, 2),
                "contributedToHive": contribution_success,
                "message": "Holdings saved successfully.",
            },
        )
    except HoldingsUploadError as e:
        logger.warning(
            "Manual upload rejected",
            extra={"etf_isin": etf_isin, "error": str(e), "error_code": e.code},
        )
        return error_response(cmd_id, e.code, str(e))
    except Exception as e:
        logger.error(
            "Manual upload failed",
            extra={"etf_isin": etf_isin, "error": str(e), "error_type": type(e).__name__},
            exc_info=True,
        )
        return error_response(cmd_id, "UPLOAD_FAILED", str(e))


def handle_preview_holdings_upload(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Preview holdings upload before saving it to cache."""
    file_path = payload.get("filePath")
    etf_isin = payload.get("etfIsin")

    if not file_path or not etf_isin:
        return error_response(cmd_id, "INVALID_PARAMS", "filePath and etfIsin are required")

    try:
        df_clean = _prepare_clean_holdings(file_path)
        total_weight = float(df_clean["weight"].sum())
        rows = _build_preview_rows(df_clean)
        warnings = _build_preview_warnings(df_clean, total_weight)

        logger.info(
            "Generated holdings preview",
            extra={
                "etf_isin": etf_isin,
                "file_path": file_path,
                "holdings_count": len(rows),
            },
        )

        return success_response(
            cmd_id,
            {
                "isin": etf_isin,
                "filePath": file_path,
                "fileName": os.path.basename(file_path),
                "holdingsCount": len(rows),
                "totalWeight": round(total_weight, 2),
                "warnings": warnings,
                "rows": rows,
            },
        )
    except Exception as e:
        logger.error(
            "Holdings preview failed",
            extra={"etf_isin": etf_isin, "error": str(e), "error_type": type(e).__name__},
            exc_info=True,
        )
        return error_response(cmd_id, "UPLOAD_PREVIEW_FAILED", str(e))


def handle_commit_holdings_upload(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Persist reviewed holdings rows after user confirmation."""
    etf_isin = payload.get("etfIsin")
    holdings = payload.get("holdings")

    if not etf_isin or not isinstance(holdings, list):
        return error_response(cmd_id, "INVALID_PARAMS", "etfIsin and holdings are required")

    try:
        if not holdings:
            return error_response(cmd_id, "INVALID_PARAMS", "At least one holding is required")

        df_clean = pd.DataFrame(holdings)
        missing_columns = [column for column in ("isin", "name", "weight") if column not in df_clean.columns]
        if missing_columns:
            joined = ", ".join(missing_columns)
            return error_response(cmd_id, "INVALID_PARAMS", f"Missing holding fields: {joined}")

        df_clean = df_clean.copy()
        df_clean["isin"] = df_clean["isin"].astype(str).str.strip()
        df_clean["name"] = df_clean["name"].astype(str).str.strip()
        df_clean["weight"] = pd.to_numeric(df_clean["weight"], errors="coerce").fillna(0.0)

        if "ticker" in df_clean.columns:
            df_clean["ticker"] = df_clean["ticker"].astype(str).str.strip()

        df_clean = df_clean[
            df_clean["isin"].ne("")
            & df_clean["name"].ne("")
            & (df_clean["weight"] > 0)
        ].reset_index(drop=True)

        if df_clean.empty:
            return error_response(cmd_id, "INVALID_PARAMS", "No valid holdings to save")

        total_weight = float(df_clean["weight"].sum())
        contribution_success = _save_holdings_to_cache(etf_isin, df_clean)

        logger.info(
            "Committed reviewed holdings upload",
            extra={
                "etf_isin": etf_isin,
                "holdings_count": len(df_clean),
                "total_weight": total_weight,
            },
        )

        return success_response(
            cmd_id,
            {
                "success": True,
                "isin": etf_isin,
                "holdingsCount": len(df_clean),
                "totalWeight": round(total_weight, 2),
                "contributedToHive": contribution_success,
                "message": "Holdings saved successfully. Re-run analysis when you are ready.",
            },
        )
    except Exception as e:
        logger.error(
            "Commit holdings upload failed",
            extra={"etf_isin": etf_isin, "error": str(e), "error_type": type(e).__name__},
            exc_info=True,
        )
        return error_response(cmd_id, "UPLOAD_COMMIT_FAILED", str(e))


def handle_get_true_holdings(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get decomposed true holdings across all ETFs with resolution provenance."""
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH

    empty_response = {"holdings": [], "summary": _empty_summary()}

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return success_response(cmd_id, empty_response)

    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)

        if df.empty:
            return success_response(cmd_id, empty_response)

        resolution_defaults = {
            "resolution_status": "unknown",
            "resolution_source": "unknown",
            "resolution_confidence": 0.0,
            "resolution_detail": "",
            "ticker": "",
        }
        for col, default in resolution_defaults.items():
            if col not in df.columns:
                df[col] = default

        # Group by ISIN only — NOT by (ISIN, name).
        # Different sources may use different names for the same company
        # (e.g., "NVIDIA" from direct holdings vs "NVIDIA CORP" from ETF decomposition).
        # The ISIN is the canonical identifier — names are display-only.
        grouped = df.groupby("child_isin", as_index=False).agg(
            {
                "child_name": "first",
                "value_eur": "sum",
                "sector": "first",
                "geography": "first",
                "ticker": "first",
                "resolution_status": "first",
                "resolution_source": "first",
                "resolution_confidence": "max",
                "resolution_detail": "first",
            }
        )

        holdings = []
        for _, row in grouped.iterrows():
            raw_isin = row["child_isin"]
            has_valid_isin = (
                raw_isin is not None
                and not bool(pd.isna(raw_isin))
                and str(raw_isin) not in ("nan", "None", "")
            )
            child_isin = str(raw_isin) if has_valid_isin else None

            sources = [
                {
                    "etf": str(s_row["parent_isin"]),
                    "value": round(float(s_row["value_eur"]), 2),
                    "weight": round(float(s_row["weight_percent"]) / 100.0, 4),
                }
                for _, s_row in df[df["child_isin"] == raw_isin].iterrows()
            ]

            holdings.append(
                {
                    "stock": str(row["child_name"]),
                    "ticker": _safe_str(row.get("ticker")) or child_isin or "",
                    "isin": child_isin,
                    "totalValue": round(float(row["value_eur"]), 2),
                    "sector": _safe_str(row.get("sector")),
                    "geography": _safe_str(row.get("geography")),
                    "sources": sources,
                    "resolutionStatus": _safe_str(row.get("resolution_status", "unknown")),
                    "resolutionSource": _safe_str(row.get("resolution_source", "unknown")),
                    "resolutionConfidence": float(row.get("resolution_confidence") or 0.0),
                    "resolutionDetail": _safe_str(row.get("resolution_detail")),
                }
            )

        holdings.sort(key=lambda x: x["totalValue"], reverse=True)

        summary = _calculate_summary(holdings)

        logger.debug("Returning true holdings with resolution data", extra={"count": len(holdings)})
        return success_response(cmd_id, {"holdings": holdings, "summary": summary})
    except Exception as e:
        logger.error(
            "Failed to get true holdings",
            extra={"error": str(e), "error_type": type(e).__name__},
            exc_info=True,
        )
        return error_response(cmd_id, "HOLDINGS_ERROR", str(e))


def _safe_str(val) -> str:
    if val is None or pd.isna(val):
        return ""
    s = str(val)
    return "" if s in ("nan", "None") else s


def _empty_summary() -> dict:
    return {
        "total": 0,
        "resolved": 0,
        "unresolved": 0,
        "skipped": 0,
        "unknown": 0,
        "bySource": {},
        "healthScore": 1.0,
    }


def _calculate_summary(holdings: list) -> dict:
    total = len(holdings)
    if total == 0:
        return _empty_summary()

    resolved = sum(1 for h in holdings if h.get("resolutionStatus") == "resolved")
    unresolved = sum(1 for h in holdings if h.get("resolutionStatus") == "unresolved")
    skipped = sum(1 for h in holdings if h.get("resolutionStatus") == "skipped")
    unknown = sum(1 for h in holdings if h.get("resolutionStatus") == "unknown")

    by_source: dict[str, int] = {}
    for h in holdings:
        source = h.get("resolutionSource") or "unknown"
        by_source[source] = by_source.get(source, 0) + 1

    denominator = resolved + unresolved
    health_score = resolved / denominator if denominator > 0 else 1.0

    return {
        "total": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "skipped": skipped,
        "unknown": unknown,
        "bySource": by_source,
        "healthScore": round(health_score, 3),
    }


def _build_pipeline_report_envelope(report: Any) -> dict[str, Any]:
    generated_at = report.get("timestamp") if isinstance(report, dict) else None
    validation_errors = validate_pipeline_health_report(report)

    if validation_errors:
        logger.warning(
            "Pipeline report shape invalid",
            extra={"generated_at": generated_at, "validation_errors": validation_errors},
        )
        return {
            "status": "invalid",
            "reportVersion": PIPELINE_REPORT_VERSION,
            "generatedAt": generated_at if isinstance(generated_at, str) else None,
            "report": None,
            "validationErrors": validation_errors,
        }

    return {
        "status": "ready",
        "reportVersion": PIPELINE_REPORT_VERSION,
        "generatedAt": generated_at,
        "report": report,
        "validationErrors": [],
    }


def handle_get_pipeline_report(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get the latest pipeline health report.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with report data, or error response.
    """
    from portfolio_src.config import PIPELINE_HEALTH_PATH

    if not os.path.exists(PIPELINE_HEALTH_PATH):
        return success_response(
            cmd_id,
            {
                "status": "missing",
                "reportVersion": PIPELINE_REPORT_VERSION,
                "generatedAt": None,
                "report": None,
                "validationErrors": [],
            },
        )

    try:
        with open(PIPELINE_HEALTH_PATH, "r") as f:
            data = json.load(f)

        return success_response(cmd_id, _build_pipeline_report_envelope(data))
    except Exception as e:
        logger.error(
            "Failed to read pipeline report",
            extra={"error": str(e), "error_type": type(e).__name__},
            exc_info=True,
        )
        return error_response(cmd_id, "REPORT_ERROR", str(e))
