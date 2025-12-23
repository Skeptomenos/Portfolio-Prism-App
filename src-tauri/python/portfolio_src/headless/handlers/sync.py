"""Portfolio Sync and Pipeline Handlers.

Handles portfolio synchronization with Trade Republic and analytics pipeline execution.
"""

import asyncio
import json
import sys
import time
from typing import Any

from portfolio_src.headless.responses import success_response, error_response
from portfolio_src.headless.state import get_auth_manager, get_bridge, get_executor
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def emit_progress(progress: int, message: str) -> None:
    """Emit sync progress event via stdout.

    This is the ONLY allowed stdout usage in handlers (for IPC events).

    Args:
        progress: Progress percentage (0-100).
        message: Human-readable progress message.
    """
    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": progress, "message": message},
            }
        )
    )
    sys.stdout.flush()


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

    emit_progress(0, "Starting sync...")

    try:
        bridge = get_bridge()
        status = await loop.run_in_executor(executor, bridge.get_status)

        # Try to restore session if not authenticated
        if status.get("status") != "authenticated":
            emit_progress(2, "Restoring session...")
            auth_manager = get_auth_manager()
            restore_result = await auth_manager.try_restore_session()

            if restore_result.success:
                emit_progress(5, "Session restored.")
                status = await loop.run_in_executor(executor, bridge.get_status)
            else:
                logger.warning(f"Session restoration failed: {restore_result.message}")

        if status.get("status") != "authenticated":
            return error_response(
                cmd_id,
                "TR_AUTH_REQUIRED",
                "Please authenticate with Trade Republic first",
            )

        emit_progress(10, "Connecting to Trade Republic...")
        start_time = time.time()

        fetcher = TRDataFetcher(bridge)
        emit_progress(30, "Fetching portfolio...")

        raw_positions = await loop.run_in_executor(
            executor, fetcher.fetch_portfolio_sync
        )

        emit_progress(50, f"Processing {len(raw_positions)} positions...")

        # Transform positions for database
        tr_positions = []
        for pos in raw_positions:
            tr_positions.append(
                {
                    "isin": pos["isin"],
                    "name": pos["name"],
                    "symbol": "",
                    "quantity": pos["quantity"],
                    "cost_basis": pos["avg_cost"],
                    "current_price": pos["current_price"],
                    "asset_class": "Equity",
                }
            )

        emit_progress(70, "Writing to database...")
        sync_result = sync_positions_from_tr(portfolio_id, tr_positions)

        update_sync_state(
            "trade_republic",
            "success",
            f"Synced {sync_result['synced_positions']} positions",
        )

        duration_ms = int((time.time() - start_time) * 1000)
        emit_progress(100, "Sync complete! Running Deep Analysis...")

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

    emit_progress(0, "Starting analytics pipeline...")
    start_time = time.time()

    try:

        def pipeline_progress(msg: str, pct: float) -> None:
            time.sleep(0.1)  # Small delay to prevent flooding
            emit_progress(int(pct * 100), f"Analytics: {msg}")

        pipeline = Pipeline()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, pipeline.run, pipeline_progress)

        duration_ms = int((time.time() - start_time) * 1000)

        if not result.success:
            emit_progress(100, "Analytics completed with warnings.")
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
            emit_progress(100, "Analytics complete!")
            logger.info(f"Pipeline complete in {duration_ms}ms")
            return success_response(
                cmd_id,
                {"success": True, "errors": [], "durationMs": duration_ms},
            )
    except Exception as e:
        logger.error(f"Failed to run pipeline: {e}", exc_info=True)
        return error_response(cmd_id, "PIPELINE_ERROR", str(e))
