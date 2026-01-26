# Spec: Implement Pydantic Validation for External API Responses

> **Goal**: Add runtime validation for all external HTTP API responses in the Python sidecar using Pydantic models.
> **Estimated Time**: 25 minutes.
> **Priority**: HIGH

## 1. Overview

The Python sidecar makes HTTP requests to external APIs (Wikidata, YFinance, Cloudflare Worker proxy) and directly accesses the JSON response without validation. This violates the mandate that ALL external data must be validated.

### Rule Reference
`rules/security.md` Section 1 (Input Validation):
> "Edge Validation: EVERY external input MUST be validated with Zod/Pydantic."

## 2. Current Violations

### 2.1 Wikidata API
**File:** `src-tauri/python/portfolio_src/data/enrichment.py`  
**Line:** ~106

```python
# CURRENT (BAD)
response = requests.get(wikidata_url, params=params)
data = response.json()  # Unvalidated!
label = data.get("results", {}).get("bindings", [])
```

### 2.2 YFinance / Market Data API
**File:** `src-tauri/python/portfolio_src/data/enrichment.py`  
**Line:** ~123

```python
# CURRENT (BAD)
response = requests.get(yfinance_url)
data = response.json()  # Unvalidated!
price = data.get("chart", {}).get("result", [{}])[0].get("indicators", {})
```

### 2.3 Cloudflare Worker Proxy
**File:** `src-tauri/python/portfolio_src/data/enrichment.py`  
**Line:** ~319

```python
# CURRENT (BAD)
response = requests.get(worker_url, headers=headers)
data = response.json()  # Unvalidated!
```

### 2.4 Other External API Calls
**File:** `src-tauri/python/portfolio_src/data/proxy_client.py`

Similar patterns of unvalidated `response.json()` usage.

## 3. Implementation Steps

### 3.1 Create Pydantic Models for External APIs

**Create file:** `src-tauri/python/portfolio_src/data/schemas/external_api.py`

```python
"""Pydantic models for external API responses."""
from typing import Optional
from pydantic import BaseModel, Field


# =============================================================================
# Wikidata SPARQL Response
# =============================================================================
class WikidataBinding(BaseModel):
    """Single binding result from Wikidata SPARQL."""
    value: str
    type: str = "literal"


class WikidataBindingRow(BaseModel):
    """Row of bindings from Wikidata query."""
    itemLabel: Optional[WikidataBinding] = None
    item: Optional[WikidataBinding] = None
    # Add other fields as needed


class WikidataResults(BaseModel):
    """Results section of Wikidata response."""
    bindings: list[WikidataBindingRow] = Field(default_factory=list)


class WikidataResponse(BaseModel):
    """Full Wikidata SPARQL query response."""
    results: WikidataResults


# =============================================================================
# YFinance / Market Data Response
# =============================================================================
class YFinanceQuote(BaseModel):
    """Quote data from YFinance-style API."""
    open: Optional[list[float]] = None
    close: Optional[list[float]] = None
    high: Optional[list[float]] = None
    low: Optional[list[float]] = None
    volume: Optional[list[int]] = None


class YFinanceIndicators(BaseModel):
    """Indicators section of YFinance response."""
    quote: list[YFinanceQuote] = Field(default_factory=list)


class YFinanceMeta(BaseModel):
    """Metadata for YFinance chart result."""
    symbol: Optional[str] = None
    currency: Optional[str] = None
    regularMarketPrice: Optional[float] = None


class YFinanceResult(BaseModel):
    """Single result from YFinance chart API."""
    meta: Optional[YFinanceMeta] = None
    timestamp: Optional[list[int]] = None
    indicators: Optional[YFinanceIndicators] = None


class YFinanceChart(BaseModel):
    """Chart section of YFinance response."""
    result: Optional[list[YFinanceResult]] = None
    error: Optional[dict] = None


class YFinanceResponse(BaseModel):
    """Full YFinance chart API response."""
    chart: YFinanceChart


# =============================================================================
# Finnhub / Cloudflare Proxy Response
# =============================================================================
class FinnhubQuoteResponse(BaseModel):
    """Finnhub quote response via Cloudflare proxy."""
    c: float = Field(description="Current price")
    d: Optional[float] = Field(None, description="Change")
    dp: Optional[float] = Field(None, description="Percent change")
    h: Optional[float] = Field(None, description="High price of the day")
    l: Optional[float] = Field(None, description="Low price of the day")
    o: Optional[float] = Field(None, description="Open price of the day")
    pc: Optional[float] = Field(None, description="Previous close price")
    t: Optional[int] = Field(None, description="Timestamp")


class ProxyErrorResponse(BaseModel):
    """Error response from Cloudflare proxy."""
    error: str
    message: Optional[str] = None
```

### 3.2 Create Validation Helper

**Add to file:** `src-tauri/python/portfolio_src/data/schemas/__init__.py`

