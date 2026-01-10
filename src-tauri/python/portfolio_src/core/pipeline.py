# core/pipeline.py
"""
Analytics Pipeline Orchestrator.

Thin coordinator that:
- Calls services in order
- Emits progress via callback
- Collects errors into List[PipelineError]
- Writes outputs and error logs

Contains NO business logic — that lives in the services.
"""

import json
import os
import time
from typing import Callable, Optional, List, Dict, Any, Tuple, Set, cast
from pathlib import Path
import pandas as pd

from portfolio_src.core.errors import (
    PipelineError,
    PipelineResult,
    ErrorPhase,
    ErrorType,
)
from portfolio_src.core.contracts import (
    ValidationGates,
    LoadPhaseOutput,
    DecomposePhaseOutput,
    EnrichPhaseOutput,
    AggregatePhaseOutput,
    ETFDecomposition,
    AggregatedExposureRecord,
    DataQuality,
    IssueSeverity,
    dataframe_to_loaded_positions,
    dataframe_to_holdings,
)
from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.services.enricher import Enricher
from portfolio_src.core.services.aggregator import Aggregator
from portfolio_src.config import (
    PIPELINE_ERRORS_PATH,
    TRUE_EXPOSURE_REPORT,
    DIRECT_HOLDINGS_REPORT,
    PIPELINE_HEALTH_PATH,
    HOLDINGS_BREAKDOWN_PATH,
    DATA_DIR,
)
from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.core.utils import (
    calculate_portfolio_total_value,
    calculate_position_values,
    get_weight_column,
    get_isin_column,
    get_name_column,
    get_total_value_column,
    get_unit_price_column,
    write_json_atomic,
)
from portfolio_src.headless.transports.echo_bridge import (
    broadcast_summary,
    PipelineSummaryData,
    HoldingsSummary,
    DecompositionSummary,
    ETFDecompositionDetail,
    ResolutionSummary,
    TimingSummary,
    UnresolvedItem,
)

logger = get_logger(__name__)


class PipelineMonitor:
    """Tracks pipeline performance, community hit rates, and data provenance."""

    def __init__(self):
        self.start_time = time.time()
        self.phase_times: Dict[str, float] = {}
        # Track ISINs by source for provenance (sets for deduplication)
        self.hive_hits: Set[str] = set()
        self.hive_misses: Set[str] = set()
        self.api_calls: Set[str] = set()
        self.contributions: Set[str] = set()  # ISINs contributed to Hive this run

    def record_phase(self, phase: str, duration: float):
        self.phase_times[phase] = round(duration, 3)

    def record_enrichment(self, isin: str, source: str):
        """Record enrichment source for an ISIN (deduplicated by set)."""
        if source == "hive":
            self.hive_hits.add(isin)
        else:
            self.hive_misses.add(isin)
            if source not in ("unknown", ""):
                self.api_calls.add(isin)

    def record_contribution(self, isin: str):
        """Record an ISIN that was contributed to Hive during this run."""
        self.contributions.add(isin)

    def get_metrics(self) -> Dict[str, Any]:
        total = len(self.hive_hits) + len(self.hive_misses)
        hit_rate = (len(self.hive_hits) / total * 100) if total > 0 else 0.0
        return {
            "execution_time_seconds": round(time.time() - self.start_time, 2),
            "phase_durations": self.phase_times,
            "hive_hit_rate": round(hit_rate, 1),
            "api_fallback_rate": round(100.0 - hit_rate, 1) if total > 0 else 0.0,
            "total_assets_processed": total,
            "hive_hits_count": len(self.hive_hits),
            "hive_misses_count": len(self.hive_misses),
            "api_calls_count": len(self.api_calls),
            "contributions_count": len(self.contributions),
        }

    def get_hive_log(self) -> Dict[str, List[str]]:
        """Return detailed Hive interaction log for UI."""
        return {
            "hits": sorted(self.hive_hits),
            "contributions": sorted(self.contributions),
        }


