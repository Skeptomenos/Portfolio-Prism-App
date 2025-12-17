"""
Telemetry Module - Automatic error reporting to GitHub Issues.

Reports errors with rate limiting to avoid spam:
- AdapterNotFound: 1 per ISIN ever
- ScraperFailed: 1 per ISIN per day
- ISINNotResolved: 1 per ISIN ever
- UnexpectedError: 5 per session

Privacy:
- Only error type, message, and ISIN are sent
- No portfolio data or credentials
- Opt-out via TELEMETRY_ENABLED=false
"""

import hashlib
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.config import PROXY_URL, PROXY_API_KEY

logger = get_logger(__name__)

# GitHub repository info
GITHUB_OWNER = "Skeptomenos"
GITHUB_REPO = "Portfolio-Prism"

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
TELEMETRY_STATE_FILE = PROJECT_ROOT / "data" / "working" / ".telemetry_state.json"

# Rate limits
RATE_LIMITS = {
    "adapter_not_found": {"per_isin": True, "max_per_day": None},
    "scraper_failed": {"per_isin": True, "max_per_day": 1},
    "isin_not_resolved": {"per_isin": True, "max_per_day": None},
    "unexpected_error": {"per_isin": False, "max_per_day": 5},
    "missing_asset": {"per_isin": True, "max_per_day": None},
}


