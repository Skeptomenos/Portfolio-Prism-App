# core/errors.py
"""
Structured error types for the analytics pipeline.

These types enable:
- Machine-readable error tracking
- GitHub issue creation with anonymized data
- Structured debugging via JSON logs
"""

from dataclasses import dataclass, field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class ErrorPhase(Enum):
    """Phase where error occurred."""
    DATA_LOADING = "DATA_LOADING"
    ETF_DECOMPOSITION = "ETF_DECOMPOSITION"
    ENRICHMENT = "ENRICHMENT"
    AGGREGATION = "AGGREGATION"
    HARVESTING = "HARVESTING"
    REPORTING = "REPORTING"


class ErrorType(Enum):
    """Type of error for categorization."""
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
        """Convert to dictionary for JSON serialization."""
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
