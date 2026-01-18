"""
Unified ISIN Resolution Module.

Resolution priority:
1. Provider-supplied ISIN (if valid)
2. Manual enrichments (user-provided mappings)
3. LocalCache lookup (backed by Hive sync)
4. Hive network lookup (if cache miss)
5. API calls (Tier 1 only): Wikidata -> Finnhub -> yFinance
6. Mark as unresolved
"""

import os
import time
import threading
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Any

import requests

from portfolio_src.prism_utils.isin_validator import is_valid_isin
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.data.manual_enrichments import load_manual_enrichments
from portfolio_src.data.proxy_client import get_proxy_client
from portfolio_src.data.local_cache import get_local_cache, LocalCache
from portfolio_src.data.hive_client import get_hive_client, HiveClient
from portfolio_src.data.normalizer import (
    NameNormalizer,
    TickerParser,
    get_name_normalizer,
    get_ticker_parser,
)

logger = get_logger(__name__)

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
FINNHUB_API_URL = "https://finnhub.io/api/v1"

# Resolution confidence scores per spec
CONFIDENCE_PROVIDER = 1.0  # Provider-supplied ISIN
CONFIDENCE_LOCAL_CACHE = 0.95  # Local SQLite cache
CONFIDENCE_HIVE = 0.90  # The Hive (Supabase)
CONFIDENCE_MANUAL = 0.85  # Manual enrichments
CONFIDENCE_WIKIDATA = 0.80  # Wikidata SPARQL
CONFIDENCE_FINNHUB = 0.75  # Finnhub API
CONFIDENCE_YFINANCE = 0.70  # yFinance (unreliable)

# Negative cache TTL (per spec Section 8.1)
NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS = 24  # All APIs failed
NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS = 1  # API rate limit hit


@dataclass
class ResolutionResult:
    isin: Optional[str]
    status: Literal["resolved", "unresolved", "skipped"]
    detail: str
    source: Optional[str] = None
    confidence: float = 0.0

    def __post_init__(self):
        if self.isin and not is_valid_isin(self.isin):
            logger.warning(f"Invalid ISIN format in resolution result: {self.isin}")
            self.isin = None
            self.status = "unresolved"
            self.detail = "isin_format_invalid"
            self.confidence = 0.0


