# Pipeline Hardening Implementation Plan

> **Project:** Contract-First Pipeline Hardening  
> **Goal:** 99.9% calculation accuracy (starting at 95%)  
> **Duration:** 12-17 days  
> **Priority:** Trust is broken if depot value is wrong

---

## Implementation Status

| Phase | Status | Completed | Notes |
|-------|--------|-----------|-------|
| **Phase 1: Contracts** | ✅ COMPLETE | 2026-01-10 | 115 unit tests, merged to main |
| **Phase 2: Validation Gates** | ✅ COMPLETE | 2026-01-10 | Ralph automated 16 stories, merged to main |
| **Phase 3: Quality Propagation** | ✅ COMPLETE | 2026-01-10 | Data Quality UI in Health tab, merged to main |
| **Phase 4: Telemetry Expansion** | ✅ COMPLETE | 2026-01-11 | Ralph automated 8 stories, 11 unit tests |
| **Phase 5: Bug Fixes** | ✅ COMPLETE | 2026-01-11 | 12/12 bugs fixed, TDD approach |

---

## Executive Summary

This plan transforms the Portfolio Prism pipeline from "works but fragile" to "robust, transparent, and community-driven." The key insight: **we can't fix bugs reliably without first defining what "correct" means.**

### Core Principles

1. **Always Run, Never Crash** - Pipeline completes even with issues
2. **Log Everything** - Every decision, every fallback, every issue
3. **Transparent to User** - Quality scores, issues, and fix hints visible
4. **Community-Driven** - Issues auto-reported to GitHub for community fixes
5. **Measurable Accuracy** - Track progress toward 99.9% goal

### Existing Foundation (What We're Building On)

| Component | Status | Location |
|-----------|--------|----------|
| Pydantic Models | ✅ Exists | `models/exposure.py`, `models/contracts.py` |
| Pandera Schemas | ✅ Exists | `core/schema.py`, `prism_utils/schemas.py` |
| Telemetry | ✅ Exists | `prism_utils/telemetry.py` |
| Error Types | ✅ Exists | `core/errors.py` |
| Schema Normalizer | ✅ Exists | `core/utils.py` |

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: CONTRACTS                                                         │
│  Define what "correct" means at each boundary                               │
│  Duration: 2-3 days                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: VALIDATION GATES                                                  │
│  Add validation at each phase boundary                                      │
│  Duration: 2-3 days                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: QUALITY PROPAGATION                                               │
│  Each record carries quality metadata                                       │
│  Duration: 2-3 days                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: TELEMETRY EXPANSION                                               │
│  Report data quality issues to GitHub                                       │
│  Duration: 2-3 days                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: BUG FIXES                                                         │
│  Fix the 16 identified issues with verification                             │
│  Duration: 3-5 days                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Contracts (2-3 Days)

### Objective

Define explicit schemas and validation rules for data flowing between pipeline phases. Without contracts, we can't measure accuracy or verify fixes.

### Deliverables

1. **`core/contracts/schemas.py`** - Pydantic models for phase inputs/outputs
2. **`core/contracts/validation.py`** - Validation functions with specific error types
3. **`core/contracts/quality.py`** - DataQuality class for score propagation
4. **Unit tests** for all contracts

### File: `core/contracts/schemas.py`