class Telemetry:
    """
    Automatic error reporting to GitHub Issues.

    Reports are rate-limited and anonymized.
    Opt-out via TELEMETRY_ENABLED=false env var.
    """

    def __init__(self, github_token: Optional[str] = None):
        """
        Initialize telemetry.

        Args:
            github_token: GitHub PAT for creating issues. If not provided,
                          reads from GITHUB_ISSUES_TOKEN env var.
        """
        self.github_token = github_token or os.getenv("GITHUB_ISSUES_TOKEN")
        self.enabled = os.getenv("TELEMETRY_ENABLED", "true").lower() == "true"
        self._session_id = str(uuid.uuid4())[:8]
        self._state = self._load_state()
        self._api_base = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"

        if not self.enabled:
            logger.info("Telemetry disabled via TELEMETRY_ENABLED=false")
        elif not self.github_token:
            logger.debug("No GitHub token available, telemetry reports will be cached")

    def _load_state(self) -> dict:
        """Load telemetry state from disk."""
        if TELEMETRY_STATE_FILE.exists():
            try:
                return json.loads(TELEMETRY_STATE_FILE.read_text())
            except Exception:
                pass
        return {
            "reported_isins": {},  # {isin: {error_type: last_reported}}
            "daily_counts": {},  # {date: {error_type: count}}
            "pending_reports": [],  # Reports waiting to be sent
        }

    def _save_state(self) -> None:
        """Save telemetry state to disk."""
        TELEMETRY_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        TELEMETRY_STATE_FILE.write_text(json.dumps(self._state, indent=2))

    def _should_report(self, error_type: str, isin: Optional[str] = None) -> bool:
        """Check if this error should be reported based on rate limits."""
        if not self.enabled:
            return False

        limits = RATE_LIMITS.get(error_type, {"per_isin": False, "max_per_day": 5})
        today = datetime.now().strftime("%Y-%m-%d")

        # Check per-ISIN limit
        if limits["per_isin"] and isin:
            reported = self._state.get("reported_isins", {}).get(isin, {})
            if error_type in reported:
                last_reported = reported[error_type]
                # For per-day limits, check if it was today
                if limits["max_per_day"]:
                    if last_reported.startswith(today):
                        return False
                else:
                    # Already reported ever
                    return False

        # Check daily limit
        if limits["max_per_day"]:
            daily = self._state.get("daily_counts", {}).get(today, {})
            count = daily.get(error_type, 0)
            if count >= limits["max_per_day"]:
                return False

        return True

    def _mark_reported(self, error_type: str, isin: Optional[str] = None) -> None:
        """Mark an error as reported."""
        now = datetime.now().isoformat()
        today = datetime.now().strftime("%Y-%m-%d")

        # Update per-ISIN tracking
        if isin:
            if "reported_isins" not in self._state:
                self._state["reported_isins"] = {}
            if isin not in self._state["reported_isins"]:
                self._state["reported_isins"][isin] = {}
            self._state["reported_isins"][isin][error_type] = now

        # Update daily counts
        if "daily_counts" not in self._state:
            self._state["daily_counts"] = {}
        if today not in self._state["daily_counts"]:
            self._state["daily_counts"][today] = {}
        current = self._state["daily_counts"][today].get(error_type, 0)
        self._state["daily_counts"][today][error_type] = current + 1

        self._save_state()

    def report_error(
        self,
        error_type: str,
        title: str,
        body: str,
        isin: Optional[str] = None,
        labels: Optional[list] = None,
    ) -> Optional[str]:
        """
        Report an error to GitHub Issues.

        Args:
            error_type: Type of error (for rate limiting)
            title: Issue title
            body: Issue body (markdown)
            isin: Related ISIN (for rate limiting)
            labels: GitHub labels to apply

        Returns:
            Issue URL if created, None if rate-limited or failed
        """
        if not self._should_report(error_type, isin):
            logger.debug(f"Rate limited: {error_type} for {isin}")
            return None

        # Add metadata to body
        full_body = (
            f"{body}\n\n"
            f"---\n"
            f"*Auto-reported by Portfolio Prism*\n\n"
            f"| Key | Value |\n"
            f"|-----|-------|\n"
            f"| Session | `{self._session_id}` |\n"
            f"| Timestamp | {datetime.now().isoformat()} |\n"
            f"| Docker Mode | {os.getenv('DOCKER_MODE', 'false')} |\n"
        )

        if not self.github_token:
            # Cache for later
            self._state.setdefault("pending_reports", []).append(
                {
                    "error_type": error_type,
                    "title": title,
                    "body": full_body,
                    "isin": isin,
                    "labels": labels or [],
                    "created_at": datetime.now().isoformat(),
                }
            )
            self._save_state()
            logger.debug(f"Cached telemetry report: {title}")
            return None

        try:
            issue = self._create_issue(title, full_body, labels or [])
            self._mark_reported(error_type, isin)
            logger.info(f"Reported issue: {issue['html_url']}")
            return issue["html_url"]
        except Exception as e:
            logger.warning(f"Failed to report issue: {e}")
            return None

    def _create_issue(
        self,
        title: str,
        body: str,
        labels: list,
    ) -> dict:
        """Create a GitHub issue (via proxy if configured)."""
        data = {
            "title": title,
            "body": body,
            "labels": labels,
        }

        if PROXY_URL and PROXY_API_KEY:
            # Distributed mode: route through proxy
            url = f"{PROXY_URL}/api/github/issues"
            req = Request(url, method="POST")
            req.add_header("X-API-Key", PROXY_API_KEY)
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "Portfolio-Prism")
        else:
            # Local dev mode: direct GitHub API call
            url = f"{self._api_base}/issues"
            req = Request(url, method="POST")
            req.add_header("Authorization", f"Bearer {self.github_token}")
            req.add_header("Accept", "application/vnd.github.v3+json")
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "Portfolio-Prism")

        req.data = json.dumps(data).encode()

        with urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())

    # Convenience methods for specific error types

    def report_adapter_not_found(
        self, isin: str, provider: Optional[str] = None
    ) -> Optional[str]:
        """Report a missing adapter for an ISIN."""
        title = f"Missing adapter for {isin}"
        body = (
            f"## Missing Adapter\n\n"
            f"No adapter is available to fetch holdings for this ETF.\n\n"
            f"| Field | Value |\n"
            f"|-------|-------|\n"
            f"| ISIN | `{isin}` |\n"
        )
        if provider:
            body += f"| Provider | {provider} |\n"

        body += (
            f"\n### Requested Action\n"
            f"Please add this ETF to the adapter registry or create a new adapter.\n"
        )

        return self.report_error(
            error_type="adapter_not_found",
            title=title,
            body=body,
            isin=isin,
            labels=["enhancement", "adapter"],
        )

    def report_scraper_failed(
        self,
        isin: str,
        adapter: str,
        error: str,
    ) -> Optional[str]:
        """Report a scraper failure."""
        title = f"Scraper failed for {isin} ({adapter})"
        body = (
            f"## Scraper Failure\n\n"
            f"The {adapter} scraper failed to fetch holdings.\n\n"
            f"| Field | Value |\n"
            f"|-------|-------|\n"
            f"| ISIN | `{isin}` |\n"
            f"| Adapter | {adapter} |\n\n"
            f"### Error\n"
            f"```\n{error[:500]}\n```\n"
        )

        return self.report_error(
            error_type="scraper_failed",
            title=title,
            body=body,
            isin=isin,
            labels=["bug", "scraper"],
        )

    def report_isin_not_resolved(
        self,
        name: str,
        ticker: Optional[str] = None,
        provider_isin: Optional[str] = None,
    ) -> Optional[str]:
        """Report an unresolved ISIN."""
        # Generate a deterministic ID for this asset
        asset_id = hashlib.md5(f"{name}:{ticker}:{provider_isin}".encode()).hexdigest()[
            :8
        ]

        title = f"Unresolved asset: {name}"
        body = (
            f"## Unresolved Asset\n\n"
            f"Could not resolve ISIN for this asset.\n\n"
            f"| Field | Value |\n"
            f"|-------|-------|\n"
            f"| Name | {name} |\n"
        )
        if ticker:
            body += f"| Ticker | `{ticker}` |\n"
        if provider_isin:
            body += f"| Provider ISIN | `{provider_isin}` |\n"

        body += (
            f"\n### Requested Action\nPlease add this asset to the asset universe.\n"
        )

        return self.report_error(
            error_type="isin_not_resolved",
            title=title,
            body=body,
            isin=asset_id,  # Use hash as pseudo-ISIN for rate limiting
            labels=["data", "asset-universe"],
        )

    def report_missing_asset(
        self,
        isin: str,
        name: Optional[str] = None,
    ) -> Optional[str]:
        """Report a missing asset in the universe."""
        title = f"Missing asset: {isin}"
        body = (
            f"## Missing Asset\n\n"
            f"This ISIN is not in the asset universe.\n\n"
            f"| Field | Value |\n"
            f"|-------|-------|\n"
            f"| ISIN | `{isin}` |\n"
        )
        if name:
            body += f"| Name | {name} |\n"

        body += (
            f"\n### Requested Action\n"
            f"Please add this asset to the asset universe CSV.\n"
        )

        return self.report_error(
            error_type="missing_asset",
            title=title,
            body=body,
            isin=isin,
            labels=["data", "asset-universe"],
        )

    def report_unexpected_error(
        self,
        error: Exception,
        context: str = "",
    ) -> Optional[str]:
        """Report an unexpected error."""
        error_hash = hashlib.md5(str(error).encode()).hexdigest()[:8]
        title = f"Unexpected error: {type(error).__name__}"

        body = (
            f"## Unexpected Error\n\n"
            f"An unexpected error occurred during operation.\n\n"
            f"### Error Details\n"
            f"```\n{type(error).__name__}: {str(error)[:500]}\n```\n"
        )
        if context:
            body += f"\n### Context\n{context}\n"

        return self.report_error(
            error_type="unexpected_error",
            title=title,
            body=body,
            isin=error_hash,  # Use hash for rate limiting
            labels=["bug"],
        )

    def flush_pending(self) -> int:
        """
        Flush any pending reports that were cached when no token was available.

        Returns:
            Number of reports sent
        """
        if not self.github_token:
            return 0

        pending = self._state.get("pending_reports", [])
        if not pending:
            return 0

        sent = 0
        remaining = []

        for report in pending:
            try:
                self._create_issue(
                    report["title"],
                    report["body"],
                    report.get("labels", []),
                )
                self._mark_reported(report["error_type"], report.get("isin"))
                sent += 1
            except Exception as e:
                logger.warning(f"Failed to flush report: {e}")
                remaining.append(report)

        self._state["pending_reports"] = remaining
        self._save_state()

        if sent:
            logger.info(f"Flushed {sent} pending telemetry reports")

        return sent

    def get_stats(self) -> dict:
        """Get telemetry statistics."""
        today = datetime.now().strftime("%Y-%m-%d")
        daily = self._state.get("daily_counts", {}).get(today, {})

        return {
            "enabled": self.enabled,
            "has_token": bool(self.github_token),
            "pending_count": len(self._state.get("pending_reports", [])),
            "isins_tracked": len(self._state.get("reported_isins", {})),
            "today_reports": sum(daily.values()),
            "session_id": self._session_id,
        }


# Module-level singleton for convenience
_telemetry_instance: Optional[Telemetry] = None


def get_telemetry() -> Telemetry:
    """Get the singleton Telemetry instance."""
    global _telemetry_instance
    if _telemetry_instance is None:
        _telemetry_instance = Telemetry()
    return _telemetry_instance
