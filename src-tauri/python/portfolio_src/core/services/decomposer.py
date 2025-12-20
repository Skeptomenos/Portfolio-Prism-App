# core/services/decomposer.py
"""
Decomposer Service - Extracts ETF holdings using cache and adapters.

UI-agnostic, reusable with React.
"""

from typing import Dict, List, Tuple, Optional
import pandas as pd

from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType
from portfolio_src.core.utils import get_isin_column, SchemaNormalizer
from portfolio_src.data.hive_client import get_hive_client
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class Decomposer:
    """Decomposes ETFs into underlying holdings. UI-agnostic."""

    def __init__(self, holdings_cache, adapter_registry):
        """
        Initialize with dependencies.

        Args:
            holdings_cache: HoldingsCache instance for cached ETF data
            adapter_registry: AdapterRegistry for fetching live data
        """
        self.holdings_cache = holdings_cache
        self.adapter_registry = adapter_registry

    def decompose(
        self, etf_positions: pd.DataFrame
    ) -> Tuple[Dict[str, pd.DataFrame], List[PipelineError]]:
        """
        Decompose ETFs into their underlying holdings.

        Args:
            etf_positions: DataFrame containing ETF positions (must have ISIN column)

        Returns:
            Tuple of (holdings_map, errors)
            - holdings_map: Dict mapping ETF ISIN to DataFrame of holdings
            - errors: List of PipelineError for any failures
        """
        holdings_map = {}
        errors = []

        if not isinstance(etf_positions, pd.DataFrame):
            errors.append(
                PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="etf_positions",
                    message="Input etf_positions must be a DataFrame",
                )
            )
            return {}, errors

        # Normalize schema first
        normalized_etf_positions = SchemaNormalizer.normalize_columns(etf_positions)

        # Validate required columns
        try:
            SchemaNormalizer.validate_schema(
                normalized_etf_positions, ["isin"], "decomposer"
            )
        except Exception as e:
            errors.append(
                PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="etf_positions",
                    message=f"Schema validation failed: {e}",
                )
            )
            return holdings_map, errors

        if normalized_etf_positions.empty:
            return holdings_map, errors

        for _, etf in normalized_etf_positions.iterrows():
            isin = str(etf["isin"])
            try:
                holdings, error = self._get_holdings(isin)

                if error:
                    errors.append(error)
                elif holdings is not None and not holdings.empty:
                    holdings_map[isin] = holdings
                    logger.info(
                        f"Decomposed ETF {isin}: {len(holdings)} holdings extracted"
                    )
                else:
                    # Should ideally be caught by error return, but fallback here
                    errors.append(
                        PipelineError(
                            phase=ErrorPhase.ETF_DECOMPOSITION,
                            error_type=ErrorType.CACHE_MISS,
                            item=isin,
                            message="No holdings data found (unknown reason)",
                            fix_hint=f"Upload to manual_holdings/{isin}.csv",
                        )
                    )
            except Exception as e:
                errors.append(
                    PipelineError(
                        phase=ErrorPhase.ETF_DECOMPOSITION,
                        error_type=ErrorType.UNKNOWN,
                        item=isin,
                        message=f"Decomposition crash: {str(e)}",
                        fix_hint="Check logs for stack trace",
                    )
                )

        logger.info(
            f"Decomposition complete: {len(holdings_map)} ETFs, {len(errors)} errors"
        )
        return holdings_map, errors

    def _get_holdings(
        self, isin: str
    ) -> Tuple[Optional[pd.DataFrame], Optional[PipelineError]]:
        """
        Try cache first, then Hive, then adapter.

        Args:
            isin: ETF ISIN to look up

        Returns:
            Tuple of (holdings_df, error)
            Exactly one will be None.
        """
        # 1. Try Local Cache first
        try:
            cached = self.holdings_cache.get_holdings(
                isin, adapter_registry=self.adapter_registry
            )
            if cached is not None and not cached.empty:
                return cached, None
        except Exception as e:
            logger.warning(f"Local cache lookup failed for {isin}: {e}")

        # 2. Try Hive Community
        try:
            hive_client = get_hive_client()
            if hive_client.is_configured:
                hive_holdings = hive_client.get_etf_holdings(isin)
                if hive_holdings is not None and not hive_holdings.empty:
                    logger.info(f"Resolved {isin} via Hive Community")
                    # Save to local cache for future offline use
                    self.holdings_cache._save_to_local_cache(
                        isin, hive_holdings, source="hive"
                    )
                    return hive_holdings, None
        except Exception as e:
            logger.warning(f"Hive lookup failed for {isin}: {e}")

        # 3. Try Adapter (Scraper)
        try:
            adapter = self.adapter_registry.get_adapter(isin)
            if not adapter:
                return None, PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.NO_ADAPTER,
                    item=isin,
                    message="No adapter registered for this ISIN",
                    fix_hint=f"Add adapter or upload to manual_holdings/{isin}.csv",
                )

            holdings = adapter.fetch_holdings(isin)
            if holdings is not None and not holdings.empty:
                # Cache the result locally
                try:
                    self.holdings_cache._save_to_local_cache(
                        isin, holdings, source="adapter"
                    )
                except Exception as e:
                    logger.warning(f"Failed to cache result for {isin}: {e}")

                # Contribute to Hive for the community
                try:
                    hive_client = get_hive_client()
                    if hive_client.is_configured:
                        hive_client.contribute_etf_holdings(isin, holdings)
                except Exception as e:
                    logger.debug(f"Failed to contribute discovery to Hive: {e}")

                return holdings, None
            else:
                return None, PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.API_FAILURE,
                    item=isin,
                    message="Adapter returned empty holdings",
                    fix_hint="Check provider website or API limits",
                )

        except Exception as e:
            logger.warning(f"Adapter failed for {isin}: {e}")
            return None, PipelineError(
                phase=ErrorPhase.ETF_DECOMPOSITION,
                error_type=ErrorType.API_FAILURE,
                item=isin,
                message=f"Adapter fetch failed: {str(e)}",
                fix_hint="Check network connectivity",
            )
