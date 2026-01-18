# Code Review: vanguard.py

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED (2 Medium, 4 Low, 2 Info)

---

## Summary

The VanguardAdapter fetches ETF holdings data using multiple strategies: manual file upload, US Vanguard API (preferred), and German site scraping (fallback). The code is well-structured with clear strategy ordering and proper error handling. The US API integration provides complete holdings with ISINs, which is a significant improvement over scraping top-10 only.

**Findings by Severity**:
- Critical: 0
- High: 0
- Medium: 2
- Low: 4
- Info: 2

---

## [MEDIUM] No ISIN Input Validation Before URL Construction

> ISIN parameter used directly in API URLs and file paths without validation

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:107,333,432-433`  
**Category**: Security  
**Severity**: Medium  

### Description

The `isin` parameter is used directly in:
1. US API URL construction (via fund_id lookup, line 188)
2. German site URL construction (line 333): `/{product_id}/{product_slug}`
3. File system paths (lines 432-433): `{isin}.xlsx`, `{isin}.csv`

While ISIN format is typically 12 alphanumeric characters, there's no validation before use. Malformed input could potentially cause:
- Path traversal in file operations (e.g., `"../../etc/passwd"`)
- Unexpected behavior in URL construction
- Cache key pollution via the `@cache_adapter_data` decorator

### Current Code

```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    # isin used directly without validation
    logger.info(f"--- Running Vanguard holdings acquisition for {isin} ---")
    # ...
    
def _fetch_from_manual_file(self, isin: str) -> Optional[pd.DataFrame]:
    manual_dir = MANUAL_INPUTS_DIR
    xlsx_path = os.path.join(manual_dir, f"{isin}.xlsx")  # No validation
    csv_path = os.path.join(manual_dir, f"{isin}.csv")
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
3. Verify no path traversal possible in manual file lookup

---

## [MEDIUM] Duplicate Logger Assignment Creates Redundancy

> Logger is assigned twice, potentially masking import or initialization issues

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:24,31`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The logger is initialized twice in the module:
- Line 24: `logger = get_logger(__name__)`
- Line 31: `logger = get_logger(__name__)` (after more imports)

This redundant initialization suggests copy-paste error from module reorganization. While functionally benign (same logger returned), it indicates potential import order issues and could mask problems if `get_logger` has side effects.

### Current Code

```python
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)  # First assignment (line 24)

from portfolio_src.data.caching import cache_adapter_data
from portfolio_src.data.holdings_cache import ManualUploadRequired
from portfolio_src.prism_utils.logging_config import get_logger  # Duplicate import
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR

logger = get_logger(__name__)  # Second assignment (line 31)
```

### Suggested Fix

```python
import os
import sys
import json
import re
import requests
import pandas as pd
from typing import Optional, List, Dict, Any

from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.data.caching import cache_adapter_data
from portfolio_src.data.holdings_cache import ManualUploadRequired
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR

logger = get_logger(__name__)  # Single assignment after all imports
```

### Verification

1. Remove duplicate import and logger assignment
2. Run `python -c "from portfolio_src.adapters.vanguard import VanguardAdapter"` - verify no import errors
3. Verify logging still works correctly

---

## [LOW] No Validation of API Response Structure

> API response structure assumed without defensive checks

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:211-215`  
**Category**: Correctness  
**Severity**: Low  

### Description

The code directly accesses nested dictionary keys (`data.get("fund", {}).get("entity", [])`) but doesn't validate the overall response structure. If Vanguard changes their API format, the code may silently return empty results instead of raising an informative error.

### Current Code

```python
data = response.json()

if total_size is None:
    total_size = data.get("size", 0)

holdings = data.get("fund", {}).get("entity", [])
```

### Suggested Fix

```python
data = response.json()

# Validate expected structure
if "fund" not in data:
    logger.warning(f"    Unexpected API response structure. Keys: {list(data.keys())}")
    return None

if total_size is None:
    total_size = data.get("size", 0)
    if total_size == 0:
        logger.warning("    API reports 0 total holdings - possible structure change")

holdings = data.get("fund", {}).get("entity", [])
```

### Verification

1. Add unit test with mock response missing "fund" key
2. Verify informative warning is logged

---

## [LOW] Unbounded Pagination Loop

> While loop could run indefinitely if API behaves unexpectedly

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:191-232`  
**Category**: Correctness  
**Severity**: Low  

### Description

The pagination loop has exit conditions based on API response data (`len(all_holdings) >= total_size`, `len(holdings) < count`), but if the API returns malformed data (e.g., always returns 500 items with `size` of infinity), the loop could run indefinitely.

### Current Code

```python
while True:
    # ... fetch page ...
    if len(all_holdings) >= total_size:
        break
    if len(holdings) < count:
        break
    start += count
