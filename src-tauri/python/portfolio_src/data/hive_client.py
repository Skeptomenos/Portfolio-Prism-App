"""
Hive Client - Community Asset Universe Sync

Syncs with Supabase backend for:
- Downloading community-contributed normalized asset data (Assets + Listings)
- Contributing new discoveries via safe RPC functions
- Local caching with TTL (Asset-level)
"""

import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

# Placeholder definitions for type checking when supabase is not installed
# This is a common pattern to avoid mypy errors when dependencies are optional/conditional.
SUPABASE_AVAILABLE = False


class Client:
    pass


def create_client(*args, **kwargs):
    return None


try:
    from supabase import create_client as real_create_client, Client as RealClient

    Client = RealClient
    create_client = real_create_client
    SUPABASE_AVAILABLE = True
except ImportError:
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

        self._client: Optional[Client] = None
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

    def _get_client(self) -> Optional[Client]:
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
        Download the latest master universe (assets + primary listings) from Supabase.

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

        # 2. Try to load from file cache (even if expired, for a fast start)
        if not force and self._load_cache():
            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "file_cache"},
            )

        # 3. Download from Supabase (Requires a Master VIEW or RPC for efficiency)
        client = self._get_client()
        if not client:
            return HiveResult(
                success=False,
                error="Supabase not configured or client failed to initialize",
            )

        try:
            # Assuming a `master_view` or similar structure for MVP sync
            # This joins assets and the primary listing/ticker
            response = client.from_("master_view").select("*").execute()

            self._universe_cache = {
                row["isin"]: AssetEntry(
                    isin=row.get("isin", ""),
                    name=row.get("name", ""),
                    asset_class=row.get("asset_class", "Unknown"),
                    base_currency=row.get("base_currency", "Unknown"),
                    ticker=row.get("ticker"),
                    exchange=row.get("exchange"),
                    currency=row.get("currency"),
                    enrichment_status=row.get("enrichment_status", "stub"),
                    last_updated=row.get("updated_at"),
                )
                for row in response.data
            }
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

        Checks local cache first. Syncs if cache is empty/stale.

        Args:
            isin: ISIN to look up

        Returns:
            AssetEntry if found, None otherwise
        """
        # Ensure cache is populated (will trigger sync if necessary)
        if not self._universe_cache or not self._is_cache_valid():
            self.sync_universe()

        # Check cache
        if isin in self._universe_cache:
            return self._universe_cache[isin]

        return None

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

        This calls the PostgreSQL RPC function `contribute_asset` for safe, transactional upsert.
        """
        client = self._get_client()
        if not client:
            return HiveResult(success=False, error="Supabase client not configured")

        try:
            # Call the RPC function defined in schema.sql
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
                # Invalidate cache to force reload on next sync/lookup
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
            # Policy/RLS errors will be caught here
            error_msg = str(e)
            if "policy" in error_msg.lower() or "permission" in error_msg.lower():
                return HiveResult(
                    success=False,
                    error="Permission denied (RLS/Policy violation). This operation requires proper authentication.",
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
        Contribute a new secondary listing (ticker/exchange) to the Hive.
        Assumes the core asset already exists.
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
                        "error_message", "Listing contribution failed at RPC level"
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
        Contribute a non-ticker alias (e.g., name variant) to the provider_mappings table.
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
                        "error_message", "Mapping contribution failed at RPC level"
                    ),
                )
        except Exception as e:
            return HiveResult(success=False, error=f"RPC call failed: {str(e)}")

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