class Pipeline:
    """
    Thin orchestrator that coordinates services.

    Contains NO business logic — only:
    - Calls services in order
    - Emits progress via callback
    - Collects errors
    - Writes outputs
    """

    def __init__(self, data_dir: Optional[Path] = None, debug: bool = False):
        """
        Initialize the pipeline.

        Args:
            data_dir: Optional override for data directory
            debug: Enable debug mode (writes intermediate snapshots)
        """
        # Dev-only: load .env if not in production
        if not os.getenv("PRISM_DATA_DIR"):
            try:
                from dotenv import load_dotenv

                load_dotenv()
            except ImportError:
                pass

        self.data_dir = data_dir or DATA_DIR
        self.debug = debug or os.getenv("DEBUG_PIPELINE", "false").lower() == "true"

        # Services are initialized lazily when run() is called
        self._decomposer: Optional[Decomposer] = None
        self._enricher: Optional[Enricher] = None
        self._aggregator: Optional[Aggregator] = None
        self._validation_gates: Optional[ValidationGates] = None

    def _init_services(self):
        """Initialize services with their dependencies."""
        if self._decomposer and self._enricher and self._aggregator:
            logger.debug("Services already initialized, skipping.")
            return

        from portfolio_src.data.holdings_cache import get_holdings_cache
        from portfolio_src.adapters.registry import AdapterRegistry
        from portfolio_src.core.services.enricher import HiveEnrichmentService
        from portfolio_src.data.resolution import ISINResolver

        holdings_cache = get_holdings_cache()
        adapter_registry = AdapterRegistry()
        enrichment_service = HiveEnrichmentService()

        isin_resolver = ISINResolver(tier1_threshold=0.5)
        self._decomposer = Decomposer(holdings_cache, adapter_registry, isin_resolver)
        self._enricher = Enricher(enrichment_service)
        self._aggregator = Aggregator()

    def _dump_debug_snapshot(self, phase: str, data: Any):
        """Dump intermediate data for debugging."""
        if not self.debug:
            return

        try:
            debug_dir = self.data_dir / "outputs" / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)

            if isinstance(data, pd.DataFrame):
                path = debug_dir / f"{phase}.csv"
                data.to_csv(path, index=False)
                logger.info(f"[DEBUG] Wrote snapshot: {path}")
            elif isinstance(data, dict):
                # Handle dict of DataFrames (holdings_map)
                if data and isinstance(next(iter(data.values())), pd.DataFrame):
                    # Concatenate all holdings into one CSV with parent_isin column
                    all_holdings = []
                    for parent_isin, df in data.items():
                        df_copy = df.copy()
                        df_copy["parent_isin"] = parent_isin
                        all_holdings.append(df_copy)

                    if all_holdings:
                        path = debug_dir / f"{phase}.csv"
                        pd.concat(all_holdings).to_csv(path, index=False)
                        logger.info(f"[DEBUG] Wrote snapshot: {path}")
                else:
                    path = debug_dir / f"{phase}.json"
                    with open(path, "w") as f:
                        json.dump(data, f, indent=2, default=str)
                    logger.info(f"[DEBUG] Wrote snapshot: {path}")
        except Exception as e:
            logger.warning(f"[DEBUG] Failed to write snapshot for {phase}: {e}")

    def _log_validation_issues(self, quality: DataQuality, phase: str) -> None:
        """Log validation issues at appropriate severity levels."""
        for issue in quality.issues:
            message = f"[{phase}] {issue.code}: {issue.message}"
            if issue.severity == IssueSeverity.CRITICAL:
                logger.error(message)
            elif issue.severity == IssueSeverity.HIGH:
                logger.warning(message)
            elif issue.severity == IssueSeverity.MEDIUM:
                logger.info(message)
            else:  # LOW
                logger.debug(message)

    def _build_load_phase_output(
        self, direct_positions: pd.DataFrame, etf_positions: pd.DataFrame
    ) -> LoadPhaseOutput:
        direct_list, direct_issues = dataframe_to_loaded_positions(direct_positions)
        etf_list, etf_issues = dataframe_to_loaded_positions(etf_positions)

        if self._validation_gates:
            self._validation_gates._pipeline_quality.issues.extend(direct_issues.issues)
            self._validation_gates._pipeline_quality.issues.extend(etf_issues.issues)

        return LoadPhaseOutput(direct_positions=direct_list, etf_positions=etf_list)

    def _build_decompose_phase_output(
        self,
        holdings_map: Dict[str, pd.DataFrame],
        etf_positions: pd.DataFrame,
        errors: List[PipelineError],
    ) -> DecomposePhaseOutput:
        decompositions = []
        etf_sources = self._decomposer.get_etf_sources() if self._decomposer else {}

        for isin, holdings_df in holdings_map.items():
            holdings_list, holdings_issues = dataframe_to_holdings(holdings_df)
            if self._validation_gates:
                self._validation_gates._pipeline_quality.issues.extend(
                    holdings_issues.issues
                )

            decompositions.append(
                ETFDecomposition(
                    etf_isin=isin,
                    etf_name=self._get_etf_name(etf_positions, isin),
                    etf_value=self._get_etf_value(etf_positions, isin),
                    holdings=holdings_list,
                    source=etf_sources.get(isin, "unknown"),
                )
            )

        etfs_failed = sum(1 for e in errors if e.phase == ErrorPhase.ETF_DECOMPOSITION)
        return DecomposePhaseOutput(
            decompositions=decompositions, etfs_failed=etfs_failed
        )

    def _build_enrich_phase_output(
        self,
        enriched_holdings: Dict[str, pd.DataFrame],
        direct_positions: pd.DataFrame,
    ) -> EnrichPhaseOutput:
        enriched_decompositions = []

        for isin, holdings_df in enriched_holdings.items():
            holdings_list, holdings_issues = dataframe_to_holdings(holdings_df)
            if self._validation_gates:
                self._validation_gates._pipeline_quality.issues.extend(
                    holdings_issues.issues
                )

            enriched_decompositions.append(
                ETFDecomposition(
                    etf_isin=isin,
                    etf_name="",
                    etf_value=0.0,
                    holdings=holdings_list,
                    source="enriched",
                )
            )

        direct_list, direct_issues = dataframe_to_loaded_positions(direct_positions)
        if self._validation_gates:
            self._validation_gates._pipeline_quality.issues.extend(direct_issues.issues)

        return EnrichPhaseOutput(
            enriched_decompositions=enriched_decompositions,
            enriched_direct=direct_list,
        )

    def run(
        self, progress_callback: Optional[Callable[[str, float, str], None]] = None
    ) -> PipelineResult:
        """
        Run the full analytics pipeline.

        Args:
            progress_callback: Function to call with (status_text, progress_0_to_1, phase)
                             Phase is one of: 'loading', 'decomposition', 'enrichment',
                             'aggregation', 'reporting', 'complete'

        Returns:
            PipelineResult with success status, metrics, and errors
        """
        # Default progress callback if none provided
        if progress_callback is None:
            progress_callback = lambda msg, pct, phase: logger.info(
                f"[{pct * 100:.0f}%] [{phase}] {msg}"
            )

        errors = []
        warnings = []
        harvested_count = 0
        monitor = PipelineMonitor()
        self._validation_gates = ValidationGates()

        # Initialize containers for finally block
        holdings_map = {}
        direct_positions = pd.DataFrame()
        etf_positions = pd.DataFrame()

        try:
            # Initialize services
            start = time.time()
            progress_callback("Initializing services...", 0.05, "loading")
            self._init_services()
            monitor.record_phase("initialization", time.time() - start)

            if not self._decomposer or not self._enricher or not self._aggregator:
                raise RuntimeError("Failed to initialize pipeline services")

            # Phase 1: Load data
            start = time.time()
            progress_callback("Loading portfolio...", 0.1, "loading")
            direct_positions, etf_positions = self._load_portfolio()

            self._dump_debug_snapshot("01_direct_positions", direct_positions)
            self._dump_debug_snapshot("01_etf_positions", etf_positions)

            stock_count = len(direct_positions)
            etf_count = len(etf_positions)
            total_holdings = stock_count + etf_count
            portfolio_value = calculate_portfolio_total_value(
                direct_positions, etf_positions
            )
            if total_holdings > 0:
                value_str = f"€{portfolio_value:,.0f}" if portfolio_value > 0 else ""
                msg = f"Found {total_holdings} holdings ({stock_count} stocks, {etf_count} ETFs)"
                if value_str:
                    msg += f" worth {value_str}"
                progress_callback(msg, 0.15, "loading")
            monitor.record_phase("data_loading", time.time() - start)

            load_output = self._build_load_phase_output(direct_positions, etf_positions)
            load_result = self._validation_gates.validate_load_output(load_output)
            if not load_result.passed:
                self._log_validation_issues(load_result.quality, "DATA_LOADING")

            if direct_positions.empty and etf_positions.empty:
                errors.append(
                    PipelineError(
                        phase=ErrorPhase.DATA_LOADING,
                        error_type=ErrorType.FILE_NOT_FOUND,
                        item="portfolio",
                        message="No portfolio data found",
                        fix_hint="Sync your portfolio from Trade Republic first",
                    )
                )
                self._write_errors(errors)
                return PipelineResult(
                    success=False,
                    etfs_processed=0,
                    etfs_failed=0,
                    total_value=0,
                    errors=errors,
                )

            # Phase 2: Decompose ETFs (via service)
            start = time.time()
            if etf_count > 0:
                progress_callback(
                    f"Decomposing {etf_count} ETFs...", 0.25, "decomposition"
                )
            else:
                progress_callback("No ETFs to decompose", 0.25, "decomposition")

            def decompose_progress(msg: str, pct: float) -> None:
                scaled = 0.25 + (pct * 0.10)
                progress_callback(msg, scaled, "decomposition")

            holdings_map, decompose_errors = self._decomposer.decompose(
                etf_positions, progress_callback=decompose_progress
            )

            self._dump_debug_snapshot("02_decomposed_holdings", holdings_map)

            total_underlying = sum(len(h) for h in holdings_map.values())
            if total_underlying > 0:
                progress_callback(
                    f"Extracted {total_underlying} underlying holdings from {len(holdings_map)} ETFs",
                    0.35,
                    "decomposition",
                )

            resolution_stats = self._decomposer.get_resolution_stats()
            if resolution_stats.get("total", 0) > 0:
                resolved = resolution_stats.get("resolved", 0)
                total = resolution_stats.get("total", 0)
                rate = resolution_stats.get("resolution_rate", "N/A")
                progress_callback(
                    f"Resolved {resolved}/{total} ISINs ({rate})",
                    0.4,
                    "decomposition",
                )

            errors.extend(decompose_errors)
            monitor.record_phase("etf_decomposition", time.time() - start)

            decompose_output = self._build_decompose_phase_output(
                holdings_map, etf_positions, errors
            )
            decompose_result = self._validation_gates.validate_decompose_output(
                decompose_output
            )
            if not decompose_result.passed:
                self._log_validation_issues(
                    decompose_result.quality, "ETF_DECOMPOSITION"
                )

            # Phase 3: Enrich (via service)
            start = time.time()
            total_to_enrich = total_underlying + len(direct_positions)
            progress_callback(
                f"Enriching {total_to_enrich} securities with sector/geography data...",
                0.5,
                "enrichment",
            )

            def enrich_progress(
                msg: str, pct: float, processed: int, total: int
            ) -> None:
                scaled = 0.50 + (pct * 0.10)
                progress_callback(msg, scaled, "enrichment")

            enriched_holdings, enrich_errors = self._enricher.enrich(
                holdings_map, progress_callback=enrich_progress
            )
            errors.extend(enrich_errors)

            self._dump_debug_snapshot("03_enriched_holdings", enriched_holdings)

            direct_positions, direct_enrich_errors = self._enricher.enrich_positions(
                direct_positions
            )
            errors.extend(direct_enrich_errors)

            self._dump_debug_snapshot("03_enriched_direct", direct_positions)

            enriched_count = sum(len(h) for h in enriched_holdings.values()) + len(
                direct_positions
            )
            progress_callback(
                f"Enriched {enriched_count} securities", 0.6, "enrichment"
            )
            monitor.record_phase("enrichment", time.time() - start)

            enrichment_sources = self._enricher.get_sources()
            for isin, source in enrichment_sources.items():
                monitor.record_enrichment(isin, source)

            for isin in self._enricher.get_contributions():
                monitor.record_contribution(isin)

            # Phase 4: Aggregate (via service)
            start = time.time()
            progress_callback("Calculating true exposure...", 0.7, "aggregation")
            exposure_df, agg_errors = self._aggregator.aggregate(
                direct_positions, etf_positions, enriched_holdings
            )

            self._dump_debug_snapshot("04_aggregated_exposure", exposure_df)

            unique_securities = len(exposure_df) if not exposure_df.empty else 0
            progress_callback(
                f"Aggregated {unique_securities} unique securities", 0.8, "aggregation"
            )
            errors.extend(agg_errors)
            monitor.record_phase("aggregation", time.time() - start)

            # Phase 5: Write reports
            start = time.time()
            progress_callback("Writing reports...", 0.85, "reporting")
            self._write_reports(exposure_df, direct_positions, etf_positions)
            monitor.record_phase("reporting", time.time() - start)

            # Phase 6: Auto-harvest (non-fatal)
            progress_callback("Harvesting new securities...", 0.95, "reporting")
            harvested_count = self._harvest()

            progress_callback("Analysis complete!", 1.0, "complete")

            total_value = calculate_portfolio_total_value(
                direct_positions, etf_positions
            )

            summary = self._build_summary(
                direct_positions=direct_positions,
                etf_positions=etf_positions,
                holdings_map=holdings_map,
                decompose_errors=decompose_errors,
                monitor=monitor,
                total_value=total_value,
                decomposer=self._decomposer,
            )
            broadcast_summary(summary)

            return PipelineResult(
                success=True,
                etfs_processed=len(holdings_map),
                etfs_failed=len(decompose_errors),
                total_value=total_value,
                errors=errors,
                warnings=warnings,
                harvested_count=harvested_count,
            )

        except Exception as e:
            logger.error(f"Pipeline failed: {e}", exc_info=True)
            errors.append(
                PipelineError(
                    phase=ErrorPhase.DATA_LOADING,
                    error_type=ErrorType.UNKNOWN,
                    item="pipeline",
                    message=str(e),
                )
            )
            return PipelineResult(
                success=False,
                etfs_processed=0,
                etfs_failed=0,
                total_value=0,
                errors=errors,
            )
        finally:
            try:
                self._write_health_report(
                    errors,
                    direct_positions,
                    etf_positions,
                    holdings_map,
                    monitor,
                    self._decomposer,
                )

                report_holdings = locals().get("enriched_holdings") or holdings_map

                self._write_breakdown_report(
                    direct_positions, etf_positions, report_holdings
                )

                self._write_errors(errors)

            except Exception as e:
                logger.error(f"Failed to write final reports: {e}")

    def _load_portfolio(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        from portfolio_src.data.database import get_positions

        positions = get_positions(portfolio_id=1)
        if not positions:
            return pd.DataFrame(), pd.DataFrame()

        df = pd.DataFrame(positions)

        direct = cast(pd.DataFrame, df[df["asset_class"].str.upper() != "ETF"].copy())
        etfs = cast(pd.DataFrame, df[df["asset_class"].str.upper() == "ETF"].copy())

        return direct, etfs

    def _harvest(self) -> int:
        """Auto-harvest new securities. Non-fatal."""
        try:
            from portfolio_src.core.harvesting import harvest_cache

            return harvest_cache()
        except ImportError:
            logger.debug("Harvesting module not available")
            return 0
        except Exception as e:
            logger.warning(f"Harvesting failed: {e}")
            return 0

    def _write_reports(self, exposure_df, direct_positions, etf_positions):
        """Write exposure report and direct holdings report."""
        TRUE_EXPOSURE_REPORT.parent.mkdir(parents=True, exist_ok=True)

        # Write True Exposure Report
        exposure_df.to_csv(TRUE_EXPOSURE_REPORT, index=False)
        logger.info(f"Wrote exposure report to {TRUE_EXPOSURE_REPORT}")

        # Write Direct Holdings Report (Direct + ETFs)
        try:
            import pandas as pd

            direct_holdings = pd.concat(
                [direct_positions, etf_positions], ignore_index=True
            )
            direct_holdings.to_csv(DIRECT_HOLDINGS_REPORT, index=False)
            logger.info(f"Wrote direct holdings report to {DIRECT_HOLDINGS_REPORT}")
        except Exception as e:
            logger.error(f"Failed to write direct holdings report: {e}")

    def _write_errors(self, errors):
        """Write structured errors to JSON for debugging."""
        PIPELINE_ERRORS_PATH.parent.mkdir(parents=True, exist_ok=True)
        # Note: We now write health report which includes failures, but keeping this for legacy debug
        with open(PIPELINE_ERRORS_PATH, "w") as f:
            json.dump([e.to_dict() for e in errors], f, indent=2)
        if errors:
            logger.info(f"Wrote {len(errors)} errors to {PIPELINE_ERRORS_PATH}")

    def _write_health_report(
        self,
        errors,
        direct_positions,
        etf_positions,
        holdings_map,
        monitor: PipelineMonitor,
        decomposer: Optional[Decomposer] = None,
    ):
        """Write rich pipeline health report for UI with provenance data."""
        from datetime import datetime

        etf_sources = decomposer.get_etf_sources() if decomposer else {}

        per_etf = []
        for isin, holdings in holdings_map.items():
            weight_col = get_weight_column(holdings)
            weight_sum = (
                float(holdings[weight_col].sum())
                if weight_col and not holdings.empty
                else 0.0
            )

            per_etf.append(
                {
                    "isin": isin,
                    "name": self._get_etf_name(etf_positions, isin),
                    "holdings_count": len(holdings),
                    "weight_sum": weight_sum,
                    "status": "success" if not holdings.empty else "failed",
                    "source": etf_sources.get(isin, "unknown"),
                }
            )

        hive_log = monitor.get_hive_log()
        metrics = monitor.get_metrics()

        health_data = {
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "direct_holdings": len(direct_positions),
                "etf_positions": len(etf_positions),
                "etfs_processed": len([e for e in per_etf if e["status"] == "success"]),
                "tier1_resolved": 0,
                "tier1_failed": len(errors),
            },
            "performance": metrics,
            "decomposition": {
                "per_etf": per_etf,
            },
            "enrichment": {
                "stats": {
                    "hive_hits": metrics.get("hive_hits_count", 0),
                    "api_calls": metrics.get("api_calls_count", 0),
                    "new_contributions": metrics.get("contributions_count", 0),
                },
                "hive_log": hive_log,
            },
            "failures": [
                {
                    "severity": "ERROR",
                    "stage": e.phase.value
                    if hasattr(e.phase, "value")
                    else str(e.phase),
                    "item": e.item,
                    "issue": e.error_type.value
                    if hasattr(e.error_type, "value")
                    else str(e.error_type),
                    "error": e.message,
                    "fix": e.fix_hint,
                }
                for e in errors
            ],
        }

        write_json_atomic(PIPELINE_HEALTH_PATH, health_data)
        logger.info(f"Wrote pipeline health report to {PIPELINE_HEALTH_PATH}")

    def _get_etf_name(self, etf_positions: pd.DataFrame, isin: str) -> str:
        """Get ETF name from positions DataFrame."""
        if etf_positions.empty:
            return "Unknown ETF"
        name_col = get_name_column(etf_positions)
        if not name_col:
            return "Unknown ETF"
        match = etf_positions[etf_positions["isin"] == isin]
        if match.empty:
            return "Unknown ETF"
        return str(match.iloc[0].get(name_col, "Unknown ETF"))

    def _get_etf_value(self, etf_positions: pd.DataFrame, isin: str) -> float:
        if etf_positions.empty:
            return 0.0
        match = etf_positions[etf_positions["isin"] == isin]
        if match.empty:
            return 0.0
        row = match.iloc[0]
        quantity = float(row.get("quantity", 0) or 0)
        for price_col in ["current_price", "price", "tr_price"]:
            if price_col in row and row[price_col] is not None:
                return quantity * float(row[price_col])
        return 0.0

    def _write_breakdown_report(self, direct_positions, etf_positions, holdings_map):
        """Write detailed holdings breakdown for UI exploration.

        Includes both direct stock holdings and indirect ETF holdings.
        """
        rows = []

        # Step 1: Add direct stock holdings with parent_isin = "DIRECT"
        if not direct_positions.empty:
            isin_col = get_isin_column(direct_positions)
            name_col = get_name_column(direct_positions)

            # Calculate ALL values vectorized ONCE (not per row) - fixes #36, #37
            position_values = calculate_position_values(direct_positions)

            for idx, row in direct_positions.iterrows():
                try:
                    isin = str(row.get(isin_col, "UNKNOWN")) if isin_col else "UNKNOWN"
                    name = str(row.get(name_col, "Unknown")) if name_col else "Unknown"

                    # Use pre-computed vectorized value
                    value = float(position_values.get(idx, 0.0))

                    rows.append(
                        {
                            "parent_isin": "DIRECT",
                            "parent_name": "Direct Holdings",
                            "child_isin": isin,
                            "child_name": name,
                            "weight_percent": 100.0,
                            "value_eur": value,
                            "sector": str(row.get("sector", "Unknown")),
                            "geography": str(row.get("geography", "Unknown")),
                            "resolution_status": str(
                                row.get("resolution_status", "resolved")
                            ),
                            "resolution_source": str(
                                row.get("resolution_source", "provider")
                            ),
                            "resolution_confidence": float(
                                row.get("resolution_confidence", 1.0) or 1.0
                            ),
                            "resolution_detail": str(row.get("resolution_detail", "")),
                            "ticker": str(row.get("ticker", row.get("Ticker", ""))),
                        }
                    )
                except Exception:
                    continue

            logger.info(f"Added {len(rows)} direct holdings to breakdown report")

        # Step 2: Add indirect holdings from ETFs
        # We need ETF values to calculate proportional value of holdings
        # Map ISIN -> Market Value
        etf_values = {}
        if not etf_positions.empty:
            # Check for explicit value column
            val_col = None
            for col in ["tr_value", "NetValue", "market_value", "net_value", "value"]:
                if col in etf_positions.columns:
                    val_col = col
                    break

            if val_col:
                for _, row in etf_positions.iterrows():
                    val = row[val_col]
                    etf_values[str(row["isin"])] = (
                        float(val) if pd.notnull(val) else 0.0
                    )
            else:
                # Fallback: Calculate from quantity * price
                # We know standard columns from database are 'quantity', 'current_price', 'cost_basis'
                qty_col = "quantity" if "quantity" in etf_positions.columns else None
                price_col = (
                    "current_price"
                    if "current_price" in etf_positions.columns
                    else None
                )
                cost_col = (
                    "cost_basis" if "cost_basis" in etf_positions.columns else None
                )

                if qty_col:
                    logger.info(
                        "Calculating ETF values from quantity * price (missing market_value column)"
                    )
                    for _, row in etf_positions.iterrows():
                        qty = float(row[qty_col]) if pd.notnull(row[qty_col]) else 0.0
                        price = 0.0
                        if price_col and pd.notnull(row[price_col]):
                            price = float(row[price_col])
                        elif cost_col and pd.notnull(row[cost_col]):
                            price = float(row[cost_col])

                        etf_values[str(row["isin"])] = qty * price

        # Map ISIN -> Name (Fix 25)
        etf_names = {}
        if not etf_positions.empty:
            name_col = None
            for col in ["name", "Name", "InstrumentName"]:
                if col in etf_positions.columns:
                    name_col = col
                    break
            if name_col:
                for _, row in etf_positions.iterrows():
                    etf_names[str(row["isin"])] = row[name_col]

        for parent_isin, holdings in holdings_map.items():
            parent_value = etf_values.get(str(parent_isin), 0.0)
            parent_name = etf_names.get(str(parent_isin), "Unknown ETF")

            if holdings.empty:
                continue

            weight_col = get_weight_column(holdings)
            isin_col = get_isin_column(holdings)
            name_col = get_name_column(holdings)

            if not weight_col:
                continue

            for _, row in holdings.iterrows():
                try:
                    weight_pct = (
                        float(row[weight_col]) if pd.notnull(row[weight_col]) else 0.0
                    )
                    value_eur = (weight_pct / 100.0) * parent_value

                    rows.append(
                        {
                            "parent_isin": parent_isin,
                            "parent_name": parent_name,
                            "child_isin": row.get(isin_col, "UNKNOWN"),
                            "child_name": row.get(name_col, "Unknown"),
                            "weight_percent": weight_pct,
                            "value_eur": value_eur,
                            "sector": row.get("sector", row.get("Sector", "Unknown")),
                            "geography": row.get(
                                "geography", row.get("Country", "Unknown")
                            ),
                            "resolution_status": row.get(
                                "resolution_status", "unknown"
                            ),
                            "resolution_source": row.get(
                                "resolution_source", "unknown"
                            ),
                            "resolution_confidence": row.get(
                                "resolution_confidence", 0.0
                            ),
                            "resolution_detail": row.get("resolution_detail", ""),
                            "ticker": row.get("ticker", row.get("Ticker", "")),
                        }
                    )
                except Exception:
                    continue

        df = pd.DataFrame(rows)
        HOLDINGS_BREAKDOWN_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(HOLDINGS_BREAKDOWN_PATH, index=False)
        logger.info(f"Wrote holdings breakdown to {HOLDINGS_BREAKDOWN_PATH}")

    def _build_summary(
        self,
        direct_positions: pd.DataFrame,
        etf_positions: pd.DataFrame,
        holdings_map: Dict[str, pd.DataFrame],
        decompose_errors: List[PipelineError],
        monitor: PipelineMonitor,
        total_value: float,
        decomposer: Optional[Decomposer] = None,
    ) -> PipelineSummaryData:
        stock_count = len(direct_positions)
        etf_count = len(etf_positions)

        holdings_summary: HoldingsSummary = {
            "stocks": stock_count,
            "etfs": etf_count,
            "total_value": total_value,
        }

        etf_names: Dict[str, str] = {}
        if not etf_positions.empty:
            name_col = get_name_column(etf_positions)
            if name_col and name_col in etf_positions.columns:
                for _, row in etf_positions.iterrows():
                    isin_val = row.get("isin", "")
                    name_val = row.get(name_col, "Unknown ETF")
                    if isin_val:
                        etf_names[str(isin_val)] = (
                            str(name_val) if name_val else "Unknown ETF"
                        )

        etf_sources = decomposer.get_etf_sources() if decomposer else {}

        failed_isins = {e.item for e in decompose_errors}
        per_etf: List[ETFDecompositionDetail] = []
        for isin, holdings in holdings_map.items():
            per_etf.append(
                {
                    "isin": isin,
                    "name": etf_names.get(isin, "Unknown ETF"),
                    "holdings_count": len(holdings),
                    "status": "success" if len(holdings) > 0 else "partial",
                    "source": etf_sources.get(isin, "unknown"),
                }
            )
        for isin in failed_isins:
            if isin not in holdings_map:
                per_etf.append(
                    {
                        "isin": isin,
                        "name": etf_names.get(isin, "Unknown ETF"),
                        "holdings_count": 0,
                        "status": "failed",
                    }
                )

        total_underlying = sum(len(h) for h in holdings_map.values())
        decomposition_summary: DecompositionSummary = {
            "etfs_processed": len(holdings_map),
            "etfs_failed": len(decompose_errors),
            "total_underlying": total_underlying,
            "per_etf": per_etf,
        }

        resolution_stats = (
            self._decomposer.get_resolution_stats() if self._decomposer else {}
        )
        by_source_raw = resolution_stats.get("by_source", {})
        tier2_skipped = by_source_raw.get("tier2_skipped", 0)
        by_source = {k: v for k, v in by_source_raw.items() if k != "tier2_skipped"}

        resolution_summary: ResolutionSummary = {
            "total": resolution_stats.get("total", 0),
            "resolved": resolution_stats.get("resolved", 0),
            "unresolved": resolution_stats.get("unresolved", 0),
            "skipped_tier2": tier2_skipped,
            "by_source": by_source,
        }

        metrics = monitor.get_metrics()
        timing_summary: TimingSummary = {
            "total_seconds": metrics.get("execution_time_seconds", 0.0),
            "phases": metrics.get("phase_durations", {}),
        }

        unresolved_items = self._collect_unresolved_items(holdings_map, etf_names)
        max_unresolved = 100
        unresolved_total = len(unresolved_items)
        unresolved_truncated = unresolved_total > max_unresolved

        return {
            "holdings": holdings_summary,
            "decomposition": decomposition_summary,
            "resolution": resolution_summary,
            "timing": timing_summary,
            "unresolved": unresolved_items[:max_unresolved],
            "unresolved_truncated": unresolved_truncated,
            "unresolved_total": unresolved_total,
        }

    def _collect_unresolved_items(
        self,
        holdings_map: Dict[str, pd.DataFrame],
        etf_names: Dict[str, str],
    ) -> List[UnresolvedItem]:
        from portfolio_src.prism_utils.isin_validator import is_valid_isin

        unresolved: List[UnresolvedItem] = []

        for parent_isin, holdings in holdings_map.items():
            if holdings.empty:
                continue

            weight_col = get_weight_column(holdings)
            isin_col = get_isin_column(holdings)

            for _, row in holdings.iterrows():
                child_isin = row.get(isin_col) if isin_col else None
                if (
                    child_isin
                    and isinstance(child_isin, str)
                    and is_valid_isin(child_isin)
                ):
                    continue

                ticker = str(row.get("ticker", "")).strip()
                name = str(row.get("name", row.get("Name", "Unknown"))).strip()
                weight = 0.0
                if weight_col:
                    try:
                        weight_val = row.get(weight_col)
                        if weight_val is not None and str(weight_val) not in (
                            "",
                            "nan",
                            "NaN",
                        ):
                            weight = float(weight_val)
                    except (ValueError, TypeError, KeyError):
                        weight = 0.0

                if not ticker:
                    reason = "no_ticker"
                elif child_isin and not is_valid_isin(str(child_isin)):
                    reason = "invalid_isin"
                else:
                    reason = "api_all_failed"

                unresolved.append(
                    {
                        "ticker": ticker or "N/A",
                        "name": name,
                        "weight": weight,
                        "parent_etf": etf_names.get(parent_isin, parent_isin),
                        "reason": reason,
                    }
                )

        unresolved.sort(key=lambda x: x["weight"], reverse=True)
        return unresolved
