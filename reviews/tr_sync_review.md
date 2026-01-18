# Code Review: tr_sync.py

**File**: `src-tauri/python/portfolio_src/data/tr_sync.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED (2 Medium, 2 Low, 1 Info)

---

## Summary

TRDataFetcher is a clean, focused class that fetches portfolio data from Trade Republic via the daemon and optionally saves to CSV. The code is well-structured with appropriate error handling. Main concerns are manual CSV escaping (should use stdlib) and lack of dedicated unit tests.

---

## [MEDIUM] Manual CSV Escaping May Miss Edge Cases

> Custom CSV escaping logic may fail on complex inputs

**File**: `src-tauri/python/portfolio_src/data/tr_sync.py:126-128`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `save_to_csv()` method implements manual CSV escaping for the name field. While it handles commas and double quotes, Python's stdlib `csv` module handles many more edge cases (embedded newlines, BOM, etc.) and is battle-tested.

### Current Code

```python
# Escape name for CSV
name = pos["name"].replace('"', '""')
if "," in name or '"' in name:
    name = f'"{name}"'

f.write(
    f"{pos['isin']},{pos['quantity']:.6f},{pos['avg_cost']:.4f},"
    f"{pos['current_price']:.4f},{pos['net_value']:.2f},{name}\n"
)
```

### Suggested Fix

```python
import csv

def save_to_csv(self, positions: List[Dict], output_path: Path) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["ISIN", "Quantity", "AvgCost", "CurrentPrice", "NetValue", "TR_Name"])
        for pos in positions:
            writer.writerow([
                pos["isin"],
                f"{pos['quantity']:.6f}",
                f"{pos['avg_cost']:.4f}",
                f"{pos['current_price']:.4f}",
                f"{pos['net_value']:.2f}",
                pos["name"],
            ])
    
    logger.info(f"Saved {len(positions)} positions to {output_path}")
    return len(positions)
```

### Verification

1. Test with instrument names containing: `"Company, Inc."`, `"O'Reilly"`, `"Line1\nLine2"`
2. Verify CSV opens correctly in Excel/Numbers
3. Existing tests should pass

---

## [MEDIUM] No Dedicated Unit Tests for TRDataFetcher

> Class is only tested via mocks in integration tests

**File**: `src-tauri/python/portfolio_src/data/tr_sync.py`  
**Category**: Testing  
**Severity**: Medium  

### Description

TRDataFetcher is mocked in integration tests but has no unit tests that verify its actual logic:
- Position transformation logic (string to float conversion)
- Malformed position handling (skip behavior)
- Empty portfolio handling
- CSV generation correctness

### Current Code

No test file exists for `tr_sync.py`.

### Suggested Fix

Create `src-tauri/python/tests/data/test_tr_sync.py`:

```python
import pytest
from pathlib import Path
from unittest.mock import Mock

from portfolio_src.data.tr_sync import TRDataFetcher


class TestTRDataFetcher:
    @pytest.fixture
    def mock_bridge(self):
        return Mock()

    def test_fetch_portfolio_success(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Siemens AG",
                        "netSize": "10.5",
                        "averageBuyIn": "120.50",
                        "netValue": 1300.25,
                    }
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert len(positions) == 1
        assert positions[0]["isin"] == "DE0007236101"
        assert positions[0]["quantity"] == 10.5
        assert positions[0]["avg_cost"] == 120.50

    def test_fetch_portfolio_skips_malformed(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {"instrumentId": "VALID123456", "netSize": "10", "averageBuyIn": "100", "netValue": 1000},
                    {"netSize": "invalid"},  # Missing instrumentId
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert len(positions) == 1  # Malformed position skipped

    def test_fetch_portfolio_empty(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {"positions": [], "cash": [{"amount": 100}]},
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert positions == []

    def test_save_to_csv(self, mock_bridge, tmp_path):
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {"isin": "US123", "name": "Test, Inc.", "quantity": 10.0, "avg_cost": 50.0, "current_price": 55.0, "net_value": 550.0}
        ]
        output_path = tmp_path / "output.csv"
        
        count = fetcher.save_to_csv(positions, output_path)
        
        assert count == 1
        content = output_path.read_text()
        assert "ISIN,Quantity" in content
        assert "US123" in content
```

### Verification

1. Run `pytest tests/data/test_tr_sync.py`
2. Verify coverage of edge cases

---

## [LOW] No ISIN Validation on Fetched Data

> Fetched data is written to database without format validation

**File**: `src-tauri/python/portfolio_src/data/tr_sync.py:79`  
**Category**: Security (Defense in Depth)  
**Severity**: Low  

### Description

While the daemon is a trusted internal source, adding ISIN validation at this boundary would provide defense-in-depth. The codebase has `is_valid_isin()` in `prism_utils/validation.py` but it's not used here.

### Current Code

```python
positions.append(
    {
        "isin": pos["instrumentId"],  # No validation
        ...
    }
)
```

### Suggested Fix

```python
from portfolio_src.prism_utils.validation import is_valid_isin

# Inside the loop:
isin = pos["instrumentId"]
if not is_valid_isin(isin):
    logger.warning(f"Skipping position with invalid ISIN format: {isin}")
    continue

positions.append({"isin": isin, ...})
```

### Verification

1. Add test case with malformed ISIN
2. Verify it's skipped with warning

---

## [LOW] Zero-Quantity Positions Create Misleading current_price

> Division fallback to 0 may hide data issues

**File**: `src-tauri/python/portfolio_src/data/tr_sync.py:75`  
**Category**: Correctness  
**Severity**: Low  

### Description

When `quantity` is 0 (or negative), `current_price` is set to 0. This creates a valid-looking position with misleading pricing data. Consider logging a warning or skipping such positions.

### Current Code

```python
current_price = net_value / quantity if quantity > 0 else 0
```

### Suggested Fix

```python
if quantity <= 0:
    logger.warning(f"Skipping position with zero/negative quantity: {pos.get('instrumentId', 'unknown')}")
    continue

current_price = net_value / quantity
```

### Verification

1. Test with position where `netSize = "0"`
2. Verify position is skipped, not silently added with price=0

---

## [INFO] Consider Using Constants for Default Values

> Magic strings reduce maintainability

**File**: `src-tauri/python/portfolio_src/data/tr_sync.py:80`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The default value `"Unknown"` for name is a magic string. Consider defining as a module constant for consistency.

### Current Code

```python
"name": pos.get("name", "Unknown"),
```

### Suggested Fix

```python
DEFAULT_INSTRUMENT_NAME = "Unknown"

# In the loop:
"name": pos.get("name", DEFAULT_INSTRUMENT_NAME),
```

### Verification

N/A - style improvement

---

## Checklist Summary

| Category | Status | Notes |
|----------|--------|-------|
| Security | PASS | Low risk - internal data source |
| Correctness | WARN | Manual CSV escaping, zero-qty edge case |
| Performance | PASS | No issues |
| Maintainability | PASS | Clean, readable code |
| Testing | WARN | No unit tests for TRDataFetcher |

---

## References

- Project validation utility: `prism_utils/validation.py`
- Python CSV module: https://docs.python.org/3/library/csv.html
- Pandera schema (used downstream): `core/schema.py`
