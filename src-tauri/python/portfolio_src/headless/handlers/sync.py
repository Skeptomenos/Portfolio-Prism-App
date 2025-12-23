"""Portfolio Sync and Pipeline Handlers.

Handles portfolio synchronization with Trade Republic and analytics pipeline execution.
"""

import asyncio
import json
import re
import sys
import time
from typing import Any

from portfolio_src.headless.responses import success_response, error_response
from portfolio_src.headless.state import get_auth_manager, get_bridge, get_executor
from portfolio_src.models import AssetClass
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def detect_asset_class(isin: str, name: str) -> AssetClass:
    """Detect asset class from ISIN and name.

    Uses multiple heuristics:
    1. Name patterns: "(Acc)", "(Dist)", "ETF", "UCITS", "Index"
    2. ISIN patterns: Common ETF prefixes
    3. Crypto patterns: Bitcoin, Ethereum ISINs

    Args:
        isin: The ISIN identifier.
        name: The instrument name.

    Returns:
        AssetClass enum value
    """
    name_upper = name.upper()
    isin_upper = isin.upper()

    # Crypto detection (ETP/ETC products)
    crypto_keywords = ["BITCOIN", "ETHEREUM", "CRYPTO", "BTC", "ETH"]
    crypto_isin_prefixes = ["XF000BTC", "XF000ETH", "CH0454664"]
    if any(kw in name_upper for kw in crypto_keywords):
        return AssetClass.CRYPTO
    if any(isin_upper.startswith(prefix) for prefix in crypto_isin_prefixes):
        return AssetClass.CRYPTO

    # ETF detection by name patterns
    etf_name_patterns = [
        r"\(ACC\)",  # Accumulating
        r"\(DIST\)",  # Distributing
        r"\bETF\b",  # Explicit ETF
        r"\bUCITS\b",  # UCITS funds
        r"\bMSCI\b",  # MSCI index funds
        r"\bS&P\s*500\b",  # S&P 500 trackers
        r"\bNASDAQ\s*100\b",  # NASDAQ trackers
        r"\bSTOXX\b",  # STOXX index
        r"\bFTSE\b",  # FTSE index
        r"\bDAX\b",  # DAX index
        r"\bCORE\b.*\b(USD|EUR|GBP)\b",  # iShares Core products
        r"\bINDEX\b",  # Index funds
        r"\bTRACKER\b",  # Tracker funds
    ]
    for pattern in etf_name_patterns:
        if re.search(pattern, name_upper):
            return AssetClass.ETF

    # ETF detection by ISIN prefix (common ETF issuers)
    # IE = Ireland (iShares, Vanguard), LU = Luxembourg, DE000A = Germany ETFs
    etf_isin_prefixes = [
        "IE00B",  # iShares Ireland
        "IE00BF",  # iShares Ireland
        "IE00BK",  # iShares Ireland
        "IE00BL",  # iShares Ireland
        "IE0031",  # Vanguard Ireland
        "LU0",  # Luxembourg funds
        "LU1",  # Luxembourg funds
        "LU2",  # Luxembourg funds
        "FR0010",  # Amundi France
        "FR0011",  # Amundi France
        "DE000A0",  # Xtrackers Germany
        "DE000A1",  # Xtrackers Germany
        "DE000A2",  # Xtrackers Germany
    ]
    for prefix in etf_isin_prefixes:
        if isin_upper.startswith(prefix):
            # Double-check it's not a single stock by checking name
            # Some single stocks also have these prefixes
            if not any(
                x in name_upper
                for x in ["AG", "SE", "INC", "CORP", "LTD", "PLC", "GMBH"]
            ):
                return AssetClass.ETF

    return AssetClass.STOCK


def emit_progress(progress: int, message: str, phase: str = "pipeline") -> None:
    """Emit sync progress event via stdout AND SSE broadcast.

    This is the ONLY allowed stdout usage in handlers (for IPC events).
    Also broadcasts to SSE clients for browser mode support.

    Args:
        progress: Progress percentage (0-100).
        message: Human-readable progress message.
        phase: Pipeline phase identifier (e.g., 'sync', 'loading', 'decomposition').
    """
    # Stdout for Tauri IPC
    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": progress, "message": message, "phase": phase},
            }
        )
    )
    sys.stdout.flush()

    # SSE broadcast for browser mode (Echo-Bridge)
    try:
        from portfolio_src.headless.transports.echo_bridge import broadcast_progress

        broadcast_progress(progress, message, phase)
    except ImportError:
        pass  # Echo-Bridge not available (e.g., in Tauri mode)


