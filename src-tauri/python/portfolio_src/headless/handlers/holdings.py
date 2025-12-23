"""Holdings and Overlap Analysis Handlers.

Handles ETF holdings upload, true holdings decomposition, and overlap analysis.
"""

import json
import os
from typing import Any

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
    """Get decomposed true holdings across all ETFs.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with holdings list, or error response.
    """
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
    import pandas as pd

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return success_response(cmd_id, {"holdings": []})

    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)

        if df.empty:
            return success_response(cmd_id, {"holdings": []})

        # Group by child security
        grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg(
            {"value_eur": "sum", "sector": "first", "geography": "first"}
        )

        holdings = []
        for _, row in grouped.iterrows():
            child_isin = str(row["child_isin"])

            # Get sources (which ETFs contain this holding)
            sources = [
                {
                    "etf": str(s_row["parent_isin"]),
                    "value": round(float(s_row["value_eur"]), 2),
                    "weight": round(float(s_row["weight_percent"]) / 100.0, 4),
                }
                for _, s_row in df[df["child_isin"] == child_isin].iterrows()
            ]

            holdings.append(
                {
                    "stock": str(row["child_name"]),
                    "ticker": child_isin,
                    "totalValue": round(float(row["value_eur"]), 2),
                    "sector": str(row["sector"]),
                    "geography": str(row["geography"]),
                    "sources": sources,
                }
            )

        holdings.sort(key=lambda x: x["totalValue"], reverse=True)

        logger.debug(f"Returning {len(holdings)} true holdings")
        return success_response(cmd_id, {"holdings": holdings})
    except Exception as e:
        logger.error(f"Failed to get true holdings: {e}", exc_info=True)
        return error_response(cmd_id, "HOLDINGS_ERROR", str(e))


def handle_get_overlap_analysis(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get ETF overlap analysis matrix.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with overlap matrix and shared holdings, or error response.
    """
    import numpy as np
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
    import pandas as pd

    empty_response = {"etfs": [], "matrix": [], "sharedHoldings": []}

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return success_response(cmd_id, empty_response)

    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)

        if df.empty:
            return success_response(cmd_id, empty_response)

        etfs = sorted(df["parent_isin"].unique().tolist())

        if not etfs:
            return success_response(cmd_id, empty_response)

        # Build overlap matrix
        n = len(etfs)
        matrix = np.zeros((n, n))

        pivot_df = df.pivot(
            index="child_isin", columns="parent_isin", values="weight_percent"
        ).fillna(0)

        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i][j] = 100.0
                else:
                    matrix[i][j] = round(
                        float(np.minimum(pivot_df[etfs[i]], pivot_df[etfs[j]]).sum()), 1
                    )

        # Find shared holdings (held by multiple ETFs)
        shared_grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg(
            {"value_eur": "sum"}
        )

        shared_holdings = []
        for _, row in shared_grouped.iterrows():
            child_isin = str(row["child_isin"])
            parents = df[df["child_isin"] == child_isin]["parent_isin"].tolist()

            if len(parents) > 1:
                shared_holdings.append(
                    {
                        "stock": str(row["child_name"]),
                        "etfs": parents,
                        "totalValue": round(float(row["value_eur"]), 2),
                    }
                )

        shared_holdings.sort(key=lambda x: x["totalValue"], reverse=True)

        logger.debug(
            f"Overlap analysis: {n} ETFs, {len(shared_holdings)} shared holdings"
        )

        return success_response(
            cmd_id,
            {
                "etfs": etfs,
                "matrix": matrix.tolist(),
                "sharedHoldings": shared_holdings[:10],
            },
        )
    except Exception as e:
        logger.error(f"Failed to get overlap analysis: {e}", exc_info=True)
        return error_response(cmd_id, "OVERLAP_ERROR", str(e))


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
