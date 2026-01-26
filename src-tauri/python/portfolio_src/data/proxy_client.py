"""
Cloudflare Proxy Client

Routes API calls through a Cloudflare Worker that:
- Injects API keys (Finnhub, etc.)
- Handles rate limiting
- Provides secure access without exposing keys in the client

This replaces direct API calls in resolution.py and enrichment.py.
"""

import logging
import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

import requests

from portfolio_src.data.schemas import validate_response_safe
from portfolio_src.data.schemas.external_api import (
    FinnhubProfileResponse,
    FinnhubQuoteResponse,
    FinnhubSearchResponse,
)

logger = logging.getLogger(__name__)


# === Input Validation ===
# Prevents injection attacks (path traversal, SQL injection) and resource abuse

# Stock symbols: alphanumeric + common separators (., -, :), max 20 chars
# Examples: AAPL, BRK.B, SHOP.TO, NYSE:GME
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9.\-:]{0,19}$", re.IGNORECASE)

# Search queries: alphanumeric + spaces and common punctuation, max 100 chars
# Reject dangerous patterns: path traversal, null bytes, control chars
QUERY_MAX_LENGTH = 100
DANGEROUS_PATTERNS = re.compile(r"[<>\"';`\\]|\.\./|%00|%0[ad]", re.IGNORECASE)


def is_valid_symbol(symbol: str | None) -> bool:
    """
    Validate stock symbol format.

    Accepts uppercase/lowercase alphanumeric with ., -, : separators.
    Max 20 characters, must start with alphanumeric.

    Args:
        symbol: Stock symbol to validate (e.g., "AAPL", "BRK.B")

    Returns:
        True if valid format, False otherwise
    """
    if not symbol or not isinstance(symbol, str):
        return False
    return bool(SYMBOL_PATTERN.match(symbol))


def is_valid_query(query: str | None) -> bool:
    """
    Validate search query for safety and length.

    Rejects:
    - Empty/None inputs
    - Queries over 100 characters
    - Dangerous patterns (path traversal, null bytes, injection chars)

    Args:
        query: Search query to validate

    Returns:
        True if safe query, False otherwise
    """
    if not query or not isinstance(query, str):
        return False
    if len(query) > QUERY_MAX_LENGTH:
        return False
    if DANGEROUS_PATTERNS.search(query):
        return False
    return True


class ProxyEndpoint(Enum):
    """Available proxy endpoints."""

    FINNHUB_PROFILE = "/api/finnhub/profile"
    FINNHUB_QUOTE = "/api/finnhub/quote"
    FINNHUB_SEARCH = "/api/finnhub/search"
    FEEDBACK = "/feedback"


@dataclass
class ProxyResponse:
    """Response from proxy API."""

    success: bool
    data: dict[str, Any] | None
    error: str | None = None
    status_code: int = 200


