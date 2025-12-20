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

    def ensure_prices_for_date(self, isins: List[str], date: datetime) -> Dict[str, float]:
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
        logger.info(f"Fetching T-1 prices for {len(missing_isins)} assets (Date: {date_str})")
        
        for isin in missing_isins:
            # fetch_historical_price handles FX conversation to EUR automatically if configured correctly
            # But wait, looking at historical_prices.py, it returns a HistoricalPriceResult.
            # We need to make sure we store the EUR converted price or handle currency.
            # For this MVP, we store the EUR price in 'historical_prices' to simplify aggregation.
            
            try:
                # Note: This calls Yahoo Finance individually. 
                # Optimization for Batching is a TODO for later if this is too slow.
                res = fetch_historical_price(isin, date_str)
                
                if res.source != "error":
                    price = res.eur_price
                    self.cache_price(isin, date_str, price, "EUR")
                    results[isin] = price
                else:
                    logger.warning(f"Failed to fetch history for {isin}: {res.error}")
            except Exception as e:
                logger.error(f"Error fetching history for {isin}: {e}")

        return results

    def calculate_day_change(self, positions: List[Dict]) -> Tuple[float, float]:
        """
        Calculate Portfolio Day Change (EUR and %).
        
        Logic:
        1. Get T-1 date (Yesterday, or Friday if Monday).
        2. Fetch T-1 close prices for all held assets.
        3. PnL_Day = Sum(Current_Value) - Sum(Qty * T-1_Price).
        
        Note: This assumes Quantity hasn't changed since yesterday. 
        For a perfect calculation, we'd need a transactions ledger.
        For MVP, this Approximation is standard.
        """
        if not positions:
            return 0.0, 0.0

        # Determine T-1 Date (Simple: Yesterday. TODO: Holiday/Weekend logic)
        # historical_prices.py handles "nearest valid date" internally if we ask for a weekend?
        # Actually fetch_historical_price tries a range [0, 1, 2, 3, 5] days back.
        # So asking for "Yesterday" is safe even if it's Sunday.
        t_minus_1 = datetime.now() - timedelta(days=1)
        
        isins = [p["isin"] for p in positions]
        t1_prices = self.ensure_prices_for_date(isins, t_minus_1)

        total_current_value = 0.0
        total_t1_value = 0.0

        for pos in positions:
            isin = pos["isin"]
            qty = float(pos.get("quantity", 0))
            
            # Current Value
            current_price = pos.get("current_price") or pos.get("cost_basis") or 0
            current_val = qty * current_price
            total_current_value += current_val

            # T-1 Value
            t1_price = t1_prices.get(isin)
            if t1_price is not None:
                total_t1_value += qty * t1_price
            else:
                # Fallback: if no history, assume no change (use current price)
                # This prevents massive fake drops if API fails
                total_t1_value += current_val

        day_change_eur = total_current_value - total_t1_value
        
        if total_t1_value > 0:
            day_change_pct = (day_change_eur / total_t1_value) * 100
        else:
            day_change_pct = 0.0

        return round(day_change_eur, 2), round(day_change_pct, 2)

    def get_portfolio_history(self, positions: List[Dict], days: int = 30) -> List[Dict]:
        """
        Calculate portfolio value history for the last N days.

        Assumes "Constant Quantity" (current holdings held for all N days).
        This is a simplification for the MVP chart.

        Args:
            positions: List of current position dicts
            days: Number of history days to fetch (default: 30)

        Returns:
            List of dicts: [{"date": "YYYY-MM-DD", "value": 123.45}, ...]
        """
        if not positions:
            return []

        history = []
        today = datetime.now()
        isins = [p["isin"] for p in positions]

        logger.info(f"Calculating {days}-day history for {len(positions)} positions...")

        # Optimize: Pre-fetch all needed prices in batch if possible.
        # For now, we iterate day by day. Since we cache aggressively,
        # the first load will be slow (N * Days API calls), subsequent instant.
        
        for i in range(days):
            # Go backwards from today (actually T-0 to T-29)
            # Or forwards from T-29 to T-0? Charts usually want chronological.
            # Let's build chronological: Start date = Today - (days - 1)
            date_dt = today - timedelta(days=(days - 1 - i))
            date_str = date_dt.strftime("%Y-%m-%d")

            # Get prices for this date
            prices = self.ensure_prices_for_date(isins, date_dt)

            # Calculate total value
            total_val = 0.0
            for pos in positions:
                isin = pos["isin"]
                qty = float(pos.get("quantity", 0))
                
                # Use historical price if available, else current/cost as fallback
                # (Fallback prevents graph from dropping to zero if API misses a day)
                price = prices.get(isin)
                if price is None:
                    # Try current price as fallback implementation detail
                    # This flatlines missing data points instead of zeroing them
                    price = pos.get("current_price") or pos.get("cost_basis") or 0
                
                total_val += qty * price

            history.append({
                "date": date_str,
                "value": round(total_val, 2)
            })

        return history
