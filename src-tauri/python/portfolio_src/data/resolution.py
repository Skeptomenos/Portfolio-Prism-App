"""
Unified ISIN Resolution Module.

This module provides a single entry point for resolving ticker/name
to ISIN, using a priority-ordered resolution strategy:

1. Provider-supplied ISIN (if valid)
2. Local asset_universe.csv lookup (by ticker)
3. Local asset_universe.csv lookup (by alias)
4. Enrichment cache lookup (validated)
5. API calls (Tier 1 only): Finnhub -> Wikidata -> YFinance
6. Mark as unresolved

Key principles:
- ISIN is always valid or None (never composite keys)
- Local resolution is attempted before any API calls
- Successfully resolved ISINs are auto-added to asset_universe
- Explicit status tracking for every resolution attempt
"""

import json
import os
import time
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Literal, Optional, Any

import pandas as pd
import requests

from portfolio_src.config import ASSET_UNIVERSE_PATH
from portfolio_src.prism_utils.isin_validator import is_valid_isin, is_placeholder_isin
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.data.manual_enrichments import load_manual_enrichments
from portfolio_src.data.proxy_client import get_proxy_client

logger = get_logger(__name__)

# Constants
CACHE_PATH = Path("data/working/cache/enrichment_cache.json")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
FINNHUB_API_URL = "https://finnhub.io/api/v1"

# Thread lock for universe writes
_universe_lock = threading.Lock()


@dataclass
class ResolutionResult:
    """Result of an ISIN resolution attempt."""

    isin: Optional[str]
    status: Literal["resolved", "unresolved", "skipped"]
    detail: str
    source: Optional[str] = None  # For tracking in asset_universe

    def __post_init__(self):
        # Validate ISIN if provided
        if self.isin and not is_valid_isin(self.isin):
            logger.warning(f"Invalid ISIN format in resolution result: {self.isin}")
            self.isin = None
            self.status = "unresolved"
            self.detail = "isin_format_invalid"


@dataclass
class AssetUniverse:
    """Manages the asset_universe.csv lookup table."""

    df: pd.DataFrame = field(default_factory=pd.DataFrame)
    ticker_index: Dict[str, str] = field(default_factory=dict)  # ticker -> ISIN
    alias_index: Dict[str, str] = field(default_factory=dict)  # alias -> ISIN

    @classmethod
    def load(cls) -> "AssetUniverse":
        """Load asset universe from CSV."""
        if not os.path.exists(ASSET_UNIVERSE_PATH):
            logger.warning(f"Asset universe not found: {ASSET_UNIVERSE_PATH}")
            return cls()

        try:
            df = pd.read_csv(ASSET_UNIVERSE_PATH)

            # Check for duplicate ISINs and warn
            duplicates = df[df["ISIN"].duplicated(keep=False)]
            if not duplicates.empty:
                dup_isins = duplicates["ISIN"].unique().tolist()
                logger.warning(
                    f"Duplicate ISINs found in asset_universe.csv: {dup_isins}. "
                    "Keeping first occurrence only."
                )
                df = df.drop_duplicates(subset=["ISIN"], keep="first")

            # Build ticker index (Yahoo_Ticker -> ISIN)
            ticker_index = {}
            for _, row in df.iterrows():
                isin = row.get("ISIN")
                yahoo_ticker = row.get("Yahoo_Ticker")
                tr_ticker = row.get("TR_Ticker")

                if isin and is_valid_isin(str(isin)):
                    if yahoo_ticker and pd.notna(yahoo_ticker):
                        ticker_index[str(yahoo_ticker).upper()] = str(isin)
                    if tr_ticker and pd.notna(tr_ticker):
                        ticker_index[str(tr_ticker).upper()] = str(isin)

            # Build alias index
            alias_index = {}
            for _, row in df.iterrows():
                isin = row.get("ISIN")
                aliases = row.get("Aliases", "")

                if isin and is_valid_isin(str(isin)) and aliases and pd.notna(aliases):
                    for alias in str(aliases).split("|"):
                        alias_clean = alias.strip().upper()
                        if alias_clean:
                            alias_index[alias_clean] = str(isin)

            logger.info(
                f"Loaded asset universe: {len(df)} entries, "
                f"{len(ticker_index)} ticker mappings, "
                f"{len(alias_index)} alias mappings"
            )

            return cls(df=df, ticker_index=ticker_index, alias_index=alias_index)

        except Exception as e:
            logger.error(f"Failed to load asset universe: {e}")
            return cls()

    def lookup_by_ticker(self, ticker: str) -> Optional[str]:
        """Look up ISIN by ticker symbol."""
        if not ticker:
            return None
        return self.ticker_index.get(ticker.upper().strip())

    def lookup_by_alias(self, alias: str) -> Optional[str]:
        """Look up ISIN by alias."""
        if not alias:
            return None
        return self.alias_index.get(alias.upper().strip())

    def add_entry(
        self,
        isin: str,
        ticker: str,
        name: str,
        source: str,
    ) -> bool:
        """
        Add a new entry to the asset universe.

        Thread-safe with deduplication.
        """
        if not is_valid_isin(isin):
            return False

        with _universe_lock:
            # Check for duplicates
            if isin in self.df["ISIN"].values:
                return False

            # Add new row
            new_row = {
                "ISIN": isin,
                "TR_Ticker": "",
                "Yahoo_Ticker": ticker,
                "Name": name,
                "Aliases": "",
                "Provider": "",
                "Asset_Class": "Stock",
                "Source": source,
                "Added_Date": datetime.now().strftime("%Y-%m-%d"),
                "Last_Verified": "",
            }

            self.df = pd.concat([self.df, pd.DataFrame([new_row])], ignore_index=True)
            self.df.to_csv(ASSET_UNIVERSE_PATH, index=False)

            # Update index
            self.ticker_index[ticker.upper()] = isin

            logger.info(f"Added to asset universe: {isin} ({ticker})")
            return True


