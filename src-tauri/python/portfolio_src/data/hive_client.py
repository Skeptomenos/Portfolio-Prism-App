"""
Hive Client - Community Asset Universe Sync

Syncs with Supabase backend for:
- Downloading community-contributed normalized asset data (Assets + Listings)
- Contributing new discoveries via safe RPC functions
- Local caching with TTL (Asset-level)
"""

import os
import json
import pandas as pd
import math
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from dotenv import load_dotenv
from portfolio_src.prism_utils.logging_config import get_logger

load_dotenv()

logger = get_logger(__name__)

# Placeholder definitions for type checking when supabase is not installed
# This is a common pattern to avoid errors when dependencies are optional.
SUPABASE_AVAILABLE = False


def create_client(*args, **kwargs):
    """Placeholder create_client function."""
    return None


try:
    from supabase import create_client as real_create_client

    # Override with real implementations at runtime
    create_client = real_create_client  # type: ignore
    SUPABASE_AVAILABLE = True
except ImportError:
    # Keep placeholder implementations when supabase is not available
    pass


@dataclass
class AssetEntry:
    """Normalized asset record, joined from assets and listings."""

    isin: str
    name: str
    asset_class: str
    base_currency: str  # Accounting currency (from assets table)
    ticker: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None  # Trading currency (from listings table)
    enrichment_status: str = "stub"

    # Metadata for caching
    contributor_count: int = 1
    last_updated: Optional[str] = None
    confidence_score: float = 0.0

    # Resolution tracking
    resolution_source: str = "hive"  # hive, detected, manual, unknown
    needs_manual_resolution: bool = False

    def calculate_confidence(self) -> float:
        """
        Calculate a trust score (0.0 - 1.0) for this asset.

        Weights:
        - Contributor Count: 0.4 (Logarithmic scaling)
        - Freshness: 0.3 (Linear decay over 180 days)
        - Status: 0.3 (Verified > Active > Stub)
        """
        # 1. Contributor Score (0.4)
        # Log scale: 1 contributor = 0.1, 10+ contributors = 0.4
        contrib_score = min(
            0.4, 0.1 + (math.log10(max(1, self.contributor_count)) * 0.3)
        )

        # 2. Freshness Score (0.3)
        freshness_score = 0.0
        if self.last_updated:
            try:
                updated_at = datetime.fromisoformat(
                    self.last_updated.replace("Z", "+00:00")
                )
                days_old = (datetime.now(updated_at.tzinfo) - updated_at).days
                # Linear decay from 0.3 (today) to 0.0 (180 days old)
                freshness_score = max(0.0, 0.3 * (1 - (days_old / 180)))
            except Exception:
                pass

        # 3. Status Score (0.3)
        status_map = {"verified": 0.3, "active": 0.2, "stub": 0.1}
        status_score = status_map.get(self.enrichment_status.lower(), 0.0)

        self.confidence_score = round(contrib_score + freshness_score + status_score, 2)
        return self.confidence_score


@dataclass
class HiveResult:
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


@dataclass
class AliasLookupResult:
    isin: str
    name: str
    asset_class: str
    alias_type: str
    contributor_count: int
    source: str
    confidence: float
    currency: Optional[str] = None
    exchange: Optional[str] = None


