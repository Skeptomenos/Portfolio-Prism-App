from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Dict
import pandas as pd

from portfolio_src.models.canonical import CanonicalPosition
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class ManualCSVAdapter:
    ISIN_COLUMNS = ["isin", "instrumentid", "security_id", "wkn"]
    NAME_COLUMNS = ["name", "security", "instrument", "bezeichnung"]
    QUANTITY_COLUMNS = [
        "quantity",
        "qty",
        "shares",
        "units",
        "amount",
        "anzahl",
        "stueck",
    ]
    PRICE_COLUMNS = ["price", "unit_price", "share_price", "current_price", "kurs"]
    VALUE_COLUMNS = ["value", "market_value", "total", "total_value", "wert"]
    CURRENCY_COLUMNS = ["currency", "waehrung", "ccy"]

    def normalize(
        self,
        df: pd.DataFrame,
        column_mapping: Optional[Dict[str, str]] = None,
    ) -> List[CanonicalPosition]:
        if df.empty:
            return []

        if column_mapping:
            df = df.rename(columns=column_mapping)

        df.columns = pd.Index([str(c).lower().strip() for c in df.columns])

        isin_col = self._find_column(df, self.ISIN_COLUMNS)
        name_col = self._find_column(df, self.NAME_COLUMNS)
        qty_col = self._find_column(df, self.QUANTITY_COLUMNS)
        price_col = self._find_column(df, self.PRICE_COLUMNS)
        value_col = self._find_column(df, self.VALUE_COLUMNS)
        currency_col = self._find_column(df, self.CURRENCY_COLUMNS)

        if not isin_col:
            raise ValueError("CSV must have an ISIN column")

        result = []

        for idx, row in df.iterrows():
            try:
                isin = str(row[isin_col]).strip().upper()
                name = str(row.get(name_col, "Unknown")) if name_col else "Unknown"
                currency = (
                    str(row.get(currency_col, "EUR")).upper() if currency_col else "EUR"
                )

                quantity, unit_price = self._extract_value_components(
                    row, qty_col, price_col, value_col
                )

                if quantity is None or unit_price is None:
                    logger.error(f"Cannot determine value for {isin}")
                    continue

                canonical = CanonicalPosition(
                    isin=isin,
                    name=name,
                    quantity=quantity,
                    unit_price=unit_price,
                    currency=currency,
                    source="manual_csv",
                    timestamp=datetime.now(),
                )

                errors = canonical.validate()
                if errors:
                    if any(
                        "Invalid ISIN" in e or "Negative price" in e for e in errors
                    ):
                        logger.warning(f"Skipping {isin}: {errors}")
                        continue

                result.append(canonical)

            except Exception as e:
                logger.error(f"Failed to parse CSV row {idx}: {e}")
                continue

        logger.info(f"Normalized {len(result)} positions from CSV")
        return result

    def _find_column(self, df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
        for col in candidates:
            if col in df.columns:
                return col
        return None

    def _extract_value_components(
        self,
        row: pd.Series,
        qty_col: Optional[str],
        price_col: Optional[str],
        value_col: Optional[str],
    ) -> tuple[Optional[Decimal], Optional[Decimal]]:
        try:
            if qty_col and price_col:
                quantity = Decimal(str(row[qty_col]))
                unit_price = Decimal(str(row[price_col]))
                return quantity, unit_price

            elif qty_col and value_col:
                quantity = Decimal(str(row[qty_col]))
                total_value = Decimal(str(row[value_col]))
                if quantity > 0:
                    unit_price = total_value / quantity
                else:
                    unit_price = Decimal("0")
                return quantity, unit_price

            elif value_col:
                quantity = Decimal("1")
                unit_price = Decimal(str(row[value_col]))
                logger.warning("No quantity column, assuming 1")
                return quantity, unit_price

            else:
                return None, None

        except (InvalidOperation, ValueError) as e:
            logger.error(f"Failed to extract value components: {e}")
            return None, None
