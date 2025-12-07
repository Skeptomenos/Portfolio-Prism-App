import os
import requests
import time
import logging
import yfinance as yf
from dotenv import load_dotenv


from data.caching import load_from_cache, save_to_cache, get_cache_key
from prism_utils.validation import is_valid_isin
from config import ASSET_UNIVERSE_PATH, PROXY_URL, PROXY_API_KEY
import pandas as pd

# Load environment variables from .env file
load_dotenv()

from typing import List, Dict, Optional, Any

# --- Constants ---
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
FINNHUB_API_URL = "https://finnhub.io/api/v1"

# Create logger
logger = logging.getLogger(__name__)

# --- Helper Functions ---


def fetch_from_yfinance(identifier: str) -> Optional[Dict[str, str]]:
    """
    Attempts to fetch metadata from YFinance using the identifier (ISIN or Ticker).
    Returns a dictionary with 'sector', 'geography', and 'name' or None if failed.
    """
    try:
        ticker = yf.Ticker(identifier)
        info = ticker.info
        # Check if we actually got valid data (YFinance sometimes returns empty info dicts)
        if info and ("sector" in info or "country" in info):
            return {
                "name": info.get("longName") or info.get("shortName") or "N/A",
                "sector": info.get("sector", "Unknown"),
                "geography": info.get("country", "Unknown"),
            }
    except Exception:
        pass
    return None


def fetch_isin_from_wikidata(
    company_name: str, raw_ticker: str = None, yahoo_ticker: str = None
) -> Optional[str]:
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
                return resp.json().get("search", [])
        except Exception as e:
            logger.debug(f"Wikidata search failed for {query}: {e}")
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
                return resp.json().get("entities", {}).get(entity_id, {})
        except Exception as e:
            logger.debug(f"Wikidata details failed for {entity_id}: {e}")
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
            f"Wikidata lookup: {company_name} | Raw: {raw_ticker} | Yahoo: {yahoo_ticker}"
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
                logger.debug(f"  ✓ Raw ticker match: {raw_ticker}")
                match_score += 2

            # Score 1: Yahoo ticker base matches
            if yahoo_ticker:
                base_yahoo = yahoo_ticker.split(".")[0]
                if base_yahoo in found_tickers:
                    logger.debug(f"  ✓ Yahoo ticker base match: {base_yahoo}")
                    match_score += 1

            # Accept if we have ISIN and at least one ticker match, or just ISIN with high confidence
            if match_score >= 2 or (isin and match_score >= 1):
                logger.info(f"✓ ISIN for {company_name}: {isin} [Wikidata]")
                return isin

        # If name search failed and we have a raw ticker, try searching by ticker
        if raw_ticker and not results:
            logger.debug(f"Retrying with raw ticker: {raw_ticker}")
            results = search_wikidata(raw_ticker)
            for result in results:
                entity_id = result["id"]
                details = get_entity_details(entity_id)
                isin = extract_isin(details)
                if isin:
                    logger.info(
                        f"✓ ISIN for {company_name}: {isin} [Wikidata via ticker]"
                    )
                    return isin

        logger.warning(f"✗ No ISIN found for {company_name} in Wikidata")
        return None

    except Exception as e:
        logger.debug(f"Wikidata lookup failed for {company_name}: {e}")
        return None


def load_asset_universe() -> Dict[str, str]:
    """
    Loads the asset universe and returns a mapping of Ticker -> ISIN.
    """
    if not os.path.exists(ASSET_UNIVERSE_PATH):
        return {}
    try:
        df = pd.read_csv(ASSET_UNIVERSE_PATH)
        # Create mapping from Yahoo Ticker to ISIN
        # Ensure we drop NaNs
        mapping = (
            df.dropna(subset=["Yahoo_Ticker", "ISIN"])
            .set_index("Yahoo_Ticker")["ISIN"]
            .to_dict()
        )
        return mapping
    except Exception as e:
        print(f"Warning: Failed to load asset universe: {e}")
        return {}


_UNIVERSE_MAPPING = None


