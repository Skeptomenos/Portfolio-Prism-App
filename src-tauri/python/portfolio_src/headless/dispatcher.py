"""Command Dispatcher.

Routes incoming IPC commands to the appropriate handler functions.
Handles both sync and async handlers transparently.
"""

import asyncio
from typing import Any

from portfolio_src.headless.handlers import HANDLER_REGISTRY
from portfolio_src.headless.responses import error_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a command to its handler.

    Extracts command name, ID, and payload from the incoming message,
    looks up the handler in the registry, and invokes it.

    Args:
        cmd: Command dict with 'command', 'id', and 'payload' keys.

    Returns:
        Response dict matching IPC contract:
        - Success: {"id": cmd_id, "status": "success", "data": {...}}
        - Error: {"id": cmd_id, "status": "error", "error": {"code": "...", "message": "..."}}

    Example:
        >>> await dispatch({"command": "get_health", "id": 1, "payload": {}})
        {"id": 1, "status": "success", "data": {"version": "0.1.0", ...}}
    """
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})

    handler = HANDLER_REGISTRY.get(command)

    if handler is None:
        logger.warning(f"Unknown command received: {command}")
        return error_response(
            cmd_id,
            "UNKNOWN_COMMAND",
            f"Unknown command: {command}",
        )

    try:
        # Handle both async and sync handlers
        if asyncio.iscoroutinefunction(handler):
            return await handler(cmd_id, payload)
        else:
            return handler(cmd_id, payload)
    except Exception as e:
        logger.error(f"Handler error for '{command}': {e}", exc_info=True)
        return error_response(cmd_id, "HANDLER_ERROR", str(e))


def get_available_commands() -> list[str]:
    """Get list of all available commands.

    Returns:
        Sorted list of command names.
    """
    return sorted(HANDLER_REGISTRY.keys())


def is_command_registered(command: str) -> bool:
    """Check if a command is registered.

    Args:
        command: Command name to check.

    Returns:
        True if command exists in registry.
    """
    return command in HANDLER_REGISTRY
