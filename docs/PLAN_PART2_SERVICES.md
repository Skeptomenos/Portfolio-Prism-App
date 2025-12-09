# Analytics Pipeline — Part 2: Services & Pipeline

> **Phase:** 2 (5-7 hours)
> **Prerequisites:** Complete Phase 0-1 from [Master Plan](./PLAN_ANALYTICS_PIPELINE.md)

---

## Overview

This phase creates the service-oriented architecture:

- **3 services:** Decomposer, Enricher, Aggregator (UI-agnostic, reusable with React)
- **1 orchestrator:** Pipeline (thin coordinator, no business logic)
- **Error types:** PipelineError, PipelineResult (structured, serializable)

---

## Phase 2 Tasks

| Task | File | Action |
|------|------|--------|
| **2.1** | `core/errors.py` | Create PipelineError, ErrorPhase, ErrorType, PipelineResult |
| **2.2** | `core/services/__init__.py` | Create services package |
| **2.3** | `core/services/decomposer.py` | Create Decomposer service |
| **2.4** | `core/services/enricher.py` | Create Enricher service |
| **2.5** | `core/services/aggregator.py` | Create Aggregator service |
| **2.6** | `core/pipeline.py` | Create thin Pipeline orchestrator |
| **2.7** | `core/pipeline.py` | Add progress_callback parameter |
| **2.8** | `core/pipeline.py` | Collect errors into `List[PipelineError]` |
| **2.9** | `core/pipeline.py` | Write `pipeline_errors.json` for debugging |
| **2.10** | `core/pipeline.py` | Dev-only dotenv: `if not os.getenv('PRISM_DATA_DIR'): load_dotenv()` |

---

## Structured Error Types

```python
# core/errors.py
from dataclasses import dataclass, field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class ErrorPhase(Enum):
    DATA_LOADING = "DATA_LOADING"
    ETF_DECOMPOSITION = "ETF_DECOMPOSITION"
    ENRICHMENT = "ENRICHMENT"
    AGGREGATION = "AGGREGATION"
    HARVESTING = "HARVESTING"
    REPORTING = "REPORTING"


class ErrorType(Enum):
    NO_ADAPTER = "NO_ADAPTER"
    API_FAILURE = "API_FAILURE"
    CACHE_MISS = "CACHE_MISS"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    PARSE_ERROR = "PARSE_ERROR"
    UNKNOWN = "UNKNOWN"


@dataclass
class PipelineError:
    """Structured error for debugging and GitHub reporting."""
    phase: ErrorPhase
    error_type: ErrorType
    item: str  # ISIN or identifier (safe to share)
    message: str
    fix_hint: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "phase": self.phase.value,
            "error_type": self.error_type.value,
            "item": self.item,
            "message": self.message,
            "fix_hint": self.fix_hint,
            "timestamp": self.timestamp,
        }

    def anonymize(self) -> dict:
        """Return dict safe for GitHub issue (no portfolio values)."""
        return {
            "phase": self.phase.value,
            "error_type": self.error_type.value,
            "item": self.item,  # ISIN is safe to share
            "message": self.message,
            "fix_hint": self.fix_hint,
        }


@dataclass
class PipelineResult:
    """Result of pipeline execution."""
    success: bool
    etfs_processed: int
    etfs_failed: int
    total_value: float  # NOT included in GitHub reports
    errors: List[PipelineError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    harvested_count: int = 0

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0

    def get_anonymized_errors(self) -> List[dict]:
        """Get errors safe for GitHub reporting."""
        return [e.anonymize() for e in self.errors]
```

---

## Service Interfaces

### Decomposer

Extracts ETF holdings using cache and adapters.

