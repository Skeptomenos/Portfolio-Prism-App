from enum import Enum
from typing import Union


class AssetClass(str, Enum):
    """Valid asset classes matching database schema constraint."""

    STOCK = "Stock"
    ETF = "ETF"
    CASH = "Cash"
    CRYPTO = "Crypto"
    DERIVATIVE = "Derivative"
    BOND = "Bond"
    FUND = "Fund"


_NORMALIZATION_MAP = {
    "equity": AssetClass.STOCK,
    "stock": AssetClass.STOCK,
    "stocks": AssetClass.STOCK,
    "share": AssetClass.STOCK,
    "shares": AssetClass.STOCK,
    "etf": AssetClass.ETF,
    "etfs": AssetClass.ETF,
    "index fund": AssetClass.ETF,
    "tracker": AssetClass.ETF,
    "cash": AssetClass.CASH,
    "money market": AssetClass.CASH,
    "crypto": AssetClass.CRYPTO,
    "cryptocurrency": AssetClass.CRYPTO,
    "bitcoin": AssetClass.CRYPTO,
    "ethereum": AssetClass.CRYPTO,
    "derivative": AssetClass.DERIVATIVE,
    "option": AssetClass.DERIVATIVE,
    "future": AssetClass.DERIVATIVE,
    "warrant": AssetClass.DERIVATIVE,
    "bond": AssetClass.BOND,
    "bonds": AssetClass.BOND,
    "fixed income": AssetClass.BOND,
    "fund": AssetClass.FUND,
    "mutual fund": AssetClass.FUND,
}


def normalize_asset_class(value: Union[str, AssetClass, None]) -> AssetClass:
    """Normalize any asset class string to valid enum value.

    Args:
        value: Raw asset class string (e.g., "Equity", "equity", "STOCK")

    Returns:
        Normalized AssetClass enum value

    Examples:
        >>> normalize_asset_class("Equity")
        AssetClass.STOCK
        >>> normalize_asset_class("etf")
        AssetClass.ETF
        >>> normalize_asset_class(None)
        AssetClass.STOCK
    """
    if value is None:
        return AssetClass.STOCK

    if isinstance(value, AssetClass):
        return value

    normalized = value.lower().strip()

    if normalized in _NORMALIZATION_MAP:
        return _NORMALIZATION_MAP[normalized]

    for enum_val in AssetClass:
        if normalized == enum_val.value.lower():
            return enum_val

    return AssetClass.STOCK
