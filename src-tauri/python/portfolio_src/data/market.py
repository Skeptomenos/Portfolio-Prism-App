import yfinance as yf
import json
import os
import pandas as pd
from typing import Dict, List, Optional, Any
from portfolio_src.config import CONFIG_DIR
from portfolio_src.data.hive_client import get_hive_client
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

TICKER_MAP_PATH = CONFIG_DIR / "ticker_map.json"


def load_ticker_map() -> Dict[str, str]:
    """Load the local ISIN-to-Ticker mapping."""
    if os.path.exists(TICKER_MAP_PATH):
        try:
            with open(TICKER_MAP_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load ticker map: {e}")
    return {}


def save_ticker_map(map_data: Dict[str, str]) -> None:
    """Save the local ISIN-to-Ticker mapping."""
    try:
        with open(TICKER_MAP_PATH, "w") as f:
            json.dump(map_data, f, indent=4)
    except Exception as e:
        logger.error(f"Failed to save ticker map: {e}")


def resolve_ticker(isin: str) -> Optional[str]:
    """
    Tries to resolve an ISIN to a Yahoo Finance Ticker.
    1. Checks local map.
    2. Checks Hive (Community).
    3. Tries ISIN directly.
    4. Tries suffixes (.DE, .F).
    5. Asks user interactively.
    """
    ticker_map = load_ticker_map()

    # 1. Check Local Cache
    if isin in ticker_map:
        ticker = ticker_map[isin]
        if ticker == "UNTRADEABLE":
            logger.warning(f"Skipping untradeable security: {isin}")
            return None
        return ticker

    # 2. Check Hive (Community)
    hive_client = get_hive_client()
    asset = hive_client.lookup(isin)
    if asset and asset.ticker:
        logger.info(f"Resolved {isin} via Hive: {asset.ticker}")
        ticker_map[isin] = asset.ticker
        save_ticker_map(ticker_map)
        return asset.ticker

    # 3. Auto-Discovery: Try ISIN directly
    found_ticker = None
    try:
        t = yf.Ticker(isin)
        if hasattr(t, "fast_info") and t.fast_info.get("last_price") is not None:
            logger.info(f"Found direct match for {isin}")
            found_ticker = isin
    except Exception:
        pass

    # 4. Auto-Discovery: Try Suffixes
    if not found_ticker:
        suffixes = [".DE", ".F"]
        for suffix in suffixes:
            potential_ticker = f"{isin}{suffix}"
            try:
                t = yf.Ticker(potential_ticker)
                if (
                    hasattr(t, "fast_info")
                    and t.fast_info.get("last_price") is not None
                ):
                    logger.info(f"Auto-resolved {isin} with suffix: {potential_ticker}")
                    found_ticker = potential_ticker
                    break
            except Exception:
                pass

    # 5. Interactive Fallback (Headless-safe)
    if not found_ticker:
        # In a headless environment, we can't use input().
        # We'll log it and return None, allowing the UI to handle it later.
        logger.warning(f"Could not auto-resolve ticker for {isin}")

    # 6. Save and Contribute
    if found_ticker:
        ticker_map[isin] = found_ticker
        save_ticker_map(ticker_map)

        # Contribute to Hive
        try:
            currency = _get_ticker_currency(found_ticker)
            exchange = (
                "XETRA"
                if found_ticker.endswith(".DE")
                else "FRA"
                if found_ticker.endswith(".F")
                else "Unknown"
            )
            hive_client.contribute_listing(isin, found_ticker, exchange, currency)
        except Exception as e:
            logger.debug(f"Failed to contribute discovery to Hive: {e}")

        return found_ticker

    return None


def _get_ticker_currency(ticker_symbol: str) -> str:
    """Determines the currency of a ticker using heuristics or API."""
    if ticker_symbol.endswith((".DE", ".F", ".MI", ".PA", ".AS", ".MC", ".VI")):
        return "EUR"
    if ticker_symbol.endswith(".HK"):
        return "HKD"

    try:
        t = yf.Ticker(ticker_symbol)
        currency = t.fast_info.get("currency")
        if currency:
            return str(currency)
    except Exception:
        pass

    return "USD" if "." not in ticker_symbol else "EUR"


def _get_fx_rate(from_currency: str, to_currency: str = "EUR") -> float:
    """Fetches FX rate. Returns 1.0 if same."""
    if from_currency == to_currency:
        return 1.0

    if from_currency == "GBp":
        return _get_fx_rate("GBP", "EUR") / 100.0

    pair = f"{from_currency}{to_currency}=X"
    try:
        t = yf.Ticker(pair)
        hist = t.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        logger.warning(f"Could not fetch FX rate for {pair}")

    return 1.0


def _fetch_prices_batch(tickers: List[str]) -> Dict[str, float]:
    """Robust batch fetching with escalation strategy."""
    prices = {}
    remaining_tickers = [t for t in tickers if t]

    if not remaining_tickers:
        return prices

    periods = ["1d", "5d", "1mo"]
    raw_prices = {}

    for period in periods:
        if not remaining_tickers:
            break

        try:
            data = yf.download(
                remaining_tickers,
                period=period,
                group_by="ticker",
                threads=True,
                progress=False,
            )

            if data is None or (isinstance(data, pd.DataFrame) and data.empty):
                continue

            if len(remaining_tickers) == 1:
                ticker = remaining_tickers[0]
                if "Close" in data.columns:
                    series = data["Close"].dropna()
                    if not series.empty:
                        raw_prices[ticker] = float(series.iloc[-1])
                        remaining_tickers = []
                continue

            found_in_batch = []
            for ticker in remaining_tickers:
                try:
                    if ticker in data.columns:
                        ticker_data = data[ticker]
                        if (
                            isinstance(ticker_data, pd.DataFrame)
                            and "Close" in ticker_data.columns
                        ):
                            series = ticker_data["Close"].dropna()
                            if not series.empty:
                                raw_prices[ticker] = float(series.iloc[-1])
                                found_in_batch.append(ticker)
                except Exception:
                    continue

            remaining_tickers = [
                t for t in remaining_tickers if t not in found_in_batch
            ]

        except Exception as e:
            logger.error(f"Batch fetch failed for period {period}: {e}")

    # Fallback: Individual Fetch
    for ticker in remaining_tickers:
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="1mo")
            if not hist.empty:
                raw_prices[ticker] = float(hist["Close"].iloc[-1])
        except Exception:
            pass

    # Normalize to EUR
    for ticker, price in raw_prices.items():
        currency = _get_ticker_currency(ticker)
        rate = _get_fx_rate(currency, "EUR")
        prices[ticker] = price * rate

    return prices


def get_price_map(isins: List[str]) -> Dict[str, float]:
    """Returns a dictionary {isin: price} using Hive-aware resolution."""
    logger.info(f"Resolving and fetching prices for {len(isins)} assets")

    ticker_map = load_ticker_map()
    missing_locally = [isin for isin in isins if isin not in ticker_map]

    if missing_locally:
        hive_client = get_hive_client()
        hive_results = hive_client.batch_lookup(missing_locally)
        updated = False
        for isin, asset in hive_results.items():
            if asset and asset.ticker:
                ticker_map[isin] = asset.ticker
                updated = True
        if updated:
            save_ticker_map(ticker_map)

    isin_to_ticker = {}
    unique_tickers = set()

    for isin in isins:
        ticker = resolve_ticker(isin)
        if ticker:
            isin_to_ticker[isin] = ticker
            unique_tickers.add(ticker)

    ticker_price_map = _fetch_prices_batch(list(unique_tickers))

    result = {}
    for isin, ticker in isin_to_ticker.items():
        if ticker in ticker_price_map:
            result[isin] = ticker_price_map[ticker]

    return result


def fetch_current_price(isin: str) -> Optional[float]:
    """Helper for single price (legacy support)"""
    res = get_price_map([isin])
    return res.get(isin)
