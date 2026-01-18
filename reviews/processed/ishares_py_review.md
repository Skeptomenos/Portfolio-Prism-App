# Code Review: ishares.py

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED (2 Medium, 5 Low, 2 Info)

---

## Summary

The ISharesAdapter is responsible for fetching ETF holdings data from iShares via direct CSV download. The code follows the "Layer 1: Direct Download" strategy and includes auto-discovery of product IDs. Overall the implementation is functional but has a critical bug (undefined variable) and could benefit from input validation.

**Findings by Severity**:
- Critical: 0
- High: 0
- Medium: 2
- Low: 5
- Info: 2

---

## [MEDIUM] Undefined Variable `ISHARES_CONFIG_PATH` Causes RuntimeError

> The `_save_config` method references an undefined variable, causing a NameError when called

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:41-44`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `_save_config` method references `ISHARES_CONFIG_PATH` on lines 41-44, but this variable is never defined. The correct variable is `CONFIG_PATH` which is defined on line 16. This will cause a `NameError` at runtime whenever a new product ID is discovered and the code attempts to persist it.

This bug prevents the auto-discovery feature from persisting newly discovered product IDs, forcing re-discovery on each run.

### Current Code

```python
def _save_config(self):
    try:
        os.makedirs(os.path.dirname(ISHARES_CONFIG_PATH), exist_ok=True)
        with open(ISHARES_CONFIG_PATH, "w") as f:
            json.dump(self.config, f, indent=4)
        logger.info(f"Updated iShares config saved to {ISHARES_CONFIG_PATH}")
    except Exception as e:
        logger.error(f"Failed to save iShares config: {e}")
```

### Suggested Fix

```python
def _save_config(self):
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w") as f:
            json.dump(self.config, f, indent=4)
        logger.info(f"Updated iShares config saved to {CONFIG_PATH}")
    except Exception as e:
        logger.error(f"Failed to save iShares config: {e}")
```

### Verification

1. Run: `python -c "from portfolio_src.adapters.ishares import ISharesAdapter; a = ISharesAdapter(); a._save_config()"`
2. Verify no NameError is raised
3. Verify config file is created at expected path

---

## [MEDIUM] No ISIN Input Validation Before URL Construction

> ISIN parameter used directly in URL and file paths without validation

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:103,48,155`  
**Category**: Security  
**Severity**: Medium  

### Description

The `isin` parameter is used directly in:
1. URL construction (line 155): `fileName={isin}_holdings`
2. Search URL (line 53): `searchTerm={isin}`
3. File cache path (via decorator)

While ISIN format is typically alphanumeric (12 characters), there's no validation before use. Malformed input could potentially cause unexpected behavior or be used for URL manipulation.

### Current Code

```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    # isin used directly without validation
    logger.info(f"--- Fetching holdings for {isin} ---")
    # ...
    url = (
        f"https://www.ishares.com/{region}/{user_type}/{region}/produkte/"
        f"{product_id}/fund/1478358465952.ajax?fileType=csv&fileName={isin}_holdings&dataType=fund"
    )
```

### Suggested Fix

```python
import re

def _validate_isin(self, isin: str) -> bool:
    """Validate ISIN format: 2 letters + 10 alphanumeric characters."""
    if not isin or not isinstance(isin, str):
        return False
    return bool(re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin.upper()))

@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    if not self._validate_isin(isin):
        logger.error(f"Invalid ISIN format: {isin}")
        return pd.DataFrame()
    
    isin = isin.upper().strip()  # Normalize
    # ... rest of method
```

### Verification

1. Add unit tests with invalid ISINs: `"../../../etc/passwd"`, `"<script>alert(1)</script>"`, `""`
2. Verify empty DataFrame returned for invalid inputs
3. Verify no path traversal or injection possible

---

## [LOW] No Validation of CSV Column Structure

> Code assumes specific column names exist without defensive checks

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:178-179`  
**Category**: Correctness  
**Severity**: Low  

### Description

The code directly accesses columns by name (`Emittententicker`, `Name`, `Gewichtung (%)`, `Standort`, `Börse`) without checking if they exist. If iShares changes their CSV format, this will raise a `KeyError`.

### Current Code

```python
holdings_df = holdings_df[
    ["Emittententicker", "Name", "Gewichtung (%)", "Standort", "Börse"]
].copy()
```

### Suggested Fix

```python
required_columns = ["Emittententicker", "Name", "Gewichtung (%)", "Standort", "Börse"]
missing_columns = [col for col in required_columns if col not in holdings_df.columns]

if missing_columns:
    logger.error(f"CSV format changed for {isin}. Missing columns: {missing_columns}")
    logger.debug(f"Available columns: {list(holdings_df.columns)}")
    return pd.DataFrame()

