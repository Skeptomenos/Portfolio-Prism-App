"""Health Check Handler.

Provides system health and status information for the headless engine.
"""

import os
import time
from typing import Any

from portfolio_src.headless.responses import success_response
from portfolio_src.headless.lifecycle import get_start_time, get_session_id
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Version constant
VERSION = "0.1.0"


def handle_get_health(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get engine health status.

    Returns version, memory usage, uptime, and database path.

    Args:
        cmd_id: IPC command identifier.
        payload: Command payload (unused).

    Returns:
        Success response with health data.
    """
    from portfolio_src.data.database import get_db_path

    memory_mb = 0.0
    try:
        import psutil

        process = psutil.Process(os.getpid())
        memory_mb = process.memory_info().rss / (1024 * 1024)
    except ImportError:
        try:
            import resource

            memory_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (
                1024 * 1024
            )
        except Exception:
            pass

    uptime = time.time() - get_start_time()

    return success_response(
        cmd_id,
        {
            "version": VERSION,
            "sessionId": get_session_id(),
            "memoryUsageMb": round(memory_mb, 1),
            "uptimeSeconds": round(uptime, 1),
            "dbPath": str(get_db_path()),
        },
    )
