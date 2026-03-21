import logging
import os
import time

import requests
import yfinance as yf
from dotenv import load_dotenv

from portfolio_src.config import (
    OUTPUTS_DIR,
    WORKER_URL,
)
from portfolio_src.data.caching import get_cache_key, load_from_cache, save_to_cache
from portfolio_src.data.schemas import validate_response_safe
from portfolio_src.data.schemas.external_api import (
    FinnhubProfileResponse,
    WikidataEntitiesResponse,
    WikidataSearchResponse,
)
from portfolio_src.prism_utils.validation import is_valid_isin

# Load environment variables from .env file
load_dotenv()

from typing import Any

# --- Constants ---
# SECURITY: Direct Finnhub API access removed - all calls must go through proxy
# See AGENTS.md: "API keys MUST be proxied via Cloudflare Worker — never in client"

# Rate limiting for API calls (configurable via environment variable)
# Default: 100ms between calls. Finnhub free tier allows 60 calls/min (~1000ms minimum)
ENRICHMENT_RATE_LIMIT_MS = int(os.getenv("ENRICHMENT_RATE_LIMIT_MS", "100"))

# Create logger
logger = logging.getLogger(__name__)

# DEBUG LOGGER - Writes to file directly to bypass stdout/stderr redirection issues
DEBUG_LOG_FILE = OUTPUTS_DIR / "enrichment_debug.log"


