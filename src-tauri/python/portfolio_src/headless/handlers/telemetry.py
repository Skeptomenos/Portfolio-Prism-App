"""Telemetry and Logging Handlers.

Handles frontend log events and error report management.
"""

from typing import Any

from portfolio_src.headless.responses import success_response
from portfolio_src.headless.lifecycle import get_session_id
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


async def handle_log_event(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Log an event from the frontend.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'level', 'message', and optionally 'context', 'component', 'category'.

    Returns:
        Success response.
    """
    from portfolio_src.data.database import log_system_event

    level = payload.get("level", "INFO")
    message = payload.get("message", "")
    context = payload.get("context", {})
    component = payload.get("component", "ui")
    category = payload.get("category", "general")

    log_system_event(
        session_id=get_session_id(),
        level=level,
        source="frontend",
        message=message,
        context=context,
        component=component,
        category=category,
    )

    return success_response(cmd_id, True)


async def handle_get_recent_reports(
    cmd_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    """Get recently processed error reports.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with list of recent reports.
    """
    from portfolio_src.data.database import get_connection

    conn = get_connection()
    cursor = conn.execute(
        "SELECT * FROM system_logs WHERE processed = 1 AND level IN ('ERROR', 'CRITICAL') ORDER BY reported_at DESC LIMIT 20"
    )
    reports = [dict(row) for row in cursor.fetchall()]

    logger.debug(f"Returning {len(reports)} recent reports")
    return success_response(cmd_id, reports)


async def handle_get_pending_reviews(
    cmd_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    """Get pending error reports awaiting review.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with list of pending reports.
    """
    from portfolio_src.data.database import get_connection

    conn = get_connection()
    cursor = conn.execute(
        "SELECT * FROM system_logs WHERE processed = 0 AND level IN ('ERROR', 'CRITICAL') ORDER BY timestamp DESC"
    )
    pending = [dict(row) for row in cursor.fetchall()]

    logger.debug(f"Returning {len(pending)} pending reviews")
    return success_response(cmd_id, pending)
