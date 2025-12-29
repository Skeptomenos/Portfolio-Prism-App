# Phase 2 Implementation Plan: Canonical Position Model

> **Parent Plan:** `keystone/plans/value-semantics-fix.md`
> **Prerequisite:** Phase 1 complete and verified
> **Status:** Pending
> **Estimated Time:** 5 hours

---

## Objective

Establish a canonical position model that serves as the single source of truth for position data. All data sources (Trade Republic, manual CSV, future brokers) must be normalized to this format before entering the pipeline.

---

## Key Design Principle

> **CanonicalPosition is an Ingestion DTO only.**
> 
> Convert: `Source → [CanonicalPosition] → DataFrame`
> 
> The pipeline continues to operate on DataFrames for performance (vectorized operations).

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `portfolio_src/models/canonical.py` | Create | CanonicalPosition dataclass |
| `portfolio_src/adapters/tr_adapter.py` | Create | Trade Republic normalizer |
| `portfolio_src/adapters/csv_adapter.py` | Create | Manual CSV normalizer |
| `portfolio_src/core/pipeline.py` | Modify | Accept canonical DataFrame |
| `tests/test_canonical.py` | Create | Unit tests for model |
| `tests/test_adapters.py` | Create | Unit tests for adapters |

---

## Step-by-Step Implementation

### Step 1: Create CanonicalPosition Model

**File:** `portfolio_src/models/canonical.py`

```python
"""
Canonical Position Model.

The single source of truth for position data representation.
All data sources must be normalized to this format before pipeline processing.
"""

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import List, Optional
import pandas as pd

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class CanonicalPosition:
    """
    Ingestion DTO - validates and normalizes source data.
    
    Convert to DataFrame immediately after validation for pipeline processing.
    The market_value is a computed property - it cannot be set incorrectly.
    """
    isin: str
    name: str
    quantity: Decimal
    unit_price: Decimal
    currency: str = "EUR"
    source: str = "unknown"
    timestamp: Optional[datetime] = field(default_factory=datetime.now)
    asset_type: str = "Stock"  # Stock, ETF, Crypto, etc.
    
    @property
    def market_value(self) -> Decimal:
        """Computed property - CANNOT be set directly."""
        return self.quantity * self.unit_price
    
    def validate(self) -> List[str]:
        """
        Validate position data.
        
        Returns:
            List of validation errors, empty if valid.
        """
        errors = []
        
        # ISIN validation
        if len(self.isin) != 12:
            errors.append(f"Invalid ISIN length: {len(self.isin)} (expected 12)")
        elif not self.isin[:2].isalpha():
            errors.append(f"ISIN must start with 2 letters: {self.isin}")
        elif not self.isin[2:].isalnum():
            errors.append(f"ISIN chars 3-12 must be alphanumeric: {self.isin}")
        
        # Quantity validation (allow negative for short positions)
        if self.quantity < 0:
            logger.warning(f"Negative quantity for {self.isin}: {self.quantity} (short position)")
        
        # Price validation
        if self.unit_price < 0:
            errors.append(f"Negative price: {self.unit_price}")
        
        # Currency validation
        if self.currency != "EUR":
            logger.warning(
                f"Non-EUR currency for {self.isin}: {self.currency}. "
                f"Value will be treated as EUR (no conversion)."
            )
        
        return errors
    
    def to_dict(self) -> dict:
        """Convert to dict for DataFrame construction."""
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
    """
    Convert validated positions to DataFrame for pipeline processing.
    
    Args:
        positions: List of validated CanonicalPosition objects
        
    Returns:
        DataFrame with canonical schema
    """
    if not positions:
        return pd.DataFrame()
    return pd.DataFrame([p.to_dict() for p in positions])


def validate_positions(positions: List[CanonicalPosition]) -> tuple[List[CanonicalPosition], List[dict]]:
    """
    Validate a list of positions, separating valid from invalid.
    
    Args:
        positions: List of CanonicalPosition objects
        
    Returns:
        Tuple of (valid_positions, error_reports)
    """
    valid = []
    errors = []
    
    for pos in positions:
        validation_errors = pos.validate()
        if validation_errors:
            errors.append({
                "isin": pos.isin,
                "name": pos.name,
                "errors": validation_errors,
            })
        else:
            valid.append(pos)
    
    if errors:
        logger.warning(f"Validation failed for {len(errors)} positions")
    
    return valid, errors
```

### Step 2: Create Trade Republic Adapter

**File:** `portfolio_src/adapters/tr_adapter.py`

```python
"""
Trade Republic Adapter.

Transforms Trade Republic API responses to canonical positions.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Any

from portfolio_src.models.canonical import CanonicalPosition
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class TradeRepublicAdapter:
    """Transforms TR API response to canonical positions."""
    
    def normalize(self, raw_positions: List[dict]) -> List[CanonicalPosition]:
        """
        Transform Trade Republic positions to canonical format.
        
        Args:
            raw_positions: List of position dicts from TR API
            
        Returns:
            List of CanonicalPosition objects
        """
        result = []
        
        for pos in raw_positions:
            try:
                # Extract fields with fallbacks
                isin = str(pos.get("instrumentId", pos.get("isin", ""))).strip().upper()
                name = str(pos.get("name", "Unknown"))
                
                # Handle quantity (netSize or quantity)
                qty_raw = pos.get("netSize", pos.get("quantity", 0))
                quantity = Decimal(str(qty_raw))
                
                # Handle price (currentPrice or price)
                price_raw = pos.get("currentPrice", pos.get("price", 0))
                unit_price = Decimal(str(price_raw))
                
                # Determine asset type
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
                
                # Validate
                errors = canonical.validate()
                if errors:
                    logger.warning(f"Validation errors for {isin}: {errors}")
                    # Still include if only warnings (e.g., negative qty)
                    if any("Invalid" in e or "Negative price" in e for e in errors):
                        continue
                
                result.append(canonical)
                
            except (KeyError, ValueError, InvalidOperation) as e:
                logger.error(f"Failed to parse TR position: {e}, data: {pos}")
                continue
        
        logger.info(f"Normalized {len(result)} positions from Trade Republic")
        return result
    
    def _detect_asset_type(self, pos: dict) -> str:
        """Detect asset type from TR position data."""
        # TR provides typeId or we can infer from ISIN
        type_id = pos.get("typeId", "")
        isin = str(pos.get("instrumentId", pos.get("isin", "")))
        
        if type_id == "etf" or isin.startswith("IE") or isin.startswith("LU"):
            return "ETF"
        elif type_id == "crypto" or isin.startswith("XF"):
            return "Crypto"
        else:
            return "Stock"
```