def enrich_securities_bulk(
    securities_to_fetch: List[Dict[str, Any]], force_refresh: bool = False
) -> List[Dict[str, Any]]:
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
    session.headers.update({"X-Finnhub-Token": FINNHUB_API_KEY})

    # Load Universe Mapping (Lazy Load)
    global _UNIVERSE_MAPPING
    if _UNIVERSE_MAPPING is None:
        _UNIVERSE_MAPPING = load_asset_universe()

    # Counter for progress feedback
    count = 0
    print("  - Progress: ", end="", flush=True)

    for security in securities_to_fetch:
        identifier = security.get("ticker") or security.get("isin")
        if not identifier:
            continue

        # Filter out internal placeholders to prevent API noise
        if (
            identifier.startswith("_")
            or "NON_EQUITY" in identifier
            or "CASH" in identifier
        ):
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
                    print(".", end="", flush=True)
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
            print("L", end="", flush=True)  # L for Local

        # Primary: Finnhub (via proxy if configured, otherwise direct)
        if PROXY_URL and PROXY_API_KEY:
            # Distributed mode: route through proxy
            try:
                response = session.get(
                    f"{PROXY_URL}/api/finnhub/profile",
                    params={"symbol": identifier},
                    headers={"X-API-Key": PROXY_API_KEY},
                )
                if response.status_code == 200:
                    profile_data = response.json()
                    if profile_data:
                        finnhub_isin = profile_data.get("isin")
                        result.update(
                            {
                                "ticker": profile_data.get("ticker", identifier),
                                "name": profile_data.get("name", "N/A"),
                                "sector": profile_data.get(
                                    "finnhubIndustry", "Unknown"
                                ),
                                "geography": profile_data.get("country", "Unknown"),
                            }
                        )
                        if finnhub_isin:
                            result["isin"] = finnhub_isin
                            logger.debug(
                                f"ISIN for {identifier}: {finnhub_isin} [Proxy]"
                            )
                        print("P", end="", flush=True)  # P for Proxy
                    else:
                        logger.warning(f"Empty profile from proxy for {identifier}")
                time.sleep(1.1)  # Rate limiting
            except requests.exceptions.RequestException as e:
                logger.warning(f"Proxy request error for {identifier}: {e}")
                print("x", end="", flush=True)
        elif FINNHUB_API_KEY:
            # Local dev mode: direct Finnhub call
            try:
                response = session.get(
                    f"{FINNHUB_API_URL}/stock/profile2", params={"symbol": identifier}
                )
                if response.status_code == 200:
                    profile_data = response.json()
                    if profile_data:
                        # Update result but preserve ISIN if Finnhub misses it
                        finnhub_isin = profile_data.get("isin")

                        result.update(
                            {
                                "ticker": profile_data.get("ticker", identifier),
                                "name": profile_data.get("name", "N/A"),
                                "sector": profile_data.get(
                                    "finnhubIndustry", "Unknown"
                                ),
                                "geography": profile_data.get("country", "Unknown"),
                            }
                        )

                        # Only overwrite ISIN if Finnhub provides a valid one
                        if finnhub_isin:
                            result["isin"] = finnhub_isin
                            logger.debug(
                                f"ISIN for {identifier}: {finnhub_isin} [Finnhub]"
                            )
                        # Visual feedback for API hit
                        print("F", end="", flush=True)  # F for Finnhub
                    else:
                        logger.warning(f"Empty profile from Finnhub for {identifier}")

                # Rate Limiting: Finnhub Free Tier is 60 calls/min (~1 call/sec)
                time.sleep(1.1)

            except requests.exceptions.RequestException as e:
                logger.warning(f"Finnhub request error for {identifier}: {e}")
                print("x", end="", flush=True)

        # NEW: Wikidata ISIN Fallback (if still N/A after Finnhub)
        # Only run if we don't already have a valid ISIN
        if (
            result["isin"] == "N/A"
            and result.get("name") != "Not Found"
            and not is_isin
        ):
            try:
                wikidata_isin = fetch_isin_from_wikidata(
                    company_name=result["name"],
                    ticker=identifier,
                    yahoo_ticker=identifier,  # identifier is the Yahoo-compatible ticker
                )

                if wikidata_isin:
                    result["isin"] = wikidata_isin
                    print("W", end="", flush=True)  # W for Wikidata ISIN resolution
                else:
                    logger.warning(f"✗ No ISIN for {identifier} from Wikidata")

            except Exception as e:
                logger.debug(f"Wikidata ISIN lookup failed for {identifier}: {e}")

        # Fallback: YFinance (if Finnhub failed or returned Unknown for sector/geo)
        if result["sector"] == "Unknown" or result["geography"] == "Unknown":
            yf_data = fetch_from_yfinance(identifier)
            if yf_data:
                result.update(yf_data)
                print("y", end="", flush=True)  # y for YFinance metadata

        # Log final ISIN status
        if result["isin"] == "N/A":
            logger.error(
                f"⚠ FAILED to resolve ISIN for {identifier} after all attempts"
            )

        # 3. Save to cache and append to results
        save_to_cache(cache_key, result)
        enriched_results.append(result)
        count += 1

    print(" Done.")
    return enriched_results


# --- Main Function ---


def enrich_securities(
    securities: List[Dict[str, Any]], force_refresh: bool = False
) -> List[Dict[str, Any]]:
    """
    Enriches a list of securities with metadata by calling the bulk enrichment function.
    The caching logic is now handled within the bulk function itself.

    Args:
        securities (list): A list of security dictionaries to enrich.
        force_refresh (bool): If True, bypasses the cache.

    Returns:
        list: A list of enriched security dictionaries.
    """
    print(f"  - Enriching metadata for {len(securities)} securities...")
    enriched_data = enrich_securities_bulk(securities, force_refresh=force_refresh)
    print("  - Enrichment complete.")
    return enriched_data
