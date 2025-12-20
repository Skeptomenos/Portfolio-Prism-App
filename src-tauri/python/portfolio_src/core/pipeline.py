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
from typing import Callable, Optional, List, Dict, Any
from pathlib import Path
import pandas as pd

from portfolio_src.core.errors import (
    PipelineError,
    PipelineResult,
    ErrorPhase,
    ErrorType,
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
    get_weight_column,
    get_isin_column,
    get_name_column,
)

logger = get_logger(__name__)


class PipelineMonitor:
    """Tracks pipeline performance and community hit rates."""

    def __init__(self):
        self.start_time = time.time()
        self.phase_times: Dict[str, float] = {}
        self.hive_hits = 0
        self.hive_misses = 0
        self.api_calls = 0
        self.total_assets = 0

    def record_phase(self, phase: str, duration: float):
        self.phase_times[phase] = round(duration, 3)

    def record_enrichment(self, source: str):
        self.total_assets += 1
        if source == "hive":
            self.hive_hits += 1
        else:
            self.hive_misses += 1
            if source != "unknown":
                self.api_calls += 1

    def get_metrics(self) -> Dict[str, Any]:
        hit_rate = (
            (self.hive_hits / self.total_assets * 100) if self.total_assets > 0 else 0.0
        )
        return {
            "execution_time_seconds": round(time.time() - self.start_time, 2),
            "phase_durations": self.phase_times,
            "hive_hit_rate": round(hit_rate, 1),
            "api_fallback_rate": round(100.0 - hit_rate, 1)
            if self.total_assets > 0
            else 0.0,
            "total_assets_processed": self.total_assets,
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

    def __init__(self, data_dir: Optional[Path] = None):
        """
        Initialize the pipeline.

        Args:
            data_dir: Optional override for data directory
        """
        # Dev-only: load .env if not in production
        if not os.getenv("PRISM_DATA_DIR"):
            try:
                from dotenv import load_dotenv

                load_dotenv()
            except ImportError:
                pass

        self.data_dir = data_dir or DATA_DIR

        # Services are initialized lazily when run() is called
        self._decomposer: Optional[Decomposer] = None
        self._enricher: Optional[Enricher] = None
        self._aggregator: Optional[Aggregator] = None

    def _init_services(self):
        """Initialize services with their dependencies."""
        from portfolio_src.data.holdings_cache import get_holdings_cache
        from portfolio_src.adapters.registry import AdapterRegistry
        from portfolio_src.core.services.enricher import HiveEnrichmentService

        holdings_cache = get_holdings_cache()
        adapter_registry = AdapterRegistry()
        enrichment_service = HiveEnrichmentService()

        self._decomposer = Decomposer(holdings_cache, adapter_registry)
        self._enricher = Enricher(enrichment_service)
        self._aggregator = Aggregator()

    def run(
        self, progress_callback: Optional[Callable[[str, float], None]] = None
    ) -> PipelineResult:
        """
        Run the full analytics pipeline.

        Args:
            progress_callback: Function to call with (status_text, progress_0_to_1)

        Returns:
            PipelineResult with success status, metrics, and errors
        """
        # Default progress callback if none provided
        if progress_callback is None:
            progress_callback = lambda msg, pct: logger.info(
                f"[{pct * 100:.0f}%] {msg}"
            )

        errors = []
        warnings = []
        harvested_count = 0
        monitor = PipelineMonitor()

        # Initialize containers for finally block
        holdings_map = {}
        direct_positions = pd.DataFrame()
        etf_positions = pd.DataFrame()

        try:
            # Initialize services
            start = time.time()
            progress_callback("Initializing services...", 0.05)
            self._init_services()
            monitor.record_phase("initialization", time.time() - start)

            if not self._decomposer or not self._enricher or not self._aggregator:
                raise RuntimeError("Failed to initialize pipeline services")

            # Phase 1: Load data
            start = time.time()
            progress_callback("Loading portfolio...", 0.1)
            direct_positions, etf_positions = self._load_portfolio()
            monitor.record_phase("data_loading", time.time() - start)

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
            progress_callback("Decomposing ETFs...", 0.3)
            holdings_map, decompose_errors = self._decomposer.decompose(etf_positions)
            errors.extend(decompose_errors)
            monitor.record_phase("etf_decomposition", time.time() - start)

            # Phase 3: Enrich (via service)
            start = time.time()
            progress_callback("Enriching holdings...", 0.5)
            enriched_holdings, enrich_errors = self._enricher.enrich(holdings_map)
            errors.extend(enrich_errors)
            monitor.record_phase("enrichment", time.time() - start)

            # Record enrichment metrics (Assume hive for now until Enricher returns sources)
            for isin in holdings_map.keys():
                monitor.record_enrichment("hive")

            # Phase 4: Aggregate (via service)
            start = time.time()
            progress_callback("Calculating exposures...", 0.7)
            exposure_df, agg_errors = self._aggregator.aggregate(
                direct_positions, etf_positions, enriched_holdings
            )
            errors.extend(agg_errors)
            monitor.record_phase("aggregation", time.time() - start)

            # Phase 5: Write reports
            start = time.time()
            progress_callback("Writing reports...", 0.85)
            self._write_reports(exposure_df, direct_positions, etf_positions)
            monitor.record_phase("reporting", time.time() - start)

            # Phase 6: Auto-harvest (non-fatal)
            progress_callback("Harvesting new securities...", 0.95)
            harvested_count = self._harvest()

            progress_callback("Complete!", 1.0)

            total_value = calculate_portfolio_total_value(
                direct_positions, etf_positions
            )

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
            # Always write reports if we have data, to aid debugging
            try:
                # Write health report
                self._write_health_report(
                    errors, direct_positions, etf_positions, holdings_map, monitor
                )

                # Write breakdown report
                if not etf_positions.empty:
                    self._write_breakdown_report(etf_positions, holdings_map)

                # Write error log
                self._write_errors(errors)

            except Exception as e:
                logger.error(f"Failed to write final reports: {e}")

    def _load_portfolio(self):
        """Load portfolio state."""
        from portfolio_src.data.state_manager import load_portfolio_state

        return load_portfolio_state()

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
    ):
        """Write rich pipeline health report for UI."""
        from datetime import datetime

        # Calculate ETF stats
        etf_stats = []
        for isin, holdings in holdings_map.items():
            weight_col = get_weight_column(holdings)
            weight_sum = (
                float(holdings[weight_col].sum())
                if weight_col and not holdings.empty
                else 0.0
            )

            etf_stats.append(
                {
                    "ticker": isin,
                    "holdings_count": len(holdings),
                    "weight_sum": weight_sum,
                    "status": "complete" if not holdings.empty else "empty",
                }
            )

        # Structure for UI
        health_data = {
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "direct_holdings": len(direct_positions),
                "etf_positions": len(etf_positions),
                "etfs_processed": len(
                    [e for e in etf_stats if e["status"] == "complete"]
                ),
                "tier1_resolved": 0,
                "tier1_failed": len(errors),
            },
            "performance": monitor.get_metrics(),
            "etf_stats": etf_stats,
            "failures": [
                {
                    "severity": "ERROR",
                    "stage": e.phase.value
                    if hasattr(e.phase, "value")
                    else str(e.phase),
                    "item": e.item,
                    "error": e.message,
                    "fix": e.fix_hint,
                }
                for e in errors
            ],
        }

        PIPELINE_HEALTH_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(PIPELINE_HEALTH_PATH, "w") as f:
            json.dump(health_data, f, indent=2)

        logger.info(f"Wrote pipeline health report to {PIPELINE_HEALTH_PATH}")

    def _write_breakdown_report(self, etf_positions, holdings_map):
        """Write detailed holdings breakdown for UI exploration."""
        rows = []

        # We need ETF values to calculate proportional value of holdings
        # Map ISIN -> Market Value
        etf_values = {}
        if not etf_positions.empty:
            # Check value column
            val_col = None
            for col in ["tr_value", "NetValue", "market_value", "net_value", "value"]:
                if col in etf_positions.columns:
                    val_col = col
                    break

            if val_col:
                for _, row in etf_positions.iterrows():
                    etf_values[str(row["isin"])] = row[val_col]

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
                            "sector": row.get("Sector", "Unknown"),
                            "geography": row.get("Country", "Unknown"),
                        }
                    )
                except Exception:
                    continue

        df = pd.DataFrame(rows)
        HOLDINGS_BREAKDOWN_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(HOLDINGS_BREAKDOWN_PATH, index=False)
        logger.info(f"Wrote holdings breakdown to {HOLDINGS_BREAKDOWN_PATH}")
