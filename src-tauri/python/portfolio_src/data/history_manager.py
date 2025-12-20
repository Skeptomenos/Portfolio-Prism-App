"""
History Manager Module

Manages caching and retrieval of historical prices for:
1. "Day Change" calculation (Yesterday's Close vs Current).
2. Sparklines (30-day price history).
"""

import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from portfolio_src.data.database import get_connection, transaction
from portfolio_src.data.historical_prices import fetch_historical_price
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class HistoryManager:
    """Manages historical price data and day-change calculations."""

    def __init__(self):
        self._conn = get_connection()

    def get_price_at_date(self, isin: str, date_str: str) -> Optional[float]:
        """
        Get close price for a specific date from cache.
        Returns None if not found.
        """
        cursor = self._conn.execute(
            "SELECT close_price FROM historical_prices WHERE isin = ? AND date_str = ?",
            (isin, date_str),
        )
        row = cursor.fetchone()
        return row[0] if row else None

    def cache_price(self, isin: str, date_str: str, price: float, currency: str):
        """Save price to database cache."""
        with transaction() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO historical_prices (isin, date_str, close_price, currency)
                VALUES (?, ?, ?, ?)
                """,
                (isin, date_str, price, currency),
            )

    def ensure_prices_for_date(
        self, isins: List[str], date: datetime, silent: bool = False
    ) -> Dict[str, float]:
        """
        Ensure prices exist for the given date.
        If missing in DB, fetch from API (Yahoo) and cache.

        Returns: Dict[isin, price_eur]
        """
        date_str = date.strftime("%Y-%m-%d")
        results = {}
        missing_isins = []

        # 1. Check Cache
        for isin in isins:
            price = self.get_price_at_date(isin, date_str)
            if price is not None:
                results[isin] = price
            else:
                missing_isins.append(isin)

        if not missing_isins:
            return results

        # 2. Fetch Missing
        if not silent:
            logger.info(
                f"Fetching prices for {len(missing_isins)} assets on {date_str}: {', '.join(missing_isins[:3])}{'...' if len(missing_isins) > 3 else ''}"
            )

        for isin in missing_isins:
            try:
                res = fetch_historical_price(isin, date_str)

                if res.source != "error":
                    price = res.eur_price
                    self.cache_price(isin, date_str, price, "EUR")
                    results[isin] = price
                else:
                    # Handle potential None in res.error
                    err_msg = res.error or "Unknown error"
                    if "possibly delisted" in err_msg.lower():
                        error_msg = f"Security {isin} may be delisted or inactive."
                    elif "invalid isin number" in err_msg.lower():
                        error_msg = f"Invalid ISIN format for {isin}"
                    else:
                        error_msg = f"Failed to fetch data for {isin}: {err_msg}"

                    # Create structured pipeline error
                    from portfolio_src.core.errors import (
                        PipelineError,
                        ErrorPhase,
                        ErrorType,
                    )

                    raise PipelineError(
                        phase=ErrorPhase.DATA_LOADING,
                        error_type=ErrorType.API_FAILURE,
                        item=isin,
                        message=error_msg,
                        fix_hint="Security may be delisted. Verify with Yahoo Finance or provide manual price entry.",
                    )
            except Exception as e:
                if not silent:
                    logger.error(f"Error fetching history for {isin}: {e}")

        return results

    def calculate_day_change(self, positions: List[Dict]) -> Tuple[float, float]:
        """
        Calculate Portfolio Day Change (EUR and %).
        """
        if not positions:
            return 0.0, 0.0

        t_minus_1 = datetime.now() - timedelta(days=1)
        isins = [p["isin"] for p in positions]
        t1_prices = self.ensure_prices_for_date(isins, t_minus_1)

        total_current_value = 0.0
        total_t1_value = 0.0

        for pos in positions:
            isin = pos["isin"]
            qty = float(pos.get("quantity", 0))

            current_price = pos.get("current_price") or pos.get("cost_basis") or 0
            current_val = qty * current_price
            total_current_value += current_val

            t1_price = t1_prices.get(isin)
            if t1_price is not None:
                total_t1_value += qty * t1_price
            else:
                total_t1_value += current_val

        day_change_eur = total_current_value - total_t1_value

        if total_t1_value > 0:
            day_change_pct = (day_change_eur / total_t1_value) * 100
        else:
            day_change_pct = 0.0

        return round(day_change_eur, 2), round(day_change_pct, 2)

    def get_portfolio_history(
        self, positions: List[Dict], days: int = 30
    ) -> List[Dict]:
        """
        Calculate portfolio value history for the last N days.
        """
        if not positions:
            return []

        history = []
        today = datetime.now()
        isins = [p["isin"] for p in positions]

        logger.info(f"Calculating {days}-day history for {len(positions)} positions...")

        total_missing = 0

        for i in range(days):
            date_dt = today - timedelta(days=(days - 1 - i))
            date_str = date_dt.strftime("%Y-%m-%d")

            missing_for_day = [
                isin for isin in isins if self.get_price_at_date(isin, date_str) is None
            ]
            total_missing += len(missing_for_day)

            prices = self.ensure_prices_for_date(isins, date_dt, silent=True)

            total_val = 0.0
            for pos in positions:
                isin = pos["isin"]
                qty = float(pos.get("quantity", 0))
                price = prices.get(isin)
                if price is None:
                    price = pos.get("current_price") or pos.get("cost_basis") or 0
                total_val += qty * price

            history.append({"date": date_str, "value": round(total_val, 2)})

        if total_missing > 0:
            logger.info(
                f"History calculation complete. Fetched {total_missing} missing data points from API."
            )
        else:
            logger.info("History calculation complete. All data retrieved from cache.")

        return history
