"""
Echo-Sentinel: Startup Auditor for Portfolio Prism.

Audits logs from previous sessions to find unreported errors and crashes.
Batches them by component and category to avoid spam.
"""

import asyncio
from datetime import datetime
from typing import List, Dict, Optional

from portfolio_src.data.database import get_unprocessed_logs, mark_logs_processed
from portfolio_src.prism_utils.telemetry import get_telemetry
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

TABLE_MSG_LIMIT = 200
FULL_MSG_THRESHOLD = 300
PRECEDING_WARNINGS_COUNT = 3


def _get_preceding_warnings(
    all_logs: List[dict], error_log: dict, count: int = 3
) -> List[dict]:
    """Find warnings that occurred before an error in the same session."""
    session_id = error_log.get("session_id")
    error_ts = error_log.get("timestamp")
    if not session_id or not error_ts:
        return []

    preceding = [
        log
        for log in all_logs
        if log.get("session_id") == session_id
        and log.get("level") == "WARNING"
        and log.get("timestamp", "") < error_ts
    ]
    preceding.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return preceding[:count]


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
        warning_logs = [l for l in logs if l["level"] == "WARNING"]

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
        successfully_reported_ids: List[int] = []
        failed_batches: List[str] = []

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
                full_msg = log["message"]
                table_msg = full_msg[:TABLE_MSG_LIMIT].replace("\n", " ")
                if len(full_msg) > TABLE_MSG_LIMIT:
                    table_msg += "..."
                body += f"| {ts} | `{sid}` | {table_msg} |\n"

            if len(unique_errors) > 10:
                body += (
                    f"\n*...and {len(unique_errors) - 10} more unique error types*\n"
                )

            body += "\n### Full Error Messages\n\n"
            for idx, (_, log) in enumerate(list(unique_errors.items())[:5]):
                full_msg = log["message"]
                if len(full_msg) > FULL_MSG_THRESHOLD:
                    body += f"<details><summary>Error {idx + 1}: {full_msg[:80]}...</summary>\n\n"
                    body += f"```\n{full_msg}\n```\n\n"

                    preceding = _get_preceding_warnings(
                        warning_logs, log, PRECEDING_WARNINGS_COUNT
                    )
                    if preceding:
                        body += "**Preceding warnings:**\n"
                        for w in preceding:
                            w_msg = w["message"][:150].replace("\n", " ")
                            body += f"- `{w['timestamp']}`: {w_msg}\n"
                        body += "\n"

                    body += "</details>\n\n"

            issue_url = telemetry.report_error(
                error_type="unexpected_error",
                title=title,
                body=body,
                labels=["auto-reported", component, category],
                error_hash=batch_error_hash,
            )

            if issue_url:
                logger.info(f"Echo-Sentinel: Reported batch {key} -> {issue_url}")
                successfully_reported_ids.extend([l["id"] for l in batch])
            else:
                failed_batches.append(key)
                logger.warning(
                    f"Echo-Sentinel: Batch {key} not reported. "
                    "Check WORKER_URL configuration or rate limits."
                )

        non_error_ids = [
            l["id"] for l in logs if l["level"] not in ("ERROR", "CRITICAL")
        ]
        mark_logs_processed(non_error_ids + successfully_reported_ids)

        if failed_batches:
            logger.warning(
                f"Echo-Sentinel: {len(failed_batches)} batches failed to report. "
                "Will retry on next startup."
            )
        else:
            logger.info(
                "Echo-Sentinel: Audit complete. All errors reported successfully."
            )

    except Exception as e:
        logger.error(f"Echo-Sentinel: Audit failed: {e}", exc_info=True)
