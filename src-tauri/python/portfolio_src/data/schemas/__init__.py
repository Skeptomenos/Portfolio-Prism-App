"""Schema validation utilities for external API responses.

This module provides type-safe validation for all external data sources
using Pydantic models. All external API responses MUST be validated
before use to ensure data integrity and catch API changes early.

Usage:
    from portfolio_src.data.schemas import validate_response, validate_response_safe
    from portfolio_src.data.schemas.external_api import WikidataResponse

    # Strict validation (raises on failure)
    validated = validate_response(WikidataResponse, response.json())

    # Safe validation (returns None on failure)
    validated = validate_response_safe(WikidataResponse, response.json())
"""

import logging
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from portfolio_src.data.schemas.external_api import (
    FinnhubProfileResponse,
    FinnhubQuoteResponse,
    WikidataResponse,
    YFinanceResponse,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def validate_response(model: type[T], data: dict[str, Any]) -> T:  # noqa: UP047
    """
    Validate external API response against Pydantic model.

    Use this for critical data where validation failure should halt processing.

    Args:
        model: Pydantic model class to validate against
        data: Raw JSON data from external API

    Returns:
        Validated model instance

    Raises:
        ValidationError: If data doesn't match the expected schema
    """
    try:
        return model.model_validate(data)
    except ValidationError as e:
        logger.error(
            "External API response validation failed",
            extra={
                "model": model.__name__,
                "error_count": e.error_count(),
                "details": str(e),
            },
        )
        raise


def validate_response_safe(model: type[T], data: dict[str, Any]) -> T | None:  # noqa: UP047
    """
    Validate external API response, returning None on failure.

    Use this for non-critical enrichment data where validation failure
    is acceptable and should not halt processing.

    Args:
        model: Pydantic model class to validate against
        data: Raw JSON data from external API

    Returns:
        Validated model instance, or None if validation fails
    """
    try:
        return model.model_validate(data)
    except ValidationError as e:
        logger.warning(
            "External API response validation failed (non-critical)",
            extra={
                "model": model.__name__,
                "error_count": e.error_count(),
            },
        )
        return None


__all__ = [
    "validate_response",
    "validate_response_safe",
    "WikidataResponse",
    "YFinanceResponse",
    "FinnhubQuoteResponse",
    "FinnhubProfileResponse",
]