class HiveClient:
    """
    Client for the Portfolio Prism community asset universe (Hive).

    Uses Supabase as the backend with a normalized schema.
    Delegates write/validation logic to PostgreSQL RPC functions.
    """

    CACHE_TTL_HOURS = 24

    def __init__(self, data_dir: Optional[Path] = None):
        """
        Initialize the Hive client.

        Args:
            data_dir: Directory for caching universe data
        """
        self.data_dir = (
            data_dir or Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
        )
        self.cache_dir = self.data_dir / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Keys are read from environment variables (.env via load_dotenv)
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_key = os.getenv("SUPABASE_ANON_KEY", "")

        self._client: Optional[Any] = None
        self._universe_cache: Dict[str, AssetEntry] = {}
        self._cache_loaded_at: Optional[datetime] = None

    @property
    def cache_file(self) -> Path:
        """Path to the cached universe file."""
        return self.cache_dir / "master_universe_normalized.json"

    @property
    def is_configured(self) -> bool:
        """Check if Supabase credentials are configured."""
        return SUPABASE_AVAILABLE and bool(self.supabase_url and self.supabase_key)

    def _get_client(self) -> Optional[Any]:
        """Get or create Supabase client."""
        if not self.is_configured:
            return None

        if self._client is None:
            try:
                self._client = create_client(self.supabase_url, self.supabase_key)
            except Exception as e:
                logger.error(f"Failed to create Supabase client: {e}")
                return None

        return self._client

    def _is_cache_valid(self) -> bool:
        """Check if local cache is still valid."""
        if not self._cache_loaded_at:
            return False

        age = datetime.now() - self._cache_loaded_at
        return age < timedelta(hours=self.CACHE_TTL_HOURS)

    def _load_cache(self) -> bool:
        """Load universe from local cache file."""
        if not self.cache_file.exists():
            return False

        try:
            data = json.loads(self.cache_file.read_text())

            cached_at = data.get("cached_at")
            if cached_at:
                cached_time = datetime.fromisoformat(cached_at)
                if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
                    return False  # Cache expired

            # Load entries, ensuring keys match the new dataclass structure
            self._universe_cache = {
                entry["isin"]: AssetEntry(**entry) for entry in data.get("entries", [])
            }
            self._cache_loaded_at = datetime.now()
            return True

        except Exception as e:
            logger.error(f"Failed to load cache: {e}")
            return False

    def _save_cache(self) -> bool:
        """Save universe to local cache file."""
        try:
            # We only cache the core Asset data, not every listing/mapping
            data = {
                "cached_at": datetime.now().isoformat(),
                "entries": [e.__dict__ for e in self._universe_cache.values()],
            }
            self.cache_file.write_text(json.dumps(data, indent=2))
            return True
        except Exception as e:
            logger.error(f"Failed to save cache: {e}")
            return False

    def sync_universe(self, force: bool = False) -> HiveResult:
        """
        Download the latest master universe from Supabase.

        Args:
            force: If True, ignore cache and force download

        Returns:
            HiveResult with number of entries synced
        """
        # 1. Check in-memory cache
        if not force and self._is_cache_valid():
            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "memory_cache"},
            )

        # 2. Try to load from file cache
        if not force and self._load_cache():
            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "file_cache"},
            )

        # 3. Download from Supabase via RPCs (bypasses RLS)
        client = self._get_client()
        if not client:
            return HiveResult(
                success=False,
                error="Supabase not configured or client failed to initialize",
            )

        try:
            # Fetch assets and listings via RPC (same approach as sync_identity_domain)
            assets_response = client.rpc("get_all_assets_rpc", {}).execute()
            listings_response = client.rpc("get_all_listings_rpc", {}).execute()

            # Build lookup dict for listings by ISIN (first listing wins)
            listings_by_isin: Dict[str, Dict[str, Any]] = {}
            for listing in listings_response.data or []:
                isin = listing.get("isin")
                if isin and isin not in listings_by_isin:
                    listings_by_isin[isin] = listing

            self._universe_cache = {}
            rows = []
            for row in assets_response.data or []:
                isin = row.get("isin", "")
                listing = listings_by_isin.get(isin, {})

                asset = AssetEntry(
                    isin=isin,
                    name=row.get("name", ""),
                    asset_class=row.get("asset_class", "Unknown"),
                    base_currency=row.get("base_currency", "Unknown"),
                    ticker=listing.get("ticker"),
                    exchange=listing.get("exchange"),
                    currency=listing.get("currency"),
                    enrichment_status=row.get("enrichment_status", "stub"),
                    last_updated=row.get("updated_at"),
                    contributor_count=row.get("contributor_count", 1),
                )
                asset.calculate_confidence()
                self._universe_cache[asset.isin] = asset

                rows.append(
                    {
                        "isin": asset.isin,
                        "ticker": asset.ticker,
                        "name": asset.name,
                        "asset_type": asset.asset_class,
                        "confidence": asset.confidence_score,
                        "last_updated": asset.last_updated,
                    }
                )

            self._cache_loaded_at = datetime.now()
            self._save_cache()

            # Sync to local SQLite via Ingestion Layer
            if rows:
                from portfolio_src.data.ingestion import DataIngestion

                DataIngestion.ingest_metadata(pd.DataFrame(rows))

            logger.info(f"Synced {len(self._universe_cache)} assets from Hive via RPC")

            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "supabase"},
            )

        except Exception as e:
            # Fallback to file cache if Supabase download fails
            if self._load_cache():
                return HiveResult(
                    success=True,
                    data={"count": len(self._universe_cache), "source": "stale_cache"},
                )
            return HiveResult(
                success=False, error=f"Supabase download failed: {str(e)}"
            )

    def lookup(self, isin: str) -> Optional[AssetEntry]:
        """
        Look up an ISIN in the universe.
        Returns from cache if available, None otherwise.
        """
        # Ensure cache is populated
        if not self._universe_cache or not self._is_cache_valid():
            self.sync_universe()

        # Check cache
        if isin in self._universe_cache:
            return self._universe_cache[isin]

        return None

    def _resolve_unknown_asset_class(self, asset: AssetEntry) -> AssetEntry:
        """Attempt to resolve an asset with Unknown asset_class using detection."""
        if asset.asset_class != "Unknown":
            return asset

        try:
            from portfolio_src.headless.handlers.sync import detect_asset_class
            from portfolio_src.models import AssetClass

            detected = detect_asset_class(asset.isin, asset.name)

            asset_class_map = {
                AssetClass.STOCK: "Equity",
                AssetClass.ETF: "ETF",
                AssetClass.CRYPTO: "Crypto",
                AssetClass.BOND: "Bond",
                AssetClass.FUND: "Fund",
                AssetClass.CASH: "Cash",
            }

            resolved_class = asset_class_map.get(detected, "Equity")
            asset.asset_class = resolved_class
            asset.resolution_source = "detected"
            asset.needs_manual_resolution = False

            logger.info(
                f"Resolved {asset.isin} asset_class: Unknown -> {resolved_class}"
            )
            return asset

        except Exception as e:
            logger.warning(f"Failed to resolve asset_class for {asset.isin}: {e}")
            asset.resolution_source = "unknown"
            asset.needs_manual_resolution = True
            return asset

    def batch_lookup(self, isins: List[str]) -> Dict[str, AssetEntry]:
        """
        Batch lookup multiple ISINs from the universe.
        Returns a dictionary mapping ISINs to AssetEntry objects.
        """
        # Check cache first
        uncached_isins = [isin for isin in isins if isin not in self._universe_cache]

        if not uncached_isins:
            return {isin: self._universe_cache[isin] for isin in isins}

        # Initialize result with cached entries
        result = {
            isin: self._universe_cache[isin]
            for isin in isins
            if isin in self._universe_cache
        }

        # Batch fetch from Supabase for uncached ISINs
        try:
            client = self._get_client()
            if client is None:
                logger.warning("Supabase client unavailable, using local detection")
                for isin in uncached_isins:
                    asset = AssetEntry(
                        isin=isin,
                        name="Unknown",
                        asset_class="Unknown",
                        base_currency="EUR",
                        resolution_source="unknown",
                        needs_manual_resolution=True,
                    )
                    asset = self._resolve_unknown_asset_class(asset)
                    result[isin] = asset
                return result

            response = (
                client.from_("assets").select("*").in_("isin", uncached_isins).execute()
            )

            found_isins = set()
            for row in response.data:
                asset = AssetEntry(
                    isin=row.get("isin", ""),
                    name=row.get("name", ""),
                    asset_class=row.get("asset_class", "Unknown"),
                    base_currency=row.get("base_currency", "Unknown"),
                    ticker=row.get("ticker"),
                    exchange=row.get("exchange"),
                    currency=row.get("currency"),
                    enrichment_status=row.get("enrichment_status", "stub"),
                    last_updated=row.get("updated_at"),
                    contributor_count=row.get("contributor_count", 1),
                    resolution_source="hive",
                )

                if asset.asset_class == "Unknown":
                    asset = self._resolve_unknown_asset_class(asset)

                asset.calculate_confidence()
                self._universe_cache[asset.isin] = asset
                result[asset.isin] = asset
                found_isins.add(asset.isin)

            missing_isins = set(uncached_isins) - found_isins
            for isin in missing_isins:
                asset = AssetEntry(
                    isin=isin,
                    name="Unknown",
                    asset_class="Unknown",
                    base_currency="EUR",
                    resolution_source="unknown",
                    needs_manual_resolution=True,
                )
                asset = self._resolve_unknown_asset_class(asset)
                self._universe_cache[isin] = asset
                result[isin] = asset

        except Exception as e:
            logger.error(f"Hive batch lookup failed: {e}")
            for isin in uncached_isins:
                if isin not in result:
                    asset = AssetEntry(
                        isin=isin,
                        name="Unknown",
                        asset_class="Unknown",
                        base_currency="EUR",
                        resolution_source="unknown",
                        needs_manual_resolution=True,
                    )
                    asset = self._resolve_unknown_asset_class(asset)
                    result[isin] = asset

        return result

    def _is_contribution_allowed(self) -> bool:
        try:
            from portfolio_src.headless.handlers.settings import (
                is_hive_contribution_enabled,
            )

            return is_hive_contribution_enabled()
        except ImportError:
            return False

    def batch_contribute(self, assets_data: List[AssetEntry]) -> bool:
        """
        Contribute multiple asset entries to the Hive.
        Uses RPC functions for atomic, safe upserts.
        """
        if not self._is_contribution_allowed():
            return False
        try:
            client = self._get_client()
            if client is None:
                logger.warning(
                    "Cannot contribute assets: Supabase client not available"
                )
                return False

            valid_asset_classes = {"Equity", "ETF", "Cash", "Crypto", "Bond", "Fund"}

            valid_assets = [
                asset
                for asset in assets_data
                if asset.asset_class in valid_asset_classes
            ]

            if not valid_assets:
                logger.debug(
                    "No valid assets to contribute (all have Unknown asset_class)"
                )
                return True

            if len(valid_assets) < len(assets_data):
                skipped = len(assets_data) - len(valid_assets)
                logger.debug(f"Skipping {skipped} assets with invalid asset_class")

            assets_dict = [
                {
                    "isin": asset.isin,
                    "name": asset.name,
                    "asset_class": asset.asset_class,
                    "base_currency": asset.base_currency,
                    "enrichment_status": asset.enrichment_status,
                }
                for asset in valid_assets
            ]

            # Use RPC function for atomic batch upsert
            response = client.rpc(
                "batch_contribute_assets", {"assets": assets_dict}
            ).execute()

            if response.data and response.data[0].get("success"):
                logger.info(
                    f"Successfully contributed {len(valid_assets)} assets to Hive"
                )
                return True
            else:
                logger.error(f"Failed to contribute assets: {response.data}")
                return False
        except Exception as e:
            logger.error(f"Hive batch contribution failed: {e}")
            return False

    def contribute_asset(
        self,
        isin: str,
        ticker: str,
        exchange: str,
        name: str,
        asset_class: str,
        base_currency: str,
        trading_currency: str,
    ) -> HiveResult:
        """
        Contribute a new asset record and its primary listing to the Hive.
        """
        if not self._is_contribution_allowed():
            return HiveResult(success=False, error="Hive contribution disabled by user")
        client = self._get_client()
        if not client:
            return HiveResult(success=False, error="Supabase client not configured")

        try:
            response = client.rpc(
                "contribute_asset",
                {
                    "p_isin": isin,
                    "p_ticker": ticker,
                    "p_exchange": exchange,
                    "p_name": name,
                    "p_asset_class": asset_class,
                    "p_base_currency": base_currency,
                    "p_trading_currency": trading_currency,
                },
            ).execute()

            if response.data and response.data[0].get("success"):
                self._cache_loaded_at = None
                return HiveResult(success=True, data=response.data[0])
            else:
                return HiveResult(
                    success=False,
                    error=response.data[0].get(
                        "error_message", "Contribution failed at RPC level"
                    ),
                )

        except Exception as e:
            error_msg = str(e)
            if "policy" in error_msg.lower() or "permission" in error_msg.lower():
                return HiveResult(
                    success=False,
                    error="Permission denied (RLS/Policy violation).",
                )
            return HiveResult(success=False, error=f"RPC call failed: {error_msg}")

    def contribute_listing(
        self,
        isin: str,
        ticker: str,
        exchange: str,
        currency: str,
    ) -> HiveResult:
        """
        Contribute a new secondary listing to the Hive.
        """
        if not self._is_contribution_allowed():
            return HiveResult(success=False, error="Hive contribution disabled by user")
        client = self._get_client()
        if not client:
            return HiveResult(success=False, error="Supabase client not configured")

        try:
            response = client.rpc(
                "contribute_listing",
                {
                    "p_isin": isin,
                    "p_ticker": ticker,
                    "p_exchange": exchange,
                    "p_currency": currency,
                },
            ).execute()

            if response.data and response.data[0].get("success"):
                return HiveResult(success=True, data=response.data[0])
            else:
                return HiveResult(
                    success=False,
                    error=response.data[0].get(
                        "error_message", "Listing contribution failed"
                    ),
                )
        except Exception as e:
            return HiveResult(success=False, error=f"RPC call failed: {str(e)}")

    def contribute_mapping(
        self,
        isin: str,
        provider: str,
        provider_id: str,
    ) -> HiveResult:
        """
        Contribute a non-ticker alias to the provider_mappings table.
        """
        if not self._is_contribution_allowed():
            return HiveResult(success=False, error="Hive contribution disabled by user")
        client = self._get_client()
        if not client:
            return HiveResult(success=False, error="Supabase client not configured")

        try:
            response = client.rpc(
                "contribute_mapping",
                {
                    "p_isin": isin,
                    "p_provider": provider,
                    "p_provider_id": provider_id,
                },
            ).execute()

            if response.data and response.data[0].get("success"):
                return HiveResult(success=True, data=response.data[0])
            else:
                return HiveResult(
                    success=False,
                    error=response.data[0].get(
                        "error_message", "Mapping contribution failed"
                    ),
                )
        except Exception as e:
            return HiveResult(success=False, error=f"RPC call failed: {str(e)}")

    def contribute_alias(
        self,
        alias: str,
        isin: str,
        alias_type: str = "name",
        language: Optional[str] = None,
        source: str = "user",
        confidence: float = 0.80,
        currency: Optional[str] = None,
        exchange: Optional[str] = None,
        currency_source: Optional[str] = None,
        contributor_hash: Optional[str] = None,
    ) -> HiveResult:
        if not self._is_contribution_allowed():
            return HiveResult(success=False, error="Hive contribution disabled by user")
        client = self._get_client()
        if not client:
            return HiveResult(success=False, error="Supabase client not configured")

        try:
            response = client.rpc(
                "contribute_alias",
                {
                    "p_alias": alias,
                    "p_isin": isin,
                    "p_alias_type": alias_type,
                    "p_language": language,
                    "p_source": source,
                    "p_confidence": confidence,
                    "p_currency": currency,
                    "p_exchange": exchange,
                    "p_currency_source": currency_source,
                    "p_contributor_hash": contributor_hash,
                },
            ).execute()

            if response.data and response.data[0].get("success"):
                return HiveResult(success=True, data=response.data[0])
            else:
                return HiveResult(
                    success=False,
                    error=response.data[0].get(
                        "error_message", "Alias contribution failed"
                    ),
                )
        except Exception as e:
            return HiveResult(success=False, error=f"RPC call failed: {str(e)}")

    def resolve_ticker(
        self,
        ticker: str,
        exchange: Optional[str] = None,
    ) -> Optional[str]:
        client = self._get_client()
        if not client:
            return None

        try:
            response = client.rpc(
                "resolve_ticker_rpc",
                {
                    "p_ticker": ticker,
                    "p_exchange": exchange,
                },
            ).execute()

            if response.data and len(response.data) > 0:
                isin = response.data[0].get("isin")
                if isin:
                    logger.debug(f"Hive resolved {ticker} -> {isin}")
                    return isin

            return None

        except Exception as e:
            logger.warning(f"Hive ticker resolution failed for {ticker}: {e}")
            return None

    def batch_resolve_tickers(
        self,
        tickers: List[str],
        chunk_size: int = 100,
    ) -> Dict[str, Optional[str]]:
        """
        Batch resolve multiple tickers to ISINs.

        Args:
            tickers: List of ticker symbols
            chunk_size: Max tickers per RPC call (default 100)

        Returns:
            Dict mapping ticker -> ISIN (or None if not found)
        """
        if not tickers:
            return {}

        client = self._get_client()
        if not client:
            return {t: None for t in tickers}

        results: Dict[str, Optional[str]] = {t: None for t in tickers}

        # Process in chunks to avoid RPC payload limits
        for i in range(0, len(tickers), chunk_size):
            chunk = tickers[i : i + chunk_size]

            try:
                response = client.rpc(
                    "batch_resolve_tickers_rpc",
                    {"p_tickers": chunk},
                ).execute()

                if response.data:
                    for row in response.data:
                        ticker = row.get("ticker", "").upper()
                        isin = row.get("isin")
                        # Match back to original case
                        for orig_ticker in chunk:
                            if orig_ticker.upper() == ticker:
                                results[orig_ticker] = isin
                                break

            except Exception as e:
                logger.warning(f"Hive batch resolution failed for chunk: {e}")
                # Continue with next chunk

        resolved_count = sum(1 for v in results.values() if v is not None)
        logger.info(f"Hive batch resolved {resolved_count}/{len(tickers)} tickers")

        return results

    def lookup_by_alias(
        self,
        alias: str,
    ) -> Optional[AliasLookupResult]:
        if not alias or not alias.strip():
            return None

        client = self._get_client()
        if not client:
            return None

        try:
            response = client.rpc(
                "lookup_alias_rpc",
                {"p_alias": alias.strip()},
            ).execute()

            if response.data and len(response.data) > 0:
                row = response.data[0]
                isin = row.get("isin")
                if isin:
                    logger.debug(f"Hive alias resolved '{alias}' -> {isin}")
                    return AliasLookupResult(
                        isin=isin,
                        name=row.get("name", ""),
                        asset_class=row.get("asset_class", "Unknown"),
                        alias_type=row.get("alias_type", "name"),
                        contributor_count=row.get("contributor_count", 1),
                        source=row.get("source", "unknown"),
                        confidence=float(row.get("confidence", 0.0)),
                        currency=row.get("currency"),
                        exchange=row.get("exchange"),
                    )

            return None

        except Exception as e:
            logger.warning(f"Hive alias lookup failed for '{alias}': {e}")
            return None

    def lookup_alias_isin(self, alias: str) -> Optional[str]:
        result = self.lookup_by_alias(alias)
        return result.isin if result else None

    def sync_identity_domain(
        self,
        page_size: int = 1000,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Pull full identity domain (assets, listings, aliases) from Hive.

        Used by LocalCache to sync data for offline operation.

        Args:
            page_size: Rows per page for pagination

        Returns:
            Dict with keys 'assets', 'listings', 'aliases', each containing
            a list of row dicts.
        """
        client = self._get_client()
        if not client:
            return {"assets": [], "listings": [], "aliases": []}

        result = {"assets": [], "listings": [], "aliases": []}

        # Fetch assets
        try:
            # Use RPC to bypass RLS
            response = client.rpc("get_all_assets_rpc", {}).execute()
            if response.data:
                result["assets"] = response.data
                logger.info(f"Synced {len(response.data)} assets from Hive")
        except Exception as e:
            logger.warning(f"Failed to sync assets: {e}")
            # Fallback: try direct query (may fail due to RLS)
            try:
                response = client.from_("assets").select("*").execute()
                if response.data:
                    result["assets"] = response.data
            except Exception:
                pass

        # Fetch listings
        try:
            response = client.rpc("get_all_listings_rpc", {}).execute()
            if response.data:
                result["listings"] = response.data
                logger.info(f"Synced {len(response.data)} listings from Hive")
        except Exception as e:
            logger.warning(f"Failed to sync listings: {e}")
            try:
                response = client.from_("listings").select("*").execute()
                if response.data:
                    result["listings"] = response.data
            except Exception:
                pass

        # Fetch aliases
        try:
            response = client.rpc("get_all_aliases_rpc", {}).execute()
            if response.data:
                result["aliases"] = response.data
                logger.info(f"Synced {len(response.data)} aliases from Hive")
        except Exception as e:
            logger.warning(f"Failed to sync aliases: {e}")
            try:
                response = client.from_("aliases").select("*").execute()
                if response.data:
                    result["aliases"] = response.data
            except Exception:
                pass

        return result

    def get_etf_holdings(self, etf_isin: str) -> Optional[pd.DataFrame]:
        """
        Fetch ETF holdings from the Hive.
        Returns a DataFrame with columns [isin, name, weight, sector, geography].
        """
        client = self._get_client()
        if not client:
            return None

        try:
            response = client.rpc(
                "get_etf_holdings_rpc", {"p_etf_isin": etf_isin}
            ).execute()

            if not response.data:
                return None

            df = pd.DataFrame(response.data)

            column_map = {
                "holding_isin": "isin",
            }
            df = df.rename(columns=column_map)

            for col in ["isin", "weight"]:
                if col not in df.columns:
                    df[col] = "Unknown" if col != "weight" else 0.0

            return df

        except Exception as e:
            logger.warning(f"Hive holdings lookup failed for {etf_isin}: {e}")
            return None

    def contribute_etf_holdings(self, etf_isin: str, holdings_df: pd.DataFrame) -> bool:
        """
        Contribute ETF holdings to the Hive.
        Uses RPC for atomic batch upsert.
        """
        if not self._is_contribution_allowed():
            return False
        client = self._get_client()
        if not client:
            return False

        try:
            # Transform DataFrame to list of dicts for RPC
            # We need to match the Supabase schema
            holdings_list = []
            for _, row in holdings_df.iterrows():
                holdings_list.append(
                    {
                        "etf_isin": etf_isin,
                        "holding_isin": str(row.get("isin", row.get("ISIN", ""))),
                        "holding_name": str(
                            row.get("name", row.get("Name", "Unknown"))
                        ),
                        "weight_percentage": float(
                            row.get("weight", row.get("Weight", 0.0)) or 0.0
                        ),
                        "sector": str(row.get("sector", "Unknown")),
                        "geography": str(row.get("geography", "Unknown")),
                    }
                )

            if not holdings_list:
                return False

            # Use RPC function for atomic batch upsert
            # This function should handle clearing old holdings and inserting new ones
            response = client.rpc(
                "batch_contribute_holdings",
                {"p_etf_isin": etf_isin, "p_holdings": holdings_list},
            ).execute()

            if response.data and response.data[0].get("success"):
                logger.info(
                    f"Successfully contributed {len(holdings_list)} holdings for {etf_isin} to Hive"
                )
                return True
            else:
                logger.error(f"Failed to contribute holdings: {response.data}")
                return False

        except Exception as e:
            logger.error(f"Hive holdings contribution failed for {etf_isin}: {e}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the cached universe."""
        return {
            "total_entries": len(self._universe_cache),
            "cache_valid": self._is_cache_valid(),
            "cache_file_exists": self.cache_file.exists(),
            "supabase_configured": self.is_configured,
        }


# Singleton instance
_hive_client: Optional[HiveClient] = None


def get_hive_client() -> HiveClient:
    """Get or create the singleton hive client."""
    global _hive_client
    if _hive_client is None:
        _hive_client = HiveClient()
    return _hive_client
