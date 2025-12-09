# core/services/__init__.py
"""
Services package for the analytics pipeline.

Services are UI-agnostic and can be used with both Streamlit and React.
"""

from .decomposer import Decomposer
from .enricher import Enricher
from .aggregator import Aggregator

__all__ = ["Decomposer", "Enricher", "Aggregator"]
