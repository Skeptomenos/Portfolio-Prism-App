"""
Portfolio position models.

Defines the structure for positions loaded from the state manager,
including both direct stock holdings and ETF positions.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal


class Position(BaseModel):
    """
    Base position loaded from state manager.

    Represents a single holding in the portfolio, either a direct stock
    or an ETF that needs to be decomposed.

    Attributes:
        isin: International Securities Identification Number (12 chars)
        name: Human-readable security name
        quantity: Number of shares/units held (must be non-negative)
        asset_type: Either "Stock" or "ETF"
        ticker_src: Yahoo Finance compatible ticker for pricing
        provider: ETF provider (e.g., "iShares", "VanEck") or empty for stocks
        current_price: Latest price in EUR (None if not yet fetched)
        market_value: quantity * current_price in EUR
    """

    isin: str = Field(..., min_length=12, max_length=12)
    name: str
    quantity: float = Field(..., ge=0)
    asset_type: Literal["Stock", "ETF"] = "Stock"
    ticker_src: Optional[str] = None
    provider: Optional[str] = None
    current_price: Optional[float] = Field(default=None, ge=0)
    market_value: float = Field(default=0.0, ge=0)

    @field_validator("isin")
    @classmethod
    def validate_isin_format(cls, v: str) -> str:
        """
        Validate ISIN format: 2 letter country code + 10 alphanumeric chars.

        Args:
            v: The ISIN string to validate

        Returns:
            The validated ISIN in uppercase

        Raises:
            ValueError: If ISIN format is invalid
        """
        v = v.upper().strip()
        if len(v) != 12:
            raise ValueError(f"ISIN must be 12 characters, got {len(v)}: {v}")
        if not v[:2].isalpha():
            raise ValueError(f"ISIN must start with 2 letters: {v}")
        if not v[2:].isalnum():
            raise ValueError(f"ISIN chars 3-12 must be alphanumeric: {v}")
        return v

    def update_market_value(self, price: float) -> None:
        """
        Update current price and recalculate market value.

        Args:
            price: New price in EUR
        """
        self.current_price = price
        self.market_value = self.quantity * price


class DirectPosition(Position):
    """
    Stock position (direct holding).

    A position in an individual stock that contributes directly
    to portfolio exposure without decomposition.
    """

    asset_type: Literal["Stock"] = "Stock"


class ETFPosition(Position):
    """
    ETF position (to be decomposed).

    A position in an ETF that will be decomposed into its underlying
    holdings via the appropriate adapter.
    """

    asset_type: Literal["ETF"] = "ETF"

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: Optional[str]) -> Optional[str]:
        """
        Validate that ETF has a provider if specified.

        Args:
            v: Provider name or None

        Returns:
            Validated provider name
        """
        if v is not None:
            valid_providers = {"iShares", "VanEck", "Xtrackers", "Amundi"}
            if v not in valid_providers:
                # Log warning but don't fail - allow unknown providers
                pass
        return v
