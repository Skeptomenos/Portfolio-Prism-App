"""Standard IPC Response Helpers.

Provides consistent response formatting for all headless engine handlers.
These functions ensure the JSON structure matches the IPC contract with Rust.

Response Format:
    Success: {"id": cmd_id, "status": "success", "data": {...}}
    Error:   {"id": cmd_id, "status": "error", "error": {"code": "...", "message": "..."}}
"""

import re
from typing import Any

# Maximum length for sanitized error messages sent to clients
_MAX_ERROR_MESSAGE_LENGTH = 200

# Patterns that may leak sensitive information in error messages
# Order matters: more specific patterns should come before general ones
_SENSITIVE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Connection strings (must come before path patterns to avoid partial matches)
    (re.compile(r"(?:postgres|mysql|sqlite|redis)://[^\s]+"), "[CONNECTION_STRING]"),
    # API keys and tokens (common patterns)
    (
        re.compile(
            r"['\"]?(?:api[_-]?key|token|secret|password|credential)['\"]?\s*[:=]\s*['\"]?[\w-]+['\"]?",
            re.IGNORECASE,
        ),
        "[REDACTED]",
    ),
    # Stack trace indicators (match full traceback context including trailing comma/context)
    (re.compile(r'File "[^"]+", line \d+(?:, in \w+)?'), "[TRACEBACK]"),
    (re.compile(r"Traceback \(most recent call last\):.*", re.DOTALL), "[TRACEBACK]"),
    # Module/function references that reveal internals
    (re.compile(r", in <module>"), ""),
    (re.compile(r"in <module>"), ""),
    (re.compile(r", in \w+"), ""),
    # Home directory expansion (must come before general path pattern)
    (re.compile(r"~/[\w./-]+"), "[PATH]"),
    # File paths (Unix and Windows) - must come after connection strings
    (re.compile(r"(?:/[\w.-]+)+(?:/[\w.-]*)*"), "[PATH]"),
    (re.compile(r"[A-Za-z]:\\(?:[\w.-]+\\)*[\w.-]*"), "[PATH]"),
]


def sanitize_error_message(message: str) -> str:
    """Sanitize an exception message for safe transmission to clients.

    Removes or redacts potentially sensitive information that could leak:
    - File system paths
    - Stack traces
    - API keys, tokens, passwords
    - Connection strings
    - Internal module/function names

    Args:
        message: Raw exception message (e.g., from str(e)).

    Returns:
        Sanitized message safe for IPC transmission, truncated to max length.

    Example:
        >>> sanitize_error_message("FileNotFoundError: /home/user/.secrets/config.json")
        "FileNotFoundError: [PATH]"
    """
    if not message:
        return "An error occurred"

    sanitized = message

    # Apply all sensitive pattern replacements
    for pattern, replacement in _SENSITIVE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    # Clean up multiple consecutive redaction markers
    sanitized = re.sub(
        r"(\[(?:PATH|TRACEBACK|REDACTED|CONNECTION_STRING)\])\s*\1+", r"\1", sanitized
    )

    # Remove excessive whitespace
    sanitized = re.sub(r"\s+", " ", sanitized).strip()

    # Truncate if too long, preserving meaningful prefix
    if len(sanitized) > _MAX_ERROR_MESSAGE_LENGTH:
        sanitized = sanitized[: _MAX_ERROR_MESSAGE_LENGTH - 3] + "..."

    # Ensure we have something meaningful to return
    if not sanitized or sanitized == "[TRACEBACK]":
        return "An internal error occurred"

    return sanitized


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
