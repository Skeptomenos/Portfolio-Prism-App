"""Dashboard Data Handlers.

Provides portfolio dashboard data and positions list for the UI.
"""

import os
from datetime import datetime
from typing import Any

from portfolio_src.headless.responses import success_response
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def handle_get_dashboard_data(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Get dashboard summary data for a portfolio.

    Calculates total value, gains, allocations, and top holdings.

    Args:
        cmd_id: IPC command identifier.
        payload: Must contain 'portfolioId' (defaults to 1).

    Returns:
        Success response with dashboard data.
    """
    from portfolio_src.data.database import get_positions

    portfolio_id = payload.get("portfolioId", 1)
    positions = get_positions(portfolio_id)

    if not positions:
        return success_response(
            cmd_id,
            {
                "totalValue": 0,
                "totalGain": 0,
                "gainPercentage": 0,
                "allocations": {"sector": {}, "region": {}, "assetClass": {}},
                "topHoldings": [],
                "lastUpdated": None,
                "isEmpty": True,
                "positionCount": 0,
            },
        )

    total_value = 0.0
    total_cost = 0.0
    holdings = []

    for pos in positions:
        quantity = float(pos.get("quantity", 0))
        current_price = float(pos.get("current_price") or pos.get("cost_basis") or 0)
        cost_basis = float(pos.get("cost_basis") or current_price)
        value = quantity * current_price
        cost = quantity * cost_basis
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0

        total_value += value
        total_cost += cost

        holdings.append(
            {
                "isin": pos.get("isin", ""),
                "name": pos.get("name") or pos.get("isin", "Unknown"),
                "ticker": pos.get("symbol"),
                "value": round(value, 2),
                "weight": 0.0,
                "pnl": round(pnl, 2),
                "pnlPercentage": round(pnl_pct, 1),
                "quantity": quantity,
                "assetClass": pos.get("asset_class"),
            }
        )

    # Calculate weights
    for h in holdings:
        h["weight"] = round(h["value"] / total_value, 4) if total_value > 0 else 0.0

    holdings.sort(key=lambda x: x["value"], reverse=True)
    top_holdings = holdings[:10]

    total_gain = total_value - total_cost
    gain_percentage = (total_gain / total_cost * 100) if total_cost > 0 else 0.0

    # Asset class allocation
    asset_class_alloc: dict[str, float] = {}
    for h in holdings:
        ac = str(h.get("assetClass") or "Unknown")
        asset_class_alloc[ac] = asset_class_alloc.get(ac, 0.0) + h["weight"]

    # Sector and region allocations from true exposure report
    sector_alloc: dict[str, float] = {}
    region_alloc: dict[str, float] = {}

    try:
        from portfolio_src.config import TRUE_EXPOSURE_REPORT
        import pandas as pd

        if os.path.exists(TRUE_EXPOSURE_REPORT):
            df = pd.read_csv(TRUE_EXPOSURE_REPORT)
            if not df.empty and "total_exposure" in df.columns:
                total_exposure = df["total_exposure"].sum()
                if total_exposure > 0:
                    sector_alloc = {
                        str(k): round((v / total_exposure) * 100, 2)
                        for k, v in df.groupby("sector")["total_exposure"].sum().items()
                        if v > 0
                    }
                    region_alloc = {
                        str(k): round((v / total_exposure) * 100, 2)
                        for k, v in df.groupby("geography")["total_exposure"]
                        .sum()
                        .items()
                        if v > 0
                    }
    except Exception:
        pass

    # Day change and history
    day_change = 0.0
    day_change_pct = 0.0
    history: list[dict[str, Any]] = []

    try:
        from portfolio_src.data.history_manager import HistoryManager

        history_mgr = HistoryManager()
        day_change, day_change_pct = history_mgr.calculate_day_change(positions)
        history = history_mgr.get_portfolio_history(positions, days=30)
    except Exception:
        pass

    return success_response(
        cmd_id,
        {
            "totalValue": round(total_value, 2),
            "totalGain": round(total_gain, 2),
            "gainPercentage": round(gain_percentage, 1),
            "dayChange": day_change,
            "dayChangePercent": day_change_pct,
            "history": history,
            "allocations": {
                "sector": sector_alloc,
                "region": region_alloc,
                "assetClass": asset_class_alloc,
            },
            "topHoldings": top_holdings,
            "lastUpdated": None,
            "isEmpty": False,
            "positionCount": len(positions),
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
    from portfolio_src.data.database import get_positions, get_sync_state

    portfolio_id = payload.get("portfolioId", 1)
    positions_raw = get_positions(portfolio_id)

    if not positions_raw:
        return success_response(
            cmd_id,
            {
                "positions": [],
                "totalValue": 0,
                "totalCost": 0,
                "totalPnl": 0,
                "totalPnlPercent": 0,
                "lastSyncTime": None,
            },
        )

    total_value = 0.0
    total_cost = 0.0
    positions: list[dict[str, Any]] = []

    for pos in positions_raw:
        quantity = float(pos.get("quantity", 0))
        current_price = float(pos.get("current_price") or pos.get("cost_basis") or 0)
        avg_buy_price = float(pos.get("cost_basis") or current_price)
        current_value = quantity * current_price
        total_cost_pos = quantity * avg_buy_price
        pnl_eur = current_value - total_cost_pos
        pnl_percent = (pnl_eur / total_cost_pos * 100) if total_cost_pos > 0 else 0

        total_value += current_value
        total_cost += total_cost_pos

        # Determine instrument type from asset class
        asset_class = pos.get("asset_class", "other")
        instrument_type = "stock"
        if asset_class:
            ac_lower = asset_class.lower()
            if "etf" in ac_lower:
                instrument_type = "etf"
            elif "crypto" in ac_lower:
                instrument_type = "crypto"
            elif "bond" in ac_lower:
                instrument_type = "bond"
            elif any(x in ac_lower for x in ["derivative", "option", "warrant"]):
                instrument_type = "derivative"

        positions.append(
            {
                "isin": pos.get("isin", ""),
                "name": pos.get("name") or pos.get("isin", "Unknown"),
                "ticker": pos.get("symbol") or "",
                "instrumentType": instrument_type,
                "quantity": quantity,
                "avgBuyPrice": round(avg_buy_price, 2),
                "currentPrice": round(current_price, 2),
                "currentValue": round(current_value, 2),
                "totalCost": round(total_cost_pos, 2),
                "pnlEur": round(pnl_eur, 2),
                "pnlPercent": round(pnl_percent, 2),
                "weight": 0.0,
                "currency": pos.get("currency") or "EUR",
                "notes": pos.get("notes") or "",
                "lastUpdated": pos.get("updated_at") or datetime.now().isoformat(),
            }
        )

    # Calculate weights
    for p in positions:
        p["weight"] = (
            round(p["currentValue"] / total_value * 100, 2) if total_value > 0 else 0.0
        )

    positions.sort(key=lambda x: x["currentValue"], reverse=True)

    sync_state = get_sync_state("trade_republic")

    return success_response(
        cmd_id,
        {
            "positions": positions,
            "totalValue": round(total_value, 2),
            "totalCost": round(total_cost, 2),
            "totalPnl": round(total_value - total_cost, 2),
            "totalPnlPercent": round(
                ((total_value - total_cost) / total_cost * 100)
                if total_cost > 0
                else 0.0,
                2,
            ),
            "lastSyncTime": sync_state.get("last_sync") if sync_state else None,
        },
    )
