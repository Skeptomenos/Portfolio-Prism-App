# core/services/decomposer.py
"""
Decomposer Service - Extracts ETF holdings using cache and adapters.

UI-agnostic, reusable with React.
"""

from typing import Dict, List, Tuple, Optional
import pandas as pd

from ..errors import PipelineError, ErrorPhase, ErrorType
from ..utils import get_isin_column
from ...prism_utils.logging_config import get_logger

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
            errors.append(PipelineError(
                phase=ErrorPhase.ETF_DECOMPOSITION,
                error_type=ErrorType.VALIDATION_FAILED,
                item="etf_positions",
                message="Input etf_positions must be a DataFrame"
            ))
            return {}, errors

        # Normalize column names (must be done before checking for empty or iterating)
        isin_col = get_isin_column(etf_positions)

        if etf_positions.empty:
            return holdings_map, errors

        for _, etf in etf_positions.iterrows():
            isin = str(etf[isin_col])
            try:
                holdings, error = self._get_holdings(isin)
                
                if error:
                    errors.append(error)
                elif holdings is not None and not holdings.empty:
                    holdings_map[isin] = holdings
                    logger.info(f"Decomposed {isin}: {len(holdings)} holdings")
                else:
                    # Should ideally be caught by error return, but fallback here
                    errors.append(PipelineError(
                        phase=ErrorPhase.ETF_DECOMPOSITION,
                        error_type=ErrorType.CACHE_MISS,
                        item=isin,
                        message="No holdings data found (unknown reason)",
                        fix_hint=f"Upload to manual_holdings/{isin}.csv",
                    ))
            except Exception as e:
                errors.append(PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.UNKNOWN,
                    item=isin,
                    message=f"Decomposition crash: {str(e)}",
                    fix_hint="Check logs for stack trace",
                ))

        logger.info(f"Decomposition complete: {len(holdings_map)} ETFs, {len(errors)} errors")
        return holdings_map, errors

    def _get_holdings(self, isin: str) -> Tuple[Optional[pd.DataFrame], Optional[PipelineError]]:
        """
        Try cache first, then adapter.
        
        Args:
            isin: ETF ISIN to look up
            
        Returns:
            Tuple of (holdings_df, error)
            Exactly one will be None.
        """
        # Try cache first
        try:
            cached = self.holdings_cache.get_holdings(isin, adapter_registry=self.adapter_registry)
            if cached is not None and not cached.empty:
                return cached, None
        except Exception as e:
            logger.warning(f"Cache lookup failed for {isin}: {e}")

        # Try adapter
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
                # Cache the result
                try:
                    self.holdings_cache._save_to_local_cache(isin, holdings, source="adapter")
                except Exception as e:
                    logger.warning(f"Failed to cache result for {isin}: {e}")
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
