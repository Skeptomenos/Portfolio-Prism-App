from typing import Any

import pytest
from pydantic import ValidationError

from portfolio_src.data.schemas import validate_response, validate_response_safe
from portfolio_src.data.schemas.external_api import (
    FinnhubProfileResponse,
    FinnhubQuoteResponse,
    FinnhubSearchResponse,
    ProxyErrorResponse,
    WikidataEntitiesResponse,
    WikidataResponse,
    WikidataSearchResponse,
    YFinanceResponse,
)


class TestWikidataResponse:
    def test_valid_with_bindings(self) -> None:
        data: dict[str, Any] = {
            "results": {"bindings": [{"itemLabel": {"value": "Apple Inc.", "type": "literal"}}]}
        }
        result = WikidataResponse.model_validate(data)
        assert len(result.results.bindings) == 1
        assert result.results.bindings[0].itemLabel is not None
        assert result.results.bindings[0].itemLabel.value == "Apple Inc."

    def test_valid_empty_bindings(self) -> None:
        data: dict[str, Any] = {"results": {"bindings": []}}
        result = WikidataResponse.model_validate(data)
        assert len(result.results.bindings) == 0

    def test_missing_results_fails(self) -> None:
        data: dict[str, Any] = {}
        with pytest.raises(ValidationError):
            WikidataResponse.model_validate(data)


class TestWikidataSearchResponse:
    def test_valid_search_results(self) -> None:
        data: dict[str, Any] = {
            "search": [{"id": "Q312", "label": "Apple Inc.", "description": "Tech company"}]
        }
        result = WikidataSearchResponse.model_validate(data)
        assert len(result.search) == 1
        assert result.search[0].id == "Q312"
        assert result.search[0].label == "Apple Inc."

    def test_empty_search(self) -> None:
        data: dict[str, Any] = {"search": []}
        result = WikidataSearchResponse.model_validate(data)
        assert len(result.search) == 0


class TestWikidataEntitiesResponse:
    def test_entity_with_isin_claim(self) -> None:
        data: dict[str, Any] = {
            "entities": {
                "Q312": {
                    "claims": {
                        "P946": [{"mainsnak": {"datavalue": {"value": "US0378331005"}}}],
                        "P249": [{"mainsnak": {"datavalue": {"value": "AAPL"}}}],
                    }
                }
            }
        }
        result = WikidataEntitiesResponse.model_validate(data)
        entity = result.entities.get("Q312")
        assert entity is not None
        assert len(entity.claims.P946) == 1
        assert entity.claims.P946[0].mainsnak.datavalue is not None
        assert entity.claims.P946[0].mainsnak.datavalue.value == "US0378331005"

    def test_entity_without_claims(self) -> None:
        data: dict[str, Any] = {"entities": {"Q312": {"claims": {}}}}
        result = WikidataEntitiesResponse.model_validate(data)
        entity = result.entities.get("Q312")
        assert entity is not None
        assert len(entity.claims.P946) == 0


class TestYFinanceResponse:
    def test_valid_chart_response(self) -> None:
        data: dict[str, Any] = {
            "chart": {
                "result": [
                    {
                        "meta": {
                            "symbol": "AAPL",
                            "currency": "USD",
                            "regularMarketPrice": 150.25,
                        },
                        "timestamp": [1704067200, 1704153600],
                        "indicators": {
                            "quote": [{"close": [150.0, 150.25], "volume": [1000, 2000]}]
                        },
                    }
                ],
                "error": None,
            }
        }
        result = YFinanceResponse.model_validate(data)
        assert result.chart.result is not None
        assert len(result.chart.result) == 1
        assert result.chart.result[0].meta is not None
        assert result.chart.result[0].meta.symbol == "AAPL"
        assert result.chart.result[0].meta.regularMarketPrice == 150.25

    def test_missing_chart_fails(self) -> None:
        data: dict[str, Any] = {}
        with pytest.raises(ValidationError):
            YFinanceResponse.model_validate(data)

    def test_chart_with_error(self) -> None:
        data: dict[str, Any] = {
            "chart": {
                "result": None,
                "error": {"code": "Not Found", "description": "No data found"},
            }
        }
        result = YFinanceResponse.model_validate(data)
        assert result.chart.result is None
        assert result.chart.error is not None
        assert result.chart.error.code == "Not Found"


