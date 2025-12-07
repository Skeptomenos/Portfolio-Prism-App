import re


def classify_holding(ticker: str, name: str) -> str:
    """
    Classifies a holding into 'Equity', 'Cash', or 'Derivative' based on its
    ticker and name.
    """
    if not isinstance(ticker, str):
        ticker = ""
    if not isinstance(name, str):
        name = ""

    ticker_upper = ticker.upper()
    name_upper = name.upper()

    # 1. Cash / Money Market
    cash_keywords = [
        "_CURRENCY",
        "LIQUIDITY",
        "CASH",
        "MONEY MARKET",
        "AUD CASH",
        "USD CASH",
        "EUR CASH",
    ]
    if any(k in ticker_upper for k in cash_keywords) or any(
        k in name_upper for k in cash_keywords
    ):
        return "Cash"

    # 2. Derivatives / Futures
    # Pattern: 1-3 letters, 1 letter (Month code: F,G,H,J,K,M,N,Q,U,V,X,Z), 1 digit (Year)
    # e.g. ESZ5 (S&P Dec 2025), TPZ5
    future_pattern = r"^[A-Z]{1,4}[FGHJKMNQUVXZ]\d$"

    if (
        "FUT" in ticker_upper
        or "FUTURE" in name_upper
        or "INDEX DEC" in name_upper
        or "INDEX MAR" in name_upper
    ):
        return "Derivative"

    if re.match(future_pattern, ticker_upper):
        return "Derivative"

    # 3. Default to Equity
    return "Equity"