class ISINResolver:
    """
    Main ISIN resolution class.

    Implements the resolution priority order and tracks results
    for auto-adding to asset_universe.
    """

    def __init__(self, tier1_threshold: float = 1.0):
        """
        Initialize resolver.

        Args:
            tier1_threshold: Weight threshold for Tier 1 resolution (default 1.0%)
        """
        self.tier1_threshold = tier1_threshold
        self.universe = AssetUniverse.load()
        self.cache = self._load_cache()
        self.newly_resolved: List[Dict[str, Any]] = []
        self.stats = {
            "total": 0,
            "resolved": 0,
            "unresolved": 0,
            "skipped": 0,
            "by_source": {},
        }

    def _load_cache(self) -> Dict[str, Dict]:
        """Load enrichment cache with validation."""
        if not CACHE_PATH.exists():
            return {}

        try:
            with open(CACHE_PATH, "r") as f:
                raw_cache = json.load(f)

            # Filter out invalid entries
            valid_cache = {}
            for key, value in raw_cache.items():
                # Reject composite keys
                if (
                    "|" in key
                    or key.startswith("FALLBACK")
                    or key.startswith("UNRESOLVED")
                ):
                    continue

                # Only keep entries with valid ISIN
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
        """
        Resolve ticker/name to ISIN using priority order.

        Args:
            ticker: Yahoo-compatible ticker symbol
            name: Security name from provider
            provider_isin: ISIN from provider (if available)
            weight: Weight percentage in ETF (for tier determination)

        Returns:
            ResolutionResult with ISIN (or None) and status
        """
        self.stats["total"] += 1

        # Normalize inputs
        ticker_clean = (ticker or "").strip()
        name_clean = (name or "").strip()

        # 1. Provider ISIN (highest priority)
        if provider_isin and is_valid_isin(provider_isin):
            result = ResolutionResult(
                isin=provider_isin,
                status="resolved",
                detail="provider",
                source="provider",
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 1b. Manual enrichments (user-provided ISINs)
        manual_mappings = load_manual_enrichments()
        if ticker_clean.upper() in manual_mappings:
            manual_isin = manual_mappings[ticker_clean.upper()]
            if is_valid_isin(manual_isin):
                result = ResolutionResult(
                    isin=manual_isin,
                    status="resolved",
                    detail="manual",
                    source="manual",
                )
                self._record_resolution(ticker_clean, name_clean, result)
                return result

        # 2. Universe lookup by ticker
        universe_isin = self.universe.lookup_by_ticker(ticker_clean)
        if universe_isin:
            result = ResolutionResult(
                isin=universe_isin,
                status="resolved",
                detail="universe_ticker",
                source=None,  # Already in universe
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 3. Universe lookup by alias/name
        universe_isin = self.universe.lookup_by_alias(name_clean)
        if universe_isin:
            result = ResolutionResult(
                isin=universe_isin,
                status="resolved",
                detail="universe_alias",
                source=None,
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 4. Cache lookup
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
        if weight <= self.tier1_threshold:
            result = ResolutionResult(
                isin=None, status="skipped", detail="tier2_skipped"
            )
            self._record_resolution(ticker_clean, name_clean, result)
            return result

        # 6. API resolution (Tier 1 only)
        result = self._resolve_via_api(ticker_clean, name_clean)
        self._record_resolution(ticker_clean, name_clean, result)
        return result

    def _resolve_via_api(self, ticker: str, name: str) -> ResolutionResult:
        """
        Attempt ISIN resolution via external APIs.

        Order: Finnhub -> Wikidata -> YFinance
        """
        # Finnhub
        isin = self._call_finnhub(ticker)
        if isin:
            return ResolutionResult(
                isin=isin, status="resolved", detail="api_finnhub", source="api_finnhub"
            )

        # Wikidata
        isin = self._call_wikidata(name, ticker)
        if isin:
            return ResolutionResult(
                isin=isin,
                status="resolved",
                detail="api_wikidata",
                source="api_wikidata",
            )

        # YFinance (last resort - often doesn't have ISIN)
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
        """Call Finnhub API for ISIN (via proxy or direct)."""
        if not ticker:
            return None

        try:
            # Try proxy first (preferred method - uses Cloudflare worker)
            proxy_client = get_proxy_client()
            response = proxy_client.get_company_profile(ticker)

            if response.success and response.data:
                isin = response.data.get("isin")
                if isin and is_valid_isin(isin):
                    logger.debug(f"Finnhub proxy resolved {ticker} -> {isin}")
                    return isin
            elif not response.success:
                logger.debug(f"Finnhub proxy error for {ticker}: {response.error}")

            # Rate limiting
            time.sleep(0.5)

        except Exception as e:
            logger.debug(f"Finnhub API error for {ticker}: {e}")

        # Fallback to direct API call if proxy fails and we have API key
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

                # Rate limiting for direct API
                time.sleep(1.1)

            except Exception as e:
                logger.debug(f"Finnhub direct API error for {ticker}: {e}")

        return None

    def _call_wikidata(self, name: str, ticker: str) -> Optional[str]:
        """Call Wikidata API for ISIN."""
        if not name:
            return None

        headers = {"User-Agent": "PortfolioAnalyzer/1.0 (Educational Python Project)"}

        try:
            # Search for entity
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

                # Get entity details
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

                # P946 is ISIN property
                isin_claims = claims.get("P946", [])
                if isin_claims:
                    isin = isin_claims[0]["mainsnak"]["datavalue"]["value"]
                    if is_valid_isin(isin):
                        return isin

        except Exception as e:
            logger.debug(f"Wikidata API error for {name}: {e}")

        return None

    def _call_yfinance(self, ticker: str) -> Optional[str]:
        """Call YFinance for ISIN (often not available)."""
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
        """Record resolution result for stats and auto-add."""
        # Update stats
        self.stats[result.status] += 1

        source = result.detail
        self.stats["by_source"][source] = self.stats["by_source"].get(source, 0) + 1

        # Track for auto-add to universe
        if result.status == "resolved" and result.source:
            self.newly_resolved.append(
                {
                    "isin": result.isin,
                    "ticker": ticker,
                    "name": name,
                    "source": result.source,
                }
            )

    def flush_to_universe(self) -> int:
        """
        Batch write newly resolved ISINs to asset_universe.csv.

        Returns:
            Number of entries added
        """
        if not self.newly_resolved:
            return 0

        added = 0
        for entry in self.newly_resolved:
            if self.universe.add_entry(
                isin=entry["isin"],
                ticker=entry["ticker"],
                name=entry["name"],
                source=entry["source"],
            ):
                added += 1

        if added > 0:
            logger.info(f"Added {added} new entries to asset_universe.csv")

        # Clear the list
        self.newly_resolved = []

        return added

    def get_stats_summary(self) -> str:
        """Get a formatted summary of resolution statistics."""
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


# Convenience function for simple use cases
def resolve_isin(
    ticker: str,
    name: str,
    provider_isin: Optional[str] = None,
    weight: float = 0.0,
) -> ResolutionResult:
    """
    Convenience function for single ISIN resolution.

    For batch resolution, use ISINResolver class directly.
    """
    resolver = ISINResolver()
    return resolver.resolve(ticker, name, provider_isin, weight)
