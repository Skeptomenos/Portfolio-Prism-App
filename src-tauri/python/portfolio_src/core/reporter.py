import re
import hashlib
import json
import traceback
from typing import Any, Dict, Optional


class Scrubber:
    PII_PATTERNS = [
        (r"[A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]){12,30}", "[IBAN]"),
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL]"),
        (
            r"\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}",
            "[PHONE]",
        ),
        (r"eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*", "[TOKEN]"),
        (
            r"(?:key|secret|password|token|auth|bearer)\s*[:=]\s*['\"]?[A-Za-z0-9-_]{16,}['\"]?",
            "[SENSITIVE_DATA]",
        ),
    ]

    ISIN_PATTERN = r"\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b"

    @classmethod
    def hash_isin(cls, isin: str) -> str:
        h = hashlib.sha256(isin.encode()).hexdigest()[:8]
        return f"[ASSET_HASH_{h}]"

    @classmethod
    def scrub_text(cls, text: str) -> str:
        if not text:
            return ""

        for pattern, replacement in cls.PII_PATTERNS:
            text = re.sub(pattern, replacement, text)

        def replace_isin(match):
            return cls.hash_isin(match.group(0))

        text = re.sub(cls.ISIN_PATTERN, replace_isin, text)
        return text

    @classmethod
    def scrub_dict(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        scrubbed = {}
        SENSITIVE_KEYS = {
            "quantity",
            "value",
            "price",
            "cost",
            "pnl",
            "amount",
            "balance",
        }

        for key, value in data.items():
            if any(s in key.lower() for s in SENSITIVE_KEYS):
                scrubbed[key] = "[REDACTED_VALUE]"
                continue

            if isinstance(value, dict):
                scrubbed[key] = cls.scrub_dict(value)
            elif isinstance(value, list):
                scrubbed[key] = [
                    cls.scrub_dict(v)
                    if isinstance(v, dict)
                    else cls.scrub_text(str(v))
                    if isinstance(v, str)
                    else v
                    for v in value
                ]
            elif isinstance(value, str):
                scrubbed[key] = cls.scrub_text(value)
            else:
                scrubbed[key] = value

        return scrubbed


class ErrorReporter:
    def __init__(self, relay_url: str):
        self.relay_url = relay_url

    def prepare_report(
        self, error: Exception, context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        stack_trace = traceback.format_exc()

        report = {
            "error_type": type(error).__name__,
            "error_message": str(error),
            "stack_trace": stack_trace,
            "context": context or {},
        }

        return Scrubber.scrub_dict(report)
