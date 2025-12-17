import yfinance as yf
import json
import os
from portfolio_src.config import CONFIG_DIR
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

TICKER_MAP_PATH = CONFIG_DIR / "ticker_map.json"


def load_ticker_map():
    if os.path.exists(TICKER_MAP_PATH):
        with open(TICKER_MAP_PATH, "r") as f:
            return json.load(f)
    return {}


def save_ticker_map(map_data):
    with open(TICKER_MAP_PATH, "w") as f:
        json.dump(map_data, f, indent=4)


def resolve_ticker(isin):
    """
    Tries to resolve an ISIN to a Yahoo Finance Ticker.
    1. Checks local map.
    2. Tries ISIN directly.
    3. Tries suffixes (.DE, .F).
    4. Asks user interactively.
    """
    ticker_map = load_ticker_map()

    # 1. Check Cache
    if isin in ticker_map:
        return ticker_map[isin]

    # 2. Auto-Discovery: Try ISIN directly
    try:
        t = yf.Ticker(isin)
        if hasattr(t, "fast_info") and t.fast_info.get("last_price") is not None:
            print(f"    -> Found direct match: {isin}")
            ticker_map[isin] = isin
            save_ticker_map(ticker_map)
            return isin
    except Exception:
        pass

    # 2b. Auto-Discovery: Try Suffixes
    suffixes = [".DE", ".F"]
    for suffix in suffixes:
        potential_ticker = f"{isin}{suffix}"
        try:
            t = yf.Ticker(potential_ticker)
            # Need to be gentle with checking validity to avoid false positives
            # fast_info is usually quick and reliable for "exists"
            if hasattr(t, "fast_info") and t.fast_info.get("last_price") is not None:
                print(f"    -> Auto-resolved with suffix: {potential_ticker}")
                ticker_map[isin] = potential_ticker
                save_ticker_map(ticker_map)
                return potential_ticker
        except Exception:
            pass

    # 3. Interactive Fallback
    print(f"  - Resolving ticker for {isin}...")
    user_input = input(
        f"    ⚠️  Could not auto-resolve ticker for {isin}.\n    Enter Yahoo Ticker (e.g., 'NESN.SW') or [s]kip: "
    ).strip()

    if user_input and user_input.lower() != "s":
        # Validate user input
        try:
            t = yf.Ticker(user_input)
            hist = t.history(period="1d")
            if not hist.empty:
                print("    ✅ Verified.")
                ticker_map[isin] = user_input
                save_ticker_map(ticker_map)
                return user_input
            else:
                print(
                    f"    ❌ Ticker '{user_input}' seems invalid or has no price data."
                )
        except Exception as e:
            print(f"    ❌ Error validating ticker: {e}")
    else:
        print("    -> Skipped.")

    return None


def _get_ticker_currency(ticker_symbol):
    """
    Determines the currency of a ticker using heuristics or API.
    """
    # 1. Heuristics based on suffix
    if ticker_symbol.endswith((".DE", ".F", ".MI", ".PA", ".AS", ".MC", ".VI")):
        return "EUR"
    if ticker_symbol.endswith(".L"):
        # LSE can be GBP, GBp (pence), or USD. Hard to guess.
        # Fallback to API.
        pass
    if ticker_symbol.endswith(".HK"):
        return "HKD"

    # 2. API Check
    try:
        t = yf.Ticker(ticker_symbol)
        # fast_info is fast and usually contains currency
        currency = t.fast_info.get("currency")
        if currency:
            return currency
    except Exception:
        pass

    # Default to USD for US-looking tickers (no dot)
    if "." not in ticker_symbol:
        return "USD"

    return "USD"  # Safe default? Or raise?


def _get_fx_rate(from_currency, to_currency="EUR"):
    """
    Fetches FX rate. Returns 1.0 if same.
    """
    if from_currency == to_currency:
        return 1.0

    # Special handling for GBp (British Pence)
    if from_currency == "GBp":
        # 100 GBp = 1 GBP.
        # Get GBP->EUR rate and divide by 100
        gbp_eur = _get_fx_rate("GBP", "EUR")
        return gbp_eur / 100.0

    pair = f"{from_currency}{to_currency}=X"
    try:
        t = yf.Ticker(pair)
        # minimal fetch
        hist = t.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        logger.warning(f"Could not fetch FX rate for {pair}")

    return 1.0  # Fallback (dangerous but keeps pipeline moving)


