"""Telemetry and Logging Handlers.

Handles frontend log events and error report management.
"""

import hashlib
import json
from typing import Any

from portfolio_src.headless.responses import success_response
from portfolio_src.headless.lifecycle import get_session_id
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

ERROR_LEVELS = {"ERROR", "CRITICAL"}


def _normalize_context(context: Any) -> Any:
    """Normalize context for deterministic hashing."""
    if isinstance(context, dict):
        return {str(key): _normalize_context(value) for key, value in sorted(context.items())}
    if isinstance(context, list):
        return [_normalize_context(value) for value in context]
    if isinstance(context, (str, int, float, bool)) or context is None:
        return context
    return str(context)


def _compute_frontend_error_hash(
    level: str,
    message: str,
    component: str,
    category: str,
    context: dict[str, Any],
) -> str:
    normalized_payload = {
        "level": level,
        "message": message,
        "component": component,
        "category": category,
        "context": _normalize_context(context),
    }
    seed = json.dumps(normalized_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


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
    error_hash = None

    if level in ERROR_LEVELS:
        explicit_hash = context.get("errorHash") if isinstance(context, dict) else None
        if isinstance(explicit_hash, str) and explicit_hash.strip():
            error_hash = explicit_hash.strip()
        else:
            context_for_hash = context if isinstance(context, dict) else {"value": context}
            error_hash = _compute_frontend_error_hash(
                level=level,
                message=message,
                component=component,
                category=category,
                context=context_for_hash,
            )

    log_system_event(
        session_id=get_session_id(),
        level=level,
        source="frontend",
        message=message,
        context=context,
        component=component,
        category=category,
        error_hash=error_hash,
    )

    return success_response(cmd_id, True)


async def handle_get_recent_reports(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get recently processed error reports.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with list of recent reports.
    """
    from portfolio_src.data.database import get_connection

    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM system_logs WHERE processed = 1 AND level IN ('ERROR', 'CRITICAL') ORDER BY reported_at DESC LIMIT 20"
        )
        reports = [dict(row) for row in cursor.fetchall()]

    logger.debug("Returning recent reports", extra={"count": len(reports)})
    return success_response(cmd_id, reports)


async def handle_get_pending_reviews(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get pending error reports awaiting review.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with list of pending reports.
    """
    from portfolio_src.data.database import get_connection

    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM system_logs WHERE processed = 0 AND level IN ('ERROR', 'CRITICAL') ORDER BY timestamp DESC"
        )
        pending = [dict(row) for row in cursor.fetchall()]

    logger.debug("Returning pending reviews", extra={"count": len(pending)})
    return success_response(cmd_id, pending)