class ISINResolver:
    def __init__(self, tier1_threshold: float = 1.0):
        self.tier1_threshold = tier1_threshold
        self.newly_resolved: List[Dict[str, Any]] = []
        self.stats = {
            "total": 0,
            "resolved": 0,
            "unresolved": 0,
            "skipped": 0,
            "by_source": {},
        }

        self._local_cache: Optional[LocalCache] = get_local_cache()
        self._hive_client: Optional[HiveClient] = get_hive_client()
        self._name_normalizer: NameNormalizer = get_name_normalizer()
        self._ticker_parser: TickerParser = get_ticker_parser()

        if self._local_cache and self._local_cache.is_stale():
            logger.info("Local cache stale, starting background sync...")
            threading.Thread(
                target=self._background_sync, daemon=True, name="hive_sync_bg"
            ).start()

    def _background_sync(self) -> None:
        try:
            if self._local_cache and self._hive_client:
                self._local_cache.sync_from_hive(self._hive_client)
        except Exception as e:
            logger.warning(f"Background Hive sync failed: {e}")

    def _is_negative_cached(self, alias: str, alias_type: str = "ticker") -> bool:
        """Check if alias has unexpired negative cache entry in SQLite."""
        if not self._local_cache:
            return False
        return self._local_cache.is_negative_cached(alias, alias_type)

    def _add_negative_cache(
        self,
        alias: str,
        alias_type: str = "ticker",
        status: str = "unresolved",
    ) -> None:
        """Add alias to negative cache in SQLite."""
        if not self._local_cache:
            return

        ttl_hours = (
            NEGATIVE_CACHE_TTL_RATE_LIMITED_HOURS
            if status == "rate_limited"
            else NEGATIVE_CACHE_TTL_UNRESOLVED_HOURS
        )

        self._local_cache.set_isin_cache(
            alias=alias,
            alias_type=alias_type,
            isin=None,
            resolution_status=status,
            confidence=0.0,
            source=None,
            ttl_hours=ttl_hours,
        )

    def resolve(
        self,
        ticker: str,
        name: str,
        provider_isin: Optional[str] = None,
        weight: float = 0.0,
        etf_isin: Optional[str] = None,
    ) -> ResolutionResult:
        self.stats["total"] += 1

        ticker_raw = (ticker or "").strip()
        name_raw = (name or "").strip()

        # Parse ticker to get root and generate search variants
        ticker_root, _exchange_hint = self._ticker_parser.parse(ticker_raw)
        ticker_variants = self._ticker_parser.generate_variants(ticker_raw)

        # Normalize name and generate search variants
        name_normalized = self._name_normalizer.normalize(name_raw)
        name_variants = self._name_normalizer.generate_variants(name_raw)

        # Use root ticker and normalized name as primary identifiers
        ticker_clean = ticker_root
        name_clean = name_normalized

        # 1. Provider ISIN
        if provider_isin and is_valid_isin(provider_isin):
            result = ResolutionResult(
                isin=provider_isin,
                status="resolved",
                detail="provider",
                source="provider",
                confidence=CONFIDENCE_PROVIDER,
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 2. Manual enrichments - try all ticker variants
        manual_mappings = load_manual_enrichments()
        for t_variant in ticker_variants:
            if t_variant.upper() in manual_mappings:
                manual_isin = manual_mappings[t_variant.upper()]
                if is_valid_isin(manual_isin):
                    result = ResolutionResult(
                        isin=manual_isin,
                        status="resolved",
                        detail="manual",
                        source="manual",
                        confidence=CONFIDENCE_MANUAL,
                    )
                    self._record_resolution(ticker_clean, name_clean, result)
                    return result

        is_tier2 = weight <= self.tier1_threshold

        # 3. LocalCache + Hive resolution with variants
        # Always try Hive network (no rate limits) - only skip expensive API calls for tier2
        result = self._resolve_via_hive(
            ticker_clean,
            name_clean,
            skip_network=False,
            ticker_variants=ticker_variants,
            name_variants=name_variants,
        )

        if result.status == "resolved":
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 4. Tier check - skip API for minor holdings
        if is_tier2:
            result = ResolutionResult(
                isin=None,
                status="skipped",
                detail="tier2_skipped",
                confidence=0.0,
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 6. API resolution
        result = self._resolve_via_api(
            ticker_clean,
            name_clean,
            ticker_variants=ticker_variants,
            name_variants=name_variants,
            etf_isin=etf_isin,
        )
        self._record_resolution(ticker_clean, name_clean, result)

        # 7. Push to Hive on API success
        if result.status == "resolved" and result.isin:
            self._push_to_hive(ticker_clean, name_clean, result.isin, result.source)

        return result

    def _resolve_via_hive(
        self,
        ticker: str,
        name: str,
        skip_network: bool = False,
        ticker_variants: Optional[List[str]] = None,
        name_variants: Optional[List[str]] = None,
    ) -> ResolutionResult:
        if self._local_cache is None:
            return ResolutionResult(
                isin=None, status="unresolved", detail="no_cache", confidence=0.0
            )

        # Try all ticker variants against local cache
        tickers_to_try = (
            ticker_variants if ticker_variants else ([ticker] if ticker else [])
        )
        for t in tickers_to_try:
            isin = self._local_cache.get_isin_by_ticker(t)
            if isin:
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="local_cache_ticker",
                    source=None,
                    confidence=CONFIDENCE_LOCAL_CACHE,
                )

        # Try all name variants against local cache
        names_to_try = name_variants if name_variants else ([name] if name else [])
        for n in names_to_try:
            isin = self._local_cache.get_isin_by_alias(n)
            if isin:
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="local_cache_alias",
                    source=None,
                    confidence=CONFIDENCE_LOCAL_CACHE,
                )

        if skip_network:
            return ResolutionResult(
                isin=None,
                status="unresolved",
                detail="local_cache_miss",
                confidence=0.0,
            )

        # Try Hive network with all variants
        if self._hive_client and self._hive_client.is_configured:
            for t in tickers_to_try:
                isin = self._hive_client.resolve_ticker(t)
                if isin:
                    self._local_cache.upsert_listing(t, "UNKNOWN", isin, "USD")
                    return ResolutionResult(
                        isin=isin,
                        status="resolved",
                        detail="hive_ticker",
                        source=None,
                        confidence=CONFIDENCE_HIVE,
                    )

            for n in names_to_try:
                alias_result = self._hive_client.lookup_by_alias(n)
                if alias_result:
                    self._local_cache.upsert_alias(n, alias_result.isin)
                    return ResolutionResult(
                        isin=alias_result.isin,
                        status="resolved",
                        detail="hive_alias",
                        source=alias_result.source,
                        confidence=CONFIDENCE_HIVE,
                    )

        return ResolutionResult(
            isin=None, status="unresolved", detail="hive_miss", confidence=0.0
        )

    def _push_to_hive(
        self,
        ticker: str,
        name: str,
        isin: str,
        source: Optional[str],
    ) -> None:
        if not self._hive_client or not self._hive_client.is_configured:
            return
        if not self._local_cache:
            return

        try:
            self._hive_client.contribute_listing(
                isin=isin,
                ticker=ticker,
                exchange="UNKNOWN",
                currency="USD",
            )

            self._local_cache.upsert_listing(ticker, "UNKNOWN", isin, "USD")

            if name and len(name) > 2:
                self._hive_client.contribute_alias(
                    alias=name,
                    isin=isin,
                    alias_type="name",
                )
                self._local_cache.upsert_alias(name, isin)

            logger.debug(f"Pushed to Hive: {ticker} -> {isin} (source: {source})")

        except Exception as e:
            logger.warning(f"Failed to push to Hive: {e}")

    def _resolve_via_api(
        self,
        ticker: str,
        name: str,
        ticker_variants: Optional[List[str]] = None,
        name_variants: Optional[List[str]] = None,
        etf_isin: Optional[str] = None,
    ) -> ResolutionResult:
        """
        Resolve via external APIs in priority order.

        Order (per spec):
        1. Wikidata (free, 0.80) - batch query with all name variants
        2. Finnhub (rate-limited, 0.75) - primary ticker only
        3. yFinance (unreliable, 0.70) - top 2 variants
        """
        names = name_variants or ([name] if name else [])
        tickers = ticker_variants or ([ticker] if ticker else [])
        primary_ticker = tickers[0] if tickers else ticker

        if self._is_negative_cached(primary_ticker):
            return ResolutionResult(
                isin=None,
                status="unresolved",
                detail="negative_cached",
                confidence=0.0,
            )

        rate_limited = False

        # 1. Wikidata - batch query with all name variants (FREE, no limit)
        isin = self._call_wikidata_batch(names)
        if isin:
            self._cache_positive_result(
                primary_ticker, "ticker", isin, "api_wikidata", CONFIDENCE_WIKIDATA
            )
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_wikidata",
                source="api_wikidata",
                confidence=CONFIDENCE_WIKIDATA,
            )

        # 2. Finnhub - PRIMARY TICKER ONLY (rate-limited 60/min)
        if primary_ticker:
            isin, was_rate_limited = self._call_finnhub_with_status(primary_ticker)
            if was_rate_limited:
                rate_limited = True

            # Log format attempt for observability
            if self._local_cache:
                self._local_cache.log_format_attempt(
                    ticker_input=ticker,
                    ticker_tried=primary_ticker,
                    format_type=self._ticker_parser.detect_format(primary_ticker),
                    api_source="api_finnhub",
                    success=bool(isin),
                    etf_isin=etf_isin,
                )

            if isin:
                self._cache_positive_result(
                    primary_ticker, "ticker", isin, "api_finnhub", CONFIDENCE_FINNHUB
                )
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="api_finnhub",
                    source="api_finnhub",
                    confidence=CONFIDENCE_FINNHUB,
                )

        # 3. yFinance - top 2 variants only (unreliable)
        for t in tickers[:2]:
            isin = self._call_yfinance(t)

            if self._local_cache:
                self._local_cache.log_format_attempt(
                    ticker_input=ticker,
                    ticker_tried=t,
                    format_type=self._ticker_parser.detect_format(t),
                    api_source="api_yfinance",
                    success=bool(isin),
                    etf_isin=etf_isin,
                )

            if isin:
                self._cache_positive_result(
                    t, "ticker", isin, "api_yfinance", CONFIDENCE_YFINANCE
                )
                return ResolutionResult(
                    isin=isin,
                    status="resolved",
                    detail="api_yfinance",
                    source="api_yfinance",
                    confidence=CONFIDENCE_YFINANCE,
                )

        status = "rate_limited" if rate_limited else "unresolved"
        self._add_negative_cache(primary_ticker, "ticker", status)

        return ResolutionResult(
            isin=None,
            status="unresolved",
            detail="api_all_failed",
            confidence=0.0,
        )

    def _call_finnhub_with_status(self, ticker: str) -> tuple[Optional[str], bool]:
        """Call Finnhub API and return (isin, was_rate_limited)."""
        if not ticker:
            return None, False

        try:
            proxy_client = get_proxy_client()
            response = proxy_client.get_company_profile(ticker)

            if response.success and response.data:
                isin = response.data.get("isin")
                if isin and is_valid_isin(isin):
                    logger.debug(f"Finnhub proxy resolved {ticker} -> {isin}")
                    return isin, False
            elif not response.success:
                if "rate" in str(response.error).lower():
                    logger.debug(f"Finnhub rate limit for {ticker}")
                    return None, True
                logger.debug(f"Finnhub proxy error for {ticker}: {response.error}")

            time.sleep(0.5)

        except Exception as e:
            logger.debug(f"Finnhub API error for {ticker}: {e}")

        if FINNHUB_API_KEY:
            try:
                response = requests.get(
                    f"{FINNHUB_API_URL}/stock/profile2",
                    params={"symbol": ticker},
                    headers={"X-Finnhub-Token": FINNHUB_API_KEY},
                    timeout=10,
                )

                if response.status_code == 200:
                    data = response.json()
                    isin = data.get("isin")
                    if isin and is_valid_isin(isin):
                        logger.debug(f"Finnhub direct resolved {ticker} -> {isin}")
                        return isin, False
                elif response.status_code == 429:
                    logger.debug(f"Finnhub direct rate limit for {ticker}")
                    return None, True

                time.sleep(1.1)

            except Exception as e:
                logger.debug(f"Finnhub direct API error for {ticker}: {e}")

        return None, False

    def _cache_positive_result(
        self,
        alias: str,
        alias_type: str,
        isin: str,
        source: str,
        confidence: float,
    ) -> None:
        """Cache a successful resolution (never expires)."""
        if not self._local_cache:
            return
        self._local_cache.set_isin_cache(
            alias=alias,
            alias_type=alias_type,
            isin=isin,
            resolution_status="resolved",
            confidence=confidence,
            source=source,
            ttl_hours=None,
        )

    def _escape_sparql_string(self, s: str) -> str:
        """Escape special characters for SPARQL string literals."""
        return s.replace("\\", "\\\\").replace('"', '\\"')

    def _call_wikidata_batch(self, name_variants: List[str]) -> Optional[str]:
        if not name_variants:
            return None

        variants = [self._escape_sparql_string(v.upper()) for v in name_variants[:5]]
        values_clause = " ".join(f'"{v}"' for v in variants)

        sparql_query = f"""
        SELECT ?item ?isin WHERE {{
          VALUES ?searchName {{ {values_clause} }}
          ?item rdfs:label ?label .
          FILTER(UCASE(?label) = ?searchName)
          ?item wdt:P946 ?isin .
        }}
        LIMIT 1
        """

        headers = {
            "User-Agent": "PortfolioAnalyzer/1.0 (Educational Python Project)",
            "Accept": "application/sparql-results+json",
        }

        try:
            response = requests.get(
                "https://query.wikidata.org/sparql",
                params={"query": sparql_query, "format": "json"},
                headers=headers,
                timeout=15,
            )

            if response.status_code == 200:
                results = response.json().get("results", {}).get("bindings", [])
                if results:
                    isin = results[0].get("isin", {}).get("value")
                    if isin and is_valid_isin(isin):
                        logger.debug(f"Wikidata SPARQL resolved -> {isin}")
                        return isin

        except Exception as e:
            logger.debug(f"Wikidata SPARQL error: {e}")

        # Fallback to entity search if SPARQL fails
        if name_variants:
            return self._call_wikidata_entity_search(name_variants[0])

        return None

    def _call_wikidata_entity_search(self, name: str) -> Optional[str]:
        """Fallback: Search Wikidata entities by name."""
        if not name:
            return None

        headers = {"User-Agent": "PortfolioAnalyzer/1.0 (Educational Python Project)"}

        try:
            search_url = "https://www.wikidata.org/w/api.php"
            params = {
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "format": "json",
                "limit": 3,
            }

            response = requests.get(
                search_url, params=params, headers=headers, timeout=10
            )
            if response.status_code != 200:
                return None

            results = response.json().get("search", [])

            for result in results:
                entity_id = result["id"]

                detail_params = {
                    "action": "wbgetentities",
                    "ids": entity_id,
                    "props": "claims",
                    "format": "json",
                }

                detail_response = requests.get(
                    search_url, params=detail_params, headers=headers, timeout=10
                )

                if detail_response.status_code != 200:
                    continue

                entity = detail_response.json().get("entities", {}).get(entity_id, {})
                claims = entity.get("claims", {})

                isin_claims = claims.get("P946", [])
                if isin_claims:
                    isin = isin_claims[0]["mainsnak"]["datavalue"]["value"]
                    if is_valid_isin(isin):
                        return isin

        except Exception as e:
            logger.debug(f"Wikidata entity search error for {name}: {e}")

        return None

    def _call_yfinance(self, ticker: str) -> Optional[str]:
        if not ticker:
            return None

        try:
            import yfinance as yf

            stock = yf.Ticker(ticker)
            info = stock.info
            isin = info.get("isin")
            if isin and is_valid_isin(isin):
                return isin
        except Exception as e:
            logger.debug(f"YFinance error for {ticker}: {e}")

        return None

    def _record_resolution(
        self, ticker: str, name: str, result: ResolutionResult
    ) -> None:
        self.stats[result.status] += 1

        source = result.detail
        self.stats["by_source"][source] = self.stats["by_source"].get(source, 0) + 1

        if result.status == "resolved" and result.source:
            self.newly_resolved.append(
                {
                    "isin": result.isin,
                    "ticker": ticker,
                    "name": name,
                    "source": result.source,
                }
            )

    def get_stats_summary(self) -> str:
        total = self.stats["total"]
        if total == 0:
            return "No resolutions performed."

        resolved = self.stats["resolved"]
        unresolved = self.stats["unresolved"]
        skipped = self.stats["skipped"]

        lines = [
            "=== Resolution Summary ===",
            f"Total processed: {total}",
            f"Resolved:        {resolved} ({100 * resolved / total:.1f}%)",
            f"Unresolved:      {unresolved} ({100 * unresolved / total:.1f}%)",
            f"Skipped (Tier2): {skipped} ({100 * skipped / total:.1f}%)",
            "",
            "By source:",
        ]

        for source, count in sorted(
            self.stats["by_source"].items(), key=lambda x: -x[1]
        ):
            lines.append(f"  - {source}: {count}")

        return "\n".join(lines)


def resolve_isin(
    ticker: str,
    name: str,
    provider_isin: Optional[str] = None,
    weight: float = 0.0,
) -> ResolutionResult:
    resolver = ISINResolver()
    return resolver.resolve(ticker, name, provider_isin, weight)
