# core/services/enricher.py
"""
Enricher Service - Adds sector, geography, and asset class metadata.

UI-agnostic, reusable with React.
"""

from typing import Dict, List, Tuple
import pandas as pd

from ..errors import PipelineError, ErrorPhase, ErrorType
from ..utils import get_isin_column
from ...prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class Enricher:
    """Enriches holdings with sector, geography, asset class. UI-agnostic."""

    def __init__(self, enrichment_service=None):
        """
        Initialize with enrichment service.
        
        Args:
            enrichment_service: Service for fetching metadata (optional)
        """
        self.enrichment_service = enrichment_service

    def enrich(
        self, holdings_map: Dict[str, pd.DataFrame]
    ) -> Tuple[Dict[str, pd.DataFrame], List[PipelineError]]:
        """
        Enrich holdings with metadata (Sector, Geography).

        Args:
            holdings_map: Dictionary mapping ETF ISINs to their holdings DataFrames

        Returns:
            Tuple of (enriched_map, errors)
            - enriched_map: Updated holdings map with metadata columns
            - errors: List of PipelineError for any failures
        """
        enriched_map = {}
        errors = []
        
        if not isinstance(holdings_map, dict):
            errors.append(PipelineError(
                phase=ErrorPhase.ENRICHMENT,
                error_type=ErrorType.VALIDATION_FAILED,
                item="holdings_map",
                message="Input holdings_map must be a dictionary"
            ))
            return {}, errors

        for etf_isin, holdings in holdings_map.items():
            try:
                enriched = self._enrich_holdings(holdings)
                enriched_map[etf_isin] = enriched
                logger.debug(f"Enriched {etf_isin}: {len(enriched)} holdings")
            except Exception as e:
                errors.append(PipelineError(
                    phase=ErrorPhase.ENRICHMENT,
                    error_type=ErrorType.API_FAILURE,
                    item=etf_isin,
                    message=str(e),
                    fix_hint="Check API connectivity or add manual enrichment",
                ))
                # Keep original holdings even if enrichment fails
                enriched_map[etf_isin] = holdings

        logger.info(f"Enrichment complete: {len(enriched_map)} ETFs, {len(errors)} errors")
        return enriched_map, errors

    def _enrich_holdings(self, holdings: pd.DataFrame) -> pd.DataFrame:
        """
        Add sector, geography, asset_class columns if missing.
        
        Args:
            holdings: DataFrame with holdings data
            
        Returns:
            Enriched DataFrame
        """
        enriched = holdings.copy()
        
        # Ensure required columns exist with defaults
        if "sector" not in enriched.columns:
            enriched["sector"] = "Unknown"
        if "geography" not in enriched.columns:
            enriched["geography"] = "Unknown"
        if "asset_class" not in enriched.columns:
            enriched["asset_class"] = "Equity"
            
        # If enrichment service is available, use it
        if self.enrichment_service:
            try:
                isin_col = get_isin_column(enriched)
                isins = enriched[isin_col].dropna().unique().tolist()
                
                metadata = self.enrichment_service.get_metadata_batch(isins)
                
                for idx, row in enriched.iterrows():
                    isin = row.get(isin_col)
                    if isin and isin in metadata:
                        meta = metadata[isin]
                        enriched.at[idx, "sector"] = meta.get("sector", enriched.at[idx, "sector"])
                        enriched.at[idx, "geography"] = meta.get("geography", enriched.at[idx, "geography"])
                        enriched.at[idx, "asset_class"] = meta.get("asset_class", enriched.at[idx, "asset_class"])
            except Exception as e:
                logger.warning(f"Enrichment service failed: {e}")
        
        return enriched