class ProxyClient:
    """
    Client for the Portfolio Prism Cloudflare Worker proxy.

    The proxy handles:
    - API key injection for Finnhub
    - Rate limiting (100 req/min per IP)
    - CORS for Tauri clients
    """

    DEFAULT_PROXY_URL = "https://portfolio-prism-proxy.bold-unit-582c.workers.dev"

    def __init__(self, proxy_url: str | None = None, timeout: int = 30):
        """
        Initialize the proxy client.

        Args:
            proxy_url: Base URL of the Cloudflare Worker. Defaults to env var or production URL.
            timeout: Request timeout in seconds
        """
        self.proxy_url = proxy_url or os.getenv(
            "WORKER_URL", os.getenv("PROXY_URL", self.DEFAULT_PROXY_URL)
        )
        self.timeout = timeout
        self._session = requests.Session()

        # Set default headers
        self._session.headers.update(
            {"Content-Type": "application/json", "User-Agent": "PortfolioPrism/1.0"}
        )

    def _request(
        self,
        endpoint: ProxyEndpoint,
        method: str = "POST",
        payload: dict | None = None,
    ) -> ProxyResponse:
        """
        Make a request to the proxy.

        Args:
            endpoint: Proxy endpoint to call
            method: HTTP method
            payload: Request payload

        Returns:
            ProxyResponse with data or error
        """
        url = f"{self.proxy_url}{endpoint.value}"

        try:
            if method == "POST":
                response = self._session.post(url, json=payload or {}, timeout=self.timeout)
            else:
                response = self._session.get(url, params=payload or {}, timeout=self.timeout)

            response.raise_for_status()

            return ProxyResponse(
                success=True, data=response.json(), status_code=response.status_code
            )

        except requests.exceptions.HTTPError as e:
            error_msg = str(e)
            if e.response is not None:
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get("error", error_msg)
                except ValueError:
                    error_msg = e.response.text or error_msg

            return ProxyResponse(
                success=False,
                data=None,
                error=error_msg,
                status_code=e.response.status_code if e.response else 500,
            )

        except requests.exceptions.Timeout:
            return ProxyResponse(
                success=False, data=None, error="Request timed out", status_code=408
            )

        except requests.exceptions.RequestException as e:
            return ProxyResponse(
                success=False,
                data=None,
                error=f"Connection error: {str(e)}",
                status_code=0,
            )

    # === Finnhub API Methods ===

    def get_company_profile(self, symbol: str) -> ProxyResponse:
        """
        Get company profile from Finnhub.

        Args:
            symbol: Stock symbol (e.g., "AAPL")

        Returns:
            ProxyResponse with company profile data
        """
        if not is_valid_symbol(symbol):
            logger.warning(f"Invalid symbol format rejected: {symbol!r}")
            return ProxyResponse(
                success=False,
                data=None,
                error="Invalid symbol format",
                status_code=400,
            )
        response = self._request(ProxyEndpoint.FINNHUB_PROFILE, payload={"symbol": symbol})
        if response.success and response.data:
            validated = validate_response_safe(FinnhubProfileResponse, response.data)
            if validated:
                response.data = validated.model_dump(exclude_none=True)
            else:
                response.success = False
                response.error = "Invalid response schema from Finnhub"
        return response

    def get_quote(self, symbol: str) -> ProxyResponse:
        """
        Get current quote from Finnhub.

        Args:
            symbol: Stock symbol

        Returns:
            ProxyResponse with quote data (c=current, h=high, l=low, o=open, pc=previous close)
        """
        if not is_valid_symbol(symbol):
            logger.warning(f"Invalid symbol format rejected: {symbol!r}")
            return ProxyResponse(
                success=False,
                data=None,
                error="Invalid symbol format",
                status_code=400,
            )
        response = self._request(ProxyEndpoint.FINNHUB_QUOTE, payload={"symbol": symbol})
        if response.success and response.data:
            validated = validate_response_safe(FinnhubQuoteResponse, response.data)
            if validated:
                response.data = validated.model_dump(exclude_none=True)
            else:
                response.success = False
                response.error = "Invalid response schema from Finnhub"
        return response

    def search_symbol(self, query: str) -> ProxyResponse:
        """
        Search for symbols matching a query.

        Args:
            query: Search query (company name or partial symbol)

        Returns:
            ProxyResponse with list of matching symbols
        """
        if not is_valid_query(query):
            logger.warning(f"Invalid search query rejected: {query!r}")
            return ProxyResponse(
                success=False,
                data=None,
                error="Invalid search query",
                status_code=400,
            )
        response = self._request(ProxyEndpoint.FINNHUB_SEARCH, payload={"q": query})
        if response.success and response.data:
            validated = validate_response_safe(FinnhubSearchResponse, response.data)
            if validated:
                response.data = validated.model_dump(exclude_none=True)
            else:
                response.success = False
                response.error = "Invalid response schema from Finnhub"
        return response

    # === Feedback API ===

    def submit_feedback(
        self, feedback_type: str, message: str, metadata: dict | None = None
    ) -> ProxyResponse:
        """
        Submit user feedback (creates GitHub issue).

        Args:
            feedback_type: Type of feedback (bug, feature, question)
            message: Feedback message
            metadata: Optional metadata (app version, etc.)

        Returns:
            ProxyResponse with issue URL if successful
        """
        return self._request(
            ProxyEndpoint.FEEDBACK,
            payload={
                "type": feedback_type,
                "message": message,
                "metadata": metadata or {},
            },
        )


# Singleton instance for convenience
_client: ProxyClient | None = None


def get_proxy_client() -> ProxyClient:
    """Get or create the singleton proxy client."""
    global _client
    if _client is None:
        _client = ProxyClient()
    return _client