### Step 3: Create Manual CSV Adapter

**File:** `portfolio_src/adapters/csv_adapter.py`

```python
"""
Manual CSV Adapter.

Transforms user-uploaded CSV files to canonical positions.
Handles ambiguous column names with explicit mapping.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Dict
import pandas as pd

from portfolio_src.models.canonical import CanonicalPosition
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class ManualCSVAdapter:
    """Transforms user-uploaded CSV to canonical positions."""
    
    # Column name candidates for each semantic field
    ISIN_COLUMNS = ["isin", "instrumentid", "security_id", "wkn"]
    NAME_COLUMNS = ["name", "security", "instrument", "bezeichnung"]
    QUANTITY_COLUMNS = ["quantity", "qty", "shares", "units", "amount", "anzahl", "stueck"]
    PRICE_COLUMNS = ["price", "unit_price", "share_price", "current_price", "kurs"]
    VALUE_COLUMNS = ["value", "market_value", "total", "total_value", "wert"]
    CURRENCY_COLUMNS = ["currency", "waehrung", "ccy"]
    
    def normalize(
        self, 
        df: pd.DataFrame, 
        column_mapping: Optional[Dict[str, str]] = None
    ) -> List[CanonicalPosition]:
        """
        Normalize CSV to canonical positions.
        
        Args:
            df: Raw CSV DataFrame
            column_mapping: Optional explicit mapping from user (from UI)
                           e.g., {"Anzahl": "quantity", "Kurs": "price"}
                           
        Returns:
            List of CanonicalPosition objects
        """
        if df.empty:
            return []
        
        # Apply user mapping if provided
        if column_mapping:
            df = df.rename(columns=column_mapping)
        
        # Normalize column names to lowercase
        df.columns = [str(c).lower().strip() for c in df.columns]
        
        # Find semantic columns
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
                currency = str(row.get(currency_col, "EUR")).upper() if currency_col else "EUR"
                
                # Determine quantity and price
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
                
                # Validate
                errors = canonical.validate()
                if errors:
                    # Skip only on hard errors
                    if any("Invalid ISIN" in e or "Negative price" in e for e in errors):
                        logger.warning(f"Skipping {isin}: {errors}")
                        continue
                
                result.append(canonical)
                
            except Exception as e:
                logger.error(f"Failed to parse CSV row {idx}: {e}")
                continue
        
        logger.info(f"Normalized {len(result)} positions from CSV")
        return result
    
    def _find_column(self, df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
        """Find first matching column from candidates."""
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
        """
        Extract quantity and unit_price from row.
        
        Handles three cases:
        1. Both quantity and price provided → use directly
        2. Quantity and total value provided → derive price
        3. Only total value provided → assume quantity=1
        """
        try:
            if qty_col and price_col:
                # Case 1: Both provided
                quantity = Decimal(str(row[qty_col]))
                unit_price = Decimal(str(row[price_col]))
                return quantity, unit_price
            
            elif qty_col and value_col:
                # Case 2: Derive price from value
                quantity = Decimal(str(row[qty_col]))
                total_value = Decimal(str(row[value_col]))
                if quantity > 0:
                    unit_price = total_value / quantity
                else:
                    unit_price = Decimal("0")
                return quantity, unit_price
            
            elif value_col:
                # Case 3: Only value, assume quantity=1
                quantity = Decimal("1")
                unit_price = Decimal(str(row[value_col]))
                logger.warning(f"No quantity column, assuming 1")
                return quantity, unit_price
            
            else:
                return None, None
                
        except (InvalidOperation, ValueError) as e:
            logger.error(f"Failed to extract value components: {e}")
            return None, None
```

### Step 4: Update Pipeline Entry Point

**File:** `portfolio_src/core/pipeline.py`

Add import and optional adapter usage:

```python
from portfolio_src.models.canonical import positions_to_dataframe, CanonicalPosition
```

The pipeline continues to accept DataFrames but can now receive pre-validated canonical DataFrames from adapters.

### Step 5: Add Unit Tests

**File:** `tests/test_canonical.py` and `tests/test_adapters.py`

(See test specifications in parent plan)

---

## Verification Steps

1. **Run adapter tests:**
   ```bash
   cd src-tauri/python && python -m pytest tests/test_adapters.py -v
   ```

2. **Test with real TR data:**
   - Sync portfolio
   - Verify positions are normalized correctly

3. **Test with sample CSV:**
   - Create test CSV with various column names
   - Verify adapter handles all cases

---

## Success Criteria

- [ ] CanonicalPosition model validates correctly
- [ ] TR adapter normalizes all position types
- [ ] CSV adapter handles ambiguous columns
- [ ] Pipeline accepts canonical DataFrames
- [ ] All adapter tests pass
- [ ] No regressions in existing functionality