```python
"""
Pipeline Phase Contracts - Pydantic models defining exact data shapes.

These schemas are the SINGLE SOURCE OF TRUTH for what data looks like
at each pipeline boundary. All validation derives from these.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, List
from enum import Enum


# =============================================================================
# Enums
# =============================================================================

class AssetClass(str, Enum):
    STOCK = "Stock"
    ETF = "ETF"
    BOND = "Bond"
    CASH = "Cash"
    CRYPTO = "Crypto"
    DERIVATIVE = "Derivative"
    UNKNOWN = "Unknown"


class ResolutionStatus(str, Enum):
    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"
    SKIPPED = "skipped"


# =============================================================================
# Phase 1 Output: Loaded Positions
# =============================================================================

class LoadedPosition(BaseModel):
    """Single position from database load."""
    
    isin: str = Field(..., min_length=12, max_length=12, pattern=r"^[A-Z]{2}[A-Z0-9]{10}$")
    name: str = Field(..., min_length=1)
    quantity: float = Field(..., description="Number of shares/units")
    current_price: Optional[float] = Field(None, ge=0, description="Current market price")
    cost_basis: Optional[float] = Field(None, ge=0, description="Average purchase price")
    asset_class: AssetClass = Field(default=AssetClass.UNKNOWN)
    symbol: Optional[str] = None
    sector: Optional[str] = None
    region: Optional[str] = None
    currency: str = Field(default="EUR")
    
    @field_validator("asset_class", mode="before")
    @classmethod
    def normalize_asset_class(cls, v):
        if v is None or v == "":
            return AssetClass.UNKNOWN
        if isinstance(v, str):
            v_upper = v.upper()
            for ac in AssetClass:
                if ac.value.upper() == v_upper:
                    return ac
        return AssetClass.UNKNOWN
    
    @property
    def market_value(self) -> float:
        """Calculate market value from quantity and price."""
        price = self.current_price or self.cost_basis or 0.0
        return self.quantity * price


class LoadPhaseOutput(BaseModel):
    """Output of Phase 1: Data Loading."""
    
    direct_positions: List[LoadedPosition] = Field(default_factory=list)
    etf_positions: List[LoadedPosition] = Field(default_factory=list)
    total_positions: int = 0
    total_value: float = 0.0
    
    def model_post_init(self, __context):
        self.total_positions = len(self.direct_positions) + len(self.etf_positions)
        self.total_value = sum(p.market_value for p in self.direct_positions + self.etf_positions)


# =============================================================================
# Phase 2 Output: Decomposed Holdings
# =============================================================================

class HoldingRecord(BaseModel):
    """Single holding within an ETF."""
    
    ticker: Optional[str] = None
    raw_ticker: Optional[str] = None
    name: str = Field(..., min_length=1)
    weight_percentage: float = Field(..., ge=0, le=150, description="Weight in ETF (0-100+)")
    isin: Optional[str] = Field(None, min_length=12, max_length=12)
    
    # Resolution metadata
    resolution_status: ResolutionStatus = ResolutionStatus.UNRESOLVED
    resolution_source: Optional[str] = None
    resolution_confidence: float = Field(default=0.0, ge=0, le=1)
    resolution_detail: Optional[str] = None
    
    @field_validator("weight_percentage", mode="before")
    @classmethod
    def normalize_weight(cls, v):
        """Convert decimal weights to percentage if needed."""
        if v is None:
            return 0.0
        v = float(v)
        # If weight looks like decimal (0.05), convert to percentage (5.0)
        # This is a heuristic - validation will catch if it's still wrong
        if 0 < v < 1 and v != 0:
            # Could be decimal format - flag for validation but don't auto-convert
            # Auto-conversion is dangerous, let validation catch it
            pass
        return v


class ETFDecomposition(BaseModel):
    """Decomposition result for a single ETF."""
    
    etf_isin: str = Field(..., min_length=12, max_length=12)
    etf_name: str
    etf_value: float = Field(..., ge=0)
    holdings: List[HoldingRecord] = Field(default_factory=list)
    source: str = Field(..., description="Where holdings came from: cached, hive, adapter, manual")
    
    # Quality metrics
    weight_sum: float = Field(default=0.0, description="Sum of all holding weights")
    holdings_count: int = 0
    resolved_count: int = 0
    unresolved_count: int = 0
    
    def model_post_init(self, __context):
        self.weight_sum = sum(h.weight_percentage for h in self.holdings)
        self.holdings_count = len(self.holdings)
        self.resolved_count = sum(1 for h in self.holdings if h.resolution_status == ResolutionStatus.RESOLVED)
        self.unresolved_count = self.holdings_count - self.resolved_count


class DecomposePhaseOutput(BaseModel):
    """Output of Phase 2: ETF Decomposition."""
    
    decompositions: List[ETFDecomposition] = Field(default_factory=list)
    etfs_processed: int = 0
    etfs_failed: int = 0
    total_holdings: int = 0
    
    def model_post_init(self, __context):
        self.etfs_processed = len(self.decompositions)
        self.total_holdings = sum(d.holdings_count for d in self.decompositions)


# =============================================================================
# Phase 3 Output: Enriched Holdings
# =============================================================================

class EnrichedHolding(HoldingRecord):
    """Holding with enrichment metadata added."""
    
    sector: str = Field(default="Unknown")
    geography: str = Field(default="Unknown")
    asset_class: AssetClass = Field(default=AssetClass.STOCK)
    enrichment_source: Optional[str] = None


class EnrichPhaseOutput(BaseModel):
    """Output of Phase 3: Enrichment."""
    
    enriched_decompositions: List[ETFDecomposition] = Field(default_factory=list)
    enriched_direct: List[LoadedPosition] = Field(default_factory=list)
    
    # Enrichment stats
    total_enriched: int = 0
    hive_hits: int = 0
    api_calls: int = 0
    enrichment_failures: int = 0


# =============================================================================
# Phase 4 Output: Aggregated Exposure
# =============================================================================

class AggregatedExposureRecord(BaseModel):
    """Single aggregated exposure record."""
    
    isin: str
    name: str
    sector: str = "Unknown"
    geography: str = "Unknown"
    asset_class: AssetClass = AssetClass.STOCK
    
    total_exposure: float = Field(..., ge=0)
    portfolio_percentage: float = Field(..., ge=0, le=100)
    
    # Source tracking
    direct_exposure: float = Field(default=0.0, ge=0)
    indirect_exposure: float = Field(default=0.0, ge=0)
    source_count: int = Field(default=1, description="Number of sources contributing")
    
    # Quality
    resolution_confidence: float = Field(default=0.0, ge=0, le=1)
    resolution_source: Optional[str] = None


class AggregatePhaseOutput(BaseModel):
    """Output of Phase 4: Aggregation."""
    
    exposures: List[AggregatedExposureRecord] = Field(default_factory=list)
    total_portfolio_value: float = Field(..., ge=0)
    
    # Aggregation stats
    unique_securities: int = 0
    resolved_securities: int = 0
    unresolved_securities: int = 0
    
    def model_post_init(self, __context):
        self.unique_securities = len(self.exposures)
        self.resolved_securities = sum(1 for e in self.exposures if not e.isin.startswith("UNRESOLVED:"))
        self.unresolved_securities = self.unique_securities - self.resolved_securities
```

### File: `core/contracts/quality.py`

