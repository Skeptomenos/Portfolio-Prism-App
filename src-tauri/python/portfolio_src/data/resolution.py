"""
Unified ISIN Resolution Module.

Resolution priority:
1. Provider-supplied ISIN (if valid)
2. Manual enrichments (user-provided mappings)
3. LocalCache lookup (backed by Hive sync)
4. Hive network lookup (if cache miss)
5. Enrichment cache lookup (validated)
6. API calls (Tier 1 only): Finnhub -> Wikidata -> YFinance
7. Mark as unresolved
"""

import json
import os
import time
import threading
from dataclasses import dataclass
from pathlib import Path
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

CACHE_PATH = Path("data/working/cache/enrichment_cache.json")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
FINNHUB_API_URL = "https://finnhub.io/api/v1"


@dataclass
class ResolutionResult:
    isin: Optional[str]
    status: Literal["resolved", "unresolved", "skipped"]
    detail: str
    source: Optional[str] = None

    def __post_init__(self):
        if self.isin and not is_valid_isin(self.isin):
            logger.warning(f"Invalid ISIN format in resolution result: {self.isin}")
            self.isin = None
            self.status = "unresolved"
            self.detail = "isin_format_invalid"


class ISINResolver:
    def __init__(self, tier1_threshold: float = 1.0):
        self.tier1_threshold = tier1_threshold
        self.cache = self._load_cache()
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

    def _load_cache(self) -> Dict[str, Dict]:
        if not CACHE_PATH.exists():
            return {}

        try:
            with open(CACHE_PATH, "r") as f:
                raw_cache = json.load(f)

            valid_cache = {}
            for key, value in raw_cache.items():
                if (
                    "|" in key
                    or key.startswith("FALLBACK")
                    or key.startswith("UNRESOLVED")
                ):
                    continue

                isin = value.get("isin")
                if isin and is_valid_isin(isin):
                    valid_cache[key] = value

            logger.info(
                f"Loaded cache: {len(valid_cache)} valid entries "
                f"(filtered {len(raw_cache) - len(valid_cache)} invalid)"
            )
            return valid_cache

        except Exception as e:
            logger.error(f"Failed to load cache: {e}")
            return {}

    def resolve(
        self,
        ticker: str,
        name: str,
        provider_isin: Optional[str] = None,
        weight: float = 0.0,
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
                    )
                    self._record_resolution(ticker_clean, name_clean, result)
                    return result

        is_tier2 = weight <= self.tier1_threshold

        # 3. LocalCache + Hive resolution with variants
        result = self._resolve_via_hive(
            ticker_clean,
            name_clean,
            skip_network=is_tier2,
            ticker_variants=ticker_variants,
            name_variants=name_variants,
        )

        if result.status == "resolved":
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 4. Enrichment cache lookup
        cache_entry = self.cache.get(ticker_clean.upper())
        if cache_entry:
            cache_isin = cache_entry.get("isin")
            if cache_isin and is_valid_isin(cache_isin):
                result = ResolutionResult(
                    isin=cache_isin, status="resolved", detail="cache", source=None
                )
                self._record_resolution(ticker_clean, name_clean, result)
                return result

        # 5. Tier check - skip API for minor holdings
        if is_tier2:
            result = ResolutionResult(
                isin=None, status="skipped", detail="tier2_skipped"
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 6. API resolution
        result = self._resolve_via_api(ticker_clean, name_clean)
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
            return ResolutionResult(isin=None, status="unresolved", detail="no_cache")

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
                )

        if skip_network:
            return ResolutionResult(
                isin=None, status="unresolved", detail="local_cache_miss"
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
                    )

        return ResolutionResult(isin=None, status="unresolved", detail="hive_miss")

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

    def _resolve_via_api(self, ticker: str, name: str) -> ResolutionResult:
        isin = self._call_finnhub(ticker)
        if isin:
            return ResolutionResult(
                isin=isin, status="resolved", detail="api_finnhub", source="api_finnhub"
            )

        isin = self._call_wikidata(name, ticker)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_wikidata",
                source="api_wikidata",
            )

        isin = self._call_yfinance(ticker)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_yfinance",
                source="api_yfinance",
            )

        return ResolutionResult(isin=None, status="unresolved", detail="api_all_failed")

    def _call_finnhub(self, ticker: str) -> Optional[str]:
        if not ticker:
            return None

        try:
            proxy_client = get_proxy_client()
            response = proxy_client.get_company_profile(ticker)

            if response.success and response.data:
                isin = response.data.get("isin")
                if isin and is_valid_isin(isin):
                    logger.debug(f"Finnhub proxy resolved {ticker} -> {isin}")
                    return isin
            elif not response.success:
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
                        return isin

                time.sleep(1.1)

            except Exception as e:
                logger.debug(f"Finnhub direct API error for {ticker}: {e}")

        return None

    def _call_wikidata(self, name: str, ticker: str) -> Optional[str]:
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
            logger.debug(f"Wikidata API error for {name}: {e}")

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