class TestFinnhubQuoteResponse:
    def test_valid_quote(self) -> None:
        data: dict[str, Any] = {
            "c": 150.25,
            "d": 2.50,
            "dp": 1.69,
            "h": 152.00,
            "l": 148.00,
            "o": 149.00,
            "pc": 147.75,
            "t": 1704067200,
        }
        result = FinnhubQuoteResponse.model_validate(data)
        assert result.c == 150.25
        assert result.d == 2.50
        assert result.dp == 1.69

    def test_minimal_quote(self) -> None:
        data: dict[str, Any] = {"c": 100.0}
        result = FinnhubQuoteResponse.model_validate(data)
        assert result.c == 100.0
        assert result.d is None
        assert result.h is None

    def test_missing_current_price_fails(self) -> None:
        data: dict[str, Any] = {"d": 2.50, "dp": 1.69}
        with pytest.raises(ValidationError):
            FinnhubQuoteResponse.model_validate(data)


class TestFinnhubProfileResponse:
    def test_valid_profile(self) -> None:
        data: dict[str, Any] = {
            "country": "US",
            "currency": "USD",
            "exchange": "NASDAQ",
            "finnhubIndustry": "Technology",
            "name": "Apple Inc.",
            "ticker": "AAPL",
            "isin": "US0378331005",
        }
        result = FinnhubProfileResponse.model_validate(data)
        assert result.country == "US"
        assert result.finnhubIndustry == "Technology"
        assert result.isin == "US0378331005"

    def test_empty_profile(self) -> None:
        data: dict[str, Any] = {}
        result = FinnhubProfileResponse.model_validate(data)
        assert result.name is None
        assert result.isin is None


class TestFinnhubSearchResponse:
    def test_valid_search(self) -> None:
        data: dict[str, Any] = {
            "count": 2,
            "result": [
                {
                    "description": "APPLE INC",
                    "displaySymbol": "AAPL",
                    "symbol": "AAPL",
                    "type": "Common Stock",
                },
                {
                    "description": "APPLE HOSPITALITY REIT INC",
                    "displaySymbol": "APLE",
                    "symbol": "APLE",
                    "type": "REIT",
                },
            ],
        }
        result = FinnhubSearchResponse.model_validate(data)
        assert result.count == 2
        assert len(result.result) == 2
        assert result.result[0].symbol == "AAPL"


class TestProxyErrorResponse:
    def test_error_with_message(self) -> None:
        data: dict[str, Any] = {"error": "Rate limited", "message": "Too many requests"}
        result = ProxyErrorResponse.model_validate(data)
        assert result.error == "Rate limited"
        assert result.message == "Too many requests"

    def test_error_without_message(self) -> None:
        data: dict[str, Any] = {"error": "Internal error"}
        result = ProxyErrorResponse.model_validate(data)
        assert result.error == "Internal error"
        assert result.message is None


class TestValidateResponseHelpers:
    def test_validate_response_success(self) -> None:
        data: dict[str, Any] = {"chart": {"result": [], "error": None}}
        result = validate_response(YFinanceResponse, data)
        assert isinstance(result, YFinanceResponse)

    def test_validate_response_failure_raises(self) -> None:
        data: dict[str, Any] = {"invalid": "data"}
        with pytest.raises(ValidationError):
            validate_response(YFinanceResponse, data)

    def test_validate_response_safe_success(self) -> None:
        data: dict[str, Any] = {"chart": {"result": [], "error": None}}
        result = validate_response_safe(YFinanceResponse, data)
        assert isinstance(result, YFinanceResponse)

    def test_validate_response_safe_failure_returns_none(self) -> None:
        data: dict[str, Any] = {"invalid": "data"}
        result = validate_response_safe(YFinanceResponse, data)
        assert result is None