```python
"""Schema validation utilities."""
from typing import TypeVar
from pydantic import BaseModel, ValidationError
import logging

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def validate_response(model: type[T], data: dict) -> T:
    """
    Validate external API response against Pydantic model.
    
    Args:
        model: Pydantic model class
        data: Raw JSON data from API
        
    Returns:
        Validated model instance
        
    Raises:
        ValidationError: If data doesn't match schema
    """
    try:
        return model.model_validate(data)
    except ValidationError as e:
        logger.error(
            "External API response validation failed",
            extra={
                "model": model.__name__,
                "errors": e.error_count(),
                "details": str(e),
            }
        )
        raise


def validate_response_safe(model: type[T], data: dict) -> T | None:
    """
    Validate external API response, returning None on failure.
    
    Use this for non-critical enrichment data where failure is acceptable.
    """
    try:
        return model.model_validate(data)
    except ValidationError as e:
        logger.warning(
            "External API response validation failed (non-critical)",
            extra={
                "model": model.__name__,
                "errors": e.error_count(),
            }
        )
        return None
```

### 3.3 Update Enrichment Module

**File to modify:** `src-tauri/python/portfolio_src/data/enrichment.py`

```python
from portfolio_src.data.schemas.external_api import (
    WikidataResponse,
    YFinanceResponse,
    FinnhubQuoteResponse,
)
from portfolio_src.data.schemas import validate_response, validate_response_safe


# BEFORE (BAD)
def get_wikidata_label(isin: str) -> str | None:
    response = requests.get(wikidata_url, params=params)
    data = response.json()
    bindings = data.get("results", {}).get("bindings", [])
    # ...

# AFTER (GOOD)
def get_wikidata_label(isin: str) -> str | None:
    response = requests.get(wikidata_url, params=params)
    validated = validate_response_safe(WikidataResponse, response.json())
    if validated is None:
        return None
    bindings = validated.results.bindings
    # ...


# BEFORE (BAD)
def get_yfinance_price(ticker: str) -> float | None:
    response = requests.get(yfinance_url)
    data = response.json()
    result = data.get("chart", {}).get("result", [{}])[0]
    # ...

# AFTER (GOOD)
def get_yfinance_price(ticker: str) -> float | None:
    response = requests.get(yfinance_url)
    validated = validate_response_safe(YFinanceResponse, response.json())
    if validated is None or not validated.chart.result:
        return None
    result = validated.chart.result[0]
    if result.meta:
        return result.meta.regularMarketPrice
    return None
```

### 3.4 Update Proxy Client

**File to modify:** `src-tauri/python/portfolio_src/data/proxy_client.py`

Apply the same pattern for Cloudflare Worker responses.

## 4. Files to Modify

| File | Action |
|------|--------|
| `src-tauri/python/portfolio_src/data/schemas/__init__.py` | CREATE - Validation helpers |
| `src-tauri/python/portfolio_src/data/schemas/external_api.py` | CREATE - Pydantic models |
| `src-tauri/python/portfolio_src/data/enrichment.py` | MODIFY - Use validation |
| `src-tauri/python/portfolio_src/data/proxy_client.py` | MODIFY - Use validation |
| `src-tauri/python/portfolio_src/data/market.py` | MODIFY - Use validation (if applicable) |

## 5. Testing Verification

### 5.1 Unit Tests for Schemas

```python
# src-tauri/python/portfolio_src/data/schemas/test_external_api.py
import pytest
from pydantic import ValidationError
from .external_api import WikidataResponse, YFinanceResponse


def test_wikidata_response_valid():
    data = {
        "results": {
            "bindings": [
                {"itemLabel": {"value": "Apple Inc.", "type": "literal"}}
            ]
        }
    }
    result = WikidataResponse.model_validate(data)
    assert result.results.bindings[0].itemLabel.value == "Apple Inc."


def test_wikidata_response_empty():
    data = {"results": {"bindings": []}}
    result = WikidataResponse.model_validate(data)
    assert len(result.results.bindings) == 0


def test_yfinance_response_missing_chart():
    data = {}  # Missing required "chart" key
    with pytest.raises(ValidationError):
        YFinanceResponse.model_validate(data)
```

### 5.2 Integration Test

```bash
# Run enrichment and verify no ValidationErrors in logs
cd src-tauri/python
uv run python -c "from portfolio_src.data.enrichment import get_wikidata_label; print(get_wikidata_label('US0378331005'))"
```

## 6. Acceptance Criteria

- [ ] Pydantic models exist for Wikidata, YFinance, and Finnhub responses
- [ ] All `response.json()` calls in `enrichment.py` are wrapped with validation
- [ ] All `response.json()` calls in `proxy_client.py` are wrapped with validation
- [ ] Validation failures are logged with structured context
- [ ] Application gracefully handles validation failures (returns None for optional data)
- [ ] Unit tests cover valid and invalid response shapes

## 7. Dependencies

- Pydantic is already installed (part of existing dependencies)
- No new dependencies required
