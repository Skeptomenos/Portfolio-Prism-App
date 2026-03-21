# prism_utils/error_reporter.py
import json
import requests
from typing import List, Optional
from portfolio_src.config import WORKER_URL


def get_app_version() -> str:
    """Get app version from package metadata."""
    try:
        from importlib.metadata import version

        return version("portfolio-prism")
    except Exception:
        return "1.0.0"  # Fallback


APP_VERSION = get_app_version()


def report_to_github(
    errors: List[dict], pipeline_version: Optional[str] = None
) -> bool:
    """
    Report anonymized errors to GitHub via Cloudflare proxy.

    Args:
        errors: List of anonymized error dicts (no portfolio values)
        pipeline_version: App version string

    Returns:
        True if report was submitted successfully
    """
    if not WORKER_URL:
        return False

    if not errors:
        return False

    version = pipeline_version or APP_VERSION

    try:
        payload = {
            "action": "create_issue",
            "title": f"[Auto] Pipeline errors ({len(errors)} failures)",
            "body": _format_issue_body(errors, version),
            "labels": ["bug", "auto-reported"],
        }

        response = requests.post(
            f"{WORKER_URL}/github/issues",
            json=payload,
            timeout=10,
        )
        return response.status_code == 201

    except Exception:
        return False


def _format_issue_body(errors: List[dict], version: str) -> str:
    """Format errors as GitHub issue markdown."""
    lines = [
        "## Automatic Error Report",
        "",
        f"**Version:** {version}",
        f"**Error Count:** {len(errors)}",
        "",
        "### Failures",
        "",
        "| Phase | Type | ISIN | Message | Fix Hint |",
        "|-------|------|------|---------|----------|",
    ]

    for e in errors[:20]:  # Limit to 20
        phase = e.get("phase", "UNKNOWN")
        error_type = e.get("error_type", "UNKNOWN")
        item = e.get("item", "N/A")
        message = e.get("message", "")[:50]
        fix_hint = e.get("fix_hint", "")[:30] if e.get("fix_hint") else ""

        lines.append(f"| {phase} | {error_type} | `{item}` | {message} | {fix_hint} |")

    if len(errors) > 20:
        lines.append(f"\n*...and {len(errors) - 20} more errors*")

    lines.extend(
        [
            "",
            "---",
            "*This issue was automatically created by Portfolio Prism error reporting.*",
        ]
    )

    return "\n".join(lines)
