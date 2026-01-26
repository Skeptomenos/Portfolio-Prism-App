"""Dashboard Data Handlers.

Provides portfolio dashboard data and positions list for the UI.
Thin presentation layer - delegates business logic to DashboardService.
"""

from typing import Any

from portfolio_src.core.services.dashboard_service import DashboardService
from portfolio_src.headless.responses import success_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

_dashboard_service = DashboardService()


def handle_get_dashboard_data(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get dashboard summary data for a portfolio.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'portfolioId' (defaults to 1).

    Returns:
        Success response with dashboard data.
    """
    portfolio_id = payload.get("portfolioId", 1)
    summary = _dashboard_service.get_dashboard_summary(portfolio_id)

    return success_response(
        cmd_id,
        {
            "totalValue": summary.total_value,
            "totalGain": summary.total_gain,
            "gainPercentage": summary.gain_percentage,
            "dayChange": summary.day_change,
            "dayChangePercent": summary.day_change_percent,
            "history": [{"date": h.date, "value": h.value} for h in summary.history],
            "allocations": {
                "sector": summary.allocations.sector,
                "region": summary.allocations.region,
                "assetClass": summary.allocations.asset_class,
            },
            "topHoldings": [
                {
                    "isin": h.isin,
                    "name": h.name,
                    "ticker": h.ticker,
                    "value": h.value,
                    "weight": h.weight,
                    "pnl": h.pnl,
                    "pnlPercentage": h.pnl_percentage,
                    "quantity": h.quantity,
                    "assetClass": h.asset_class,
                }
                for h in summary.top_holdings
            ],
            "lastUpdated": summary.last_updated,
            "isEmpty": summary.is_empty,
            "positionCount": summary.position_count,
        },
    )


def handle_get_positions(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get all positions for a portfolio with full details.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'portfolioId' (defaults to 1).

    Returns:
        Success response with positions list and totals.
    """
    portfolio_id = payload.get("portfolioId", 1)
    response = _dashboard_service.get_positions(portfolio_id)

    return success_response(
        cmd_id,
        {
            "positions": [
                {
                    "isin": p.isin,
                    "name": p.name,
                    "ticker": p.ticker,
                    "instrumentType": p.instrument_type,
                    "quantity": p.quantity,
                    "avgBuyPrice": p.avg_buy_price,
                    "currentPrice": p.current_price,
                    "currentValue": p.current_value,
                    "totalCost": p.total_cost,
                    "pnlEur": p.pnl_eur,
                    "pnlPercent": p.pnl_percent,
                    "weight": p.weight,
                    "currency": p.currency,
                    "notes": p.notes,
                    "lastUpdated": p.last_updated,
                }
                for p in response.positions
            ],
            "totalValue": response.total_value,
            "totalCost": response.total_cost,
            "totalPnl": response.total_pnl,
            "totalPnlPercent": response.total_pnl_percent,
            "lastSyncTime": response.last_sync_time,
        },
    )
