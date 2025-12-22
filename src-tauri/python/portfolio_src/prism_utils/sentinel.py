"""
Echo-Sentinel: Startup Auditor for Portfolio Prism.

Audits logs from previous sessions to find unreported errors and crashes.
Batches them by component and category to avoid spam.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import List, Dict, Any

from portfolio_src.data.database import get_unprocessed_logs, mark_logs_processed
from portfolio_src.prism_utils.telemetry import get_telemetry
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


async def audit_previous_session():
    """
    Audit unprocessed logs from previous sessions and report them.
    Runs with a delay to avoid blocking startup.
    """
    try:
        await asyncio.sleep(5)

        logger.info("Echo-Sentinel: Starting background audit...")

        logs = get_unprocessed_logs()
        if not logs:
            logger.info("Echo-Sentinel: No unprocessed logs found.")
            return

        error_logs = [l for l in logs if l["level"] in ("ERROR", "CRITICAL")]
        if not error_logs:
            logger.info(f"Echo-Sentinel: Found {len(logs)} logs, but no errors.")
            mark_logs_processed([l["id"] for l in logs])
            return

        logger.info(
            f"Echo-Sentinel: Found {len(error_logs)} unreported errors. Grouping..."
        )

        batches: Dict[str, List[dict]] = {}
        for log in error_logs:
            key = f"{log.get('component', 'unknown')}:{log.get('category', 'general')}"
            if key not in batches:
                batches[key] = []
            batches[key].append(log)

        telemetry = get_telemetry()

        for key, batch in batches.items():
            component, category = key.split(":")

            unique_errors = {}
            for log in batch:
                h = log.get("error_hash") or log["message"]
                if h not in unique_errors:
                    unique_errors[h] = log

            title = f"[AUTO] {component.upper()} {category.replace('_', ' ').title()}: {len(batch)} occurrences"

            batch_error_hash = list(unique_errors.keys())[0] if unique_errors else None

            body = f"## Automated Error Report\n\n"
            body += f"**Component:** {component}\n"
            body += f"**Category:** {category}\n"
            body += f"**Occurrences:** {len(batch)}\n\n"

            body += "### Error Details\n\n"
            body += "| Timestamp | Session | Message |\n"
            body += "|-----------|---------|---------|\n"

            for _, log in list(unique_errors.items())[:10]:
                ts = log["timestamp"]
                sid = log["session_id"]
                msg = log["message"][:100]
                body += f"| {ts} | `{sid}` | {msg} |\n"

            if len(unique_errors) > 10:
                body += (
                    f"\n*...and {len(unique_errors) - 10} more unique error types*\n"
                )

            issue_url = telemetry.report_error(
                error_type="unexpected_error",
                title=title,
                body=body,
                labels=["auto-reported", component, category],
                error_hash=batch_error_hash,
            )

            if issue_url:
                logger.info(f"Echo-Sentinel: Reported batch {key} -> {issue_url}")
            else:
                logger.info(f"Echo-Sentinel: Batch {key} rate-limited or failed.")

        mark_logs_processed([l["id"] for l in logs])
        logger.info("Echo-Sentinel: Audit complete. All logs marked as processed.")

    except Exception as e:
        logger.error(f"Echo-Sentinel: Audit failed: {e}", exc_info=True)
