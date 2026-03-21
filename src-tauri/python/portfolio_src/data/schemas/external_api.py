"""Pydantic models for external API responses.

These models validate data from Wikidata, YFinance, and Finnhub APIs.
All external API responses MUST be validated through these schemas
before accessing nested fields to catch API changes early.
"""

from pydantic import BaseModel, ConfigDict, Field


class WikidataBinding(BaseModel):
    """Single binding value from Wikidata SPARQL result."""

    value: str
    type: str = "literal"


class WikidataBindingRow(BaseModel):
    """Row of bindings from Wikidata SPARQL query.

    Fields are optional since different queries return different columns.
    """

    itemLabel: WikidataBinding | None = None
    item: WikidataBinding | None = None


class WikidataResults(BaseModel):
    """Results section of Wikidata SPARQL response."""

    bindings: list[WikidataBindingRow] = Field(default_factory=list)


class WikidataResponse(BaseModel):
    """Full Wikidata SPARQL query response.

    Example response structure:
        {
            "results": {
                "bindings": [
                    {"itemLabel": {"value": "Apple Inc.", "type": "literal"}}
                ]
            }
        }
    """

    results: WikidataResults


class WikidataSearchResult(BaseModel):
    """Single result from Wikidata entity search API."""

    id: str
    label: str | None = None
    description: str | None = None


class WikidataSearchResponse(BaseModel):
    """Response from Wikidata wbsearchentities API."""

    search: list[WikidataSearchResult] = Field(default_factory=list)


class WikidataClaimValue(BaseModel):
    """Value within a Wikidata claim's mainsnak."""

    value: str


class WikidataMainsnak(BaseModel):
    """Mainsnak structure within a Wikidata claim."""

    datavalue: WikidataClaimValue | None = None


class WikidataClaim(BaseModel):
    """Single claim from Wikidata entity."""

    mainsnak: WikidataMainsnak


class WikidataEntityClaims(BaseModel):
    """Claims section of a Wikidata entity.

    P946 = ISIN identifier
    P249 = Ticker symbol
    """

    model_config = ConfigDict(extra="allow")

    P946: list[WikidataClaim] = Field(default_factory=list)
    P249: list[WikidataClaim] = Field(default_factory=list)


class WikidataEntity(BaseModel):
    """Single Wikidata entity with claims."""

    claims: WikidataEntityClaims = Field(default_factory=WikidataEntityClaims)


class WikidataEntitiesResponse(BaseModel):
    """Response from Wikidata wbgetentities API."""

    entities: dict[str, WikidataEntity] = Field(default_factory=dict)


class YFinanceQuote(BaseModel):
    """Quote data arrays from YFinance chart API."""

    open: list[float] | None = None
    close: list[float] | None = None
    high: list[float] | None = None
    low: list[float] | None = None
    volume: list[int] | None = None


class YFinanceIndicators(BaseModel):
    """Indicators section containing quote arrays."""

    quote: list[YFinanceQuote] = Field(default_factory=list)


class YFinanceMeta(BaseModel):
    """Metadata for a YFinance chart result."""

    symbol: str | None = None
    currency: str | None = None
    regularMarketPrice: float | None = None
    exchangeName: str | None = None
    instrumentType: str | None = None


class YFinanceResult(BaseModel):
    """Single result from YFinance chart API."""

    meta: YFinanceMeta | None = None
    timestamp: list[int] | None = None
    indicators: YFinanceIndicators | None = None


class YFinanceError(BaseModel):
    """Error structure from YFinance API."""

    code: str | None = None
    description: str | None = None


class YFinanceChart(BaseModel):
    """Chart section of YFinance response."""

    result: list[YFinanceResult] | None = None
    error: YFinanceError | None = None


class YFinanceResponse(BaseModel):
    """Full YFinance chart API response.

    Example response structure:
        {
            "chart": {
                "result": [{
                    "meta": {"symbol": "AAPL", "regularMarketPrice": 150.0},
                    "indicators": {"quote": [{"close": [150.0]}]}
                }],
                "error": null
            }
        }
    """

    chart: YFinanceChart


class FinnhubQuoteResponse(BaseModel):
    """Finnhub quote endpoint response.

    Field meanings:
        c = Current price
        d = Change
        dp = Percent change
        h = High price of the day
        l = Low price of the day
        o = Open price of the day
        pc = Previous close price
        t = Timestamp
    """

    model_config = ConfigDict(populate_by_name=True)

    c: float = Field(description="Current price")
    d: float | None = Field(default=None, description="Change")
    dp: float | None = Field(default=None, description="Percent change")
    h: float | None = Field(default=None, description="High price of the day")
    low: float | None = Field(default=None, alias="l", description="Low price of the day")
    o: float | None = Field(default=None, description="Open price of the day")
    pc: float | None = Field(default=None, description="Previous close price")
    t: int | None = Field(default=None, description="Timestamp")


class FinnhubProfileResponse(BaseModel):
    """Finnhub company profile endpoint response.

    This is the response from /stock/profile2 endpoint.
    """

    country: str | None = None
    currency: str | None = None
    exchange: str | None = None
    finnhubIndustry: str | None = None
    ipo: str | None = None
    logo: str | None = None
    marketCapitalization: float | None = None
    name: str | None = None
    phone: str | None = None
    shareOutstanding: float | None = None
    ticker: str | None = None
    weburl: str | None = None
    isin: str | None = Field(default=None, description="ISIN identifier if available")


class FinnhubSearchMatch(BaseModel):
    """Single match from Finnhub symbol search."""

    description: str
    displaySymbol: str
    symbol: str
    type: str


class FinnhubSearchResponse(BaseModel):
    """Finnhub symbol search endpoint response."""

    count: int = 0
    result: list[FinnhubSearchMatch] = Field(default_factory=list)


class ProxyErrorResponse(BaseModel):
    """Error response from Cloudflare proxy."""

    error: str
    message: str | None = None
