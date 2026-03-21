"""Repository for pipeline snapshot IO operations (Data Layer)."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pandas as pd

from portfolio_src.config import (
    DIRECT_HOLDINGS_REPORT,
    HOLDINGS_BREAKDOWN_PATH,
    PIPELINE_ERRORS_PATH,
    PIPELINE_HEALTH_PATH,
    TRUE_EXPOSURE_REPORT,
)

logger = logging.getLogger(__name__)


def write_json_atomic(
    path: Path, data: dict[str, Any], default: Callable[[Any], str] | None = None
) -> None:
    """Write JSON atomically via temp file + rename to prevent corruption."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(dir=path.parent, suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2, default=default)
            f.flush()
            os.fsync(f.fileno())

        os.replace(temp_path, path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


def write_csv_atomic(path: Path, df: pd.DataFrame, **kwargs: Any) -> None:
    """Write CSV atomically via temp file + rename to prevent corruption."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if "index" not in kwargs:
        kwargs["index"] = False

    fd, temp_path = tempfile.mkstemp(dir=path.parent, suffix=".csv.tmp")
    try:
        with os.fdopen(fd, "w", newline="") as f:
            df.to_csv(f, **kwargs)
            f.flush()
            os.fsync(f.fileno())

        os.replace(temp_path, path)
        logger.debug("Wrote CSV atomically: %s", path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


class SnapshotRepository:
    """Repository for pipeline snapshot persistence (exposure reports, errors, health)."""

    def __init__(
        self,
        exposure_path: Path | None = None,
        direct_holdings_path: Path | None = None,
        breakdown_path: Path | None = None,
        errors_path: Path | None = None,
        health_path: Path | None = None,
    ) -> None:
        self._exposure_path = exposure_path or TRUE_EXPOSURE_REPORT
        self._direct_holdings_path = direct_holdings_path or DIRECT_HOLDINGS_REPORT
        self._breakdown_path = breakdown_path or HOLDINGS_BREAKDOWN_PATH
        self._errors_path = errors_path or PIPELINE_ERRORS_PATH
        self._health_path = health_path or PIPELINE_HEALTH_PATH

    def save_exposure_report(self, exposure_df: pd.DataFrame) -> Path:
        self._exposure_path.parent.mkdir(parents=True, exist_ok=True)
        write_csv_atomic(self._exposure_path, exposure_df)
        logger.info("Wrote exposure report to %s", self._exposure_path)
        return self._exposure_path

    def save_direct_holdings_report(self, direct_holdings_df: pd.DataFrame) -> Path:
        self._direct_holdings_path.parent.mkdir(parents=True, exist_ok=True)
        write_csv_atomic(self._direct_holdings_path, direct_holdings_df)
        logger.info("Wrote direct holdings report to %s", self._direct_holdings_path)
        return self._direct_holdings_path

    def save_holdings_breakdown(self, breakdown_df: pd.DataFrame) -> Path:
        self._breakdown_path.parent.mkdir(parents=True, exist_ok=True)
        write_csv_atomic(self._breakdown_path, breakdown_df)
        logger.info("Wrote holdings breakdown to %s", self._breakdown_path)
        return self._breakdown_path

    def save_errors(self, errors: list[dict[str, Any]]) -> Path:
        self._errors_path.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(self._errors_path, errors)  # type: ignore[arg-type]
        if errors:
            logger.info("Wrote %d errors to %s", len(errors), self._errors_path)
        return self._errors_path

    def save_health_report(self, health_data: dict[str, Any]) -> Path:
        self._health_path.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(self._health_path, health_data)
        logger.info("Wrote pipeline health report to %s", self._health_path)
        return self._health_path

    def load_exposure_report(self) -> pd.DataFrame | None:
        if self._exposure_path.exists():
            return pd.read_csv(self._exposure_path)
        return None

    def load_direct_holdings_report(self) -> pd.DataFrame | None:
        if self._direct_holdings_path.exists():
            return pd.read_csv(self._direct_holdings_path)
        return None

    def load_holdings_breakdown(self) -> pd.DataFrame | None:
        if self._breakdown_path.exists():
            return pd.read_csv(self._breakdown_path)
        return None

    def load_health_report(self) -> dict[str, Any] | None:
        if self._health_path.exists():
            with open(self._health_path) as f:
                return json.load(f)  # type: ignore[no-any-return]
        return None

    def load_errors(self) -> list[dict[str, Any]]:
        if self._errors_path.exists():
            with open(self._errors_path) as f:
                return json.load(f)  # type: ignore[no-any-return]
        return []
