"""Pipeline Phase Contracts - Pydantic models defining exact data shapes at each pipeline boundary."""

from __future__ import annotations

from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class AssetClass(str, Enum):
    """Asset classification types."""

    STOCK = "Stock"
    ETF = "ETF"
    BOND = "Bond"
    CASH = "Cash"
    CRYPTO = "Crypto"
    DERIVATIVE = "Derivative"
    UNKNOWN = "Unknown"


class ResolutionStatus(str, Enum):
    """ISIN resolution status for holdings."""

    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"
    SKIPPED = "skipped"


class LoadedPosition(BaseModel):
    """A single position loaded from the database."""

    isin: str = Field(
        ..., min_length=12, max_length=12, pattern=r"^[A-Z]{2}[A-Z0-9]{10}$"
    )
    name: str = Field(..., min_length=1)
    quantity: float
    current_price: Optional[float] = Field(default=None, ge=0)
    cost_basis: Optional[float] = Field(default=None, ge=0)
    asset_class: AssetClass = AssetClass.UNKNOWN
    symbol: Optional[str] = None
    sector: Optional[str] = None
    region: Optional[str] = None
    currency: str = "EUR"

    @field_validator("asset_class", mode="before")
    @classmethod
    def normalize_asset_class(cls, v: Any) -> AssetClass:
        if v is None or v == "":
            return AssetClass.UNKNOWN
        if isinstance(v, AssetClass):
            return v
        if isinstance(v, str):
            v_upper = v.upper()
            for ac in AssetClass:
                if ac.value.upper() == v_upper or ac.name == v_upper:
                    return ac
            return AssetClass.UNKNOWN
        return AssetClass.UNKNOWN

    @property
    def market_value(self) -> float:
        price = self.current_price or self.cost_basis or 0.0
        return self.quantity * price


class LoadPhaseOutput(BaseModel):
    """Container for Load phase results."""

    direct_positions: List[LoadedPosition] = Field(default_factory=list)
    etf_positions: List[LoadedPosition] = Field(default_factory=list)
    total_positions: int = 0
    total_value: float = 0.0

    @model_validator(mode="after")
    def compute_totals(self) -> "LoadPhaseOutput":
        self.total_positions = len(self.direct_positions) + len(self.etf_positions)
        total = sum(p.market_value for p in self.direct_positions)
        total += sum(p.market_value for p in self.etf_positions)
        self.total_value = total
        return self


class HoldingRecord(BaseModel):
    """Single holding within an ETF."""

    ticker: Optional[str] = None
    raw_ticker: Optional[str] = None
    name: str = Field(..., min_length=1)
    weight_percentage: float = Field(default=0.0, ge=0, le=150)
    isin: Optional[str] = Field(
        default=None, min_length=12, max_length=12, pattern=r"^[A-Z]{2}[A-Z0-9]{10}$"
    )
    resolution_status: ResolutionStatus = ResolutionStatus.UNRESOLVED
    resolution_source: Optional[str] = None
    resolution_confidence: float = Field(default=0.0, ge=0, le=1)
    resolution_detail: Optional[str] = None

    @field_validator("weight_percentage", mode="before")
    @classmethod
    def normalize_weight(cls, v: Any) -> float:
        if v is None:
            return 0.0
        return float(v)

    @field_validator("isin", mode="before")
    @classmethod
    def validate_optional_isin(cls, v: Any) -> Optional[str]:
        if v is None or v == "":
            return None
        return v


class ETFDecomposition(BaseModel):
    """Decomposition result for a single ETF."""

    etf_isin: str = Field(
        ..., min_length=12, max_length=12, pattern=r"^[A-Z]{2}[A-Z0-9]{10}$"
    )
    etf_name: str
    etf_value: float = Field(..., ge=0)
    holdings: List[HoldingRecord] = Field(default_factory=list)
    source: str = "unknown"
    weight_sum: float = 0.0
    holdings_count: int = 0
    resolved_count: int = 0
    unresolved_count: int = 0

    @model_validator(mode="after")
    def compute_stats(self) -> "ETFDecomposition":
        self.weight_sum = sum(h.weight_percentage for h in self.holdings)
        self.holdings_count = len(self.holdings)
        resolved = sum(
            1 for h in self.holdings if h.resolution_status == ResolutionStatus.RESOLVED
        )
        self.resolved_count = resolved
        self.unresolved_count = len(self.holdings) - resolved
        return self


class DecomposePhaseOutput(BaseModel):
    """Container for Decompose phase results."""

    decompositions: List[ETFDecomposition] = Field(default_factory=list)
    etfs_processed: int = 0
    etfs_failed: int = 0
    total_holdings: int = 0

    @model_validator(mode="after")
    def compute_totals(self) -> "DecomposePhaseOutput":
        self.etfs_processed = len(self.decompositions)
        self.total_holdings = sum(d.holdings_count for d in self.decompositions)
        return self


class EnrichedHolding(HoldingRecord):
    """Holding with enrichment metadata added."""

    sector: str = "Unknown"
    geography: str = "Unknown"
    asset_class: AssetClass = AssetClass.STOCK
    enrichment_source: Optional[str] = None


class EnrichPhaseOutput(BaseModel):
    """Container for Enrich phase results."""

    enriched_decompositions: List[ETFDecomposition] = Field(default_factory=list)
    enriched_direct: List[LoadedPosition] = Field(default_factory=list)
    total_enriched: int = 0
    hive_hits: int = 0
    api_calls: int = 0
    enrichment_failures: int = 0


class AggregatedExposureRecord(BaseModel):
    """Single aggregated exposure record."""

    isin: str  # Can be ISIN or "UNRESOLVED:..." pattern
    name: str
    sector: str = "Unknown"
    geography: str = "Unknown"
    asset_class: AssetClass = AssetClass.STOCK
    total_exposure: float = Field(..., ge=0)
    portfolio_percentage: float = Field(..., ge=0, le=200)
    direct_exposure: float = Field(default=0.0, ge=0)
    indirect_exposure: float = Field(default=0.0, ge=0)
    source_count: int = 1
    resolution_confidence: float = Field(default=0.0, ge=0, le=1)
    resolution_source: Optional[str] = None


class AggregatePhaseOutput(BaseModel):
    """Container for Aggregate phase results."""

    exposures: List[AggregatedExposureRecord] = Field(default_factory=list)
    total_portfolio_value: float = Field(..., ge=0)
    unique_securities: int = 0
    resolved_securities: int = 0
    unresolved_securities: int = 0

    @model_validator(mode="after")
    def compute_counts(self) -> "AggregatePhaseOutput":
        self.unique_securities = len(self.exposures)
        unresolved = sum(1 for e in self.exposures if e.isin.startswith("UNRESOLVED:"))
        self.unresolved_securities = unresolved
        self.resolved_securities = len(self.exposures) - unresolved
        return self
