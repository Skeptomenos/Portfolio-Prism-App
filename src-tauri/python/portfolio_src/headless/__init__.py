"""Headless Engine Core.

This package contains the refactored Prism Headless Engine components:
- dispatcher: Command routing and dispatch logic
- handlers: Business logic handlers organized by domain
- transports: IPC layer (Stdin/Stdout and Echo-Bridge HTTP)
- responses: Standard response format helpers
- state: Singleton managers for auth, bridge, and executors
- lifecycle: Session initialization and shutdown logic
"""

# Response helpers
from portfolio_src.headless.responses import error_response, success_response

# State singletons
from portfolio_src.headless.state import (
    get_auth_manager,
    get_bridge,
    get_executor,
    reset_state,
)

# Lifecycle management
from portfolio_src.headless.lifecycle import (
    dead_mans_switch,
    get_session_id,
    get_start_time,
    init_database,
    install_default_config,
    resource_path,
    setup_session,
    start_dead_mans_switch,
)

# Dispatcher
from portfolio_src.headless.dispatcher import (
    dispatch,
    get_available_commands,
    is_command_registered,
)

__all__ = [
    # Responses
    "success_response",
    "error_response",
    # State
    "get_auth_manager",
    "get_bridge",
    "get_executor",
    "reset_state",
    # Lifecycle
    "setup_session",
    "start_dead_mans_switch",
    "dead_mans_switch",
    "install_default_config",
    "init_database",
    "resource_path",
    "get_session_id",
    "get_start_time",
    # Dispatcher
    "dispatch",
    "get_available_commands",
    "is_command_registered",
]
