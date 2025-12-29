from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import List, Optional
import pandas as pd

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class CanonicalPosition:
    isin: str
    name: str
    quantity: Decimal
    unit_price: Decimal
    currency: str = "EUR"
    source: str = "unknown"
    timestamp: Optional[datetime] = field(default_factory=datetime.now)
    asset_type: str = "Stock"

    @property
    def market_value(self) -> Decimal:
        return self.quantity * self.unit_price

    def validate(self) -> List[str]:
        errors = []

        if len(self.isin) != 12:
            errors.append(f"Invalid ISIN length: {len(self.isin)} (expected 12)")
        elif not self.isin[:2].isalpha():
            errors.append(f"ISIN must start with 2 letters: {self.isin}")
        elif not self.isin[2:].isalnum():
            errors.append(f"ISIN chars 3-12 must be alphanumeric: {self.isin}")

        if self.quantity < 0:
            logger.warning(
                f"Negative quantity for {self.isin}: {self.quantity} (short position)"
            )

        if self.unit_price < 0:
            errors.append(f"Negative price: {self.unit_price}")

        if self.currency != "EUR":
            logger.warning(
                f"Non-EUR currency for {self.isin}: {self.currency}. "
                f"Value will be treated as EUR (no conversion)."
            )

        return errors

    def to_dict(self) -> dict:
        return {
            "isin": self.isin,
            "name": self.name,
            "quantity": float(self.quantity),
            "price": float(self.unit_price),
            "market_value": float(self.market_value),
            "currency": self.currency,
            "source": self.source,
            "asset_type": self.asset_type,
        }


def positions_to_dataframe(positions: List[CanonicalPosition]) -> pd.DataFrame:
    if not positions:
        return pd.DataFrame()
    return pd.DataFrame([p.to_dict() for p in positions])


def validate_positions(
    positions: List[CanonicalPosition],
) -> tuple[List[CanonicalPosition], List[dict]]:
    valid = []
    errors = []

    for pos in positions:
        validation_errors = pos.validate()
        if validation_errors:
            errors.append(
                {
                    "isin": pos.isin,
                    "name": pos.name,
                    "errors": validation_errors,
                }
            )
        else:
            valid.append(pos)

    if errors:
        logger.warning(f"Validation failed for {len(errors)} positions")

    return valid, errors