def debug_log(msg):
    try:
        with open(DEBUG_LOG_FILE, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {msg}\n")
    except Exception:
        pass


# --- Helper Functions ---


def fetch_from_yfinance(identifier: str) -> dict[str, str] | None:
    """
    Attempts to fetch metadata from YFinance using the identifier (ISIN or Ticker).
    Returns a dictionary with 'sector', 'geography', and 'name' or None if failed.
    """
    try:
        debug_log(f"Calling yfinance for {identifier}")
        ticker = yf.Ticker(identifier)
        info = ticker.info
        debug_log(f"yfinance returned info for {identifier}")
        # Check if we actually got valid data (YFinance sometimes returns empty info dicts)
        if info and ("sector" in info or "country" in info):
            return {
                "name": info.get("longName") or info.get("shortName") or "N/A",
                "sector": info.get("sector", "Unknown"),
                "geography": info.get("country", "Unknown"),
            }
    except (
        BaseException
    ) as e:  # Catch EVERYTHING (SystemExit, KeyboardInterrupt, etc.) just in case
        debug_log(f"yfinance crashed/failed for {identifier}: {e}")
        logger.warning(
            "yfinance failed", extra={"identifier": identifier, "error": str(e)}, exc_info=True
        )
    return None


def fetch_isin_from_wikidata(
    company_name: str,
    raw_ticker: str | None = None,
    yahoo_ticker: str | None = None,
) -> str | None:
    """
    Sophisticated ISIN lookup using Wikidata with multi-signal validation.

    Uses company name, raw ticker (from provider), and Yahoo ticker to find and validate
    the correct entity, then extracts the ISIN.

    Args:
        company_name: The company name to search for
        raw_ticker: Raw ticker from ETF provider (e.g., "AAPL" from iShares)
        yahoo_ticker: Yahoo Finance compatible ticker (e.g., "AAPL" or "ALV.DE")

    Returns:
        ISIN string or None if not found
    """
    headers = {"User-Agent": "PortfolioAnalyzer/1.0 (Educational Python Project)"}

    def search_wikidata(query):
        """Search for entities matching the query."""
        url = "https://www.wikidata.org/w/api.php"
        params = {
            "action": "wbsearchentities",
            "search": query,
            "language": "en",
            "format": "json",
            "limit": 5,
        }
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            if resp.status_code == 200:
                validated = validate_response_safe(WikidataSearchResponse, resp.json())
                if validated:
                    return [
                        {"id": r.id, "label": r.label, "description": r.description}
                        for r in validated.search
                    ]
                return []
        except Exception as e:
            logger.debug(
                "Wikidata search failed", extra={"query": query, "error": str(e)}, exc_info=True
            )
        return []

    def get_entity_details(entity_id):
        """Get full entity details including claims."""
        url = "https://www.wikidata.org/w/api.php"
        params = {
            "action": "wbgetentities",
            "ids": entity_id,
            "props": "claims|labels|aliases",
            "format": "json",
        }
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            if resp.status_code == 200:
                validated = validate_response_safe(WikidataEntitiesResponse, resp.json())
                if validated and entity_id in validated.entities:
                    entity = validated.entities[entity_id]
                    # Return dict for backward compat with extract_isin/extract_tickers
                    return {"claims": entity.claims.model_dump()}
                return {}
        except Exception as e:
            logger.debug(
                "Wikidata details failed",
                extra={"entity_id": entity_id, "error": str(e)},
                exc_info=True,
            )
        return {}

    def extract_isin(entity_data):
        """Extract ISIN from entity claims (P946)."""
        claims = entity_data.get("claims", {})
        isin_claims = claims.get("P946", [])
        if isin_claims:
            return isin_claims[0]["mainsnak"]["datavalue"]["value"]
        return None

    def extract_tickers(entity_data):
        """Extract ticker symbols from entity claims (P249)."""
        claims = entity_data.get("claims", {})
        ticker_claims = claims.get("P249", [])
        tickers = []
        for claim in ticker_claims:
            if "datavalue" in claim["mainsnak"]:
                tickers.append(claim["mainsnak"]["datavalue"]["value"])
        return tickers

    try:
        logger.debug(
            "Wikidata lookup",
            extra={
                "company_name": company_name,
                "raw_ticker": raw_ticker,
                "yahoo_ticker": yahoo_ticker,
            },
        )

        # Strategy 1: Search by company name
        results = search_wikidata(company_name)

        for result in results:
            entity_id = result["id"]
            details = get_entity_details(entity_id)

            # Extract ISIN and tickers
            isin = extract_isin(details)
            found_tickers = extract_tickers(details)

            # Validation scoring
            match_score = 0

            # Score 1: Has ISIN
            if isin:
                match_score += 1

            # Score 2: Raw ticker matches (strong signal)
            if raw_ticker and raw_ticker in found_tickers:
                logger.debug("Raw ticker match", extra={"raw_ticker": raw_ticker})
                match_score += 2

            # Score 1: Yahoo ticker base matches
            if yahoo_ticker:
                base_yahoo = yahoo_ticker.split(".")[0]
                if base_yahoo in found_tickers:
                    logger.debug("Yahoo ticker base match", extra={"base_yahoo": base_yahoo})
                    match_score += 1

            # Accept if we have ISIN and at least one ticker match, or just ISIN with high confidence
            if match_score >= 2 or (isin and match_score >= 1):
                logger.info(
                    "ISIN found [Wikidata]", extra={"company_name": company_name, "isin": isin}
                )
                return isin

        # If name search failed and we have a raw ticker, try searching by ticker
        if raw_ticker and not results:
            logger.debug("Retrying with raw ticker", extra={"raw_ticker": raw_ticker})
            results = search_wikidata(raw_ticker)
            for result in results:
                entity_id = result["id"]
                details = get_entity_details(entity_id)
                isin = extract_isin(details)
                if isin:
                    logger.info(
                        "ISIN found [Wikidata via ticker]",
                        extra={"company_name": company_name, "isin": isin},
                    )
                    return isin

        logger.warning("No ISIN found in Wikidata", extra={"company_name": company_name})
        return None

    except Exception as e:
        logger.debug(
            "Wikidata lookup failed",
            extra={"company_name": company_name, "error": str(e)},
            exc_info=True,
        )
        return None


def load_asset_universe() -> dict[str, str]:
    """Load ticker -> ISIN mapping from LocalCache."""
    from portfolio_src.data.local_cache import get_local_cache

    cache = get_local_cache()
    if cache is None:
        return {}

    try:
        conn = cache._get_connection()
        cursor = conn.execute("SELECT ticker, isin FROM cache_listings")
        return {row["ticker"]: row["isin"] for row in cursor}
    except Exception as e:
        logger.warning(
            "Failed to load asset universe from cache", extra={"error": str(e)}, exc_info=True
        )
        return {}


_UNIVERSE_MAPPING = None


def enrich_securities_bulk(
    securities_to_fetch: list[dict[str, Any]], force_refresh: bool = False
) -> list[dict[str, Any]]:
    """
    Enriches a list of securities with metadata from Finnhub, using a robust caching layer.

    Args:
        securities_to_fetch (list): A list of security dictionaries to enrich.
        force_refresh (bool): If True, bypasses the cache and fetches fresh data.

    Returns:
        list: A list of enriched security dictionaries.
    """
    enriched_results = []
    session = requests.Session()
    # SECURITY: Finnhub token injected by Cloudflare Worker proxy, not client

    # Load Universe Mapping (Lazy Load)
    global _UNIVERSE_MAPPING
    if _UNIVERSE_MAPPING is None:
        _UNIVERSE_MAPPING = load_asset_universe()

    # Ensure debug log dir exists
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Starting bulk enrichment", extra={"count": len(securities_to_fetch)})

    # Counter for progress feedback
    count = 0

    for security in securities_to_fetch:
        identifier = security.get("ticker") or security.get("isin")
        if not identifier:
            continue

        # Filter out internal placeholders to prevent API noise
        if identifier.startswith("_") or "NON_EQUITY" in identifier or "CASH" in identifier:
            continue

        # NEW: Check if the identifier is ALREADY an ISIN
        # If so, we don't need to "resolve" it, just enrich metadata
        is_isin = is_valid_isin(identifier)

        cache_key = get_cache_key(identifier)

        # 1. Check cache first
        if not force_refresh:
            cached_data = load_from_cache(cache_key)
            if cached_data:
                # Validation: cache hit only if we have valid sector, geography, AND ISIN
                # This ensures we re-enrich securities that previously failed ISIN resolution
                if (
                    cached_data.get("sector") != "Unknown"
                    and cached_data.get("geography") != "Unknown"
                    and cached_data.get("isin") not in (None, "N/A", "")
                ):
                    enriched_results.append(cached_data)
                    # Visual feedback for cache hit
                    count += 1
                    continue

        # 2. If not in cache or force_refresh is True, call the API
        result = {
            "ticker": identifier,
            "isin": identifier if is_isin else "N/A",
            "name": "Not Found",
            "sector": "Unknown",
            "geography": "Unknown",
        }

        # Preserve raw_ticker if provided
        if security.get("raw_ticker"):
            result["raw_ticker"] = security.get("raw_ticker")

        # 0. Check Asset Universe (Local Resolution)
        if identifier in _UNIVERSE_MAPPING:
            result["isin"] = _UNIVERSE_MAPPING[identifier]
            # If we have the ISIN, we might still want sector/geo from API,
            # but at least we have the ID.
            logger.debug(
                "Resolved ISIN locally",
                extra={"identifier": identifier, "isin": _UNIVERSE_MAPPING[identifier]},
            )

        # Primary: Finnhub (via proxy if configured, otherwise direct)
        if WORKER_URL:
            try:
                response = session.get(
                    f"{WORKER_URL}/api/finnhub/profile",
                    params={"symbol": identifier},
                )
                if response.status_code == 200:
                    profile = validate_response_safe(FinnhubProfileResponse, response.json())
                    if profile:
                        result.update(
                            {
                                "ticker": profile.ticker or identifier,
                                "name": profile.name or "N/A",
                                "sector": profile.finnhubIndustry or "Unknown",
                                "geography": profile.country or "Unknown",
                            }
                        )
                        if profile.isin:
                            result["isin"] = profile.isin
                            logger.debug(
                                "ISIN found [Proxy]",
                                extra={"identifier": identifier, "isin": profile.isin},
                            )
                        logger.debug("Enriched via Proxy", extra={"identifier": identifier})
                    else:
                        logger.warning("Empty profile from proxy", extra={"identifier": identifier})
                rate_limit_sec = max(ENRICHMENT_RATE_LIMIT_MS / 1000, 1.0)
                logger.debug("Rate limiting", extra={"sleep_seconds": rate_limit_sec})
                time.sleep(rate_limit_sec)
            except requests.exceptions.RequestException as e:
                logger.warning(
                    "Proxy request error",
                    extra={"identifier": identifier, "error": str(e)},
                    exc_info=True,
                )

        # SECURITY: Direct Finnhub API fallback removed (security bypass risk)
        # All Finnhub calls must go through Cloudflare Worker proxy
        # If WORKER_URL is not configured, enrichment falls through to Wikidata

        # Wikidata ISIN Fallback (if still N/A after proxy)

        # Only run if we don't already have a valid ISIN
        if result["isin"] == "N/A" and result.get("name") != "Not Found" and not is_isin:
            try:
                wikidata_isin = fetch_isin_from_wikidata(
                    company_name=result["name"],
                    raw_ticker=identifier,
                    yahoo_ticker=identifier,  # identifier is the Yahoo-compatible ticker
                )

                if wikidata_isin:
                    result["isin"] = wikidata_isin
                    logger.debug(
                        "Resolved ISIN via Wikidata",
                        extra={"identifier": identifier, "isin": wikidata_isin},
                    )
                else:
                    logger.warning("No ISIN from Wikidata", extra={"identifier": identifier})

            except Exception as e:
                logger.debug(
                    "Wikidata ISIN lookup failed",
                    extra={"identifier": identifier, "error": str(e)},
                    exc_info=True,
                )

        # Fallback: YFinance (if Finnhub failed or returned Unknown for sector/geo)
        if result["sector"] == "Unknown" or result["geography"] == "Unknown":
            yf_data = fetch_from_yfinance(identifier)
            if yf_data:
                result.update(yf_data)
                logger.debug("Enriched via YFinance", extra={"identifier": identifier})

        # Log final ISIN status
        if result["isin"] == "N/A":
            logger.error(
                "FAILED to resolve ISIN after all attempts", extra={"identifier": identifier}
            )

        # 3. Save to cache and append to results
        save_to_cache(cache_key, result)
        enriched_results.append(result)
        count += 1

    logger.info("Bulk enrichment complete.")
    return enriched_results


# --- Main Function ---


def enrich_securities(
    securities: list[dict[str, Any]], force_refresh: bool = False
) -> list[dict[str, Any]]:
    """
    Enriches a list of securities with metadata by calling the bulk enrichment function.
    The caching logic is now handled within the bulk function itself.

    Args:
        securities (list): A list of security dictionaries to enrich.
        force_refresh (bool): If True, bypasses the cache.

    Returns:
        list: A list of enriched security dictionaries.
    """
    logger.info("Enriching metadata", extra={"count": len(securities)})
    enriched_data = enrich_securities_bulk(securities, force_refresh=force_refresh)
    logger.info("Enrichment complete.")
    return enriched_data


class EnrichmentService:
    """
    Service wrapper for enrichment functions.
    Satisfies dependency injection interface required by Enricher.
    """

    def get_metadata_batch(self, isins: list[str]) -> dict[str, dict[str, Any]]:
        """
        Fetch metadata for a batch of ISINs.

        Args:
            isins: List of ISIN strings

        Returns:
            Dictionary mapping ISIN -> Metadata Dict
        """
        if not isins:
            return {}

        # Convert to list of security dicts expected by bulk function
        securities = [{"isin": isin} for isin in isins]

        # Call existing functional implementation
        enriched_list = enrich_securities_bulk(securities)

        # Convert back to dict map
        result = {}
        for item in enriched_list:
            isin = item.get("isin")
            if isin and isin != "N/A":
                result[isin] = item

        return result
