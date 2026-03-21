"""Dashboard data transfer objects.

Provides typed DTOs for dashboard service responses.
These models ensure type-safe data transfer between service and presentation layers.
"""

from typing import Optional
from pydantic import BaseModel, Field


class HoldingSummary(BaseModel):
    """Summary of a single holding for dashboard display.

    Attributes:
        isin: International Securities Identification Number.
        name: Human-readable security name.
        ticker: Trading symbol (may be None if not resolved).
        value: Current market value in EUR.
        weight: Portfolio weight as decimal (0.0 - 1.0).
        pnl: Profit/loss in EUR.
        pnl_percentage: Profit/loss as percentage of cost.
        quantity: Number of shares/units held.
        asset_class: Asset classification (e.g., "Equity", "ETF").
    """

    isin: str
    name: str
    ticker: Optional[str] = None
    value: float = Field(ge=0)
    weight: float = Field(ge=0, le=1)
    pnl: float
    pnl_percentage: float
    quantity: float = Field(ge=0)
    asset_class: Optional[str] = None


class AllocationBreakdown(BaseModel):
    """Portfolio allocation breakdown by category.

    Attributes:
        sector: Allocation by sector (e.g., {"Technology": 0.25}).
        region: Allocation by region (e.g., {"North America": 0.60}).
        asset_class: Allocation by asset class (e.g., {"Equity": 0.80}).
    """

    sector: dict[str, float] = Field(default_factory=dict)
    region: dict[str, float] = Field(default_factory=dict)
    asset_class: dict[str, float] = Field(default_factory=dict)


class HistoryPoint(BaseModel):
    """Single data point in portfolio history.

    Attributes:
        date: Date string (ISO format).
        value: Portfolio value at that date.
    """

    date: str
    value: float


class DashboardSummary(BaseModel):
    """Complete dashboard summary data.

    This is the primary DTO returned by DashboardService.get_dashboard_summary().

    Attributes:
        total_value: Total portfolio market value in EUR.
        total_gain: Total unrealized gain/loss in EUR.
        gain_percentage: Total gain as percentage of cost.
        day_change: Value change since previous close in EUR.
        day_change_percent: Day change as percentage.
        history: Historical portfolio values for charting.
        allocations: Breakdown by sector, region, and asset class.
        top_holdings: Top 10 holdings by value.
        last_updated: ISO timestamp of last data update (if available).
        is_empty: True if portfolio has no positions.
        position_count: Number of positions in portfolio.
    """

    total_value: float = Field(ge=0)
    total_gain: float
    gain_percentage: float
    day_change: float = 0.0
    day_change_percent: float = 0.0
    history: list[HistoryPoint] = Field(default_factory=list)
    allocations: AllocationBreakdown = Field(default_factory=AllocationBreakdown)
    top_holdings: list[HoldingSummary] = Field(default_factory=list)
    last_updated: Optional[str] = None
    is_empty: bool = False
    position_count: int = Field(ge=0)


class PositionDetail(BaseModel):
    """Detailed position information for positions list view.

    Attributes:
        isin: International Securities Identification Number.
        name: Human-readable security name.
        ticker: Trading symbol.
        instrument_type: Type of instrument (stock, etf, crypto, bond, derivative).
        quantity: Number of shares/units held.
        avg_buy_price: Average purchase price in EUR.
        current_price: Current market price in EUR.
        current_value: Current market value in EUR.
        total_cost: Total purchase cost in EUR.
        pnl_eur: Unrealized profit/loss in EUR.
        pnl_percent: Unrealized profit/loss as percentage.
        weight: Portfolio weight as percentage (0-100).
        currency: Currency code (e.g., "EUR").
        notes: User notes for this position.
        last_updated: ISO timestamp of last update.
    """

    isin: str
    name: str
    ticker: str = ""
    instrument_type: str = "stock"
    quantity: float = Field(ge=0)
    avg_buy_price: float = Field(ge=0)
    current_price: float = Field(ge=0)
    current_value: float = Field(ge=0)
    total_cost: float = Field(ge=0)
    pnl_eur: float
    pnl_percent: float
    weight: float = Field(ge=0)
    currency: str = "EUR"
    notes: str = ""
    last_updated: str


class PositionsResponse(BaseModel):
    """Complete positions list response.

    This is the primary DTO returned by DashboardService.get_positions().

    Attributes:
        positions: List of all positions with details.
        total_value: Total portfolio market value in EUR.
        total_cost: Total portfolio cost basis in EUR.
        total_pnl: Total unrealized profit/loss in EUR.
        total_pnl_percent: Total P&L as percentage.
        last_sync_time: ISO timestamp of last sync (if available).
    """

    positions: list[PositionDetail] = Field(default_factory=list)
    total_value: float = Field(ge=0)
    total_cost: float = Field(ge=0)
    total_pnl: float
    total_pnl_percent: float
    last_sync_time: Optional[str] = None
