"""Handler Registry.

This module exports all command handlers and provides the handler registry
used by the dispatcher for command routing.

Handler Naming Convention:
    - Handlers are named `handle_{command_name}`
    - Async handlers use `async def`
    - Sync handlers use `def`
    - All handlers return `dict[str, Any]` matching IPC contract

Handler Domains:
    - health: System health and status
    - dashboard: Portfolio dashboard data
    - tr_auth: Trade Republic authentication
    - sync: Portfolio synchronization and pipeline
    - holdings: ETF holdings and overlap analysis
    - telemetry: Logging and error reporting
"""

from typing import Any, Callable, Coroutine, Union

# Import all handlers
from portfolio_src.headless.handlers.health import handle_get_health
from portfolio_src.headless.handlers.dashboard import (
    handle_get_dashboard_data,
    handle_get_positions,
)
from portfolio_src.headless.handlers.tr_auth import (
    handle_tr_get_auth_status,
    handle_tr_check_saved_session,
    handle_tr_login,
    handle_tr_submit_2fa,
    handle_tr_logout,
)
from portfolio_src.headless.handlers.sync import (
    handle_sync_portfolio,
    handle_run_pipeline,
)
from portfolio_src.headless.handlers.holdings import (
    handle_upload_holdings,
    handle_get_true_holdings,
    handle_get_overlap_analysis,
    handle_get_pipeline_report,
)
from portfolio_src.headless.handlers.telemetry import (
    handle_log_event,
    handle_get_recent_reports,
    handle_get_pending_reviews,
)
from portfolio_src.headless.handlers.settings import (
    handle_set_hive_contribution,
    handle_get_hive_contribution,
)

# Type alias for handler functions
HandlerFunc = Union[
    Callable[[int, dict[str, Any]], dict[str, Any]],
    Callable[[int, dict[str, Any]], Coroutine[Any, Any, dict[str, Any]]],
]

# Handler registry mapping command names to handler functions
HANDLER_REGISTRY: dict[str, HandlerFunc] = {
    # Health
    "get_health": handle_get_health,
    "get_engine_health": handle_get_health,
    # Dashboard
    "get_dashboard_data": handle_get_dashboard_data,
    "get_positions": handle_get_positions,
    # TR Auth
    "tr_get_auth_status": handle_tr_get_auth_status,
    "tr_check_saved_session": handle_tr_check_saved_session,
    "tr_login": handle_tr_login,
    "tr_submit_2fa": handle_tr_submit_2fa,
    "tr_logout": handle_tr_logout,
    # Sync
    "sync_portfolio": handle_sync_portfolio,
    "run_pipeline": handle_run_pipeline,
    # Holdings
    "upload_holdings": handle_upload_holdings,
    "get_true_holdings": handle_get_true_holdings,
    "get_overlap_analysis": handle_get_overlap_analysis,
    "get_pipeline_report": handle_get_pipeline_report,
    # Telemetry
    "log_event": handle_log_event,
    "get_recent_reports": handle_get_recent_reports,
    "get_pending_reviews": handle_get_pending_reviews,
    # Settings
    "set_hive_contribution": handle_set_hive_contribution,
    "get_hive_contribution": handle_get_hive_contribution,
}

__all__ = [
    # Registry
    "HANDLER_REGISTRY",
    "HandlerFunc",
    # Health
    "handle_get_health",
    # Dashboard
    "handle_get_dashboard_data",
    "handle_get_positions",
    # TR Auth
    "handle_tr_get_auth_status",
    "handle_tr_check_saved_session",
    "handle_tr_login",
    "handle_tr_submit_2fa",
    "handle_tr_logout",
    # Sync
    "handle_sync_portfolio",
    "handle_run_pipeline",
    # Holdings
    "handle_upload_holdings",
    "handle_get_true_holdings",
    "handle_get_overlap_analysis",
    "handle_get_pipeline_report",
    # Telemetry
    "handle_log_event",
    "handle_get_recent_reports",
    "handle_get_pending_reviews",
    # Settings
    "handle_set_hive_contribution",
    "handle_get_hive_contribution",
]