```python
# core/services/decomposer.py
from typing import Dict, List, Tuple
import pandas as pd
from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType


class Decomposer:
    """Decomposes ETFs into underlying holdings. UI-agnostic."""

    def __init__(self, holdings_cache, adapter_registry):
        self.holdings_cache = holdings_cache
        self.adapter_registry = adapter_registry

    def decompose(
        self, etf_positions: pd.DataFrame
    ) -> Tuple[Dict[str, pd.DataFrame], List[PipelineError]]:
        """
        Decompose ETF positions into holdings.

        Args:
            etf_positions: DataFrame with columns [isin, name, quantity, ...]

        Returns:
            Tuple of (holdings_map, errors)
            - holdings_map: {isin: holdings_df}
            - errors: List of PipelineError for failed ETFs
        """
        holdings_map = {}
        errors = []

        for _, etf in etf_positions.iterrows():
            isin = str(etf["isin"])
            try:
                holdings = self._get_holdings(isin)
                if holdings is not None and not holdings.empty:
                    holdings_map[isin] = holdings
                else:
                    errors.append(PipelineError(
                        phase=ErrorPhase.ETF_DECOMPOSITION,
                        error_type=ErrorType.CACHE_MISS,
                        item=isin,
                        message="No holdings data found",
                        fix_hint=f"Upload to manual_holdings/{isin}.csv",
                    ))
            except Exception as e:
                errors.append(PipelineError(
                    phase=ErrorPhase.ETF_DECOMPOSITION,
                    error_type=ErrorType.NO_ADAPTER,
                    item=isin,
                    message=str(e),
                    fix_hint=f"Add adapter or upload to manual_holdings/{isin}.csv",
                ))

        return holdings_map, errors

    def _get_holdings(self, isin: str) -> pd.DataFrame:
        """Try cache first, then adapter."""
        # Implementation uses self.holdings_cache and self.adapter_registry
        ...
```

### Enricher

Adds sector, geography, and asset class metadata.

```python
# core/services/enricher.py
from typing import Dict, List, Tuple
import pandas as pd
from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType


class Enricher:
    """Enriches holdings with sector, geography, asset class. UI-agnostic."""

    def __init__(self, enrichment_service):
        self.enrichment_service = enrichment_service

    def enrich(
        self, holdings_map: Dict[str, pd.DataFrame]
    ) -> Tuple[Dict[str, pd.DataFrame], List[PipelineError]]:
        """
        Enrich holdings with metadata.

        Args:
            holdings_map: {etf_isin: holdings_df}

        Returns:
            Tuple of (enriched_map, errors)
        """
        enriched_map = {}
        errors = []

        for etf_isin, holdings in holdings_map.items():
            try:
                enriched = self._enrich_holdings(holdings)
                enriched_map[etf_isin] = enriched
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

        return enriched_map, errors

    def _enrich_holdings(self, holdings: pd.DataFrame) -> pd.DataFrame:
        """Add sector, geography, asset_class columns."""
        # Implementation uses self.enrichment_service
        ...
```

### Aggregator

Groups and sums exposures across all positions.

```python
# core/services/aggregator.py
from typing import Dict
import pandas as pd


class Aggregator:
    """Aggregates holdings into exposure report. UI-agnostic."""

    def aggregate(
        self,
        direct_positions: pd.DataFrame,
        etf_positions: pd.DataFrame,
        holdings_map: Dict[str, pd.DataFrame],
    ) -> pd.DataFrame:
        """
        Aggregate all positions into exposure report.

        Args:
            direct_positions: DataFrame of direct stock holdings
            etf_positions: DataFrame of ETF positions
            holdings_map: {etf_isin: enriched_holdings_df}

        Returns:
            DataFrame with columns:
            [isin, name, sector, geography, total_exposure, portfolio_percentage]
        """
        # Implementation:
        # 1. Weight ETF holdings by position size
        # 2. Combine with direct positions
        # 3. Group by underlying ISIN
        # 4. Calculate percentages
        ...
```

---

## Pipeline Orchestrator