```python
"""
Data Quality Tracking - Propagates quality scores through the pipeline.

Quality degrades as issues are encountered. User sees final score
and can drill into specific issues.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime


class IssueSeverity(Enum):
    """Severity levels for data quality issues."""
    
    CRITICAL = "critical"  # Calculation WILL be wrong (e.g., weight sum = 0.5)
    HIGH = "high"          # Calculation MAY be wrong (e.g., weight sum = 85%)
    MEDIUM = "medium"      # Data is incomplete (e.g., missing geography)
    LOW = "low"            # Cosmetic issue (e.g., name formatting)


class IssueCategory(Enum):
    """Categories for grouping issues."""
    
    SCHEMA = "schema"           # Missing/invalid columns
    WEIGHT = "weight"           # Weight sum issues
    RESOLUTION = "resolution"   # ISIN resolution failures
    ENRICHMENT = "enrichment"   # Missing metadata
    CURRENCY = "currency"       # Currency conversion issues
    VALUE = "value"             # Value calculation issues


@dataclass
class ValidationIssue:
    """Single data quality issue."""
    
    severity: IssueSeverity
    category: IssueCategory
    code: str                    # Machine-readable: "WEIGHT_SUM_LOW"
    message: str                 # Human-readable description
    fix_hint: str                # What user/community can do
    item: str                    # ISIN or identifier (safe to share)
    phase: str                   # Pipeline phase where detected
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    # Optional context
    expected: Optional[str] = None
    actual: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
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
        """Format for GitHub issue creation (anonymized)."""
        return {
            "severity": self.severity.value,
            "category": self.category.value,
            "code": self.code,
            "message": self.message,
            "fix_hint": self.fix_hint,
            "item": self.item,  # ISIN is safe to share
            "phase": self.phase,
        }


@dataclass
class DataQuality:
    """
    Quality score that propagates through the pipeline.
    
    Starts at 1.0 (perfect) and degrades as issues are encountered.
    Each record can carry its own DataQuality, and they aggregate
    at the pipeline level.
    """
    
    score: float = 1.0
    issues: List[ValidationIssue] = field(default_factory=list)
    
    # Penalty weights per severity
    PENALTIES = {
        IssueSeverity.CRITICAL: 0.30,
        IssueSeverity.HIGH: 0.15,
        IssueSeverity.MEDIUM: 0.05,
        IssueSeverity.LOW: 0.01,
    }
    
    def add_issue(self, issue: ValidationIssue) -> None:
        """Add issue and degrade score."""
        self.issues.append(issue)
        penalty = self.PENALTIES.get(issue.severity, 0.05)
        self.score = max(0.0, self.score - penalty)
    
    def merge(self, other: "DataQuality") -> None:
        """Merge another DataQuality into this one."""
        self.issues.extend(other.issues)
        # Recalculate score from all issues
        self.score = 1.0
        for issue in self.issues:
            penalty = self.PENALTIES.get(issue.severity, 0.05)
            self.score = max(0.0, self.score - penalty)
    
    @property
    def is_trustworthy(self) -> bool:
        """Score >= 0.95 means calculations are reliable."""
        return self.score >= 0.95
    
    @property
    def has_critical_issues(self) -> bool:
        """Check if any critical issues exist."""
        return any(i.severity == IssueSeverity.CRITICAL for i in self.issues)
    
    @property
    def issue_count_by_severity(self) -> Dict[str, int]:
        """Count issues by severity."""
        counts = {s.value: 0 for s in IssueSeverity}
        for issue in self.issues:
            counts[issue.severity.value] += 1
        return counts
    
    @property
    def issue_count_by_category(self) -> Dict[str, int]:
        """Count issues by category."""
        counts = {c.value: 0 for c in IssueCategory}
        for issue in self.issues:
            counts[issue.category.value] += 1
        return counts
    
    def get_issues_for_phase(self, phase: str) -> List[ValidationIssue]:
        """Get all issues from a specific phase."""
        return [i for i in self.issues if i.phase == phase]
    
    def to_summary(self) -> Dict[str, Any]:
        """Generate summary for UI display."""
        return {
            "score": round(self.score, 3),
            "score_percentage": round(self.score * 100, 1),
            "is_trustworthy": self.is_trustworthy,
            "has_critical_issues": self.has_critical_issues,
            "total_issues": len(self.issues),
            "by_severity": self.issue_count_by_severity,
            "by_category": self.issue_count_by_category,
            "issues": [i.to_dict() for i in self.issues],
        }
    
    def to_user_message(self) -> str:
        """Generate user-friendly message."""
        if self.is_trustworthy:
            return f"Data quality: {self.score * 100:.1f}% - Calculations are reliable"
        
        critical = sum(1 for i in self.issues if i.severity == IssueSeverity.CRITICAL)
        high = sum(1 for i in self.issues if i.severity == IssueSeverity.HIGH)
        
        if critical > 0:
            return f"Data quality: {self.score * 100:.1f}% - {critical} critical issue(s) affecting accuracy"
        elif high > 0:
            return f"Data quality: {self.score * 100:.1f}% - {high} issue(s) may affect accuracy"
        else:
            return f"Data quality: {self.score * 100:.1f}% - Some data is incomplete"
```

### File: `core/contracts/validation.py`

