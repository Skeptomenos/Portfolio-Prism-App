import io
import logging
import sys
import re
import hashlib
import json
from typing import Optional, Dict, Any
from rich.logging import RichHandler
from rich.console import Console

_console = Console(stderr=True)


class PIIFilter(logging.Filter):
    PATTERNS = [
        (r"[A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]){12,30}", "[IBAN]"),
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL]"),
        (
            r"\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}",
            "[PHONE]",
        ),
        (r"eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*", "[TOKEN]"),
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.msg, str):
            return True

        msg = record.msg
        for pattern, replacement in self.PATTERNS:
            msg = re.sub(pattern, replacement, msg)

        record.msg = msg
        return True


class SQLiteLogHandler(logging.Handler):
    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id

    def emit(self, record: logging.LogRecord):
        try:
            from portfolio_src.data.database import log_system_event

            msg = self.format(record)
            context = getattr(record, "context", {})

            # Extract component and category if provided in extra
            component = getattr(record, "component", None)
            category = getattr(record, "category", None)

            # Auto-categorize if not provided
            if not component or not category:
                component, category = self._categorize(record)

            error_hash = None
            if record.levelno >= logging.ERROR:
                error_hash = self._calculate_hash(record, msg)

            if record.exc_info:
                import traceback

                context["stack_trace"] = traceback.format_exception(*record.exc_info)

            log_system_event(
                session_id=self.session_id,
                level=record.levelname,
                source="python",
                message=msg,
                context=context,
                component=component,
                category=category,
                error_hash=error_hash,
            )
        except Exception:
            pass

    def _categorize(self, record: logging.LogRecord) -> tuple[str, str]:
        """Auto-categorize log record based on name and content."""
        name = record.name
        msg = str(record.msg).lower()

        component = "pipeline"
        category = "general"

        if "tr_bridge" in name or "tr_auth" in name:
            component = "integrations"
            category = "api_error"
        elif "database" in name or "schema" in name:
            component = "data"
            category = "data_corruption"
        elif "scraper" in name or "adapter" in name:
            component = "integrations"
            category = "scraper_failed"
        elif "resolver" in name:
            component = "pipeline"
            category = "isin_resolution"

        if record.exc_info:
            category = "crash"

        return component, category

    def _calculate_hash(self, record: logging.LogRecord, formatted_msg: str) -> str:
        """Calculate a stable hash for deduplication."""
        # Use the first 3 lines of stack trace if available
        if record.exc_info:
            import traceback

            tb = "".join(traceback.format_exception(*record.exc_info))
            # Clean memory addresses like 0x12345678
            tb = re.sub(r"0x[0-9a-fA-F]+", "0xADDR", tb)
            # Take first few frames to be stable across minor code changes
            seed = f"{record.levelname}:{tb[:500]}"
        else:
            seed = f"{record.levelname}:{formatted_msg}"

        return hashlib.md5(seed.encode()).hexdigest()


class PrismFormatter(logging.Formatter):
    PREFIX = "  \033[90mPRISM\033[0m ↳ "

    COLORS = {
        "DEBUG": "\033[90mDEBUG\033[0m",
        "INFO": "\033[34mINFO \033[0m",
        "WARNING": "\033[33mWARN \033[0m",
        "ERROR": "\033[31mERROR\033[0m",
        "CRITICAL": "\033[31mFATAL\033[0m",
    }

    def format(self, record: logging.LogRecord) -> str:
        level_name = record.levelname
        color_level = self.COLORS.get(level_name, level_name)

        log_fmt = f"{self.PREFIX}{color_level} {record.name}: {record.getMessage()}"

        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            if record.exc_text:
                log_fmt += f"\n{record.exc_text}"

        return log_fmt


class StreamToLogger:
    def __init__(self, logger, level):
        self.logger = logger
        self.level = level
        self.linebuf = ""

    def write(self, buf):
        for line in buf.rstrip().splitlines():
            self.logger.log(self.level, line.rstrip())

    def flush(self):
        pass

    def isatty(self):
        return False

    def fileno(self):
        raise io.UnsupportedOperation("StreamToLogger has no file descriptor")

    def readable(self):
        return False

    def writable(self):
        return True

    def seekable(self):
        return False

    @property
    def closed(self):
        return False


def configure_root_logger(level: int = logging.INFO, session_id: Optional[str] = None):
    root = logging.getLogger()
    root.setLevel(level)

    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)
    logging.getLogger("fsspec").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("portfolio_src.data.history_manager").setLevel(logging.WARNING)

    for h in root.handlers[:]:
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(PIIFilter())
    handler.setFormatter(PrismFormatter())
    root.addHandler(handler)

    if session_id:
        sqlite_handler = SQLiteLogHandler(session_id)
        sqlite_handler.addFilter(PIIFilter())
        sqlite_handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
        root.addHandler(sqlite_handler)

    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        uv_logger = logging.getLogger(logger_name)
        uv_logger.handlers = []
        uv_logger.propagate = True


def get_logger(name: str) -> logging.Logger:
    """
    Returns a named logger.
    Assumes configure_root_logger() has been called.
    """
    return logging.getLogger(name)