holdings_df = holdings_df[required_columns].copy()
```

### Verification

1. Test with a mock CSV missing expected columns
2. Verify graceful handling with informative error logging

---

## [LOW] Interactive Prompt May Block in Headless Mode

> `input()` call could block execution in sidecar/headless environment

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:92-100`  
**Category**: Correctness  
**Severity**: Low  

### Description

The `_prompt_for_product_id` method uses `input()` which will block indefinitely if called in a non-interactive context. While there's a `sys.stdout.isatty()` guard at line 124, this check may not be reliable in all deployment scenarios (e.g., Tauri sidecar).

### Current Code

```python
if not product_id and sys.stdout.isatty():
    product_id = self._prompt_for_product_id(isin)
```

### Suggested Fix

```python
# Add environment variable check for headless mode
import os

def _is_interactive(self) -> bool:
    """Check if running in interactive mode."""
    if os.getenv("PRISM_HEADLESS", "0") == "1":
        return False
    return sys.stdout.isatty()

# In fetch_holdings:
if not product_id and self._is_interactive():
    product_id = self._prompt_for_product_id(isin)
```

### Verification

1. Set `PRISM_HEADLESS=1` and verify no prompt appears
2. Test in Tauri sidecar environment

---

## [LOW] Empty DataFrame Return Masks Error Type

> Exceptions return empty DataFrame without distinguishing error vs no-data

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:303-312`  
**Category**: Correctness  
**Severity**: Low  

### Description

Both network errors and unexpected errors return an empty DataFrame, making it impossible for callers to distinguish between "no holdings data" vs "fetch failed". This could lead to silent data loss.

### Current Code

```python
except requests.exceptions.RequestException as e:
    logger.error(f"Network request failed for {isin}...")
    return pd.DataFrame()
except Exception as e:
    logger.error(f"An unexpected error occurred...")
    return pd.DataFrame()
```

### Suggested Fix

Consider returning `None` for errors vs empty DataFrame for valid-but-empty responses, or raising custom exceptions that the registry can handle.

```python
class AdapterFetchError(Exception):
    """Raised when adapter fails to fetch data due to network or parsing errors."""
    pass

# In exception handlers:
except requests.exceptions.RequestException as e:
    logger.error(f"Network request failed for {isin}...")
    raise AdapterFetchError(f"Network error fetching {isin}") from e
```

### Verification

1. Update registry/calling code to handle exceptions appropriately
2. Verify error states are properly propagated

---

## [LOW] Hardcoded German Locale Column Names

> CSV parsing assumes German language column headers

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:178-192`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Column names like `Emittententicker`, `Gewichtung (%)`, `Standort`, `Börse` are hardcoded German terms. If the user_type or region is changed to non-German locales, the CSV format will differ.

### Suggested Fix

Add a column mapping configuration per locale, or document that only German locale is supported.

```python
COLUMN_MAPPINGS = {
    "de": {
        "ticker": "Emittententicker",
        "name": "Name",
        "weight": "Gewichtung (%)",
        "location": "Standort",
        "exchange": "Börse",
    },
    # Future: Add other locales
}
```

---

## [LOW] Fragile Product ID Discovery Regex

> Regex pattern for product ID extraction could match incorrectly

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:64`  
**Category**: Correctness  
**Severity**: Low  

### Description

The regex `r"/produkte/(\d+)/"` uses `re.search()` which takes the first match. If the page structure changes and contains other `/produkte/\d+/` patterns, the wrong ID could be extracted.

### Suggested Fix

Consider using a more specific regex or validating the extracted ID against known ranges.

---

## [INFO] Magic Number in CSV Parsing

> `skiprows=2` is undocumented

**File**: `src-tauri/python/portfolio_src/adapters/ishares.py:173`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `skiprows=2` parameter assumes a specific CSV header format. This should be documented or made a constant.

### Suggested Fix

```python
# iShares CSV format: 2 header rows before data
ISHARES_CSV_HEADER_ROWS = 2

holdings_df = pd.read_csv(csv_data, skiprows=ISHARES_CSV_HEADER_ROWS)
```

---

## [INFO] No Unit Tests for ISharesAdapter

> Test coverage gap for ETF adapters

**File**: `src-tauri/python/tests/test_adapters.py`  
**Category**: Testing  
**Severity**: Info  

### Description

The test file covers `TradeRepublicAdapter` and `ManualCSVAdapter` but has no tests for `ISharesAdapter`, `VanguardAdapter`, `XtrackersAdapter`, `VanEckAdapter`, or `AmundiAdapter`. This leaves significant functionality untested.

### Suggested Fix

Add unit tests with mocked network responses to cover:
1. Valid CSV parsing
2. Column name validation
3. Ticker suffix logic
4. Error handling for network failures
5. Product ID discovery

---

## Approval Status

**PASSED** - No critical or high severity findings. Medium findings are:
1. Bug fix needed for undefined variable (clear fix)
2. Input validation recommended (defense in depth)

Both are improvements but not blockers for the current implementation.
