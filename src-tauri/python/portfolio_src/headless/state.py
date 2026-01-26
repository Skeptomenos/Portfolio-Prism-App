"""Singleton State Managers.

Provides lazy-initialized singleton instances for shared resources:
- TRAuthManager: Trade Republic authentication
- TRBridge: Trade Republic API bridge
- ThreadPoolExecutor: Throttled executor for bridge operations
- SyncService: Portfolio sync orchestration (has stateful AssetClassifier)

These singletons are initialized on first access to avoid import-time side effects.
The executor is pre-configured with max_workers=2 to respect API rate limits (REQ-010).

Thread Safety:
    All singleton getters use double-checked locking pattern to prevent race conditions
    when multiple threads attempt to initialize the same singleton simultaneously.

Note:
    Pipeline is intentionally NOT a singleton - each sync run creates a fresh Pipeline
    instance to ensure clean state. See SyncService.run_pipeline().

    DashboardService is stateless and should be instantiated per-request in handlers.
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from portfolio_src.prism_utils.logging_config import get_logger

if TYPE_CHECKING:
    from portfolio_src.core.services.sync_service import SyncService
    from portfolio_src.core.tr_auth import TRAuthManager
    from portfolio_src.core.tr_bridge import TRBridge

logger = get_logger(__name__)

# Module-level singletons (lazy-initialized)
_auth_manager: "TRAuthManager | None" = None
_bridge: "TRBridge | None" = None
_sync_service: "SyncService | None" = None

# Lock for thread-safe singleton initialization (double-checked locking pattern)
_state_lock = threading.Lock()

# Pre-initialized executor with throttling constraint (REQ-010: max 5 concurrent API requests)
# Bridge operations use 2 workers to leave headroom for other async tasks
_bridge_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bridge")


def get_auth_manager() -> "TRAuthManager":
    """Get or create the TRAuthManager singleton.

    Returns:
        TRAuthManager instance for Trade Republic authentication.

    Note:
        Lazy initialization avoids import-time side effects from pytr library.
        Uses double-checked locking for thread safety.
    """
    global _auth_manager
    if _auth_manager is None:
        with _state_lock:
            if _auth_manager is None:  # Double-check after acquiring lock
                from portfolio_src.core.tr_auth import TRAuthManager

                logger.debug("Initializing TRAuthManager singleton")
                _auth_manager = TRAuthManager()
    return _auth_manager


def get_bridge() -> "TRBridge":
    """Get or create the TRBridge singleton.

    Returns:
        TRBridge instance for Trade Republic API communication.

    Note:
        Uses TRBridge.get_instance() which manages its own singleton pattern.
        Uses double-checked locking for thread safety.
    """
    global _bridge
    if _bridge is None:
        with _state_lock:
            if _bridge is None:  # Double-check after acquiring lock
                from portfolio_src.core.tr_bridge import TRBridge

                logger.debug("Initializing TRBridge singleton")
                _bridge = TRBridge.get_instance()
    return _bridge


def get_executor() -> ThreadPoolExecutor:
    """Get the shared bridge executor.

    Returns:
        ThreadPoolExecutor configured for throttled bridge operations.

    Note:
        max_workers=2 ensures we don't exceed API rate limits while
        allowing concurrent operations for auth + data fetching.
    """
    return _bridge_executor


def get_sync_service() -> "SyncService":
    """Get or create the SyncService singleton.

    Returns:
        SyncService instance for portfolio sync orchestration.

    Note:
        SyncService is stateful (contains AssetClassifier with cached lookups).
        Uses double-checked locking for thread safety.
    """
    global _sync_service
    if _sync_service is None:
        with _state_lock:
            if _sync_service is None:
                from portfolio_src.core.services.sync_service import SyncService

                logger.debug("Initializing SyncService singleton")
                _sync_service = SyncService()
    return _sync_service


def reset_state() -> None:
    """Reset all singletons (for testing only).

    Warning:
        This should only be used in test fixtures to ensure clean state.
        Do not call in production code.
    """
    global _auth_manager, _bridge, _sync_service
    logger.debug("Resetting headless state singletons")
    _auth_manager = None
    _bridge = None
    _sync_service = None