async def handle_sync_portfolio(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Sync portfolio data from Trade Republic.

    Fetches positions, writes to database, and triggers analytics pipeline.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'portfolioId' (defaults to 1).

    Returns:
        Success response with sync results, or error response.
    """
    from portfolio_src.data.tr_sync import TRDataFetcher
    from portfolio_src.data.database import sync_positions_from_tr, update_sync_state

    loop = asyncio.get_event_loop()
    executor = get_executor()
    portfolio_id = payload.get("portfolioId", 1)

    emit_progress(0, "Starting sync...", "sync")

    try:
        bridge = get_bridge()
        status = await loop.run_in_executor(executor, bridge.get_status)

        # Try to restore session if not authenticated
        if status.get("status") != "authenticated":
            emit_progress(2, "Restoring session...", "sync")
            auth_manager = get_auth_manager()
            restore_result = await auth_manager.try_restore_session()

            if restore_result.success:
                emit_progress(5, "Session restored.", "sync")
                status = await loop.run_in_executor(executor, bridge.get_status)
            else:
                logger.warning(f"Session restoration failed: {restore_result.message}")

        if status.get("status") != "authenticated":
            return error_response(
                cmd_id,
                "TR_AUTH_REQUIRED",
                "Please authenticate with Trade Republic first",
            )

        emit_progress(10, "Connecting to Trade Republic...", "sync")
        start_time = time.time()

        fetcher = TRDataFetcher(bridge)
        emit_progress(30, "Fetching portfolio...", "sync")

        raw_positions = await loop.run_in_executor(
            executor, fetcher.fetch_portfolio_sync
        )

        emit_progress(50, f"Processing {len(raw_positions)} positions...", "sync")

        # Transform positions for database with proper asset classification
        tr_positions = []
        etf_count = 0
        crypto_count = 0
        for pos in raw_positions:
            isin = pos["isin"]
            name = pos["name"]
            asset_class = detect_asset_class(isin, name)
            if asset_class == AssetClass.ETF:
                etf_count += 1
            elif asset_class == AssetClass.CRYPTO:
                crypto_count += 1
            tr_positions.append(
                {
                    "isin": isin,
                    "name": name,
                    "symbol": "",
                    "quantity": pos["quantity"],
                    "cost_basis": pos["avg_cost"],
                    "current_price": pos["current_price"],
                    "asset_class": asset_class.value,
                }
            )
        logger.info(
            f"Classified {len(tr_positions)} positions: "
            f"{etf_count} ETFs, {crypto_count} crypto, "
            f"{len(tr_positions) - etf_count - crypto_count} stocks"
        )

        emit_progress(70, "Writing to database...", "sync")
        sync_result = sync_positions_from_tr(portfolio_id, tr_positions)

        update_sync_state(
            "trade_republic",
            "success",
            f"Synced {sync_result['synced_positions']} positions",
        )

        duration_ms = int((time.time() - start_time) * 1000)
        emit_progress(100, "Sync complete! Running Deep Analysis...", "sync")

        # Trigger analytics pipeline
        await handle_run_pipeline(cmd_id, payload)

        logger.info(
            f"Portfolio sync complete: {sync_result['synced_positions']} positions in {duration_ms}ms"
        )

        return success_response(
            cmd_id,
            {
                "syncedPositions": sync_result["synced_positions"],
                "newPositions": sync_result["new_positions"],
                "updatedPositions": sync_result["updated_positions"],
                "totalValue": sync_result["total_value"],
                "durationMs": duration_ms,
            },
        )
    except Exception as e:
        logger.error(f"Portfolio sync failed: {e}", exc_info=True)
        update_sync_state("trade_republic", "error", str(e))
        return error_response(cmd_id, "TR_SYNC_FAILED", str(e))


async def handle_run_pipeline(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Run the analytics pipeline.

    Executes decomposition, enrichment, and aggregation.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with pipeline results, or error response.
    """
    from portfolio_src.core.pipeline import Pipeline

    emit_progress(0, "Starting analytics pipeline...", "pipeline")
    start_time = time.time()

    try:

        def pipeline_progress(msg: str, pct: float, phase: str = "pipeline") -> None:
            time.sleep(0.1)  # Small delay to prevent flooding
            emit_progress(int(pct * 100), msg, phase)

        pipeline = Pipeline()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, pipeline.run, pipeline_progress)

        duration_ms = int((time.time() - start_time) * 1000)

        if not result.success:
            emit_progress(100, "Analytics completed with warnings.", "complete")
            logger.warning(f"Pipeline completed with {len(result.errors)} errors")
            return success_response(
                cmd_id,
                {
                    "success": False,
                    "errors": [str(e) for e in result.errors],
                    "durationMs": duration_ms,
                },
            )
        else:
            emit_progress(100, "Analytics complete!", "complete")
            logger.info(f"Pipeline complete in {duration_ms}ms")
            return success_response(
                cmd_id,
                {"success": True, "errors": [], "durationMs": duration_ms},
            )
    except Exception as e:
        logger.error(f"Failed to run pipeline: {e}", exc_info=True)
        return error_response(cmd_id, "PIPELINE_ERROR", str(e))
