import json
import os
from datetime import datetime
from collections import defaultdict

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class MetricsTracker:
    """
    Simple singleton-style tracker for pipeline execution metrics.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MetricsTracker, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.reset()
        self._initialized = True

    def reset(self):
        """Resets all metrics to zero/empty."""
        self.metrics = {
            "timestamp": datetime.now().isoformat(),
            "duration_seconds": 0.0,
            "counts": defaultdict(int),
            "funnel": {
                "total_positions_db": 0,
                "direct_holdings": 0,
                "etf_positions": 0,
                "etfs_with_adapter": 0,
                "etfs_successfully_fetched": 0,
                "etfs_failed": 0,
            },
            "system": {
                "api_calls_yfinance": 0,  # To be implemented in market.py
                "api_calls_providers": 0,
                "cache_hits": 0,
                "validation_errors": 0,
            },
        }
        self._start_time = datetime.now()

    def start_run(self):
        """Resets and marks the start time."""
        self.reset()
        self._start_time = datetime.now()

    def end_run(self):
        """Calculates duration."""
        self.metrics["duration_seconds"] = (
            datetime.now() - self._start_time
        ).total_seconds()

    def set_funnel_metric(self, key: str, value: int):
        """Sets a specific funnel metric (absolute value)."""
        if key in self.metrics["funnel"]:
            self.metrics["funnel"][key] = value

    def increment_system_metric(self, key: str, value: int = 1):
        """Increments a system metric (counter)."""
        if key in self.metrics["system"]:
            self.metrics["system"][key] += value
        else:
            # Allow dynamic keys if needed, or strict? Let's allow dynamic for flexibility
            self.metrics["system"][key] = self.metrics["system"].get(key, 0) + value

    def save(self, output_path: str):
        """Saves metrics to a JSON file."""
        self.end_run()
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "w") as f:
                json.dump(self.metrics, f, indent=4)
        except Exception as e:
            logger.error(f"Failed to save metrics: {e}")


# Global instance
tracker = MetricsTracker()
