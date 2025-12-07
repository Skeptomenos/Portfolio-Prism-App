"""
Enrichment Gap Collector

Tracks holdings where ISIN resolution failed, calculates impact,
and saves to a structured file for dashboard consumption.
"""

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Optional, Dict, Any

from utils.logging_config import get_logger

logger = get_logger(__name__)

ENRICHMENT_GAPS_PATH = "outputs/enrichment_gaps.json"


@dataclass
class EnrichmentGap:
    """Represents a single enrichment failure."""

    ticker: str
    name: str
    source_etf_isin: str
    source_etf_name: str
    weight_in_etf: float  # Percentage weight within the ETF
    weight_in_portfolio: float  # Percentage weight in total portfolio
    failure_reason: str  # e.g., "api_all_failed", "invalid_format"
    priority: str = ""  # high/medium/low - calculated based on weight

    def __post_init__(self):
        """Calculate priority based on portfolio weight."""
        if not self.priority:
            if self.weight_in_portfolio > 1.0:
                self.priority = "high"
            elif self.weight_in_portfolio > 0.1:
                self.priority = "medium"
            else:
                self.priority = "low"


@dataclass
class EnrichmentGapSummary:
    """Summary statistics for all gaps."""

    total_gaps: int
    total_weight_affected: float  # Sum of weight_in_portfolio
    portfolio_coverage: float  # 100 - total_weight_affected
    high_priority_count: int
    medium_priority_count: int
    low_priority_count: int


class EnrichmentGapCollector:
    """
    Collects and manages enrichment gaps during pipeline execution.

    Usage:
        collector = EnrichmentGapCollector()

        # During ETF decomposition
        collector.record(EnrichmentGap(
            ticker="REGN",
            name="Regeneron Pharmaceuticals",
            source_etf_isin="IE00B4L5Y983",
            source_etf_name="iShares Core MSCI World",
            weight_in_etf=0.13,
            weight_in_portfolio=0.04,
            failure_reason="api_all_failed"
        ))

        # At end of pipeline
        collector.save()
    """

    def __init__(self):
        self._gaps: List[EnrichmentGap] = []
        self._seen_keys: set = set()  # Prevent duplicates

    def record(self, gap: EnrichmentGap) -> None:
        """
        Record an enrichment gap.

        Deduplicates based on ticker + source_etf_isin combination.
        """
        key = f"{gap.ticker}|{gap.source_etf_isin}"
        if key in self._seen_keys:
            return

        self._seen_keys.add(key)
        self._gaps.append(gap)
        logger.debug(
            f"Recorded enrichment gap: {gap.ticker} from {gap.source_etf_isin} "
            f"(weight: {gap.weight_in_portfolio:.3f}%, priority: {gap.priority})"
        )

    def get_gaps(self) -> List[EnrichmentGap]:
        """Return all recorded gaps, sorted by portfolio weight descending."""
        return sorted(self._gaps, key=lambda g: g.weight_in_portfolio, reverse=True)

    def get_summary(self) -> EnrichmentGapSummary:
        """Calculate summary statistics."""
        total_weight = sum(g.weight_in_portfolio for g in self._gaps)
        high_count = sum(1 for g in self._gaps if g.priority == "high")
        medium_count = sum(1 for g in self._gaps if g.priority == "medium")
        low_count = sum(1 for g in self._gaps if g.priority == "low")

        return EnrichmentGapSummary(
            total_gaps=len(self._gaps),
            total_weight_affected=round(total_weight, 2),
            portfolio_coverage=round(100 - total_weight, 2),
            high_priority_count=high_count,
            medium_priority_count=medium_count,
            low_priority_count=low_count,
        )

    def save(self, path: Optional[str] = None) -> None:
        """
        Save gaps to JSON file.

        Args:
            path: Output path. Defaults to ENRICHMENT_GAPS_PATH.
        """
        output_path = path or ENRICHMENT_GAPS_PATH

        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        summary = self.get_summary()
        gaps = self.get_gaps()

        data = {
            "generated_at": datetime.now().isoformat(),
            "summary": asdict(summary),
            "gaps": [asdict(g) for g in gaps],
        }

        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

        logger.info(
            f"Saved {len(gaps)} enrichment gaps to {output_path} "
            f"(coverage: {summary.portfolio_coverage:.1f}%)"
        )

    def clear(self) -> None:
        """Clear all recorded gaps."""
        self._gaps.clear()
        self._seen_keys.clear()

    def __len__(self) -> int:
        return len(self._gaps)


def load_enrichment_gaps(path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load enrichment gaps from JSON file.

    Returns:
        Dict with 'generated_at', 'summary', and 'gaps' keys.
        Returns empty structure if file doesn't exist.
    """
    input_path = path or ENRICHMENT_GAPS_PATH

    if not os.path.exists(input_path):
        return {
            "generated_at": None,
            "summary": {
                "total_gaps": 0,
                "total_weight_affected": 0,
                "portfolio_coverage": 100,
                "high_priority_count": 0,
                "medium_priority_count": 0,
                "low_priority_count": 0,
            },
            "gaps": [],
        }

    try:
        with open(input_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Failed to load enrichment gaps from {input_path}: {e}")
        return {
            "generated_at": None,
            "summary": {
                "total_gaps": 0,
                "total_weight_affected": 0,
                "portfolio_coverage": 100,
                "high_priority_count": 0,
                "medium_priority_count": 0,
                "low_priority_count": 0,
            },
            "gaps": [],
        }
