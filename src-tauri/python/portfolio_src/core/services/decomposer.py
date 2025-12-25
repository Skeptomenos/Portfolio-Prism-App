# core/services/decomposer.py
from typing import Dict, List, Tuple, Optional, Any, TYPE_CHECKING
import pandas as pd

from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType
from portfolio_src.core.utils import get_isin_column, SchemaNormalizer
from portfolio_src.data.hive_client import get_hive_client
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.prism_utils.isin_validator import is_valid_isin

if TYPE_CHECKING:
    from portfolio_src.data.resolution import ISINResolver

logger = get_logger(__name__)


class Decomposer:
    """Decomposes ETFs into underlying holdings. UI-agnostic."""

    def __init__(
        self,
        holdings_cache,
        adapter_registry,
        isin_resolver: Optional["ISINResolver"] = None,
    ):
        self.holdings_cache = holdings_cache
        self.adapter_registry = adapter_registry
        self.isin_resolver = isin_resolver
        self._resolution_stats: Dict[str, Dict[str, Any]] = {}

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
        holdings = None
        source = None

        try:
            cached = self.holdings_cache.get_holdings(
                isin, adapter_registry=self.adapter_registry
            )
            if cached is not None and not cached.empty:
                holdings = cached
                source = "cache"
        except Exception as e:
            logger.warning(f"Local cache lookup failed for {isin}: {e}")

        if holdings is None:
            try:
                hive_client = get_hive_client()
                if hive_client.is_configured:
                    hive_holdings = hive_client.get_etf_holdings(isin)
                    if hive_holdings is not None and not hive_holdings.empty:
                        logger.info(f"Resolved {isin} via Hive Community")
                        self.holdings_cache._save_to_local_cache(
                            isin, hive_holdings, source="hive"
                        )
                        holdings = hive_holdings
                        source = "hive"
            except Exception as e:
                logger.warning(f"Hive lookup failed for {isin}: {e}")

        if holdings is None:
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

                adapter_holdings = adapter.fetch_holdings(isin)
                if adapter_holdings is not None and not adapter_holdings.empty:
                    try:
                        self.holdings_cache._save_to_local_cache(
                            isin, adapter_holdings, source="adapter"
                        )
                    except Exception as e:
                        logger.warning(f"Failed to cache result for {isin}: {e}")

                    try:
                        hive_client = get_hive_client()
                        if hive_client.is_configured:
                            hive_client.contribute_etf_holdings(isin, adapter_holdings)
                    except Exception as e:
                        logger.debug(f"Failed to contribute discovery to Hive: {e}")

                    holdings = adapter_holdings
                    source = "adapter"
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

        if holdings is not None and not holdings.empty:
            holdings, resolution_stats = self._resolve_holdings_isins(holdings, isin)
            self._resolution_stats[isin] = resolution_stats

        return holdings, None

    def _resolve_holdings_isins(
        self,
        holdings: pd.DataFrame,
        etf_isin: str,
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        if self.isin_resolver is None:
            logger.debug(
                f"No ISINResolver configured, skipping resolution for {etf_isin}"
            )
            return holdings, {"skipped": True}

        if holdings.empty:
            return holdings, {"total": 0, "resolved": 0, "unresolved": 0}

        if "ticker" not in holdings.columns:
            logger.warning(
                f"Holdings for {etf_isin} missing 'ticker' column, skipping resolution"
            )
            return holdings, {"skipped": True, "reason": "no_ticker_column"}

        holdings = holdings.copy()
        if "isin" not in holdings.columns:
            holdings["isin"] = None

        weight_col = None
        for col in ["weight", "Weight", "weight_pct", "Weight_Pct"]:
            if col in holdings.columns:
                weight_col = col
                break

        resolved_count = 0
        unresolved_count = 0
        resolution_sources: Dict[str, int] = {}

        for idx, row in holdings.iterrows():
            ticker = str(row.get("ticker", "")).strip()
            name = str(row.get("name", "")).strip()
            try:
                weight = (
                    float(row[weight_col]) if weight_col and weight_col in row else 0.0
                )
            except (ValueError, TypeError):
                weight = 0.0

            existing_isin = row.get("isin")
            if (
                existing_isin
                and isinstance(existing_isin, str)
                and is_valid_isin(existing_isin)
            ):
                resolved_count += 1
                resolution_sources["existing"] = (
                    resolution_sources.get("existing", 0) + 1
                )
                continue

            if not ticker:
                unresolved_count += 1
                continue

            result = self.isin_resolver.resolve(
                ticker=ticker,
                name=name,
                provider_isin=existing_isin if isinstance(existing_isin, str) else None,
                weight=weight,
            )

            if result.status == "resolved" and result.isin:
                holdings.at[idx, "isin"] = result.isin
                resolved_count += 1
                source = result.source or result.detail or "unknown"
                resolution_sources[source] = resolution_sources.get(source, 0) + 1
            elif result.status == "skipped":
                resolution_sources["tier2_skipped"] = (
                    resolution_sources.get("tier2_skipped", 0) + 1
                )
            else:
                unresolved_count += 1
                logger.debug(f"Failed to resolve {ticker} ({name}): {result.detail}")

        stats = {
            "total": len(holdings),
            "resolved": resolved_count,
            "unresolved": unresolved_count,
            "by_source": resolution_sources,
        }

        logger.info(
            f"Resolution for {etf_isin}: {resolved_count}/{len(holdings)} resolved, "
            f"{unresolved_count} unresolved"
        )

        return holdings, stats

    def get_resolution_stats(self) -> Dict[str, Any]:
        if not self._resolution_stats:
            return {"total": 0, "resolved": 0, "unresolved": 0, "etfs": {}}

        total = 0
        resolved = 0
        unresolved = 0
        all_sources: Dict[str, int] = {}

        for etf_isin, stats in self._resolution_stats.items():
            if stats.get("skipped"):
                continue
            total += stats.get("total", 0)
            resolved += stats.get("resolved", 0)
            unresolved += stats.get("unresolved", 0)

            for source, count in stats.get("by_source", {}).items():
                all_sources[source] = all_sources.get(source, 0) + count

        return {
            "total": total,
            "resolved": resolved,
            "unresolved": unresolved,
            "resolution_rate": f"{(resolved / total * 100):.1f}%"
            if total > 0
            else "N/A",
            "by_source": all_sources,
            "etfs": self._resolution_stats,
        }
