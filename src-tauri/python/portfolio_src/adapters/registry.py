# phases/active/holdings_fetcher.py
import os
import json
from datetime import datetime
from typing import Optional

import pandas as pd

# Add the project root to the Python path
# Add the project root to the Python path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

from portfolio_src import config # Import centralized config

from adapters.vaneck import VanEckAdapter
from adapters.ishares import ISharesAdapter
from adapters.xtrackers import XtrackersAdapter
from adapters.amundi import AmundiAdapter
from adapters.vanguard import VanguardAdapter
from data.holdings_cache import HoldingsCache, ManualUploadRequired
from prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class AdapterNotImplementedError(Exception):
    """Raised when an adapter key exists in config but no class is implemented."""

    pass


class AdapterRegistry:
    """
    A single point of responsibility for selecting and instantiating the correct adapter.
    This class implements the Factory pattern for our adapters.

    Now integrates with HoldingsCache for 3-tier resolution:
    1. Local cache (fast, offline)
    2. Community data (pre-cached)
    3. Scraper adapters (fallback)
    """

    def __init__(
        self,
        config_path: str = str(
            config.CONFIG_DIR / "adapter_registry.json"
        ),
        use_cache: bool = True,
    ):
        self._isin_to_key = self._load_config(config_path)
        self._key_to_class = {
            "ishares": ISharesAdapter,
            "vaneck": VanEckAdapter,
            "amundi": AmundiAdapter,
            "xtrackers": XtrackersAdapter,
            "vanguard": VanguardAdapter,
        }
        self._use_cache = use_cache
        self._holdings_cache: Optional[HoldingsCache] = None
        logger.info("AdapterRegistry initialized.")

    def _load_config(self, path):
        """Loads the ISIN-to-adapter mapping from the JSON config."""
        logger.info(f"Loading adapter configuration from: {path}")
        try:
            with open(path, "r") as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(
                f"Adapter config file not found at {path}. Registry will be empty."
            )
            return {}
        except json.JSONDecodeError:
            logger.error(f"Error decoding JSON from adapter config file at {path}.")
            return {}

    def _log_feature_request(self, provider_key, isin):
        """Appends a feature request to the BACKLOG.md file (deprecated/local only)."""
        # In frozen app, writing to project root is not useful.
        # Ideally this should log to a robust location or be removed.
        # For now, we try to write to a log file in OUTPUTS
        backlog_path = config.OUTPUTS_DIR / "missing_adapters.log"
        try:
            # Read existing content to check for duplicates
            existing_content = ""
            if os.path.exists(backlog_path):
                with open(backlog_path, "r") as f:
                    existing_content = f.read()

            request_line = f"- [ ] Create adapter for provider: '{provider_key}'"

            if request_line not in existing_content:
                with open(backlog_path, "a") as f:
                    f.write(
                        f"\n{request_line} (Triggered by ISIN: {isin} on {datetime.now().strftime('%Y-%m-%d')})"
                    )
                logger.info(f"Added feature request for '{provider_key}' to BACKLOG.md")
        except Exception as e:
            logger.error(f"Failed to write to backlog: {e}")

    def get_adapter(self, isin: str):
        """
        Returns an instantiated adapter for a given ISIN.

        Args:
            isin: The ISIN of the ETF.

        Returns:
            An instantiated adapter object or None if no adapter is found.

        Raises:
            AdapterNotImplementedError: If the provider is known but not implemented.
        """
        adapter_key = self._isin_to_key.get(isin)

        if not adapter_key or adapter_key == "ignore":
            return None

        AdapterClass = self._key_to_class.get(adapter_key)
        if not AdapterClass:
            logger.warning(
                f"Adapter key '{adapter_key}' for ISIN {isin} is not implemented yet."
            )
            self._log_feature_request(adapter_key, isin)
            raise AdapterNotImplementedError(
                f"Provider '{adapter_key}' is not supported yet."
            )

        try:
            # Handle adapters that require special instantiation (e.g., with ISIN)
            if AdapterClass is VanEckAdapter:
                return AdapterClass(isin=isin)
            if AdapterClass is VanguardAdapter:
                return AdapterClass(isin=isin)
            return AdapterClass()
        except Exception as e:
            logger.error(
                f"Failed to instantiate adapter {AdapterClass.__name__} for ISIN {isin}: {e}"
            )
            return None

    @property
    def holdings_cache(self) -> HoldingsCache:
        """Lazy-load the holdings cache."""
        if self._holdings_cache is None:
            self._holdings_cache = HoldingsCache()
        return self._holdings_cache

    def fetch_holdings(
        self,
        isin: str,
        force_refresh: bool = False,
    ) -> pd.DataFrame:
        """
        Fetch holdings for an ISIN using 3-tier resolution.

        Resolution order:
        1. Local cache (if use_cache=True and not force_refresh)
        2. Community data (if use_cache=True and not force_refresh)
        3. Scraper adapter (if available)
        4. Manual upload (fallback)

        Args:
            isin: The ISIN of the ETF
            force_refresh: If True, skip cache and fetch fresh data

        Returns:
            DataFrame with holdings data

        Raises:
            ManualUploadRequired: If holdings cannot be fetched automatically
        """
        if self._use_cache:
            return self.holdings_cache.get_holdings(
                isin=isin,
                adapter_registry=self,
                force_refresh=force_refresh,
            )
        else:
            # Direct adapter fetch (bypasses cache)
            adapter = self.get_adapter(isin)
            if adapter is None:
                raise ManualUploadRequired(
                    isin=isin,
                    provider="Unknown",
                    message=f"No adapter available for {isin}",
                )
            holdings = adapter.fetch_holdings(isin)
            if holdings is None or holdings.empty:
                raise ManualUploadRequired(
                    isin=isin,
                    provider=adapter.__class__.__name__,
                    message=f"Adapter returned no holdings for {isin}",
                )
            return holdings

    def has_holdings(self, isin: str) -> bool:
        """Check if holdings are available for an ISIN (cache or adapter)."""
        if self._use_cache:
            if self.holdings_cache.has_holdings(isin):
                return True
        # Check if adapter exists
        return self.get_adapter(isin) is not None

    def get_cache_stats(self) -> dict:
        """Get statistics about the holdings cache."""
        if self._use_cache:
            return self.holdings_cache.get_cache_stats()
        return {"cache_disabled": True}
