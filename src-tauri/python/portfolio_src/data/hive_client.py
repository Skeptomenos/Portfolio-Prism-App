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

load_dotenv()

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
    """Result from a hive operation."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


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
                print(f"Failed to create Supabase client: {e}")
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
            print(f"Failed to load cache: {e}")
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
            print(f"Failed to save cache: {e}")
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

        # 3. Download from Supabase
        client = self._get_client()
        if not client:
            return HiveResult(
                success=False,
                error="Supabase not configured or client failed to initialize",
            )

        try:
            response = client.from_("master_view").select("*").execute()

            self._universe_cache = {}
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
                )
                asset.calculate_confidence()
                self._universe_cache[asset.isin] = asset
            self._cache_loaded_at = datetime.now()
            self._save_cache()

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
                # Return placeholder entries if client is not available
                for isin in uncached_isins:
                    result[isin] = AssetEntry(
                        isin=isin,
                        name="Unknown",
                        asset_class="Unknown",
                        base_currency="Unknown",
                    )
                return result

            response = (
                client.from_("assets").select("*").in_("isin", uncached_isins).execute()
            )

            # Process response and update cache
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
                )
                asset.calculate_confidence()
                self._universe_cache[asset.isin] = asset
                result[asset.isin] = asset

        except Exception as e:
            print(f"Hive batch lookup failed: {e}")
            # Return placeholder entries for failed lookups
            for isin in uncached_isins:
                if isin not in result:
                    result[isin] = AssetEntry(
                        isin=isin,
                        name="Unknown",
                        asset_class="Unknown",
                        base_currency="Unknown",
                    )

        return result

    def batch_contribute(self, assets_data: List[AssetEntry]) -> bool:
        """
        Contribute multiple asset entries to the Hive.
        Uses RPC functions for atomic, safe upserts.
        """
        try:
            client = self._get_client()
            if client is None:
                print("Cannot contribute assets: Supabase client not available")
                return False

            # Transform AssetEntry to dict for upsert
            assets_dict = [
                {
                    "isin": asset.isin,
                    "name": asset.name,
                    "asset_class": asset.asset_class,
                    "base_currency": asset.base_currency,
                    "enrichment_status": asset.enrichment_status,
                }
                for asset in assets_data
            ]

            # Use RPC function for atomic batch upsert
            response = client.rpc("batch_contribute_assets", {"assets": assets_dict})

            if response.data and response.data[0].get("success"):
                print(f"Successfully contributed {len(assets_data)} assets to Hive")
                return True
            else:
                print(f"Failed to contribute assets: {response.data}")
                return False
        except Exception as e:
            print(f"Hive batch contribution failed: {e}")
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

    def get_etf_holdings(self, etf_isin: str) -> Optional[pd.DataFrame]:
        """
        Fetch ETF holdings from the Hive.
        Returns a DataFrame with columns [isin, name, weight, sector, geography].
        """
        client = self._get_client()
        if not client:
            return None

        try:
            # Query the etf_holdings table
            response = (
                client.from_("etf_holdings")
                .select("*")
                .eq("etf_isin", etf_isin)
                .execute()
            )

            if not response.data:
                return None

            # Convert to DataFrame and normalize columns
            df = pd.DataFrame(response.data)

            # Map Hive columns to standard internal names
            column_map = {
                "holding_isin": "isin",
                "holding_name": "name",
                "weight_percentage": "weight",
            }
            df = df.rename(columns=column_map)

            # Ensure required columns exist
            for col in ["isin", "name", "weight"]:
                if col not in df.columns:
                    df[col] = "Unknown" if col != "weight" else 0.0

            return df

        except Exception as e:
            print(f"Hive holdings lookup failed for {etf_isin}: {e}")
            return None

    def contribute_etf_holdings(self, etf_isin: str, holdings_df: pd.DataFrame) -> bool:
        """
        Contribute ETF holdings to the Hive.
        Uses RPC for atomic batch upsert.
        """
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
                print(
                    f"Successfully contributed {len(holdings_list)} holdings for {etf_isin} to Hive"
                )
                return True
            else:
                print(f"Failed to contribute holdings: {response.data}")
                return False

        except Exception as e:
            print(f"Hive holdings contribution failed for {etf_isin}: {e}")
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
