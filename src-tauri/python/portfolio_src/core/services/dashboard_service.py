"""Dashboard Service - Business logic for portfolio dashboard calculations."""

import os
from typing import Any

from portfolio_src.models.dashboard import (
    AllocationBreakdown,
    DashboardSummary,
    HistoryPoint,
    HoldingSummary,
    PositionDetail,
    PositionsResponse,
)
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class DashboardService:
    """Calculates portfolio metrics for dashboard display.

    This service encapsulates all P&L calculations, weight computations,
    and allocation breakdowns. It returns typed Pydantic DTOs instead of
    raw dictionaries.
    """

    def get_dashboard_summary(self, portfolio_id: int = 1) -> DashboardSummary:
        """Calculate complete dashboard summary for a portfolio.

        Fetches positions from database, calculates P&L, weights, allocations,
        and returns a typed DTO.

        Args:
            portfolio_id: Portfolio to calculate summary for (default: 1).

        Returns:
            DashboardSummary with all computed metrics.
        """
        from portfolio_src.data.database import get_positions

        positions = get_positions(portfolio_id)

        if not positions:
            return DashboardSummary(
                total_value=0,
                total_gain=0,
                gain_percentage=0,
                allocations=AllocationBreakdown(),
                top_holdings=[],
                last_updated=None,
                is_empty=True,
                position_count=0,
            )

        holdings, total_value, total_cost = self._calculate_holdings(positions)
        self._apply_weights(holdings, total_value)
        holdings.sort(key=lambda x: x.value, reverse=True)

        total_gain = total_value - total_cost
        gain_percentage = (total_gain / total_cost * 100) if total_cost > 0 else 0.0

        allocations = self._calculate_allocations(holdings)
        day_change, day_change_pct, history = self._get_history_data(positions)

        return DashboardSummary(
            total_value=round(total_value, 2),
            total_gain=round(total_gain, 2),
            gain_percentage=round(gain_percentage, 1),
            day_change=day_change,
            day_change_percent=day_change_pct,
            history=history,
            allocations=allocations,
            top_holdings=holdings[:10],
            last_updated=None,
            is_empty=False,
            position_count=len(positions),
        )

    def get_positions(self, portfolio_id: int = 1) -> PositionsResponse:
        """Get all positions with full details for a portfolio.

        Args:
            portfolio_id: Portfolio to fetch positions for (default: 1).

        Returns:
            PositionsResponse with all positions and totals.
        """
        from datetime import datetime

        from portfolio_src.data.database import get_positions, get_sync_state

        positions_raw = get_positions(portfolio_id)

        if not positions_raw:
            return PositionsResponse(
                positions=[],
                total_value=0,
                total_cost=0,
                total_pnl=0,
                total_pnl_percent=0,
                last_sync_time=None,
            )

        total_value = 0.0
        total_cost = 0.0
        positions: list[PositionDetail] = []

        for pos in positions_raw:
            detail = self._create_position_detail(pos)
            total_value += detail.current_value
            total_cost += detail.total_cost
            positions.append(detail)

        self._apply_position_weights(positions, total_value)
        positions.sort(key=lambda x: x.current_value, reverse=True)

        sync_state = get_sync_state("trade_republic")
        total_pnl = total_value - total_cost
        total_pnl_percent = (total_pnl / total_cost * 100) if total_cost > 0 else 0.0

        return PositionsResponse(
            positions=positions,
            total_value=round(total_value, 2),
            total_cost=round(total_cost, 2),
            total_pnl=round(total_pnl, 2),
            total_pnl_percent=round(total_pnl_percent, 2),
            last_sync_time=sync_state.get("last_sync") if sync_state else None,
        )

    def _calculate_holdings(
        self, positions: list[dict[str, Any]]
    ) -> tuple[list[HoldingSummary], float, float]:
        """Calculate holding summaries from raw position data."""
        total_value = 0.0
        total_cost = 0.0
        holdings: list[HoldingSummary] = []

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
                HoldingSummary(
                    isin=pos.get("isin", ""),
                    name=pos.get("name") or pos.get("isin", "Unknown"),
                    ticker=pos.get("symbol"),
                    value=round(value, 2),
                    weight=0.0,
                    pnl=round(pnl, 2),
                    pnl_percentage=round(pnl_pct, 1),
                    quantity=quantity,
                    asset_class=pos.get("asset_class"),
                )
            )

        return holdings, total_value, total_cost

    def _apply_weights(self, holdings: list[HoldingSummary], total_value: float) -> None:
        """Apply portfolio weights to holdings in-place."""
        for h in holdings:
            h.weight = round(h.value / total_value, 4) if total_value > 0 else 0.0

    def _apply_position_weights(self, positions: list[PositionDetail], total_value: float) -> None:
        """Apply portfolio weights to positions in-place (as percentage 0-100)."""
        for p in positions:
            p.weight = round(p.current_value / total_value * 100, 2) if total_value > 0 else 0.0

    def _calculate_allocations(self, holdings: list[HoldingSummary]) -> AllocationBreakdown:
        """Calculate allocation breakdown from holdings."""
        asset_class_alloc: dict[str, float] = {}
        for h in holdings:
            ac = str(h.asset_class or "Unknown")
            asset_class_alloc[ac] = asset_class_alloc.get(ac, 0.0) + h.weight

        sector_alloc, region_alloc = self._get_exposure_allocations()

        return AllocationBreakdown(
            sector=sector_alloc,
            region=region_alloc,
            asset_class=asset_class_alloc,
        )

    def _get_exposure_allocations(self) -> tuple[dict[str, float], dict[str, float]]:
        """Load sector and region allocations from true exposure report."""
        sector_alloc: dict[str, float] = {}
        region_alloc: dict[str, float] = {}

        try:
            import pandas as pd

            from portfolio_src.config import TRUE_EXPOSURE_REPORT

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
                            for k, v in df.groupby("geography")["total_exposure"].sum().items()
                            if v > 0
                        }
        except Exception:
            pass

        return sector_alloc, region_alloc

    def _get_history_data(
        self, positions: list[dict[str, Any]]
    ) -> tuple[float, float, list[HistoryPoint]]:
        """Get day change and history data from HistoryManager."""
        day_change = 0.0
        day_change_pct = 0.0
        history: list[HistoryPoint] = []

        try:
            from portfolio_src.data.history_manager import HistoryManager

            history_mgr = HistoryManager()
            day_change, day_change_pct = history_mgr.calculate_day_change(positions)
            raw_history = history_mgr.get_portfolio_history(positions, days=30)
            history = [HistoryPoint(date=h["date"], value=h["value"]) for h in raw_history]
        except Exception:
            pass

        return day_change, day_change_pct, history

    def _create_position_detail(self, pos: dict[str, Any]) -> PositionDetail:
        """Create a PositionDetail from raw position data."""
        from datetime import datetime

        quantity = float(pos.get("quantity", 0))
        current_price = float(pos.get("current_price") or pos.get("cost_basis") or 0)
        avg_buy_price = float(pos.get("cost_basis") or current_price)
        current_value = quantity * current_price
        total_cost = quantity * avg_buy_price
        pnl_eur = current_value - total_cost
        pnl_percent = (pnl_eur / total_cost * 100) if total_cost > 0 else 0

        instrument_type = self._determine_instrument_type(pos.get("asset_class"))

        return PositionDetail(
            isin=pos.get("isin", ""),
            name=pos.get("name") or pos.get("isin", "Unknown"),
            ticker=pos.get("symbol") or "",
            instrument_type=instrument_type,
            quantity=quantity,
            avg_buy_price=round(avg_buy_price, 2),
            current_price=round(current_price, 2),
            current_value=round(current_value, 2),
            total_cost=round(total_cost, 2),
            pnl_eur=round(pnl_eur, 2),
            pnl_percent=round(pnl_percent, 2),
            weight=0.0,
            currency=pos.get("currency") or "EUR",
            notes=pos.get("notes") or "",
            last_updated=pos.get("updated_at") or datetime.now().isoformat(),
        )

    def _determine_instrument_type(self, asset_class: str | None) -> str:
        """Determine instrument type from asset class string."""
        if not asset_class:
            return "stock"

        ac_lower = asset_class.lower()
        if "etf" in ac_lower:
            return "etf"
        if "crypto" in ac_lower:
            return "crypto"
        if "bond" in ac_lower:
            return "bond"
        if any(x in ac_lower for x in ["derivative", "option", "warrant"]):
            return "derivative"
        return "stock"