```python
"""
Validation Functions - Check data at phase boundaries.

Each function returns a list of ValidationIssues. Empty list = valid.
Pipeline continues regardless, but issues are tracked.
"""

from typing import List, Optional
import pandas as pd

from .quality import ValidationIssue, IssueSeverity, IssueCategory
from .schemas import (
    LoadedPosition, HoldingRecord, ETFDecomposition,
    AssetClass, ResolutionStatus
)


# =============================================================================
# Phase 1: Load Validation
# =============================================================================

def validate_loaded_positions(
    positions: List[LoadedPosition],
    phase: str = "DATA_LOADING",
) -> List[ValidationIssue]:
    """Validate positions loaded from database."""
    issues = []
    
    if not positions:
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.SCHEMA,
            code="NO_POSITIONS",
            message="No positions loaded from database",
            fix_hint="Sync portfolio data from Trade Republic",
            item="portfolio",
            phase=phase,
        ))
        return issues
    
    # Check for positions with zero/negative values
    zero_value_count = sum(1 for p in positions if p.market_value <= 0)
    if zero_value_count > 0:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.VALUE,
            code="ZERO_VALUE_POSITIONS",
            message=f"{zero_value_count} position(s) have zero or negative value",
            fix_hint="Update prices via sync or check quantity values",
            item="portfolio",
            phase=phase,
            expected="> 0",
            actual=f"{zero_value_count} positions",
        ))
    
    # Check for unknown asset classes
    unknown_count = sum(1 for p in positions if p.asset_class == AssetClass.UNKNOWN)
    if unknown_count > 0:
        issues.append(ValidationIssue(
            severity=IssueSeverity.LOW,
            category=IssueCategory.ENRICHMENT,
            code="UNKNOWN_ASSET_CLASS",
            message=f"{unknown_count} position(s) have unknown asset class",
            fix_hint="Asset classification will be attempted during enrichment",
            item="portfolio",
            phase=phase,
        ))
    
    # Check for non-EUR currencies
    non_eur = [p for p in positions if p.currency.upper() != "EUR"]
    if non_eur:
        currencies = set(p.currency for p in non_eur)
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.CURRENCY,
            code="NON_EUR_CURRENCY",
            message=f"{len(non_eur)} position(s) in non-EUR currency: {currencies}",
            fix_hint="Currency conversion not implemented - values may be incorrect",
            item="portfolio",
            phase=phase,
            expected="EUR",
            actual=str(currencies),
        ))
    
    return issues


# =============================================================================
# Phase 2: Decomposition Validation
# =============================================================================

def validate_holdings_weights(
    decomposition: ETFDecomposition,
    phase: str = "ETF_DECOMPOSITION",
) -> List[ValidationIssue]:
    """Validate that holdings weights are reasonable."""
    issues = []
    etf_isin = decomposition.etf_isin
    weight_sum = decomposition.weight_sum
    
    if not decomposition.holdings:
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.SCHEMA,
            code="NO_HOLDINGS",
            message=f"ETF {etf_isin} has no holdings data",
            fix_hint="Upload holdings CSV or wait for adapter fix",
            item=etf_isin,
            phase=phase,
        ))
        return issues
    
    # Check for likely decimal format (weights sum to ~1 instead of ~100)
    if 0.5 < weight_sum < 1.5:
        issues.append(ValidationIssue(
            severity=IssueSeverity.CRITICAL,
            category=IssueCategory.WEIGHT,
            code="WEIGHT_DECIMAL_FORMAT",
            message=f"Weight sum is {weight_sum:.2f}, likely decimal format (should be ~100)",
            fix_hint="Adapter may be returning weights as decimals - multiply by 100",
            item=etf_isin,
            phase=phase,
            expected="90-110",
            actual=f"{weight_sum:.2f}",
        ))
    elif weight_sum < 50:
        issues.append(ValidationIssue(
            severity=IssueSeverity.CRITICAL,
            category=IssueCategory.WEIGHT,
            code="WEIGHT_SUM_VERY_LOW",
            message=f"Weight sum is {weight_sum:.1f}%, far below expected 100%",
            fix_hint="Holdings data is severely incomplete or format is wrong",
            item=etf_isin,
            phase=phase,
            expected="90-110",
            actual=f"{weight_sum:.1f}",
        ))
    elif weight_sum < 90:
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.WEIGHT,
            code="WEIGHT_SUM_LOW",
            message=f"Weight sum is {weight_sum:.1f}%, below expected ~100%",
            fix_hint="Holdings data may be incomplete - some positions missing",
            item=etf_isin,
            phase=phase,
            expected="90-110",
            actual=f"{weight_sum:.1f}",
        ))
    elif weight_sum > 110:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.WEIGHT,
            code="WEIGHT_SUM_HIGH",
            message=f"Weight sum is {weight_sum:.1f}%, above expected ~100%",
            fix_hint="ETF may use leverage or include derivatives",
            item=etf_isin,
            phase=phase,
            expected="90-110",
            actual=f"{weight_sum:.1f}",
        ))
    
    # Check for negative weights
    negative_weights = [h for h in decomposition.holdings if h.weight_percentage < 0]
    if negative_weights:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.WEIGHT,
            code="NEGATIVE_WEIGHTS",
            message=f"{len(negative_weights)} holding(s) have negative weights (short positions)",
            fix_hint="Short positions are included - exposure calculation accounts for this",
            item=etf_isin,
            phase=phase,
        ))
    
    return issues


def validate_resolution_rate(
    decomposition: ETFDecomposition,
    min_resolution_rate: float = 0.80,
    phase: str = "ETF_DECOMPOSITION",
) -> List[ValidationIssue]:
    """Validate ISIN resolution rate for holdings."""
    issues = []
    
    if decomposition.holdings_count == 0:
        return issues  # Already caught by weight validation
    
    resolution_rate = decomposition.resolved_count / decomposition.holdings_count
    
    if resolution_rate < 0.50:
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.RESOLUTION,
            code="LOW_RESOLUTION_RATE",
            message=f"Only {resolution_rate:.0%} of holdings resolved for {decomposition.etf_isin}",
            fix_hint="Many holdings lack ISIN - contribute to community database",
            item=decomposition.etf_isin,
            phase=phase,
            expected=f">= {min_resolution_rate:.0%}",
            actual=f"{resolution_rate:.0%}",
        ))
    elif resolution_rate < min_resolution_rate:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.RESOLUTION,
            code="MODERATE_RESOLUTION_RATE",
            message=f"{resolution_rate:.0%} of holdings resolved for {decomposition.etf_isin}",
            fix_hint="Some holdings lack ISIN - aggregation will group by name",
            item=decomposition.etf_isin,
            phase=phase,
            expected=f">= {min_resolution_rate:.0%}",
            actual=f"{resolution_rate:.0%}",
        ))
    
    return issues


# =============================================================================
# Phase 3: Enrichment Validation
# =============================================================================

def validate_enrichment_coverage(
    holdings: List[HoldingRecord],
    etf_isin: str,
    phase: str = "ENRICHMENT",
) -> List[ValidationIssue]:
    """Validate that enrichment provided meaningful data."""
    issues = []
    
    if not holdings:
        return issues
    
    # Check sector coverage
    unknown_sector = sum(1 for h in holdings if getattr(h, 'sector', 'Unknown') == 'Unknown')
    sector_rate = 1 - (unknown_sector / len(holdings))
    
    if sector_rate < 0.50:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.ENRICHMENT,
            code="LOW_SECTOR_COVERAGE",
            message=f"Only {sector_rate:.0%} of holdings have sector data",
            fix_hint="Sector breakdown will be incomplete",
            item=etf_isin,
            phase=phase,
        ))
    
    # Check geography coverage
    unknown_geo = sum(1 for h in holdings if getattr(h, 'geography', 'Unknown') == 'Unknown')
    geo_rate = 1 - (unknown_geo / len(holdings))
    
    if geo_rate < 0.50:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.ENRICHMENT,
            code="LOW_GEOGRAPHY_COVERAGE",
            message=f"Only {geo_rate:.0%} of holdings have geography data",
            fix_hint="Geographic breakdown will be incomplete",
            item=etf_isin,
            phase=phase,
        ))
    
    return issues


# =============================================================================
# Phase 4: Aggregation Validation
# =============================================================================

def validate_aggregation_totals(
    calculated_total: float,
    expected_total: float,
    tolerance: float = 0.01,
    phase: str = "AGGREGATION",
) -> List[ValidationIssue]:
    """Validate that aggregated totals match expected portfolio value."""
    issues = []
    
    if expected_total <= 0:
        issues.append(ValidationIssue(
            severity=IssueSeverity.CRITICAL,
            category=IssueCategory.VALUE,
            code="ZERO_PORTFOLIO_VALUE",
            message="Portfolio total value is zero or negative",
            fix_hint="Check position quantities and prices",
            item="portfolio",
            phase=phase,
        ))
        return issues
    
    difference = abs(calculated_total - expected_total)
    difference_pct = difference / expected_total
    
    if difference_pct > 0.10:
        issues.append(ValidationIssue(
            severity=IssueSeverity.CRITICAL,
            category=IssueCategory.VALUE,
            code="TOTAL_MISMATCH_LARGE",
            message=f"Aggregated total differs from expected by {difference_pct:.1%}",
            fix_hint="Significant calculation error - check weight sums and value calculations",
            item="portfolio",
            phase=phase,
            expected=f"€{expected_total:,.2f}",
            actual=f"€{calculated_total:,.2f}",
        ))
    elif difference_pct > tolerance:
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.VALUE,
            code="TOTAL_MISMATCH",
            message=f"Aggregated total differs from expected by {difference_pct:.1%}",
            fix_hint="Minor discrepancy - may be due to rounding or incomplete holdings",
            item="portfolio",
            phase=phase,
            expected=f"€{expected_total:,.2f}",
            actual=f"€{calculated_total:,.2f}",
        ))
    
    return issues


def validate_percentage_sum(
    exposures: List,  # List of records with portfolio_percentage
    phase: str = "AGGREGATION",
) -> List[ValidationIssue]:
    """Validate that portfolio percentages sum to ~100%."""
    issues = []
    
    if not exposures:
        return issues
    
    pct_sum = sum(getattr(e, 'portfolio_percentage', 0) for e in exposures)
    
    if pct_sum < 95:
        issues.append(ValidationIssue(
            severity=IssueSeverity.HIGH,
            category=IssueCategory.VALUE,
            code="PERCENTAGE_SUM_LOW",
            message=f"Portfolio percentages sum to {pct_sum:.1f}%, expected ~100%",
            fix_hint="Some exposure may be missing from aggregation",
            item="portfolio",
            phase=phase,
            expected="95-105%",
            actual=f"{pct_sum:.1f}%",
        ))
    elif pct_sum > 105:
        issues.append(ValidationIssue(
            severity=IssueSeverity.MEDIUM,
            category=IssueCategory.VALUE,
            code="PERCENTAGE_SUM_HIGH",
            message=f"Portfolio percentages sum to {pct_sum:.1f}%, above expected ~100%",
            fix_hint="May include leveraged positions or calculation overlap",
            item="portfolio",
            phase=phase,
            expected="95-105%",
            actual=f"{pct_sum:.1f}%",
        ))
    
    return issues
```

