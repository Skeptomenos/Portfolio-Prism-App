"""
Pydantic models for type-safe data structures throughout the pipeline.

This module provides strongly-typed data containers that:
- Define expected fields and types
- Validate data automatically at creation
- Enable IDE autocomplete and error detection
- Document data structure in code

Usage:
    from models import Position, ETFHolding, ExposureRecord
"""

from models.portfolio import Position, DirectPosition, ETFPosition
from models.holdings import ETFHolding, ClassifiedHolding, EnrichedHolding
from models.exposure import ExposureRecord, AggregatedExposure

__all__ = [
    # Portfolio models
    "Position",
    "DirectPosition",
    "ETFPosition",
    # Holdings models
    "ETFHolding",
    "ClassifiedHolding",
    "EnrichedHolding",
    # Exposure models
    "ExposureRecord",
    "AggregatedExposure",
]
