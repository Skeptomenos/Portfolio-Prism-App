# core/services/enricher.py
"""
Enricher Service - Adds sector, geography, and asset class metadata.

UI-agnostic, reusable with React.
"""

from typing import Dict, List, Tuple, Any, Optional, Callable
import pandas as pd
from dataclasses import dataclass

from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType, SchemaError
from portfolio_src.core.utils import get_isin_column, SchemaNormalizer
from portfolio_src.data.hive_client import get_hive_client, AssetEntry
from portfolio_src.data.enrichment import EnrichmentService
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class EnrichmentResult:
    """Result of a batch enrichment operation."""

    data: Dict[str, Dict[str, Any]]
    sources: Dict[str, str]


class HiveEnrichmentService:
    """
    Multi-tier enrichment service that prioritizes Supabase Hive.

    Flow: Hive (Community) -> API Fallbacks (Finnhub/yfinance) -> Contribution
    """

    def __init__(self):
        self.hive_client = get_hive_client()
        self.fallback_service = EnrichmentService()

    def get_metadata_batch(self, isins: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Fetch metadata for a batch of ISINs using the multi-tier strategy.
        """
        if not isins:
            return {}

        # 1. Try Hive first
        hive_results = self.hive_client.batch_lookup(isins)

        # Convert AssetEntry objects to dicts and identify gaps
        metadata = {}
        missing_isins = []
        sources = {}

        for isin in isins:
            asset = hive_results.get(isin)
            if asset and asset.name != "Unknown":
                metadata[isin] = {
                    "isin": asset.isin,
                    "name": asset.name,
                    "sector": asset.asset_class,  # Map asset_class to sector if specific sector missing
                    "geography": "Unknown",  # Hive schema needs enhancement for geography
                    "asset_class": asset.asset_class,
                }
                sources[isin] = "hive"
            else:
                missing_isins.append(isin)

        # 2. Fill gaps with fallback APIs
        if missing_isins:
            logger.info(
                f"Hive miss for {len(missing_isins)} assets. Calling fallback APIs for: {', '.join(missing_isins[:3])}{'...' if len(missing_isins) > 3 else ''}"
            )
            fallback_results = self.fallback_service.get_metadata_batch(missing_isins)

            new_contributions = []
            for isin, data in fallback_results.items():
                metadata[isin] = data
                sources[isin] = data.get("source", "api")

                # Prepare for Hive contribution
                new_contributions.append(
                    AssetEntry(
                        isin=isin,
                        name=data.get("name", "Unknown"),
                        asset_class=data.get("asset_class", "Stock"),
                        base_currency="EUR",  # Default for TR users
                        enrichment_status="active",
                    )
                )

            # 3. Contribute new discoveries back to Hive
            if new_contributions:
                logger.info(f"Contributing {len(new_contributions)} new assets to Hive")
                self.hive_client.batch_contribute(new_contributions)

        return metadata


class Enricher:
    """Enriches holdings with sector, geography, asset class. UI-agnostic."""

    def __init__(self, enrichment_service=None):
        """
        Initialize with enrichment service.

        Args:
            enrichment_service: Service for fetching metadata (optional)
        """
        # Use HiveEnrichmentService by default if not provided
        self.enrichment_service = enrichment_service or HiveEnrichmentService()

    def enrich(
        self,
        holdings_map: Dict[str, pd.DataFrame],
        progress_callback: Optional[Callable[[str, float, int, int], None]] = None,
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
            errors.append(
                PipelineError(
                    phase=ErrorPhase.ENRICHMENT,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="holdings_map",
                    message="Input holdings_map must be a dictionary",
                )
            )
            return {}, errors

        total_etfs = len(holdings_map)
        total_securities = sum(len(h) for h in holdings_map.values())
        processed_securities = 0

        for idx, (etf_isin, holdings) in enumerate(holdings_map.items()):
            if progress_callback:
                progress_callback(
                    f"Enriching ETF {idx + 1}/{total_etfs} ({processed_securities}/{total_securities} securities)...",
                    idx / total_etfs,
                    processed_securities,
                    total_securities,
                )

            try:
                enriched = self._enrich_holdings(holdings)
                enriched_map[etf_isin] = enriched
                processed_securities += len(holdings)
                logger.debug(f"Enriched {etf_isin}: {len(enriched)} holdings")
            except Exception as e:
                errors.append(
                    PipelineError(
                        phase=ErrorPhase.ENRICHMENT,
                        error_type=ErrorType.API_FAILURE,
                        item=etf_isin,
                        message=str(e),
                        fix_hint="Check API connectivity or add manual enrichment",
                    )
                )
                enriched_map[etf_isin] = holdings
                processed_securities += len(holdings)

        logger.info(
            f"Enrichment complete: {len(enriched_map)} ETFs processed, {len(errors)} errors"
        )
        return enriched_map, errors

    def enrich_positions(
        self, positions: pd.DataFrame
    ) -> Tuple[pd.DataFrame, List[PipelineError]]:
        """
        Enrich direct stock positions with sector/geography metadata.

        Args:
            positions: DataFrame of direct stock positions

        Returns:
            Tuple of (enriched_positions, errors)
        """
        errors: List[PipelineError] = []

        if positions.empty:
            return positions, errors

        try:
            enriched = self._enrich_holdings(positions)
            logger.info(f"Enriched {len(enriched)} direct positions")
            return enriched, errors
        except Exception as e:
            errors.append(
                PipelineError(
                    phase=ErrorPhase.ENRICHMENT,
                    error_type=ErrorType.API_FAILURE,
                    item="direct_positions",
                    message=str(e),
                    fix_hint="Check API connectivity",
                )
            )
            return positions, errors

    def _enrich_holdings(self, holdings: pd.DataFrame) -> pd.DataFrame:
        """
        Add sector, geography, asset_class columns if missing.

        Args:
            holdings: DataFrame with holdings data

        Returns:
            Enriched DataFrame
        """
        # Normalize schema first
        normalized_holdings = SchemaNormalizer.normalize_columns(holdings)

        # Validate required columns
        try:
            SchemaNormalizer.validate_schema(normalized_holdings, ["isin"], "enricher")
        except SchemaError as e:
            logger.error(f"Schema validation failed in enricher: {e}")
            raise e

        enriched = normalized_holdings.copy()

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
                isins = enriched["isin"].dropna().unique().tolist()

                metadata = self.enrichment_service.get_metadata_batch(isins)

                for idx, row in enriched.iterrows():
                    isin = row.get("isin")
                    if isin and isin in metadata:
                        meta = metadata[isin]
                        enriched.at[idx, "sector"] = meta.get(
                            "sector", enriched.at[idx, "sector"]
                        )
                        enriched.at[idx, "geography"] = meta.get(
                            "geography", enriched.at[idx, "geography"]
                        )
                        enriched.at[idx, "asset_class"] = meta.get(
                            "asset_class", enriched.at[idx, "asset_class"]
                        )
            except Exception as e:
                logger.warning(f"Enrichment service failed: {e}")

        return enriched