### Tests for Phase 1

Create `tests/test_contracts.py`:

```python
"""Tests for pipeline contracts."""

import pytest
from portfolio_src.core.contracts.schemas import (
    LoadedPosition, HoldingRecord, ETFDecomposition,
    AssetClass, ResolutionStatus
)
from portfolio_src.core.contracts.quality import (
    DataQuality, ValidationIssue, IssueSeverity, IssueCategory
)
from portfolio_src.core.contracts.validation import (
    validate_holdings_weights,
    validate_loaded_positions,
    validate_aggregation_totals,
)


class TestSchemas:
    """Test Pydantic schema validation."""
    
    def test_loaded_position_valid(self):
        pos = LoadedPosition(
            isin="US0378331005",
            name="Apple Inc",
            quantity=10.0,
            current_price=150.0,
        )
        assert pos.market_value == 1500.0
    
    def test_loaded_position_invalid_isin(self):
        with pytest.raises(ValueError):
            LoadedPosition(
                isin="INVALID",
                name="Test",
                quantity=10.0,
            )
    
    def test_asset_class_normalization(self):
        pos = LoadedPosition(
            isin="US0378331005",
            name="Test",
            quantity=10.0,
            asset_class="etf",  # lowercase
        )
        assert pos.asset_class == AssetClass.ETF


class TestDataQuality:
    """Test quality score propagation."""
    
    def test_initial_score(self):
        dq = DataQuality()
        assert dq.score == 1.0
        assert dq.is_trustworthy
    
    def test_critical_issue_degrades_score(self):
        dq = DataQuality()
        dq.add_issue(ValidationIssue(
            severity=IssueSeverity.CRITICAL,
            category=IssueCategory.WEIGHT,
            code="TEST",
            message="Test",
            fix_hint="Test",
            item="TEST",
            phase="TEST",
        ))
        assert dq.score == 0.70
        assert not dq.is_trustworthy
    
    def test_multiple_issues_accumulate(self):
        dq = DataQuality()
        for _ in range(3):
            dq.add_issue(ValidationIssue(
                severity=IssueSeverity.MEDIUM,
                category=IssueCategory.ENRICHMENT,
                code="TEST",
                message="Test",
                fix_hint="Test",
                item="TEST",
                phase="TEST",
            ))
        assert dq.score == 0.85  # 1.0 - (3 * 0.05)


class TestValidation:
    """Test validation functions."""
    
    def test_weight_sum_valid(self):
        decomp = ETFDecomposition(
            etf_isin="IE00B4L5Y983",
            etf_name="Test ETF",
            etf_value=10000.0,
            holdings=[
                HoldingRecord(name="A", weight_percentage=50.0),
                HoldingRecord(name="B", weight_percentage=50.0),
            ],
            source="test",
        )
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 0
    
    def test_weight_sum_decimal_format(self):
        decomp = ETFDecomposition(
            etf_isin="IE00B4L5Y983",
            etf_name="Test ETF",
            etf_value=10000.0,
            holdings=[
                HoldingRecord(name="A", weight_percentage=0.50),
                HoldingRecord(name="B", weight_percentage=0.50),
            ],
            source="test",
        )
        issues = validate_holdings_weights(decomp)
        assert len(issues) == 1
        assert issues[0].code == "WEIGHT_DECIMAL_FORMAT"
        assert issues[0].severity == IssueSeverity.CRITICAL
```

### Phase 1 Acceptance Criteria

- [ ] All schema classes defined with Pydantic validation
- [ ] DataQuality class tracks score and issues
- [ ] Validation functions for each phase boundary
- [ ] 100% test coverage for contracts
- [ ] Documentation in docstrings

---

## Phase 2: Validation Gates (2-3 Days)

### Objective

Integrate validation functions into the pipeline. Each phase boundary validates its output and records issues without stopping execution.

### Deliverables

1. **Modified `core/pipeline.py`** - Add validation calls at phase boundaries
2. **Modified services** - Return quality metadata alongside data
3. **`core/contracts/gates.py`** - Validation gate orchestration
4. **Integration tests** for validation flow

### File: `core/contracts/gates.py`

