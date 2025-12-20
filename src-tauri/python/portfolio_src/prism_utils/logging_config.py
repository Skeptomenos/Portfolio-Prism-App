import logging
import sys
import re
from typing import Optional


class PIIFilter(logging.Filter):
    """
    Filters out PII (Personally Identifiable Information) from log records.
    """

    # Regex patterns for PII
    PATTERNS = [
        # IBAN: Two letters, two digits, then alphanumeric. Specific, so run first.
        (r"[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}", "[IBAN]"),
        # Email: Simple but effective
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL]"),
        # Phone: Catch international format +49... and long number strings
        # Run last to avoid eating parts of other identifiers
        (r"\+?[0-9]{10,15}", "[PHONE]"),
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.msg, str):
            return True

        msg = record.msg
        for pattern, replacement in self.PATTERNS:
            msg = re.sub(pattern, replacement, msg)

        record.msg = msg
        return True


def configure_root_logger(level: int = logging.INFO):
    """
    Configures the root logger with PII filtering.
    Call this once at application startup.
    """
    root = logging.getLogger()
    root.setLevel(level)

    # Silence noisy 3rd party libraries
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)
    logging.getLogger("fsspec").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    # Remove existing handlers to avoid duplicates
    for h in root.handlers[:]:
        root.removeHandler(h)

    # Create handler (stderr to keep stdout clean for IPC)
    handler = logging.StreamHandler(sys.stderr)

    # Add PII Filter
    handler.addFilter(PIIFilter())

    # Create formatter - Standardized for Rust parsing
    # Format: [LEVEL] Name: Message
    formatter = logging.Formatter("[%(levelname)s] %(name)s: %(message)s")
    handler.setFormatter(formatter)

    # Add handler to root
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """
    Returns a named logger.
    Assumes configure_root_logger() has been called.
    """
    return logging.getLogger(name)
