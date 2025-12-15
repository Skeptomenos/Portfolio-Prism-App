"""
IPC Data Contracts

Pydantic models defining the interface between Rust (Shell) and Python (Engine).
These models ensure type safety and validation for all IPC communication.

See: anamnesis/specs/ipc_api.md
"""

from datetime import datetime
from typing import Optional, Literal, Any
from pydantic import BaseModel, Field


# =============================================================================
# REQUEST MODELS (Rust -> Python)
# =============================================================================


class Command(BaseModel):
    """
    Incoming command from Rust shell.

    All commands include a correlation ID for matching responses.
    """

    id: int = Field(..., description="Correlation ID for request/response matching")
    command: str = Field(
        ..., description="Command name (e.g., 'get_health', 'sync_portfolio')"
    )
    payload: dict = Field(
        default_factory=dict, description="Command-specific parameters"
    )


# =============================================================================
# RESPONSE MODELS (Python -> Rust)
# =============================================================================


class ErrorDetail(BaseModel):
    """Error information for failed commands."""

    code: str = Field(..., description="Error code (e.g., 'NO_DATA', 'API_ERROR')")
    message: str = Field(..., description="Human-readable error message")


class BaseResponse(BaseModel):
    """Base response structure for all commands."""

    id: int = Field(..., description="Correlation ID (echoed from request)")
    status: Literal["success", "error"] = Field(..., description="Response status")


class ErrorResponse(BaseResponse):
    """Response for failed commands."""

    status: Literal["error"] = "error"
    error: ErrorDetail


class SuccessResponse(BaseResponse):
    """Base for successful responses with data."""

    status: Literal["success"] = "success"
    data: Any = Field(..., description="Command-specific response data")


# =============================================================================
# HEALTH RESPONSE
# =============================================================================


class HealthData(BaseModel):
    """Data payload for get_health command."""

    version: str = Field(..., description="Engine version string")
    memory_usage_mb: float = Field(..., description="Current memory usage in MB")
    uptime_seconds: Optional[float] = Field(
        None, description="Engine uptime in seconds"
    )
    db_path: Optional[str] = Field(None, description="Path to SQLite database")


class HealthResponse(SuccessResponse):
    """Response for get_health command."""

    data: HealthData


# =============================================================================
# DASHBOARD RESPONSE
# =============================================================================


class HoldingData(BaseModel):
    """Single holding in the portfolio."""

    isin: str
    name: str
    ticker: Optional[str] = None
    value: float = Field(..., description="Current market value")
    weight: float = Field(..., description="Portfolio weight (0.0-1.0)")
    pnl: float = Field(..., description="Profit/loss amount")
    pnl_percentage: float = Field(..., description="Profit/loss percentage")
    quantity: float = Field(..., description="Number of shares")
    asset_class: Optional[str] = None


class AllocationData(BaseModel):
    """Allocation breakdown by dimension."""

    sector: dict[str, float] = Field(default_factory=dict)
    region: dict[str, float] = Field(default_factory=dict)
    asset_class: dict[str, float] = Field(default_factory=dict)


class DashboardData(BaseModel):
    """Data payload for get_dashboard_data command."""

    total_value: float = Field(..., description="Total portfolio value")
    total_gain: float = Field(..., description="Total unrealized gain/loss")
    gain_percentage: float = Field(..., description="Gain as percentage")
    allocations: AllocationData = Field(default_factory=AllocationData)
    top_holdings: list[HoldingData] = Field(default_factory=list)
    last_updated: Optional[str] = Field(
        None, description="ISO timestamp of last update"
    )
    is_empty: bool = Field(False, description="True if no positions in portfolio")
    position_count: int = Field(0, description="Number of positions")


class DashboardResponse(SuccessResponse):
    """Response for get_dashboard_data command."""

    data: DashboardData


# =============================================================================
# SYNC RESPONSE
# =============================================================================


class SyncResultData(BaseModel):
    """Data payload for sync_portfolio command."""

    synced_assets: int = Field(..., description="Number of assets synced")
    duration_ms: int = Field(..., description="Sync duration in milliseconds")
    new_positions: int = Field(0, description="Number of new positions added")
    updated_positions: int = Field(0, description="Number of positions updated")


class SyncResponse(SuccessResponse):
    """Response for sync_portfolio command."""

    data: SyncResultData


# =============================================================================
# READY SIGNAL (sent on startup)
# =============================================================================


class ReadySignal(BaseModel):
    """
    Sent to stdout when Python engine is ready to receive commands.
    This is NOT a response to a command - it's an unsolicited startup signal.
    """

    status: Literal["ready"] = "ready"
    version: str
    pid: int = Field(..., description="Process ID for health monitoring")


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def success_response(cmd_id: int, data: BaseModel) -> dict:
    """
    Create a success response dict.

    Args:
        cmd_id: Correlation ID from the command
        data: Pydantic model with response data

    Returns:
        Dict ready for JSON serialization
    """
    return {"id": cmd_id, "status": "success", "data": data.model_dump(by_alias=True)}


def error_response(cmd_id: int, code: str, message: str) -> dict:
    """
    Create an error response dict.

    Args:
        cmd_id: Correlation ID from the command
        code: Error code
        message: Human-readable error message

    Returns:
        Dict ready for JSON serialization
    """
    return {
        "id": cmd_id,
        "status": "error",
        "error": {"code": code, "message": message},
    }