```python
"""
Validation Gates - Orchestrates validation at phase boundaries.

Gates validate data and collect issues without stopping the pipeline.
"""

from typing import Tuple, List, Any
from dataclasses import dataclass

from .quality import DataQuality, ValidationIssue
from .validation import (
    validate_loaded_positions,
    validate_holdings_weights,
    validate_resolution_rate,
    validate_enrichment_coverage,
    validate_aggregation_totals,
    validate_percentage_sum,
)
from .schemas import (
    LoadPhaseOutput, DecomposePhaseOutput, EnrichPhaseOutput,
    AggregatePhaseOutput, ETFDecomposition
)


@dataclass
class GateResult:
    """Result of a validation gate."""
    passed: bool  # True if no critical issues
    quality: DataQuality
    data: Any  # The validated data


class ValidationGates:
    """
    Orchestrates validation at each pipeline phase boundary.
    
    Usage:
        gates = ValidationGates()
        result = gates.validate_load_output(positions)
        if not result.passed:
            logger.warning(f"Load phase has issues: {result.quality.issues}")
        # Continue anyway - pipeline always runs
    """
    
    def __init__(self):
        self.pipeline_quality = DataQuality()
    
    def validate_load_output(
        self,
        output: LoadPhaseOutput,
    ) -> GateResult:
        """Validate Phase 1 output."""
        quality = DataQuality()
        
        # Validate direct positions
        issues = validate_loaded_positions(
            output.direct_positions,
            phase="DATA_LOADING",
        )
        for issue in issues:
            quality.add_issue(issue)
        
        # Validate ETF positions
        issues = validate_loaded_positions(
            output.etf_positions,
            phase="DATA_LOADING",
        )
        for issue in issues:
            quality.add_issue(issue)
        
        self.pipeline_quality.merge(quality)
        
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )
    
    def validate_decompose_output(
        self,
        output: DecomposePhaseOutput,
    ) -> GateResult:
        """Validate Phase 2 output."""
        quality = DataQuality()
        
        for decomp in output.decompositions:
            # Validate weight sums
            issues = validate_holdings_weights(decomp)
            for issue in issues:
                quality.add_issue(issue)
            
            # Validate resolution rate
            issues = validate_resolution_rate(decomp)
            for issue in issues:
                quality.add_issue(issue)
        
        self.pipeline_quality.merge(quality)
        
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )
    
    def validate_enrich_output(
        self,
        output: EnrichPhaseOutput,
    ) -> GateResult:
        """Validate Phase 3 output."""
        quality = DataQuality()
        
        for decomp in output.enriched_decompositions:
            issues = validate_enrichment_coverage(
                decomp.holdings,
                decomp.etf_isin,
            )
            for issue in issues:
                quality.add_issue(issue)
        
        self.pipeline_quality.merge(quality)
        
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
        """Validate Phase 4 output."""
        quality = DataQuality()
        
        # Validate totals match
        issues = validate_aggregation_totals(
            output.total_portfolio_value,
            expected_total,
        )
        for issue in issues:
            quality.add_issue(issue)
        
        # Validate percentages sum correctly
        issues = validate_percentage_sum(output.exposures)
        for issue in issues:
            quality.add_issue(issue)
        
        self.pipeline_quality.merge(quality)
        
        return GateResult(
            passed=not quality.has_critical_issues,
            quality=quality,
            data=output,
        )
    
    def get_pipeline_quality(self) -> DataQuality:
        """Get accumulated quality for entire pipeline run."""
        return self.pipeline_quality
    
    def get_summary(self) -> dict:
        """Get summary suitable for pipeline_health.json."""
        return {
            "quality_score": self.pipeline_quality.score,
            "is_trustworthy": self.pipeline_quality.is_trustworthy,
            "total_issues": len(self.pipeline_quality.issues),
            "by_severity": self.pipeline_quality.issue_count_by_severity,
            "by_category": self.pipeline_quality.issue_count_by_category,
            "issues": [i.to_dict() for i in self.pipeline_quality.issues],
        }
```

### Pipeline Integration

Modify `core/pipeline.py` to use validation gates:

```python
# In Pipeline.__init__
from portfolio_src.core.contracts.gates import ValidationGates
self._validation_gates = ValidationGates()

# After each phase, add validation
def _run_load_phase(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
    direct, etfs = self._load_portfolio()
    
    # Convert to contract types and validate
    from portfolio_src.core.contracts.schemas import LoadPhaseOutput, LoadedPosition
    output = LoadPhaseOutput(
        direct_positions=[LoadedPosition(**row) for row in direct.to_dict('records')],
        etf_positions=[LoadedPosition(**row) for row in etfs.to_dict('records')],
    )
    
    result = self._validation_gates.validate_load_output(output)
    if not result.passed:
        self._log_validation_issues(result.quality, "DATA_LOADING")
    
    return direct, etfs

def _log_validation_issues(self, quality: DataQuality, phase: str):
    """Log validation issues and add to pipeline errors."""
    for issue in quality.issues:
        if issue.severity in (IssueSeverity.CRITICAL, IssueSeverity.HIGH):
            logger.warning(f"[{phase}] {issue.code}: {issue.message}")
        else:
            logger.info(f"[{phase}] {issue.code}: {issue.message}")
```

### Phase 2 Acceptance Criteria

- [ ] ValidationGates class orchestrates all validation
- [ ] Pipeline calls validation after each phase
- [ ] Issues logged with appropriate severity
- [ ] Pipeline continues even with critical issues
- [ ] Quality summary included in pipeline_health.json

---

## Phase 3: Quality Propagation (2-3 Days)

### Objective

Make quality visible to users. Each output record carries quality metadata, and the UI shows quality indicators.

### Deliverables

1. **Modified output schemas** - Add quality columns to DataFrames
2. **`pipeline_health.json` enhancement** - Include quality summary
3. **SSE broadcast enhancement** - Include quality in real-time updates
4. **User-facing quality messages** - Clear, actionable feedback

### Output Schema Changes

Add to `true_exposure.csv`:

| Column | Type | Description |
|--------|------|-------------|
| `data_quality_score` | float | 0.0-1.0 quality score for this record |
| `quality_issues` | str | Comma-separated issue codes |
| `needs_attention` | bool | True if any HIGH/CRITICAL issues |

### Enhanced pipeline_health.json

```json
{
  "timestamp": "2026-01-10T04:12:37",
  "data_quality": {
    "overall_score": 0.87,
    "is_trustworthy": false,
    "user_message": "Data quality: 87% - 2 issue(s) may affect accuracy",
    "issues_summary": {
      "critical": 0,
      "high": 2,
      "medium": 5,
      "low": 3
    },
    "top_issues": [
      {
        "severity": "high",
        "code": "WEIGHT_SUM_LOW",
        "message": "Weight sum is 85.2%, below expected ~100%",
        "item": "IE00B4L5Y983",
        "fix_hint": "Holdings data may be incomplete"
      }
    ],
    "by_phase": {
      "DATA_LOADING": {"score": 1.0, "issues": 0},
      "ETF_DECOMPOSITION": {"score": 0.85, "issues": 2},
      "ENRICHMENT": {"score": 0.95, "issues": 5},
      "AGGREGATION": {"score": 1.0, "issues": 0}
    }
  },
  "metrics": { ... },
  "performance": { ... }
}
```