```

### Suggested Fix

```python
MAX_PAGES = 50  # Safety limit: 50 pages * 500 = 25,000 holdings max
page_count = 0

while True:
    page_count += 1
    if page_count > MAX_PAGES:
        logger.warning(f"    Hit max pages ({MAX_PAGES}), stopping pagination")
        break
    
    # ... rest of loop ...
```

### Verification

1. Add test with mock API that returns infinite pagination
2. Verify loop terminates with warning

---

## [LOW] BeautifulSoup Scraping Relies on Fragile Table Index

> Hardcoded table index (2) is fragile

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:354`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The BeautifulSoup scraping assumes the holdings table is the 3rd table (index 2) on the page. If Vanguard changes their page layout (adds/removes tables), this will silently extract wrong data or fail.

### Current Code

```python
tables = soup.find_all("table")

if len(tables) < 3:
    logger.warning(f"   Expected 4 tables, found {len(tables)}")  # Note: says 4 but checks < 3
    return None

# Holdings table is typically the 3rd table (index 2)
holdings_table = tables[2]
```

### Suggested Fix

```python
# Try to find the holdings table by structure
def _find_holdings_table(self, soup) -> Optional[Tag]:
    """Find holdings table by looking for weight percentage column."""
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if any("assets" in h or "gewichtung" in h for h in headers):
            return table
    return None

holdings_table = self._find_holdings_table(soup)
if not holdings_table:
    logger.warning("   Could not find holdings table by structure")
    return None
```

### Verification

1. Test with mocked HTML containing different table layouts
2. Verify table is found by content, not position

---

## [LOW] Comment/Code Mismatch in Table Count Check

> Comment says "Expected 4 tables" but code checks for 3

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:349-350`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The warning message says "Expected 4 tables" but the condition checks `len(tables) < 3`, which would allow exactly 3 tables. This is confusing and suggests the code or comment is out of date.

### Current Code

```python
if len(tables) < 3:
    logger.warning(f"   Expected 4 tables, found {len(tables)}")  # Mismatch
```

### Suggested Fix

```python
# Either:
EXPECTED_MIN_TABLES = 3
if len(tables) < EXPECTED_MIN_TABLES:
    logger.warning(f"   Expected at least {EXPECTED_MIN_TABLES} tables, found {len(tables)}")

# Or if 4 is truly expected:
if len(tables) < 4:
    logger.warning(f"   Expected at least 4 tables, found {len(tables)}")
```

### Verification

1. Verify the actual expected number of tables by testing against live site
2. Update code/comment to match

---

## [INFO] Magic Number in API Request

> Hardcoded count=500 without explanation

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:185`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `count = 500` value for pagination is undocumented. It should be extracted to a named constant with explanation.

### Suggested Fix

```python
# Vanguard API max items per request (experimentally determined)
VANGUARD_API_PAGE_SIZE = 500

# In method:
count = VANGUARD_API_PAGE_SIZE
```

---

## [INFO] Unused Import

> `RAW_DOWNLOADS_DIR` is imported but never used

**File**: `src-tauri/python/portfolio_src/adapters/vanguard.py:29`  
**Category**: Maintainability  
**Severity**: Info  

### Description

`RAW_DOWNLOADS_DIR` is imported from `portfolio_src.config` but is never referenced in the code. This is dead code that should be removed.

### Current Code

```python
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR
```

### Suggested Fix

```python
from portfolio_src.config import MANUAL_INPUTS_DIR
```

### Verification

1. Run `grep -n "RAW_DOWNLOADS_DIR" vanguard.py` - should only show import line
2. Remove unused import

---

## Positive Observations

1. **Clear strategy ordering**: The adapter documents and implements a clear priority order (manual > US API > scraping > error)
2. **Good error handling**: All fetch methods properly catch exceptions and log useful error messages
3. **US API integration**: The mapping of European ISINs to US equivalent funds is clever and provides complete holdings data
4. **Caching**: Uses the `@cache_adapter_data` decorator for 24-hour TTL, reducing API calls
5. **Helpful ManualUploadRequired**: When all automated methods fail, provides user with download URL
6. **Weight normalization**: Properly handles string-to-float conversion for weight percentages

---

## Approval Status

**PASSED** - No critical or high severity findings. Medium findings are:
1. ISIN validation needed for defense in depth (consistent with ishares.py review)
2. Duplicate logger assignment is a minor code quality issue

Both are improvements but not blockers for the current implementation.