```python
# core/pipeline.py
import json
import os
from typing import Callable, List
from pathlib import Path

from portfolio_src.core.errors import PipelineError, PipelineResult, ErrorPhase, ErrorType
from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.services.enricher import Enricher
from portfolio_src.core.services.aggregator import Aggregator
from portfolio_src.config import PIPELINE_ERRORS_PATH, OUTPUTS_DIR, TRUE_EXPOSURE_REPORT


class Pipeline:
    """
    Thin orchestrator that coordinates services.
    
    Contains NO business logic — only:
    - Calls services in order
    - Emits progress via callback
    - Collects errors
    - Writes outputs
    """

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        
        # Dev-only: load .env if not in production
        if not os.getenv("PRISM_DATA_DIR"):
            try:
                from dotenv import load_dotenv
                load_dotenv()
            except ImportError:
                pass
        
        # Initialize services (dependencies injected)
        self.decomposer = Decomposer(...)
        self.enricher = Enricher(...)
        self.aggregator = Aggregator()

    def run(self, progress_callback: Callable[[str, float], None]) -> PipelineResult:
        """
        Run the full analytics pipeline.

        Args:
            progress_callback: Function to call with (status_text, progress_0_to_1)

        Returns:
            PipelineResult with success status, metrics, and errors
        """
        errors: List[PipelineError] = []
        warnings: List[str] = []
        harvested_count = 0

        try:
            # Phase 1: Load data
            progress_callback("Loading portfolio...", 0.1)
            direct_positions, etf_positions = self._load_portfolio()

            # Phase 2: Decompose ETFs (via service)
            progress_callback("Decomposing ETFs...", 0.3)
            holdings_map, decompose_errors = self.decomposer.decompose(etf_positions)
            errors.extend(decompose_errors)

            # Phase 3: Enrich (via service)
            progress_callback("Enriching holdings...", 0.5)
            enriched_holdings, enrich_errors = self.enricher.enrich(holdings_map)
            errors.extend(enrich_errors)

            # Phase 4: Aggregate (via service)
            progress_callback("Calculating exposures...", 0.7)
            exposure_df = self.aggregator.aggregate(
                direct_positions, etf_positions, enriched_holdings
            )

            # Phase 5: Write reports
            progress_callback("Writing reports...", 0.85)
            self._write_reports(exposure_df)

            # Phase 6: Auto-harvest (non-fatal)
            progress_callback("Harvesting new securities...", 0.95)
            harvested_count = self._harvest()

            # Write error log
            self._write_errors(errors)

            progress_callback("Complete!", 1.0)

            return PipelineResult(
                success=True,
                etfs_processed=len(holdings_map),
                etfs_failed=len(decompose_errors),
                total_value=self._calculate_total(direct_positions, etf_positions),
                errors=errors,
                warnings=warnings,
                harvested_count=harvested_count,
            )

        except Exception as e:
            errors.append(PipelineError(
                phase=ErrorPhase.UNKNOWN,
                error_type=ErrorType.UNKNOWN,
                item="pipeline",
                message=str(e),
            ))
            self._write_errors(errors)
            return PipelineResult(
                success=False,
                etfs_processed=0,
                etfs_failed=0,
                total_value=0,
                errors=errors,
            )

    def _load_portfolio(self):
        """Load portfolio state."""
        from portfolio_src.data.state_manager import load_portfolio_state
        return load_portfolio_state()

    def _harvest(self) -> int:
        """Auto-harvest new securities. Non-fatal."""
        try:
            from portfolio_src.core.harvesting import harvest_cache
            return harvest_cache()
        except Exception:
            return 0

    def _write_reports(self, exposure_df):
        """Write exposure report CSV."""
        exposure_df.to_csv(TRUE_EXPOSURE_REPORT, index=False)

    def _write_errors(self, errors: List[PipelineError]):
        """Write structured errors to JSON for debugging."""
        with open(PIPELINE_ERRORS_PATH, "w") as f:
            json.dump([e.to_dict() for e in errors], f, indent=2)

    def _calculate_total(self, direct_positions, etf_positions) -> float:
        """Calculate total portfolio value."""
        direct_value = direct_positions["market_value"].sum() if not direct_positions.empty else 0
        etf_value = etf_positions["market_value"].sum() if not etf_positions.empty else 0
        return direct_value + etf_value
```

---

## Files Created

| File | Purpose |
|------|---------|
| `core/errors.py` | PipelineError, ErrorPhase, ErrorType, PipelineResult |
| `core/services/__init__.py` | Services package |
| `core/services/decomposer.py` | ETF decomposition service |
| `core/services/enricher.py` | Metadata enrichment service |
| `core/services/aggregator.py` | Exposure calculation service |
| `core/pipeline.py` | Thin orchestrator |

---

## Testing Strategy

Each service should be testable independently:

```python
# tests/test_decomposer.py
def test_decomposer_handles_missing_adapter():
    mock_cache = MockHoldingsCache(return_empty=True)
    mock_registry = MockAdapterRegistry(adapters={})
    
    decomposer = Decomposer(mock_cache, mock_registry)
    holdings_map, errors = decomposer.decompose(mock_etf_positions)
    
    assert len(errors) == 1
    assert errors[0].error_type == ErrorType.NO_ADAPTER
```

---

## Next: [Part 3 — UI & Integration](./PLAN_PART3_INTEGRATION.md)