### SSE Broadcast Enhancement

Modify `PipelineSummaryData` in `echo_bridge.py`:

```python
class QualitySummary(TypedDict):
    score: float
    is_trustworthy: bool
    user_message: str
    critical_count: int
    high_count: int
    top_issues: List[Dict[str, Any]]

class PipelineSummaryData(TypedDict):
    holdings: HoldingsSummary
    decomposition: DecompositionSummary
    resolution: ResolutionSummary
    timing: TimingSummary
    quality: QualitySummary  # NEW
    unresolved: List[UnresolvedItem]
    unresolved_truncated: bool
    unresolved_total: int
```

### Phase 3 Acceptance Criteria

- [ ] Quality score visible in pipeline_health.json
- [ ] Top issues listed with fix hints
- [ ] SSE broadcasts include quality summary
- [ ] User message is clear and actionable
- [ ] Per-phase quality breakdown available

---

## Phase 4: Telemetry Expansion (2-3 Days)

### Objective

Automatically report data quality issues to GitHub so the community can contribute fixes.

### Deliverables

1. **New telemetry methods** for data quality issues
2. **Aggregated reporting** (not per-record spam)
3. **Fix contribution workflow** documentation
4. **Rate limiting** for quality reports

### New Telemetry Methods

Add to `prism_utils/telemetry.py`:

```python
def report_weight_validation_failure(
    self,
    etf_isin: str,
    weight_sum: float,
    adapter: str,
) -> Optional[str]:
    """Report ETF with invalid weight sum."""
    title = f"Weight validation failed: {etf_isin}"
    body = (
        f"## Weight Validation Failure\n\n"
        f"ETF holdings weights don't sum to ~100%.\n\n"
        f"| Field | Value |\n"
        f"|-------|-------|\n"
        f"| ISIN | `{etf_isin}` |\n"
        f"| Weight Sum | {weight_sum:.1f}% |\n"
        f"| Expected | 90-110% |\n"
        f"| Adapter | {adapter} |\n\n"
        f"### Impact\n"
        f"Exposure calculations will be {'under' if weight_sum < 100 else 'over'}counted "
        f"by approximately {abs(100 - weight_sum):.1f}%.\n\n"
        f"### Requested Action\n"
        f"1. Check if adapter is fetching all holdings\n"
        f"2. Verify weight format (percentage vs decimal)\n"
        f"3. Upload corrected holdings CSV if available\n"
    )
    
    return self.report_error(
        error_type="weight_validation",
        title=title,
        body=body,
        isin=etf_isin,
        labels=["data-quality", "validation", adapter],
    )

def report_enrichment_gap(
    self,
    gap_type: str,  # "sector" or "geography"
    affected_isins: List[str],
    coverage_rate: float,
) -> Optional[str]:
    """Report enrichment coverage gap."""
    # Aggregate report - not per-ISIN
    title = f"Enrichment gap: {gap_type} coverage at {coverage_rate:.0%}"
    
    # Only include first 10 ISINs to avoid spam
    sample_isins = affected_isins[:10]
    isin_list = "\n".join(f"- `{isin}`" for isin in sample_isins)
    
    body = (
        f"## Enrichment Coverage Gap\n\n"
        f"Many assets are missing {gap_type} data.\n\n"
        f"| Metric | Value |\n"
        f"|--------|-------|\n"
        f"| Gap Type | {gap_type} |\n"
        f"| Coverage | {coverage_rate:.0%} |\n"
        f"| Affected Assets | {len(affected_isins)} |\n\n"
        f"### Sample ISINs\n{isin_list}\n"
    )
    
    if len(affected_isins) > 10:
        body += f"\n*...and {len(affected_isins) - 10} more*\n"
    
    body += (
        f"\n### Requested Action\n"
        f"Contribute {gap_type} data to the community asset database.\n"
    )
    
    # Use hash of ISINs for rate limiting
    import hashlib
    batch_hash = hashlib.md5("".join(sorted(affected_isins)).encode()).hexdigest()[:8]
    
    return self.report_error(
        error_type="enrichment_gap",
        title=title,
        body=body,
        isin=batch_hash,
        labels=["data-quality", "enrichment", gap_type],
    )

def report_quality_summary(
    self,
    quality: "DataQuality",
    session_id: str,
) -> Optional[str]:
    """Report aggregated quality summary for a pipeline run."""
    if quality.is_trustworthy:
        return None  # Don't report good runs
    
    critical = quality.issue_count_by_severity.get("critical", 0)
    high = quality.issue_count_by_severity.get("high", 0)
    
    if critical == 0 and high == 0:
        return None  # Only report significant issues
    
    title = f"Quality issues: {critical} critical, {high} high"
    
    # Group issues by code
    by_code = {}
    for issue in quality.issues:
        if issue.code not in by_code:
            by_code[issue.code] = []
        by_code[issue.code].append(issue)
    
    body = (
        f"## Pipeline Quality Report\n\n"
        f"| Metric | Value |\n"
        f"|--------|-------|\n"
        f"| Quality Score | {quality.score:.0%} |\n"
        f"| Critical Issues | {critical} |\n"
        f"| High Issues | {high} |\n"
        f"| Session | `{session_id}` |\n\n"
        f"### Issues by Type\n\n"
    )
    
    for code, issues in sorted(by_code.items(), key=lambda x: -len(x[1])):
        sample = issues[0]
        body += (
            f"#### {code} ({len(issues)} occurrences)\n"
            f"- Severity: {sample.severity.value}\n"
            f"- Message: {sample.message}\n"
            f"- Fix: {sample.fix_hint}\n\n"
        )
    
    return self.report_error(
        error_type="quality_summary",
        title=title,
        body=body,
        isin=session_id,
        labels=["data-quality", "summary"],
    )
```

### Rate Limiting for Quality Reports

Add to `RATE_LIMITS`:

```python
RATE_LIMITS = {
    # Existing...
    "weight_validation": {"per_isin": True, "max_per_day": 5},
    "enrichment_gap": {"per_isin": True, "max_per_day": 3},
    "quality_summary": {"per_isin": False, "max_per_day": 10},
}
```

### Phase 4 Acceptance Criteria

