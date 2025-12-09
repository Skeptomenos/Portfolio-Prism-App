"""
Holdings Cache Module - 3-tier resolution for ETF holdings.

Resolution order:
1. Local cache (instant, offline) - data/working/etf_holdings_cache/
2. Community data (pre-cached) - community_data/etf_holdings/
3. Scraper adapters (fallback, may fail)
4. Manual upload (user action required)

For Docker mode, scrapers are disabled and only cache/manual upload works.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from portfolio_src import config # Import centralized config

import pandas as pd

from prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Directory paths defined in config
# Use persistent working directory for cache
LOCAL_CACHE_DIR = config.WORKING_DIR / "etf_holdings_cache"
# Community Data: This is bundled. In dev = PROJECT_ROOT/community_data. 
# In frozen app, config.PROJECT_ROOT points to temp bundle location where assets are extracted.
COMMUNITY_DIR = config.PROJECT_ROOT / "community_data" / "etf_holdings"
# Manual Uploads: Use persistent inputs directory
MANUAL_UPLOAD_DIR = config.MANUAL_INPUTS_DIR


class ManualUploadRequired(Exception):
    """Raised when holdings must be manually uploaded by the user."""

    def __init__(
        self,
        isin: str,
        provider: str,
        message: str = "Manual upload required",
        download_url: Optional[str] = None,
    ):
        self.isin = isin
        self.provider = provider
        self.download_url = download_url
        super().__init__(message)


class HoldingsCache:
    """
    3-tier cache system for ETF holdings.

    Provides fast access to holdings via local cache, falls back to
    community data, then scrapers if needed.
    """

    def __init__(self, max_cache_age_days: int = 7):
        """
        Initialize the holdings cache.

        Args:
            max_cache_age_days: Maximum age of cached data before refresh needed
        """
        self.max_cache_age_days = max_cache_age_days
        self._ensure_directories()
        self._local_metadata = self._load_metadata(LOCAL_CACHE_DIR)
        self._community_metadata = self._load_metadata(COMMUNITY_DIR)
        logger.info(
            f"HoldingsCache initialized: "
            f"{len(self._local_metadata)} local, "
            f"{len(self._community_metadata)} community"
        )

    def _ensure_directories(self) -> None:
        """Create cache directories if they don't exist."""
        LOCAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        MANUAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def _load_metadata(self, cache_dir: Path) -> dict:
        """Load metadata from a cache directory."""
        metadata_file = cache_dir / "_metadata.json"
        if metadata_file.exists():
            try:
                data = json.loads(metadata_file.read_text())
                # Filter out stats keys
                return {k: v for k, v in data.items() if not k.startswith("_")}
            except Exception as e:
                logger.warning(f"Failed to load metadata from {metadata_file}: {e}")
        return {}

    def _save_local_metadata(self) -> None:
        """Save local cache metadata."""
        metadata_file = LOCAL_CACHE_DIR / "_metadata.json"
        data = dict(self._local_metadata)
        data["_stats"] = {
            "total_etfs": len(self._local_metadata),
            "last_updated": datetime.now().isoformat(),
        }
        metadata_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    def get_holdings(
        self,
        isin: str,
        adapter_registry=None,
        force_refresh: bool = False,
    ) -> pd.DataFrame:
        """
        Get holdings for an ISIN using 3-tier resolution.

        Args:
            isin: The ISIN to look up
            adapter_registry: Optional AdapterRegistry for scraper fallback
            force_refresh: If True, skip cache and fetch fresh data

        Returns:
            DataFrame with holdings data

        Raises:
            ManualUploadRequired: If holdings cannot be fetched and must be uploaded
            Exception: If all resolution methods fail
        """
        # Tier 1: Local cache (unless force refresh)
        if not force_refresh:
            holdings = self._get_from_local_cache(isin)
            if holdings is not None:
                logger.debug(f"[{isin}] Found in local cache")
                return holdings

        # Tier 2: Community data (unless force refresh)
        if not force_refresh:
            holdings = self._get_from_community(isin)
            if holdings is not None:
                logger.debug(f"[{isin}] Found in community data")
                # Copy to local cache for faster access
                self._copy_to_local_cache(isin, holdings)
                return holdings

        # Tier 3: Scraper adapters
        if adapter_registry and not os.getenv("DOCKER_MODE") == "true":
            holdings = self._fetch_via_adapter(isin, adapter_registry)
            if holdings is not None:
                logger.debug(f"[{isin}] Fetched via adapter")
                # Save to local cache
                self._save_to_local_cache(isin, holdings, source="adapter_fetch")
                return holdings

        # Tier 4: Check for manual upload
        holdings = self._get_from_manual_upload(isin)
        if holdings is not None:
            logger.debug(f"[{isin}] Found manual upload")
            # Save to local cache
            self._save_to_local_cache(isin, holdings, source="manual_upload")
            return holdings

        # All tiers failed
        raise ManualUploadRequired(
            isin=isin,
            provider="Unknown",
            message=f"No holdings data available for {isin}. Please upload manually.",
        )

    def _get_from_local_cache(self, isin: str) -> Optional[pd.DataFrame]:
        """Get holdings from local cache if fresh."""
        if isin not in self._local_metadata:
            return None

        # Check freshness
        if not self._is_fresh(self._local_metadata[isin]):
            logger.debug(f"[{isin}] Local cache expired")
            return None

        csv_file = LOCAL_CACHE_DIR / f"{isin}.csv"
        if not csv_file.exists():
            return None

        try:
            return pd.read_csv(csv_file)
        except Exception as e:
            logger.warning(f"[{isin}] Failed to read local cache: {e}")
            return None

    def _get_from_community(self, isin: str) -> Optional[pd.DataFrame]:
        """Get holdings from community data."""
        csv_file = COMMUNITY_DIR / f"{isin}.csv"
        if not csv_file.exists():
            return None

        try:
            return pd.read_csv(csv_file)
        except Exception as e:
            logger.warning(f"[{isin}] Failed to read community data: {e}")
            return None

    def _get_from_manual_upload(self, isin: str) -> Optional[pd.DataFrame]:
        """Check for manually uploaded holdings file."""
        # Look for any file matching the ISIN pattern
        for ext in [".csv", ".xlsx", ".xls"]:
            for pattern in [f"{isin}{ext}", f"{isin.lower()}{ext}", f"*{isin}*{ext}"]:
                matches = list(MANUAL_UPLOAD_DIR.glob(pattern))
                if matches:
                    file_path = matches[0]
                    try:
                        if ext == ".csv":
                            return pd.read_csv(file_path)
                        else:
                            return pd.read_excel(file_path)
                    except Exception as e:
                        logger.warning(
                            f"[{isin}] Failed to read manual file {file_path}: {e}"
                        )
        return None

    def _fetch_via_adapter(self, isin: str, adapter_registry) -> Optional[pd.DataFrame]:
        """Fetch holdings using the adapter registry."""
        try:
            adapter = adapter_registry.get_adapter(isin)
            if adapter is None:
                logger.debug(f"[{isin}] No adapter available")
                return None

            holdings = adapter.fetch_holdings(isin)
            if holdings is None or holdings.empty:
                return None

            return holdings
        except Exception as e:
            logger.warning(f"[{isin}] Adapter fetch failed: {e}")
            return None

    def _is_fresh(self, metadata: dict) -> bool:
        """Check if cached data is still fresh."""
        cached_at = metadata.get("cached_at")
        if not cached_at:
            return False

        try:
            cache_time = datetime.fromisoformat(cached_at)
            age = datetime.now() - cache_time
            return age.days < self.max_cache_age_days
        except Exception:
            return False

    def _copy_to_local_cache(self, isin: str, holdings: pd.DataFrame) -> None:
        """Copy community data to local cache for faster access."""
        try:
            csv_file = LOCAL_CACHE_DIR / f"{isin}.csv"
            holdings.to_csv(csv_file, index=False)

            # Copy metadata from community
            if isin in self._community_metadata:
                self._local_metadata[isin] = dict(self._community_metadata[isin])
                self._local_metadata[isin]["copied_from"] = "community"
                self._local_metadata[isin]["copied_at"] = datetime.now().isoformat()
                self._save_local_metadata()

            logger.debug(f"[{isin}] Copied to local cache")
        except Exception as e:
            logger.warning(f"[{isin}] Failed to copy to local cache: {e}")

    def _save_to_local_cache(
        self,
        isin: str,
        holdings: pd.DataFrame,
        source: str = "unknown",
        name: Optional[str] = None,
    ) -> None:
        """Save holdings to local cache."""
        try:
            csv_file = LOCAL_CACHE_DIR / f"{isin}.csv"
            holdings.to_csv(csv_file, index=False)

            # Calculate stats
            total_weight = 0
            if "weight_percentage" in holdings.columns:
                total_weight = holdings["weight_percentage"].sum()

            self._local_metadata[isin] = {
                "name": name or isin,
                "cached_at": datetime.now().isoformat(),
                "source": source,
                "holdings_count": len(holdings),
                "total_weight": round(total_weight, 2),
                "columns": list(holdings.columns),
            }
            self._save_local_metadata()

            logger.info(f"[{isin}] Saved to local cache ({len(holdings)} holdings)")
        except Exception as e:
            logger.warning(f"[{isin}] Failed to save to local cache: {e}")

    def has_holdings(self, isin: str) -> bool:
        """Check if holdings are available for an ISIN (any tier)."""
        # Check local cache
        if isin in self._local_metadata and self._is_fresh(self._local_metadata[isin]):
            return True

        # Check community data
        if (COMMUNITY_DIR / f"{isin}.csv").exists():
            return True

        # Check manual uploads
        for ext in [".csv", ".xlsx", ".xls"]:
            if list(MANUAL_UPLOAD_DIR.glob(f"*{isin}*{ext}")):
                return True

        return False

    def get_cache_stats(self) -> dict:
        """Get statistics about the cache."""
        local_count = len(self._local_metadata)
        community_count = len(self._community_metadata)

        # Count fresh vs stale
        fresh_count = sum(1 for m in self._local_metadata.values() if self._is_fresh(m))

        return {
            "local_count": local_count,
            "local_fresh": fresh_count,
            "local_stale": local_count - fresh_count,
            "community_count": community_count,
            "total_available": len(self.list_available_isins()),
        }

    def list_available_isins(self) -> list[str]:
        """List all ISINs with available holdings data."""
        isins = set()

        # From local cache (if fresh)
        for isin, meta in self._local_metadata.items():
            if self._is_fresh(meta):
                isins.add(isin)

        # From community data
        for csv_file in COMMUNITY_DIR.glob("*.csv"):
            if csv_file.name != "_metadata.json":
                isins.add(csv_file.stem)

        return sorted(isins)

    def invalidate(self, isin: str) -> None:
        """Invalidate cached data for an ISIN (force refresh on next access)."""
        if isin in self._local_metadata:
            del self._local_metadata[isin]
            self._save_local_metadata()

        csv_file = LOCAL_CACHE_DIR / f"{isin}.csv"
        if csv_file.exists():
            csv_file.unlink()

        logger.info(f"[{isin}] Cache invalidated")

    def clear_local_cache(self) -> None:
        """Clear all local cache (keeps community data)."""
        self._local_metadata = {}
        self._save_local_metadata()

        for csv_file in LOCAL_CACHE_DIR.glob("*.csv"):
            csv_file.unlink()

        logger.info("Local cache cleared")


# Module-level singleton for convenience
_cache_instance: Optional[HoldingsCache] = None


def get_holdings_cache() -> HoldingsCache:
    """Get the singleton HoldingsCache instance."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = HoldingsCache()
    return _cache_instance
