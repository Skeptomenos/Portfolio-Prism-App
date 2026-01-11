# core/services/decomposer.py
from typing import Dict, List, Tuple, Optional, Any, Callable, TYPE_CHECKING
import pandas as pd
import threading

from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType
from portfolio_src.core.utils import get_isin_column, SchemaNormalizer
from portfolio_src.data.hive_client import get_hive_client
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.prism_utils.isin_validator import is_valid_isin

if TYPE_CHECKING:
    from portfolio_src.data.resolution import ISINResolver

logger = get_logger(__name__)


def _contribute_to_hive_async(isin: str, holdings: pd.DataFrame) -> None:
    """Fire-and-forget Hive contribution using daemon thread."""

    def _do_contribute():
        try:
            hive_client = get_hive_client()
            if hive_client.is_configured:
                hive_client.contribute_etf_holdings(isin, holdings)
                logger.debug(f"Async Hive contribution completed for {isin}")
        except Exception as e:
            logger.debug(f"Async Hive contribution failed for {isin}: {e}")

    thread = threading.Thread(target=_do_contribute, daemon=True)
    thread.start()
    logger.debug(f"Started async Hive contribution for {isin}")


def _normalize_weight_format(holdings: pd.DataFrame, etf_isin: str) -> pd.DataFrame:
    """
    Auto-detect and normalize weight format from decimal (0.05) to percentage (5.0).

    Detection heuristic: if max(weights) <= 1.0 AND sum(weights) <= 2.0,
    it's decimal format and should be multiplied by 100.
    """
    weight_col = None
    for col in ["weight", "Weight", "weight_pct", "Weight_Pct"]:
        if col in holdings.columns:
            weight_col = col
            break

    if weight_col is None:
        return holdings

    weights = pd.to_numeric(holdings[weight_col], errors="coerce").fillna(0.0)

    if weights.empty:
        return holdings

    max_weight = weights.max()
    sum_weight = weights.sum()

    if max_weight <= 1.0 and sum_weight <= 2.0:
        logger.info(
            f"Detected decimal weight format for {etf_isin} "
            f"(max={max_weight:.4f}, sum={sum_weight:.4f}). Converting to percentage."
        )
        holdings = holdings.copy()
        holdings[weight_col] = weights * 100
        return holdings

    return holdings


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
        self._etf_sources: Dict[str, str] = {}

    def decompose(
        self,
        etf_positions: pd.DataFrame,
        progress_callback: Optional[Callable[[str, float], None]] = None,
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

        total_etfs = len(normalized_etf_positions)
        for idx, (_, etf) in enumerate(normalized_etf_positions.iterrows()):
            isin = str(etf["isin"])
            etf_name = str(etf.get("name", etf.get("Name", isin)))[:30]

            if progress_callback:
                progress_callback(
                    f"Decomposing ETF {idx + 1}/{total_etfs}: {etf_name}...",
                    (idx / total_etfs),
                )

            try:
                holdings, source, error = self._get_holdings(isin)

                if error:
                    errors.append(error)
                elif holdings is not None and not holdings.empty:
                    holdings_map[isin] = holdings
                    self._etf_sources[isin] = source or "unknown"
                    logger.info(
                        f"Decomposed ETF {isin}: {len(holdings)} holdings extracted (source: {source})"
                    )
                else:
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
    ) -> Tuple[Optional[pd.DataFrame], Optional[str], Optional[PipelineError]]:
        """
        Fetch holdings for an ETF from cache, Hive, or adapter.

        Returns:
            Tuple of (holdings_df, source, error) where source is one of:
            - "cached" - from local cache
            - "hive" - from Hive community database
            - "{adapter_name}_adapter" - from provider adapter (e.g., "ishares_adapter")
        """
        holdings = None
        source = None

        try:
            cached = self.holdings_cache.get_holdings(
                isin, adapter_registry=self.adapter_registry
            )
            if cached is not None and not cached.empty:
                holdings = cached
                source = "cached"
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
                    return (
                        None,
                        None,
                        PipelineError(
                            phase=ErrorPhase.ETF_DECOMPOSITION,
                            error_type=ErrorType.NO_ADAPTER,
                            item=isin,
                            message="No adapter registered for this ISIN",
                            fix_hint=f"Add adapter or upload to manual_holdings/{isin}.csv",
                        ),
                    )

                adapter_holdings = adapter.fetch_holdings(isin)
                if adapter_holdings is not None and not adapter_holdings.empty:
                    try:
                        self.holdings_cache._save_to_local_cache(
                            isin, adapter_holdings, source="adapter"
                        )
                    except Exception as e:
                        logger.warning(f"Failed to cache result for {isin}: {e}")

                    _contribute_to_hive_async(isin, adapter_holdings)

                    holdings = adapter_holdings
                    adapter_name = type(adapter).__name__.lower().replace("adapter", "")
                    source = f"{adapter_name}_adapter"
                else:
                    return (
                        None,
                        None,
                        PipelineError(
                            phase=ErrorPhase.ETF_DECOMPOSITION,
                            error_type=ErrorType.API_FAILURE,
                            item=isin,
                            message="Adapter returned empty holdings",
                            fix_hint="Check provider website or API limits",
                        ),
                    )

            except Exception as e:
                logger.warning(f"Adapter failed for {isin}: {e}")
                return (
                    None,
                    None,
                    PipelineError(
                        phase=ErrorPhase.ETF_DECOMPOSITION,
                        error_type=ErrorType.API_FAILURE,
                        item=isin,
                        message=f"Adapter fetch failed: {str(e)}",
                        fix_hint="Check network connectivity",
                    ),
                )

        if holdings is not None and not holdings.empty:
            holdings = _normalize_weight_format(holdings, isin)
            holdings, resolution_stats = self._resolve_holdings_isins(holdings, isin)
            self._resolution_stats[isin] = resolution_stats

        return holdings, source, None

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

        # Initialize columns
        if "isin" not in holdings.columns:
            holdings["isin"] = None
        if "resolution_status" not in holdings.columns:
            holdings["resolution_status"] = None
        if "resolution_detail" not in holdings.columns:
            holdings["resolution_detail"] = None
        # Add provenance columns
        if "resolution_source" not in holdings.columns:
            holdings["resolution_source"] = None
        if "resolution_confidence" not in holdings.columns:
            holdings["resolution_confidence"] = 0.0

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
                holdings.at[idx, "resolution_status"] = "resolved"
                holdings.at[idx, "resolution_detail"] = "existing"
                holdings.at[idx, "resolution_source"] = "provider"
                holdings.at[idx, "resolution_confidence"] = 1.0
                continue

            if not ticker:
                unresolved_count += 1
                holdings.at[idx, "resolution_status"] = "skipped"
                holdings.at[idx, "resolution_detail"] = "no_ticker"
                holdings.at[idx, "resolution_source"] = None
                holdings.at[idx, "resolution_confidence"] = 0.0
                continue

            result = self.isin_resolver.resolve(
                ticker=ticker,
                name=name,
                provider_isin=existing_isin if isinstance(existing_isin, str) else None,
                weight=weight,
                etf_isin=etf_isin,
            )

            holdings.at[idx, "isin"] = result.isin
            holdings.at[idx, "resolution_status"] = result.status
            holdings.at[idx, "resolution_detail"] = result.detail
            holdings.at[idx, "resolution_source"] = result.source
            holdings.at[idx, "resolution_confidence"] = result.confidence

            if result.status == "resolved" and result.isin:
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

    def get_etf_sources(self) -> Dict[str, str]:
        """Return mapping of ETF ISIN to decomposition source."""
        return self._etf_sources.copy()