- [ ] New telemetry methods for data quality issues
- [ ] Aggregated reporting (not per-record)
- [ ] Rate limiting prevents spam
- [ ] GitHub issues include fix hints
- [ ] Labels enable filtering/triage

---

## Phase 5: Bug Fixes (3-5 Days)

### Objective

Fix the 16 identified issues from the code review. With contracts and validation in place, we can verify each fix.

### Issue Priority Order

Fix in this order (dependencies and impact):

#### Critical (Day 1-2)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | NaN handling in asset_class split | `pipeline.py:472-473` | Use `.fillna("").str.upper()` |
| 2 | Weight sum validation | `decomposer.py` | Add validation, auto-detect decimal format |
| 3 | Geography always "Unknown" | `enricher.py` | Populate from Hive/API |

#### High (Day 2-3)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 4 | Synchronous Hive contribution | `decomposer.py:197-202` | Move to background thread |
| 5 | First-wins name/sector | `aggregator.py:117-119` | Use highest-confidence source |
| 6 | Vectorized claim false | `pipeline.py:623-656` | Use actual vectorized ops |

#### Medium (Day 3-4)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 7 | No ISIN deduplication | `decomposer.py` | Dedupe before enrichment |
| 8 | Sector/asset_class conflation | `enricher.py:66` | Separate concepts |
| 9 | No currency conversion | `aggregator.py` | Add validation, flag non-EUR |
| 10 | Division by zero risk | `aggregator.py:140-143` | Return NaN or raise |
| 11 | Inconsistent value logic | `pipeline.py:667-703` | Use single source of truth |
| 12 | Non-atomic CSV writes | `pipeline.py:495-505` | Use atomic writes |

#### Low (Day 4-5)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 13 | Hardcoded portfolio_id | `pipeline.py:466` | Add parameter |
| 14 | Negative weight clipping | `ishares.py:208-210` | Preserve or flag |
| 15 | Tier naming confusion | `resolution.py:185` | Rename variables |
| 16 | No rate limiting on batch | `enricher.py:138-140` | Add throttling |

### Fix Verification Process

For each fix:

1. **Write failing test** that demonstrates the bug
2. **Implement fix**
3. **Verify test passes**
4. **Run validation gates** to confirm no regressions
5. **Update CHANGELOG.md**

### Example Fix: NaN Handling (Issue #1)

```python
# Before (buggy)
direct = df[df["asset_class"].str.upper() != "ETF"].copy()
etfs = df[df["asset_class"].str.upper() == "ETF"].copy()

# After (fixed)
asset_class_upper = df["asset_class"].fillna("").str.upper()
direct = df[asset_class_upper != "ETF"].copy()
etfs = df[asset_class_upper == "ETF"].copy()
```

Test:

```python
def test_load_handles_nan_asset_class():
    """Regression test for NaN asset_class handling."""
    positions = [
        {"isin": "US0378331005", "name": "Apple", "quantity": 10, "asset_class": None},
        {"isin": "IE00B4L5Y983", "name": "iShares", "quantity": 5, "asset_class": "ETF"},
    ]
    df = pd.DataFrame(positions)
    
    # This should not raise AttributeError
    direct, etfs = pipeline._split_positions(df)
    
    assert len(direct) == 1
    assert len(etfs) == 1
```

### Phase 5 Acceptance Criteria

- [ ] All 16 issues have corresponding tests
- [ ] All tests pass
- [ ] Validation gates show no regressions
- [ ] CHANGELOG.md updated for each fix
- [ ] Quality score improved (measure before/after)

---

## Success Metrics

### Accuracy Targets

| Milestone | Target | Measurement |
|-----------|--------|-------------|
| Phase 1 Complete | Baseline | Measure current accuracy |
| Phase 2 Complete | 85% | Validation catches issues |
| Phase 3 Complete | 90% | User sees quality scores |
| Phase 4 Complete | 92% | Community fixes flowing |
| Phase 5 Complete | 95% | All bugs fixed |
| Ongoing | 99.9% | Continuous improvement |

### Quality Score Tracking

After each phase, run pipeline on test portfolio and record:

- Overall quality score
- Issues by severity
- Issues by category
- Specific issue codes

### User Trust Indicators

- Portfolio value matches Trade Republic (within 0.1%)
- No critical issues in quality report
- Quality score >= 95%

---

## Risk Mitigation

### Risk: Contracts Too Strict

**Mitigation:** Start with warnings, not errors. Pipeline always runs.

### Risk: Performance Degradation

**Mitigation:** Validation is O(n) and adds <1s to pipeline. Profile if needed.

### Risk: Too Many GitHub Issues

**Mitigation:** Aggressive rate limiting. Aggregate reports. Review after 1 week.

### Risk: Breaking Changes

**Mitigation:** All changes behind feature flags initially. Gradual rollout.

---

## Timeline Summary

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| Week 1 | Phase 1 + 2 | Contracts defined, validation gates active |
| Week 2 | Phase 3 + 4 | Quality visible to users, telemetry expanded |
| Week 3 | Phase 5 | All bugs fixed, 95% accuracy achieved |

---

## Next Steps

1. **Review this plan** - Confirm priorities and timeline
2. **Create workstream** - Initialize Keystone workstream for tracking
3. **Start Phase 1** - Define contracts (2-3 days)
4. **Measure baseline** - Run pipeline, record current quality score

---

## Appendix: File Changes Summary

| File | Changes |
|------|---------|
| `core/contracts/__init__.py` | NEW - Package init |
| `core/contracts/schemas.py` | NEW - Pydantic schemas |
| `core/contracts/quality.py` | NEW - DataQuality class |
| `core/contracts/validation.py` | NEW - Validation functions |
| `core/contracts/gates.py` | NEW - Validation orchestration |
| `core/pipeline.py` | MODIFY - Add validation calls |
| `core/services/decomposer.py` | MODIFY - Return quality metadata |
| `core/services/enricher.py` | MODIFY - Fix geography, return quality |
| `core/services/aggregator.py` | MODIFY - Use highest-confidence, validate |
| `prism_utils/telemetry.py` | MODIFY - Add quality report methods |
| `headless/transports/echo_bridge.py` | MODIFY - Add quality to SSE |
| `tests/test_contracts.py` | NEW - Contract tests |
| `tests/test_validation_gates.py` | NEW - Gate tests |
| `tests/test_bug_fixes.py` | NEW - Regression tests |
