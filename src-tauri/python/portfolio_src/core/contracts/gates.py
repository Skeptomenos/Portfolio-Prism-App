"""Validation Gates - Orchestrates validation at phase boundaries."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from .quality import DataQuality
from .schemas import (
    AggregatePhaseOutput,
    DecomposePhaseOutput,
    EnrichPhaseOutput,
    LoadPhaseOutput,
)
from .validation import (
    validate_aggregate_phase_output,
    validate_decompose_phase_output,
    validate_enrich_phase_output,
    validate_load_phase_output,
)


@dataclass
class GateResult:
    """Result from a validation gate."""

    passed: bool
    quality: DataQuality
    data: Any


class ValidationGates:
    """Orchestrates validation at pipeline phase boundaries."""

    def __init__(self) -> None:
        self._pipeline_quality = DataQuality()

    def validate_load_output(self, output: LoadPhaseOutput) -> GateResult:
        """Validate Load phase output and accumulate quality metrics."""
        quality = DataQuality()
        issues = validate_load_phase_output(output)
        for issue in issues:
            quality.add_issue(issue)
        self._pipeline_quality.merge(quality)
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )

    def validate_decompose_output(self, output: DecomposePhaseOutput) -> GateResult:
        """Validate Decompose phase output and accumulate quality metrics."""
        quality = DataQuality()
        issues = validate_decompose_phase_output(output)
        for issue in issues:
            quality.add_issue(issue)
        self._pipeline_quality.merge(quality)
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )

    def validate_enrich_output(self, output: EnrichPhaseOutput) -> GateResult:
        """Validate Enrich phase output and accumulate quality metrics."""
        quality = DataQuality()
        issues = validate_enrich_phase_output(output)
        for issue in issues:
            quality.add_issue(issue)
        self._pipeline_quality.merge(quality)
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )

    def validate_aggregate_output(
        self,
        output: AggregatePhaseOutput,
        expected_total: float,
    ) -> GateResult:
        """Validate Aggregate phase output and accumulate quality metrics."""
        quality = DataQuality()
        issues = validate_aggregate_phase_output(output, expected_total)
        for issue in issues:
            quality.add_issue(issue)
        self._pipeline_quality.merge(quality)
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )

    def get_pipeline_quality(self) -> DataQuality:
        """Get the accumulated quality across all gates."""
        return self._pipeline_quality

    def get_summary(self) -> Dict[str, Any]:
        """Get JSON-serializable summary of pipeline quality."""
        q = self._pipeline_quality
        return {
            "quality_score": round(q.score, 4),
            "is_trustworthy": q.is_trustworthy,
            "total_issues": len(q.issues),
            "by_severity": q.issue_count_by_severity,
            "by_category": q.issue_count_by_category,
            "issues": [issue.to_dict() for issue in q.issues],
        }

    def reset(self) -> None:
        """Reset accumulated state for a new pipeline run."""
        self._pipeline_quality = DataQuality()
