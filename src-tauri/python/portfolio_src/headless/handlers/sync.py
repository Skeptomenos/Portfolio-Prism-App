"""Portfolio Sync and Pipeline Handlers.

Thin presentation layer for portfolio synchronization IPC.
Delegates business logic to SyncService.
"""

import json
import sys
from typing import Any

from portfolio_src.core.services.sync_service import (
    AuthenticationError,
    SyncService,
)
from portfolio_src.headless.responses import error_response, success_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Module-level service singleton for stateful operations
_sync_service: SyncService | None = None


def _get_sync_service() -> SyncService:
    """Get or create the SyncService singleton."""
    global _sync_service
    if _sync_service is None:
        _sync_service = SyncService()
    return _sync_service


def emit_progress(progress: int, message: str, phase: str = "pipeline") -> None:
    """Emit sync progress event via stdout AND SSE broadcast.

    This is the ONLY allowed stdout usage in handlers (for IPC events).
    Also broadcasts to SSE clients for browser mode support.
    """
    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": progress, "message": message, "phase": phase},
            }
        )
    )
    sys.stdout.flush()

    try:
        from portfolio_src.headless.transports.echo_bridge import broadcast_progress

        broadcast_progress(progress, message, phase)
    except ImportError:
        pass


async def handle_sync_portfolio(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Sync portfolio data from Trade Republic.

    Thin handler that delegates to SyncService.
    """
    portfolio_id = payload.get("portfolioId", 1)
    service = _get_sync_service()

    try:
        result = service.sync_portfolio(
            portfolio_id=portfolio_id,
            progress_callback=emit_progress,
        )

        return success_response(
            cmd_id,
            {
                "syncedPositions": result.synced_positions,
                "newPositions": result.new_positions,
                "updatedPositions": result.updated_positions,
                "totalValue": result.total_value,
                "durationMs": result.duration_ms,
            },
        )
    except AuthenticationError as e:
        return error_response(cmd_id, "TR_AUTH_REQUIRED", str(e))
    except Exception as e:
        logger.error(f"Portfolio sync failed: {e}", exc_info=True)
        service.record_sync_error(str(e))
        return error_response(cmd_id, "TR_SYNC_FAILED", str(e))


async def handle_run_pipeline(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Run the analytics pipeline.

    Thin handler that delegates to SyncService.
    """
    service = _get_sync_service()

    try:
        result = service.run_pipeline(progress_callback=emit_progress)

        return success_response(
            cmd_id,
            {
                "success": result.success,
                "errors": result.errors,
                "durationMs": result.duration_ms,
            },
        )
    except Exception as e:
        logger.error(f"Failed to run pipeline: {e}", exc_info=True)
        return error_response(cmd_id, "PIPELINE_ERROR", str(e))
