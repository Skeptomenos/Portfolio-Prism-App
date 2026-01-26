"""Command Dispatcher.

Routes incoming IPC commands to the appropriate handler functions.
Handles both sync and async handlers transparently.
"""

import asyncio
from typing import Any

from portfolio_src.headless.handlers import HANDLER_REGISTRY
from portfolio_src.headless.responses import error_response, sanitize_error_message
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def _validate_ipc_payload(cmd: Any) -> tuple[bool, str, int]:
    """Validate IPC payload structure before processing.

    Validates that the incoming command has the required structure:
    - Must be a dict
    - 'command' must be a string (or missing/empty for unknown command handling)
    - 'id' must be an int or coercible to int
    - 'payload' must be a dict if present

    Args:
        cmd: Raw command object to validate.

    Returns:
        Tuple of (is_valid, error_message, cmd_id).
        If valid, error_message is empty string.
        cmd_id is extracted/defaulted for error response correlation.
    """
    # Must be a dict
    if not isinstance(cmd, dict):
        return False, f"IPC payload must be a dict, got {type(cmd).__name__}", 0

    # Extract cmd_id early for error response correlation
    raw_id = cmd.get("id", 0)
    try:
        cmd_id = int(raw_id) if raw_id is not None else 0
    except (TypeError, ValueError):
        return False, f"IPC 'id' must be an integer, got {type(raw_id).__name__}", 0

    # Validate 'command' is a string (empty string handled downstream as unknown command)
    command = cmd.get("command")
    if command is not None and not isinstance(command, str):
        return (
            False,
            f"IPC 'command' must be a string, got {type(command).__name__}",
            cmd_id,
        )

    # Validate 'payload' is a dict if present
    payload = cmd.get("payload")
    if payload is not None and not isinstance(payload, dict):
        return (
            False,
            f"IPC 'payload' must be a dict, got {type(payload).__name__}",
            cmd_id,
        )

    return True, "", cmd_id


async def dispatch(cmd: Any) -> dict[str, Any]:
    """Dispatch a command to its handler.

    Validates payload structure, extracts command name, ID, and payload
    from the incoming message, looks up the handler in the registry,
    and invokes it.

    Args:
        cmd: Command dict with 'command', 'id', and 'payload' keys.

    Returns:
        Response dict matching IPC contract:
        - Success: {"id": cmd_id, "success": True, "data": {...}}
        - Error: {"id": cmd_id, "success": False, "error": {"code": "...", "message": "..."}}

    Example:
        >>> await dispatch({"command": "get_health", "id": 1, "payload": {}})
        {"id": 1, "success": True, "data": {"version": "0.1.0", ...}}
    """
    # Validate IPC payload structure before processing
    is_valid, validation_error, validated_id = _validate_ipc_payload(cmd)
    if not is_valid:
        logger.warning(f"IPC payload validation failed: {validation_error}")
        return error_response(validated_id, "INVALID_PAYLOAD", validation_error)

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
        # Log full error details server-side for debugging
        logger.error(f"Handler error for '{command}': {e}", exc_info=True)
        # SECURITY: Sanitize exception message before sending to client
        # to prevent information disclosure (file paths, stack traces, etc.)
        safe_message = sanitize_error_message(str(e))
        return error_response(cmd_id, "HANDLER_ERROR", safe_message)


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
