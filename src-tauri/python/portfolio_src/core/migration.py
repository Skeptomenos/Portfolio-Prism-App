"""
Data Migration Module for Portfolio Prism Desktop App.

Ensures user data directories are properly initialized on first run.
"""

import os
import sys
import shutil
from pathlib import Path

from portfolio_src.config import CONFIG_DIR
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def get_bundled_defaults_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "default_config"  # type: ignore[attr-defined]
    else:
        return Path(__file__).parent.parent / "default_config"


def initialize_user_data_dir(data_dir: Path) -> None:
    logger.info(f"Initializing user data directory: {data_dir}")

    dirs_to_create = [
        data_dir,
        data_dir / "config",
        data_dir / "inputs",
        data_dir / "inputs" / "portfolio",
        data_dir / "inputs" / "manual_holdings",
        data_dir / "working",
        data_dir / "working" / "cache",
        data_dir / "outputs",
    ]

    for directory in dirs_to_create:
        directory.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Created directory: {directory}")

    bundled_defaults = get_bundled_defaults_path()
    user_config_dir = data_dir / "config"

    default_files = [
        "adapter_registry.json",
    ]

    for filename in default_files:
        src = bundled_defaults / filename
        dst = user_config_dir / filename

        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)
            logger.info(f"Copied default config: {filename}")
        elif not src.exists():
            logger.warning(f"Bundled default not found: {src}")

    ticker_map_src = bundled_defaults / "ticker_map.json"
    ticker_map_dst = CONFIG_DIR / "ticker_map.json"

    if ticker_map_src.exists():
        try:
            ticker_map_dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ticker_map_src, ticker_map_dst)
            logger.info(f"Migrated ticker map to {ticker_map_dst}")
        except Exception as e:
            logger.error(f"Failed to migrate ticker map: {e}")

    version_file = data_dir / "version.txt"
    if not version_file.exists():
        version_file.write_text("1.0.0")
        logger.info("Created version marker")


def run_migration_if_needed() -> None:
    """
    Main entry point for migration logic.
    Called from prism_boot.py before starting Streamlit.
    """
    prism_data_dir = os.getenv("PRISM_DATA_DIR")

    if not prism_data_dir:
        logger.debug("PRISM_DATA_DIR not set, skipping migration (dev mode)")
        return

    data_dir = Path(prism_data_dir)

    # Check if this is a fresh install
    version_file = data_dir / "version.txt"
    if not version_file.exists():
        logger.info("Fresh install detected, running data initialization...")
        initialize_user_data_dir(data_dir)
    else:
        current_version = version_file.read_text().strip()
        logger.debug(f"Existing installation detected: v{current_version}")
        # Future: Add upgrade logic here when schema changes
