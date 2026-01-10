"""
Data Quality Tracking - Propagates quality scores through the pipeline.

Quality degrades as issues are encountered. User sees final score
and can drill into specific issues.

Design:
- Score starts at 1.0 (perfect)
- Each issue applies a penalty based on severity
- Score never goes below 0.0
- is_trustworthy = score >= 0.95
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, ClassVar, Dict, List, Optional


class IssueSeverity(str, Enum):
    """Severity levels for data quality issues."""

    CRITICAL = "critical"  # Calculation WILL be wrong
    HIGH = "high"  # Calculation MAY be wrong
    MEDIUM = "medium"  # Data is incomplete
    LOW = "low"  # Cosmetic issue


class IssueCategory(str, Enum):
    """Categories for grouping issues."""

    SCHEMA = "schema"  # Missing/invalid columns
    WEIGHT = "weight"  # Weight sum issues
    RESOLUTION = "resolution"  # ISIN resolution failures
    ENRICHMENT = "enrichment"  # Missing metadata
    CURRENCY = "currency"  # Currency conversion issues
    VALUE = "value"  # Value calculation issues


@dataclass
class ValidationIssue:
    """A single validation issue detected during pipeline processing.

    Attributes:
        severity: How serious the issue is (CRITICAL, HIGH, MEDIUM, LOW)
        category: What type of issue (SCHEMA, WEIGHT, etc.)
        code: Machine-readable code (e.g., "WEIGHT_SUM_LOW")
        message: Human-readable description
        fix_hint: What user/community can do to fix
        item: ISIN or identifier (safe to share publicly)
        phase: Pipeline phase where detected
        timestamp: ISO format, defaults to now
        expected: What was expected (optional)
        actual: What was found (optional)
    """

    severity: IssueSeverity
    category: IssueCategory
    code: str
    message: str
    fix_hint: str
    item: str
    phase: str
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    expected: Optional[str] = None
    actual: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary with all fields."""
        return {
            "severity": self.severity.value,
            "category": self.category.value,
            "code": self.code,
            "message": self.message,
            "fix_hint": self.fix_hint,
            "item": self.item,
            "phase": self.phase,
            "timestamp": self.timestamp,
            "expected": self.expected,
            "actual": self.actual,
        }

    def to_telemetry(self) -> Dict[str, Any]:
        """Convert to anonymized dictionary for GitHub issue creation.

        Only includes fields safe to share publicly (no PII).
        """
        return {
            "severity": self.severity.value,
            "category": self.category.value,
            "code": self.code,
            "phase": self.phase,
            "expected": self.expected,
            "actual": self.actual,
        }


@dataclass
class DataQuality:
    """Tracks data quality score and issues through the pipeline.

    The score starts at 1.0 (perfect) and degrades as issues are added.
    Each issue applies a penalty based on its severity.

    Attributes:
        score: Current quality score (0.0 to 1.0)
        issues: List of validation issues encountered
    """

    score: float = 1.0
    issues: List[ValidationIssue] = field(default_factory=list)

    # Penalty amounts for each severity level
    PENALTIES: ClassVar[Dict[IssueSeverity, float]] = {
        IssueSeverity.CRITICAL: 0.25,  # One critical = 75%
        IssueSeverity.HIGH: 0.10,  # One high = 90%
        IssueSeverity.MEDIUM: 0.03,  # Accumulates slowly
        IssueSeverity.LOW: 0.01,  # Cosmetic
    }

    def add_issue(self, issue: ValidationIssue) -> None:
        """Add an issue and degrade the score by the appropriate penalty.

        Args:
            issue: The validation issue to add
        """
        self.issues.append(issue)
        penalty = self.PENALTIES.get(issue.severity, 0.0)
        self.score = max(0.0, self.score - penalty)

    @property
    def is_trustworthy(self) -> bool:
        """Returns True if the quality score is high enough to trust.

        A score >= 0.95 is considered trustworthy.
        """
        return self.score >= 0.95

    @property
    def has_critical_issues(self) -> bool:
        """Returns True if any CRITICAL severity issues exist."""
        return any(issue.severity == IssueSeverity.CRITICAL for issue in self.issues)

    @property
    def issue_count_by_severity(self) -> Dict[str, int]:
        """Count issues grouped by severity level."""
        counts: Dict[str, int] = {s.value: 0 for s in IssueSeverity}
        for issue in self.issues:
            counts[issue.severity.value] += 1
        return counts

    @property
    def issue_count_by_category(self) -> Dict[str, int]:
        """Count issues grouped by category."""
        counts: Dict[str, int] = {c.value: 0 for c in IssueCategory}
        for issue in self.issues:
            counts[issue.category.value] += 1
        return counts

    def get_issues_for_phase(self, phase: str) -> List[ValidationIssue]:
        """Get all issues for a specific pipeline phase.

        Args:
            phase: The pipeline phase to filter by

        Returns:
            List of issues from that phase
        """
        return [issue for issue in self.issues if issue.phase == phase]

    def merge(self, other: DataQuality) -> None:
        """Merge another DataQuality's issues into this one and recalculate score.

        Args:
            other: Another DataQuality instance to merge from
        """
        self.issues.extend(other.issues)
        self.score = 1.0
        for issue in self.issues:
            penalty = self.PENALTIES.get(issue.severity, 0.0)
            self.score = max(0.0, self.score - penalty)

    def to_summary(self) -> Dict[str, Any]:
        """Convert to JSON-serializable summary for UI display.

        Returns:
            Dictionary with quality metrics and issues
        """
        return {
            "quality_score": round(self.score, 4),
            "is_trustworthy": self.is_trustworthy,
            "has_critical_issues": self.has_critical_issues,
            "total_issues": len(self.issues),
            "by_severity": self.issue_count_by_severity,
            "by_category": self.issue_count_by_category,
            "issues": [issue.to_dict() for issue in self.issues],
        }

    def to_user_message(self) -> str:
        """Generate a human-friendly status message.

        Returns:
            A message appropriate for the current quality state
        """
        if self.has_critical_issues:
            critical_count = self.issue_count_by_severity.get("critical", 0)
            return (
                f"Warning: {critical_count} critical issue(s) detected. "
                f"Results may be inaccurate. Quality score: {self.score:.0%}"
            )

        if not self.is_trustworthy:
            high_count = self.issue_count_by_severity.get("high", 0)
            if high_count > 0:
                return (
                    f"Caution: {high_count} high-priority issue(s) found. "
                    f"Quality score: {self.score:.0%}"
                )
            return f"Some data quality issues detected. Quality score: {self.score:.0%}"

        if len(self.issues) > 0:
            return (
                f"Data quality is good with {len(self.issues)} minor issue(s). "
                f"Quality score: {self.score:.0%}"
            )

        return f"Excellent data quality. Score: {self.score:.0%}"
