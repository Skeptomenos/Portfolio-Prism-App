import logging
import sys
import re
from typing import Optional
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
            if record.exc_info:
                import traceback

                context["stack_trace"] = traceback.format_exception(*record.exc_info)

            log_system_event(
                session_id=self.session_id,
                level=record.levelname,
                source="python",
                message=msg,
                context=context,
            )
        except Exception:
            pass


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
    logging.getLogger("portfolio_src.data.history_manager").setLevel(logging.WARNING)

    for h in root.handlers[:]:
        root.removeHandler(h)

    rich_handler = RichHandler(
        console=_console,
        show_time=True,
        show_path=False,
        markup=True,
        rich_tracebacks=True,
    )
    rich_handler.addFilter(PIIFilter())
    formatter = logging.Formatter("%(name)s: %(message)s")
    rich_handler.setFormatter(formatter)
    root.addHandler(rich_handler)

    if session_id:
        sqlite_handler = SQLiteLogHandler(session_id)
        sqlite_handler.addFilter(PIIFilter())
        sqlite_handler.setFormatter(formatter)
        root.addHandler(sqlite_handler)


def get_logger(name: str) -> logging.Logger:
    """
    Returns a named logger.
    Assumes configure_root_logger() has been called.
    """
    return logging.getLogger(name)
