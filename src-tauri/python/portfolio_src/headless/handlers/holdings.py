"""Holdings and Overlap Analysis Handlers.

Handles ETF holdings upload, true holdings decomposition, and pipeline reporting.
"""

import json
import os
from typing import Any

import pandas as pd

from portfolio_src.headless.responses import success_response, error_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def handle_upload_holdings(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Upload manual ETF holdings from a file.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'filePath' and 'etfIsin'.

    Returns:
        Success response with upload results, or error response.
    """
    from portfolio_src.core.data_cleaner import DataCleaner
    from portfolio_src.data.holdings_cache import get_holdings_cache
    from portfolio_src.data.hive_client import get_hive_client

    file_path = payload.get("filePath")
    etf_isin = payload.get("etfIsin")

    if not file_path or not etf_isin:
        return error_response(
            cmd_id, "INVALID_PARAMS", "filePath and etfIsin are required"
        )

    try:
        logger.info(f"Uploading holdings for ETF {etf_isin} from {file_path}")

        df_raw = DataCleaner.smart_load(file_path)
        df_clean = DataCleaner.cleanup(df_raw)

        if df_clean.empty:
            return error_response(
                cmd_id, "CLEANUP_FAILED", "No valid holdings found in file"
            )

        total_weight = float(df_clean["weight"].sum())

        # Save to local cache
        cache = get_holdings_cache()
        cache._save_to_local_cache(etf_isin, df_clean, source="manual_upload")

        # Contribute to Hive if configured
        hive_client = get_hive_client()
        contribution_success = (
            hive_client.contribute_etf_holdings(etf_isin, df_clean)
            if hive_client.is_configured
            else False
        )

        logger.info(
            f"Holdings upload complete: {len(df_clean)} holdings, "
            f"total weight {total_weight:.1f}%, contributed to Hive: {contribution_success}"
        )

        return success_response(
            cmd_id,
            {
                "isin": etf_isin,
                "holdingsCount": len(df_clean),
                "totalWeight": round(total_weight, 2),
                "contributedToHive": contribution_success,
            },
        )
    except Exception as e:
        logger.error(f"Manual upload failed for {etf_isin}: {e}", exc_info=True)
        return error_response(cmd_id, "UPLOAD_FAILED", str(e))


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

        grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg(
            {
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
                    "resolutionStatus": _safe_str(
                        row.get("resolution_status", "unknown")
                    ),
                    "resolutionSource": _safe_str(
                        row.get("resolution_source", "unknown")
                    ),
                    "resolutionConfidence": float(
                        row.get("resolution_confidence") or 0.0
                    ),
                    "resolutionDetail": _safe_str(row.get("resolution_detail")),
                }
            )

        holdings.sort(key=lambda x: x["totalValue"], reverse=True)

        summary = _calculate_summary(holdings)

        logger.debug(f"Returning {len(holdings)} true holdings with resolution data")
        return success_response(cmd_id, {"holdings": holdings, "summary": summary})
    except Exception as e:
        logger.error(f"Failed to get true holdings: {e}", exc_info=True)
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
        return success_response(cmd_id, None)

    try:
        with open(PIPELINE_HEALTH_PATH, "r") as f:
            data = json.load(f)

        return success_response(cmd_id, data)
    except Exception as e:
        logger.error(f"Failed to read pipeline report: {e}", exc_info=True)
        return error_response(cmd_id, "REPORT_ERROR", str(e))
