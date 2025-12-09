"""
TR Daemon Protocol

Defines message format for communication between Streamlit/Tauri app and tr_daemon.py.
Uses JSON-RPC style messages over stdin/stdout.
"""

import json
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any
from enum import Enum


class TRMethod(Enum):
    """Supported daemon methods."""

    LOGIN = "login"
    LOGOUT = "logout"
    CONFIRM_2FA = "confirm_2fa"
    FETCH_PORTFOLIO = "fetch_portfolio"
    GET_STATUS = "get_status"
    SHUTDOWN = "shutdown"


@dataclass
class TRRequest:
    """Request message to daemon."""

    method: str
    params: Dict[str, Any]
    id: str  # For request/response matching


@dataclass
class TRResponse:
    """Response message from daemon."""

    result: Optional[dict]
    error: Optional[str]
    id: str  # Matches request.id


class TRError(Exception):
    """TR daemon specific error."""

    def __init__(self, message: str, method: str = None):
        super().__init__(message)
        self.method = method
        self.message = message


def serialize_request(request: TRRequest) -> str:
    """Serialize request to JSON string."""
    return json.dumps(asdict(request))


def deserialize_response(json_str: str) -> TRResponse:
    """Deserialize JSON string to response."""
    data = json.loads(json_str)
    return TRResponse(
        result=data.get("result"), error=data.get("error"), id=data.get("id")
    )


def create_error_response(request_id: str, error_message: str) -> str:
    """Create error response."""
    response = TRResponse(result=None, error=error_message, id=request_id)
    return json.dumps(asdict(response))


def create_success_response(request_id: str, result: dict) -> str:
    """Create success response."""
    response = TRResponse(result=result, error=None, id=request_id)
    return json.dumps(asdict(response))
