"""Sync data transfer objects.

Provides typed DTOs for sync service responses.
These models ensure type-safe data transfer between service and presentation layers.
"""


from pydantic import BaseModel, Field


class SyncProgress(BaseModel):
    """Progress update during sync operation.

    Attributes:
        progress: Progress percentage (0-100).
        message: Human-readable progress message.
        phase: Pipeline phase identifier (e.g., 'sync', 'loading', 'decomposition').
    """

    progress: int = Field(ge=0, le=100)
    message: str
    phase: str = "pipeline"


class PortfolioSyncResult(BaseModel):
    """Result of portfolio synchronization with Trade Republic.

    Attributes:
        synced_positions: Total number of positions synced.
        new_positions: Number of newly added positions.
        updated_positions: Number of updated existing positions.
        total_value: Total portfolio value after sync.
        duration_ms: Sync duration in milliseconds.
        etf_count: Number of positions classified as ETF.
        crypto_count: Number of positions classified as crypto.
        stock_count: Number of positions classified as stock.
    """

    synced_positions: int = Field(ge=0)
    new_positions: int = Field(ge=0)
    updated_positions: int = Field(ge=0)
    total_value: float = Field(ge=0)
    duration_ms: int = Field(ge=0)
    etf_count: int = Field(ge=0, default=0)
    crypto_count: int = Field(ge=0, default=0)
    stock_count: int = Field(ge=0, default=0)


class PipelineResult(BaseModel):
    """Result of analytics pipeline execution.

    Attributes:
        success: Whether pipeline completed without errors.
        errors: List of error messages if any.
        duration_ms: Pipeline execution duration in milliseconds.
    """

    success: bool
    errors: list[str] = Field(default_factory=list)
    duration_ms: int = Field(ge=0)


class ClassifiedPosition(BaseModel):
    """Position data with resolved asset classification.

    Attributes:
        isin: International Securities Identification Number.
        name: Human-readable security name.
        symbol: Trading symbol (empty if not resolved).
        quantity: Number of shares/units held.
        cost_basis: Average purchase price.
        current_price: Current market price.
        asset_class: Resolved asset classification (e.g., 'Equity', 'ETF').
    """

    isin: str
    name: str
    symbol: str = ""
    quantity: float = Field(ge=0)
    cost_basis: float = Field(ge=0)
    current_price: float = Field(ge=0)
    asset_class: str


class AuthStatus(BaseModel):
    """Trade Republic authentication status.

    Attributes:
        authenticated: Whether user is authenticated.
        needs_restore: Whether session restoration was attempted.
        message: Status message for display.
    """

    authenticated: bool
    needs_restore: bool = False
    message: str | None = None
