"""Singleton State Managers.

Provides lazy-initialized singleton instances for shared resources:
- TRAuthManager: Trade Republic authentication
- TRBridge: Trade Republic API bridge
- ThreadPoolExecutor: Throttled executor for bridge operations
- Pipeline: Data processing pipeline

These singletons are initialized on first access to avoid import-time side effects.
The executor is pre-configured with max_workers=2 to respect API rate limits (REQ-010).
"""

from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from portfolio_src.prism_utils.logging_config import get_logger

if TYPE_CHECKING:
    from portfolio_src.core.tr_auth import TRAuthManager
    from portfolio_src.core.tr_bridge import TRBridge
    from portfolio_src.core.pipeline import Pipeline

logger = get_logger(__name__)

# Module-level singletons (lazy-initialized)
_auth_manager: "TRAuthManager | None" = None
_bridge: "TRBridge | None" = None
_pipeline: "Pipeline | None" = None

# Pre-initialized executor with throttling constraint (REQ-010: max 5 concurrent API requests)
# Bridge operations use 2 workers to leave headroom for other async tasks
_bridge_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bridge")


def get_auth_manager() -> "TRAuthManager":
    """Get or create the TRAuthManager singleton.

    Returns:
        TRAuthManager instance for Trade Republic authentication.

    Note:
        Lazy initialization avoids import-time side effects from pytr library.
    """
    global _auth_manager
    if _auth_manager is None:
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
    """
    global _bridge
    if _bridge is None:
        from portfolio_src.core.tr_bridge import TRBridge

        logger.debug("Initializing TRBridge singleton")
        _bridge = TRBridge.get_instance()
    return _bridge


def get_pipeline() -> "Pipeline":
    """Get or create the Pipeline singleton."""
    global _pipeline
    if _pipeline is None:
        from portfolio_src.core.pipeline import Pipeline

        logger.debug("Initializing Pipeline singleton")
        _pipeline = Pipeline()
    return _pipeline


def get_executor() -> ThreadPoolExecutor:
    """Get the shared bridge executor.

    Returns:
        ThreadPoolExecutor configured for throttled bridge operations.

    Note:
        max_workers=2 ensures we don't exceed API rate limits while
        allowing concurrent operations for auth + data fetching.
    """
    return _bridge_executor


def reset_state() -> None:
    """Reset all singletons (for testing only).

    Warning:
        This should only be used in test fixtures to ensure clean state.
        Do not call in production code.
    """
    global _auth_manager, _bridge, _pipeline
    logger.debug("Resetting headless state singletons")
    _auth_manager = None
    _bridge = None
    _pipeline = None
