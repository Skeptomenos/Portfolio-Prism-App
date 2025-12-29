from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List

from portfolio_src.models.canonical import CanonicalPosition
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class TradeRepublicAdapter:
    def normalize(self, raw_positions: List[dict]) -> List[CanonicalPosition]:
        result = []

        for pos in raw_positions:
            try:
                isin = str(pos.get("instrumentId", pos.get("isin", ""))).strip().upper()
                name = str(pos.get("name", "Unknown"))

                qty_raw = pos.get("netSize", pos.get("quantity", 0))
                quantity = Decimal(str(qty_raw))

                price_raw = pos.get("currentPrice", pos.get("price", 0))
                unit_price = Decimal(str(price_raw))

                asset_type = self._detect_asset_type(pos)

                canonical = CanonicalPosition(
                    isin=isin,
                    name=name,
                    quantity=quantity,
                    unit_price=unit_price,
                    currency="EUR",
                    source="trade_republic",
                    timestamp=datetime.now(),
                    asset_type=asset_type,
                )

                errors = canonical.validate()
                if errors:
                    logger.warning(f"Validation errors for {isin}: {errors}")
                    if any("Invalid" in e or "Negative price" in e for e in errors):
                        continue

                result.append(canonical)

            except (KeyError, ValueError, InvalidOperation) as e:
                logger.error(f"Failed to parse TR position: {e}, data: {pos}")
                continue

        logger.info(f"Normalized {len(result)} positions from Trade Republic")
        return result

    def _detect_asset_type(self, pos: dict) -> str:
        type_id = pos.get("typeId", "")
        isin = str(pos.get("instrumentId", pos.get("isin", "")))

        if type_id == "etf" or isin.startswith("IE") or isin.startswith("LU"):
            return "ETF"
        elif type_id == "crypto" or isin.startswith("XF"):
            return "Crypto"
        else:
            return "Stock"
