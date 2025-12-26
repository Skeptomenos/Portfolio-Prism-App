"""Headless Engine Lifecycle Management.

Handles session initialization, configuration installation, and shutdown logic:
- Session ID generation and logger configuration
- Dead man's switch for sidecar lifecycle (parent process monitoring)
- Default configuration file installation from bundle
- Resource path resolution for PyInstaller bundles
"""

import logging
import os
import shutil
import sys
import threading
import uuid
from pathlib import Path
from typing import Optional

from portfolio_src.prism_utils.logging_config import configure_root_logger, get_logger

logger = get_logger(__name__)

# Module-level session state
_session_id: str = "unknown"
_start_time: float = 0.0


def get_session_id() -> str:
    """Get the current session ID.

    Returns:
        UUID string identifying this engine session.
    """
    return _session_id


def get_start_time() -> float:
    """Get the session start timestamp.

    Returns:
        Unix timestamp when the session was initialized.
    """
    return _start_time


def resource_path(relative_path: str) -> str:
    """Get absolute path to resource, works for dev and PyInstaller bundle.

    Args:
        relative_path: Path relative to the script or bundle root.

    Returns:
        Absolute path to the resource.

    Note:
        In PyInstaller bundles, sys._MEIPASS points to the temp extraction directory.
        In development, uses the script's directory.
    """
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    # When running from headless package, go up to python/ directory
    if "headless" in base_path:
        base_path = os.path.dirname(os.path.dirname(os.path.dirname(base_path)))
    return os.path.join(base_path, relative_path)


def dead_mans_switch(shutdown_event: threading.Event) -> None:
    """Monitor for parent process termination and exit cleanly.

    This function blocks until the shutdown_event is set, then forces
    process exit. Used as a daemon thread to ensure the sidecar terminates
    when the parent Tauri process dies.

    Args:
        shutdown_event: Event that signals shutdown (set when stdin closes).

    Note:
        Uses os._exit(0) for immediate termination without cleanup handlers.
        This is intentional to avoid hanging on stuck I/O.
    """
    try:
        shutdown_event.wait()
    except Exception:
        pass
    finally:
        os._exit(0)


def start_dead_mans_switch() -> threading.Event:
    """Start the dead man's switch daemon thread.

    Returns:
        The shutdown event that can be set to trigger termination.

    Note:
        The thread is started as a daemon so it won't prevent process exit.
    """
    shutdown_event = threading.Event()
    threading.Thread(
        target=dead_mans_switch,
        args=(shutdown_event,),
        daemon=True,
        name="dead-mans-switch",
    ).start()
    logger.debug("Dead man's switch started")
    return shutdown_event


def setup_session(http_mode: bool = False) -> str:
    """Initialize a new engine session.

    Creates a unique session ID, configures logging, and ensures
    the data directory exists.

    Args:
        http_mode: If True, redirect stdout/stderr to loggers (for Echo-Bridge).

    Returns:
        The generated session ID.

    Note:
        In HTTP mode, stdout/stderr are redirected to prevent IPC pollution.
    """
    import time

    global _session_id, _start_time

    _session_id = str(uuid.uuid4())
    _start_time = time.time()

    # Ensure data directory exists
    data_dir = os.environ.get("PRISM_DATA_DIR")
    if data_dir:
        os.makedirs(data_dir, exist_ok=True)

    # Configure logging with session ID
    configure_root_logger(session_id=_session_id)

    # In HTTP mode, redirect stdout/stderr to loggers
    if http_mode:
        from portfolio_src.prism_utils.logging_config import StreamToLogger

        sys.stdout = StreamToLogger(get_logger("STDOUT"), logging.INFO)
        sys.stderr = StreamToLogger(get_logger("STDERR"), logging.WARNING)

    logger.info(f"Session started: {_session_id}")
    return _session_id


def install_default_config() -> None:
    """Install default configuration files from bundle if missing.

    Copies bundled config files to the user's config directory on first run.
    Skips files that already exist to preserve user customizations.
    """
    try:
        from portfolio_src.config import CONFIG_DIR
    except ImportError:
        logger.error(
            "Could not import portfolio_src.config. Skipping default config install."
        )
        return

    logger.info(f"Checking configuration in: {CONFIG_DIR}")

    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"Failed to create config dir: {e}", exc_info=True)
        return

    files_to_install = [
        "adapter_registry.json",
        "ishares_config.json",
        "ticker_map.json",
    ]

    for filename in files_to_install:
        target_path = CONFIG_DIR / filename
        if target_path.exists():
            continue

        bundled_path = Path(resource_path(os.path.join("default_config", filename)))
        if bundled_path.exists():
            try:
                shutil.copy2(bundled_path, target_path)
                logger.info(f"Installed default config: {filename}")
            except Exception as e:
                logger.error(f"Failed to install {filename}: {e}", exc_info=True)
        else:
            log_level = logging.WARNING if "registry" in filename else logging.INFO
            logger.log(log_level, f"Default config not found in bundle: {bundled_path}")


def init_database() -> None:
    """Initialize the SQLite database.

    Creates tables if they don't exist and applies any pending migrations.
    """
    from portfolio_src.data.database import init_db

    init_db()
    logger.debug("Database initialized")
