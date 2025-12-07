"""
Hive Client - Community Asset Universe Sync

Syncs with Supabase backend for:
- Downloading community-contributed ISIN-to-ticker mappings
- Contributing new discoveries back to the community
- Local caching with TTL
"""

import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dataclasses import dataclass

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False


@dataclass
class AssetEntry:
    """Single asset in the universe."""
    isin: str
    ticker: str
    name: str
    asset_type: str  # "ETF", "Stock", etc.
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
    
    Uses Supabase as the backend with:
    - Public read access (no auth needed for downloading)
    - Authenticated write access (for contributing)
    - Local caching with 24h TTL
    """
    
    TABLE_NAME = "master_universe"
    CACHE_TTL_HOURS = 24
    
    def __init__(
        self,
        data_dir: Optional[Path] = None,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None
    ):
        """
        Initialize the Hive client.
        
        Args:
            data_dir: Directory for caching universe data
            supabase_url: Supabase project URL (defaults to env var)
            supabase_key: Supabase anon key (defaults to env var)
        """
        self.data_dir = data_dir or Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
        self.cache_dir = self.data_dir / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.supabase_url = supabase_url or os.getenv("SUPABASE_URL", "")
        self.supabase_key = supabase_key or os.getenv("SUPABASE_ANON_KEY", "")
        
        self._client: Optional[Client] = None
        self._universe_cache: Dict[str, AssetEntry] = {}
        self._cache_loaded_at: Optional[datetime] = None
    
    @property
    def cache_file(self) -> Path:
        """Path to the cached universe file."""
        return self.cache_dir / "master_universe.json"
    
    @property
    def is_configured(self) -> bool:
        """Check if Supabase credentials are configured."""
        return bool(self.supabase_url and self.supabase_key)
    
    def _get_client(self) -> Optional[Client]:
        """Get or create Supabase client."""
        if not SUPABASE_AVAILABLE:
            return None
        
        if not self.is_configured:
            return None
        
        if self._client is None:
            self._client = create_client(self.supabase_url, self.supabase_key)
        
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
            
            # Check cache metadata
            cached_at = data.get("cached_at")
            if cached_at:
                cached_time = datetime.fromisoformat(cached_at)
                if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
                    return False  # Cache expired
            
            # Load entries
            self._universe_cache = {
                entry["isin"]: AssetEntry(**entry)
                for entry in data.get("entries", [])
            }
            self._cache_loaded_at = datetime.now()
            return True
            
        except Exception as e:
            print(f"Failed to load cache: {e}")
            return False
    
    def _save_cache(self) -> bool:
        """Save universe to local cache file."""
        try:
            data = {
                "cached_at": datetime.now().isoformat(),
                "entries": [
                    {
                        "isin": e.isin,
                        "ticker": e.ticker,
                        "name": e.name,
                        "asset_type": e.asset_type,
                        "contributor_count": e.contributor_count,
                        "last_updated": e.last_updated
                    }
                    for e in self._universe_cache.values()
                ]
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
        # Check cache first
        if not force and self._is_cache_valid():
            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "cache"}
            )
        
        # Try to load from file cache
        if not force and self._load_cache():
            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "file_cache"}
            )
        
        # Download from Supabase
        client = self._get_client()
        if not client:
            # Fallback to file cache even if expired
            if self._load_cache():
                return HiveResult(
                    success=True,
                    data={"count": len(self._universe_cache), "source": "stale_cache"}
                )
            return HiveResult(
                success=False,
                error="Supabase not configured and no cache available"
            )
        
        try:
            response = client.table(self.TABLE_NAME).select("*").execute()
            
            self._universe_cache = {
                row["isin"]: AssetEntry(
                    isin=row["isin"],
                    ticker=row["ticker"],
                    name=row.get("name", ""),
                    asset_type=row.get("asset_type", "Unknown"),
                    contributor_count=row.get("contributor_count", 1),
                    last_updated=row.get("last_updated")
                )
                for row in response.data
            }
            self._cache_loaded_at = datetime.now()
            self._save_cache()
            
            return HiveResult(
                success=True,
                data={"count": len(self._universe_cache), "source": "supabase"}
            )
            
        except Exception as e:
            return HiveResult(success=False, error=str(e))
    
    def lookup(self, isin: str) -> Optional[AssetEntry]:
        """
        Look up an ISIN in the universe.
        
        Checks local cache first, then Supabase if not found.
        
        Args:
            isin: ISIN to look up
            
        Returns:
            AssetEntry if found, None otherwise
        """
        # Ensure cache is loaded
        if not self._universe_cache:
            self.sync_universe()
        
        # Check cache
        if isin in self._universe_cache:
            return self._universe_cache[isin]
        
        # Try direct lookup from Supabase
        client = self._get_client()
        if not client:
            return None
        
        try:
            response = client.table(self.TABLE_NAME).select("*").eq("isin", isin).execute()
            
            if response.data:
                row = response.data[0]
                entry = AssetEntry(
                    isin=row["isin"],
                    ticker=row["ticker"],
                    name=row.get("name", ""),
                    asset_type=row.get("asset_type", "Unknown"),
                    contributor_count=row.get("contributor_count", 1),
                    last_updated=row.get("last_updated")
                )
                self._universe_cache[isin] = entry
                return entry
                
        except Exception as e:
            print(f"Hive lookup failed: {e}")
        
        return None
    
    def contribute(
        self,
        isin: str,
        ticker: str,
        name: str = "",
        asset_type: str = "Unknown",
        auth_token: Optional[str] = None
    ) -> HiveResult:
        """
        Contribute a new ISIN-ticker mapping to the Hive.
        
        Requires authentication.
        
        Args:
            isin: ISIN to contribute
            ticker: Ticker symbol
            name: Asset name
            asset_type: Asset type (ETF, Stock, etc.)
            auth_token: Supabase auth token (if authenticated)
            
        Returns:
            HiveResult indicating success/failure
        """
        client = self._get_client()
        if not client:
            return HiveResult(success=False, error="Supabase not configured")
        
        try:
            # Upsert the entry
            response = client.table(self.TABLE_NAME).upsert({
                "isin": isin,
                "ticker": ticker,
                "name": name,
                "asset_type": asset_type,
                "last_updated": datetime.now().isoformat()
            }).execute()
            
            # Update local cache
            self._universe_cache[isin] = AssetEntry(
                isin=isin,
                ticker=ticker,
                name=name,
                asset_type=asset_type,
                last_updated=datetime.now().isoformat()
            )
            self._save_cache()
            
            return HiveResult(success=True, data={"isin": isin, "ticker": ticker})
            
        except Exception as e:
            error_msg = str(e)
            if "policy" in error_msg.lower() or "permission" in error_msg.lower():
                return HiveResult(
                    success=False,
                    error="Authentication required to contribute. Please log in."
                )
            return HiveResult(success=False, error=error_msg)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the cached universe."""
        return {
            "total_entries": len(self._universe_cache),
            "cache_valid": self._is_cache_valid(),
            "cache_file_exists": self.cache_file.exists(),
            "supabase_configured": self.is_configured
        }


# Singleton instance
_hive_client: Optional[HiveClient] = None


def get_hive_client() -> HiveClient:
    """Get or create the singleton hive client."""
    global _hive_client
    if _hive_client is None:
        _hive_client = HiveClient()
    return _hive_client