def _fetch_prices_batch(tickers):
    """
    Robust batch fetching with escalation strategy.
    Returns a dict {ticker: price_in_eur}.
    """
    prices = {}
    remaining_tickers = [t for t in tickers if t]  # Filter Nones

    if not remaining_tickers:
        return prices

    # Escalation Strategy: 1d -> 5d -> 1mo
    periods = ["1d", "5d", "1mo"]

    raw_prices = {}

    for period in periods:
        if not remaining_tickers:
            break

        logger.info(
            f"Fetching batch of {len(remaining_tickers)} tickers with period='{period}'..."
        )

        try:
            # group_by='ticker' ensures we get a MultiIndex with Ticker as top level
            # threads=True enables parallel fetching
            data = yf.download(
                remaining_tickers,
                period=period,
                group_by="ticker",
                threads=True,
                progress=False,
            )

            # If only one ticker, data structure is different (single level columns)
            if len(remaining_tickers) == 1:
                ticker = remaining_tickers[0]
                if not data.empty and "Close" in data.columns:
                    last_valid = data["Close"].dropna().iloc[-1]
                    raw_prices[ticker] = float(last_valid)
                    remaining_tickers = []
                continue

            # Multi-ticker handling
            found_in_batch = []
            for ticker in remaining_tickers:
                try:
                    if ticker in data.columns:
                        ticker_data = data[ticker]
                        if "Close" in ticker_data.columns:
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
    if remaining_tickers:
        logger.info(
            f"Falling back to individual fetch for {len(remaining_tickers)} tickers..."
        )
        for ticker in remaining_tickers:
            try:
                t = yf.Ticker(ticker)
                hist = t.history(period="1mo")
                if not hist.empty:
                    raw_prices[ticker] = float(hist["Close"].iloc[-1])
                    logger.debug(f"Recovered {ticker} via individual fetch.")
                else:
                    logger.warning(
                        f"Failed to fetch price for {ticker} (Delisted or Invalid)"
                    )
            except Exception as e:
                logger.warning(f"Error fetching {ticker}: {e}")

    # --- Currency Conversion Step ---
    logger.info("Normalizing prices to EUR...")
    for ticker, price in raw_prices.items():
        currency = _get_ticker_currency(ticker)
        if currency != "EUR":
            rate = _get_fx_rate(currency, "EUR")
            prices[ticker] = price * rate
            # logger.debug(f"Converted {ticker}: {price} {currency} -> {prices[ticker]:.2f} EUR (Rate: {rate:.4f})")
        else:
            prices[ticker] = price

    return prices


def get_price_map(isins):
    """
    Returns a dictionary {isin: price}.
    Resolves ISINs to Tickers first, then batch fetches prices.
    """
    logger.info(f"Resolving and fetching prices for {len(isins)} assets")

    # 1. Resolve all ISINs to Tickers
    isin_to_ticker = {}
    unique_tickers = set()

    for isin in isins:
        ticker = resolve_ticker(isin)
        if ticker:
            isin_to_ticker[isin] = ticker
            unique_tickers.add(ticker)
        else:
            logger.warning(f"⚠️  No price available for {isin} (Missing Ticker)")

    # 2. Fetch Prices for Unique Tickers (Batch)
    ticker_price_map = _fetch_prices_batch(list(unique_tickers))

    # 3. Map back to ISINs
    result = {}
    for isin, ticker in isin_to_ticker.items():
        if ticker in ticker_price_map:
            result[isin] = ticker_price_map[ticker]
        else:
            # Try to report why? (Already logged in batch fetch)
            pass

    return result


def fetch_current_price(isin):
    """Helper for single price (legacy support)"""
    res = get_price_map([isin])
    return res.get(isin)
