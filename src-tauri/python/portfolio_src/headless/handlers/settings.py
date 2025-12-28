"""Settings Handlers.

Handles user preference management including Hive contribution settings.
"""

from typing import Any

from portfolio_src.data.database import get_connection
from portfolio_src.headless.responses import success_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def get_setting(key: str, default: str = "") -> str:
    with get_connection() as conn:
        cursor = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (key, value),
        )
        conn.commit()


def handle_set_hive_contribution(
    request_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    enabled = payload.get("enabled", False)
    set_setting("hive_contribution_enabled", "true" if enabled else "false")
    logger.info(f"Hive contribution set to: {enabled}")
    return success_response(request_id, {"enabled": enabled})


def handle_get_hive_contribution(
    request_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    value = get_setting("hive_contribution_enabled", "true")
    enabled = value.lower() == "true"
    return success_response(request_id, {"enabled": enabled})


def is_hive_contribution_enabled() -> bool:
    value = get_setting("hive_contribution_enabled", "true")
    return value.lower() == "true"
