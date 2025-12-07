"""
Historical price fetching module.

Fetches closing prices for specific historical dates with full
currency conversion audit trail.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
import yfinance as yf

from prism_utils.logging_config import get_logger

logger = get_logger(__name__)

TICKER_MAP_PATH = Path("config/ticker_map.json")


@dataclass
class HistoricalPriceResult:
    """Result of a historical price fetch with full audit trail."""

    isin: str
    ticker: str
    date: str
    raw_price: float
    currency: str
    fx_rate: float
    eur_price: float
    source: str  # "historical", "fallback", "error"
    error: Optional[str] = None
    actual_date: Optional[str] = None  # Date price was actually fetched for

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "isin": self.isin,
            "ticker": self.ticker,
            "date": self.date,
            "raw_price": self.raw_price,
            "currency": self.currency,
            "fx_rate": self.fx_rate,
            "eur_price": self.eur_price,
            "source": self.source,
            "error": self.error,
            "actual_date": self.actual_date,
        }


def load_ticker_map() -> Dict[str, str]:
    """Load ISIN to Yahoo ticker mapping."""
    if TICKER_MAP_PATH.exists():
        with open(TICKER_MAP_PATH, "r") as f:
            return json.load(f)
    return {}


def get_ticker_for_isin(isin: str) -> Optional[str]:
    """Get Yahoo ticker for an ISIN."""
    ticker_map = load_ticker_map()
    return ticker_map.get(isin)


def _get_ticker_currency(ticker: str) -> str:
    """
    Determine the currency of a ticker.

    Uses heuristics first, then falls back to API.
    """
    # Heuristics based on suffix
    if ticker.endswith((".DE", ".F", ".MI", ".PA", ".AS", ".MC", ".VI")):
        return "EUR"
    if ticker.endswith(".L"):
        # London - could be GBP, GBp (pence), or USD
        # Need to check API
        try:
            t = yf.Ticker(ticker)
            currency = t.fast_info.get("currency")
            if currency:
                return currency
        except Exception:
            pass
        return "GBP"  # Default for London
    if ticker.endswith(".HK"):
        return "HKD"
    if ticker.endswith(".SW"):
        return "CHF"

    # No suffix - likely US stock
    if "." not in ticker:
        return "USD"

    # Fallback: try API
    try:
        t = yf.Ticker(ticker)
        currency = t.fast_info.get("currency")
        if currency:
            return currency
    except Exception:
        pass

    return "USD"  # Safe default


def _get_fx_rate(
    from_currency: str, to_currency: str = "EUR", date: Optional[str] = None
) -> float:
    """
    Get FX rate for currency conversion.

    Args:
        from_currency: Source currency code
        to_currency: Target currency code (default EUR)
        date: Optional date for historical rate (YYYY-MM-DD)

    Returns:
        Exchange rate (multiply by this to convert)
    """
    if from_currency == to_currency:
        return 1.0

    # Handle GBp (British Pence) - 100 GBp = 1 GBP
    if from_currency == "GBp":
        gbp_rate = _get_fx_rate("GBP", to_currency, date)
        return gbp_rate / 100.0

    pair = f"{from_currency}{to_currency}=X"

    try:
        t = yf.Ticker(pair)

        if date:
            # Historical rate
            date_dt = datetime.strptime(date, "%Y-%m-%d")
            end_dt = date_dt + timedelta(days=1)
            hist = t.history(
                start=date_dt.strftime("%Y-%m-%d"), end=end_dt.strftime("%Y-%m-%d")
            )
            if not hist.empty:
                return float(hist["Close"].iloc[-1])

        # Current/fallback rate
        hist = t.history(period="5d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])

    except Exception as e:
        logger.warning(f"Could not fetch FX rate for {pair}: {e}")

    # Hardcoded fallbacks for common pairs (approximate)
    fallback_rates = {
        "USDEUR": 0.92,
        "GBPEUR": 1.17,
        "HKDEUR": 0.12,
        "CHFEUR": 1.05,
    }

    key = f"{from_currency}{to_currency}"
    if key in fallback_rates:
        logger.warning(f"Using fallback FX rate for {key}")
        return fallback_rates[key]

    return 1.0  # Last resort fallback


def fetch_historical_price(
    isin: str, date: str, ticker: Optional[str] = None
) -> HistoricalPriceResult:
    """
    Fetch closing price for a specific historical date.

    Args:
        isin: Security ISIN
        date: Target date (YYYY-MM-DD format)
        ticker: Optional Yahoo ticker (if not provided, will look up from ticker_map)

    Returns:
        HistoricalPriceResult with full audit trail
    """
    # Resolve ticker
    if ticker is None:
        ticker = get_ticker_for_isin(isin)

    if not ticker:
        return HistoricalPriceResult(
            isin=isin,
            ticker="",
            date=date,
            raw_price=0.0,
            currency="",
            fx_rate=1.0,
            eur_price=0.0,
            source="error",
            error=f"No ticker mapping found for ISIN {isin}",
        )

    try:
        t = yf.Ticker(ticker)

        # Parse date and create range
        date_dt = datetime.strptime(date, "%Y-%m-%d")

        # Try to get price for the exact date first
        # If it's a weekend/holiday, expand the range
        for days_back in [0, 1, 2, 3, 5]:
            start_dt = date_dt - timedelta(days=days_back)
            end_dt = date_dt + timedelta(days=1)

            hist = t.history(
                start=start_dt.strftime("%Y-%m-%d"), end=end_dt.strftime("%Y-%m-%d")
            )

            if not hist.empty:
                # Get the last available price in range
                raw_price = float(hist["Close"].iloc[-1])
                actual_date = str(hist.index[-1])[:10]  # Get YYYY-MM-DD from index

                # Get currency and convert
                currency = _get_ticker_currency(ticker)
                fx_rate = _get_fx_rate(currency, "EUR", date)
                eur_price = raw_price * fx_rate

                return HistoricalPriceResult(
                    isin=isin,
                    ticker=ticker,
                    date=date,
                    raw_price=raw_price,
                    currency=currency,
                    fx_rate=fx_rate,
                    eur_price=eur_price,
                    source="historical" if days_back == 0 else "fallback",
                    actual_date=actual_date,
                )

        # No data found
        return HistoricalPriceResult(
            isin=isin,
            ticker=ticker,
            date=date,
            raw_price=0.0,
            currency="",
            fx_rate=1.0,
            eur_price=0.0,
            source="error",
            error=f"No historical data found for {ticker} around {date}",
        )

    except Exception as e:
        return HistoricalPriceResult(
            isin=isin,
            ticker=ticker,
            date=date,
            raw_price=0.0,
            currency="",
            fx_rate=1.0,
            eur_price=0.0,
            source="error",
            error=str(e),
        )


def get_historical_price_map(
    isins: List[str], date: str, ticker_overrides: Optional[Dict[str, str]] = None
) -> Dict[str, HistoricalPriceResult]:
    """
    Fetch historical prices for multiple ISINs.

    Args:
        isins: List of ISINs to fetch prices for
        date: Target date (YYYY-MM-DD format)
        ticker_overrides: Optional dict of ISIN->ticker overrides

    Returns:
        Dict mapping ISIN to HistoricalPriceResult
    """
    results = {}
    ticker_overrides = ticker_overrides or {}

    logger.info(f"Fetching historical prices for {len(isins)} ISINs as of {date}")

    for isin in isins:
        ticker = ticker_overrides.get(isin)
        result = fetch_historical_price(isin, date, ticker)
        results[isin] = result

        if result.source == "error":
            logger.warning(f"  - {isin}: ERROR - {result.error}")
        else:
            logger.debug(
                f"  - {isin} ({result.ticker}): {result.raw_price:.2f} {result.currency} "
                f"-> {result.eur_price:.2f} EUR (FX: {result.fx_rate:.4f})"
            )

    # Summary
    success = sum(1 for r in results.values() if r.source != "error")
    logger.info(f"Historical price fetch complete: {success}/{len(isins)} successful")

    return results


def calculate_position_value(
    quantity: float, price_result: HistoricalPriceResult
) -> float:
    """
    Calculate position value from quantity and price result.

    Args:
        quantity: Number of shares/units
        price_result: HistoricalPriceResult from fetch

    Returns:
        Position value in EUR
    """
    if price_result.source == "error":
        return 0.0
    return quantity * price_result.eur_price
