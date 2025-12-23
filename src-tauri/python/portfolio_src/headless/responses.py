"""Standard IPC Response Helpers.

Provides consistent response formatting for all headless engine handlers.
These functions ensure the JSON structure matches the IPC contract with Rust.

Response Format:
    Success: {"id": cmd_id, "status": "success", "data": {...}}
    Error:   {"id": cmd_id, "status": "error", "error": {"code": "...", "message": "..."}}
"""

from typing import Any


def success_response(cmd_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Create a standard success response.

    Args:
        cmd_id: IPC command identifier for response correlation.
        data: Response payload data.

    Returns:
        Formatted success response dict matching IPC contract.

    Example:
        >>> success_response(1, {"version": "0.1.0"})
        {"id": 1, "status": "success", "data": {"version": "0.1.0"}}
    """
    return {
        "id": cmd_id,
        "status": "success",
        "data": data,
    }


def error_response(cmd_id: int, code: str, message: str) -> dict[str, Any]:
    """Create a standard error response.

    Args:
        cmd_id: IPC command identifier for response correlation.
        code: Error code (e.g., "TR_AUTH_ERROR", "INVALID_PARAMS").
        message: Human-readable error message.

    Returns:
        Formatted error response dict matching IPC contract.

    Example:
        >>> error_response(1, "TR_AUTH_ERROR", "Invalid credentials")
        {"id": 1, "status": "error", "error": {"code": "TR_AUTH_ERROR", "message": "Invalid credentials"}}
    """
    return {
        "id": cmd_id,
        "status": "error",
        "error": {
            "code": code,
            "message": message,
        },
    }
