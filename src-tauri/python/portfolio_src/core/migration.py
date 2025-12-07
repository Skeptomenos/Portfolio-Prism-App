"""
Data Migration Module for Portfolio Prism Desktop App.

This module ensures that user data directories are properly initialized
when the app runs for the first time in production (Tauri bundle).

On first run:
1. Creates the user's data directory (~/.../Application Support/PortfolioPrism)
2. Copies bundled default configs (asset_universe.csv, adapter_registry.json)
   to the user-writable location.
"""
import os
import sys
import shutil
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def get_bundled_defaults_path() -> Path:
    """
    Get the path to bundled default configs.
    In a PyInstaller bundle, this is inside the frozen _MEIPASS directory.
    In development, it's relative to the script.
    """
    if getattr(sys, 'frozen', False):
        # Running in PyInstaller bundle
        return Path(sys._MEIPASS) / "default_config"
    else:
        # Development mode
        return Path(__file__).parent.parent / "default_config"


def initialize_user_data_dir(data_dir: Path) -> None:
    """
    Ensure the user's data directory exists and has required default files.
    
    Args:
        data_dir: The path from PRISM_DATA_DIR env var
    """
    logger.info(f"Initializing user data directory: {data_dir}")
    
    # Create core directories
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
    
    # Copy default configs if they don't exist
    bundled_defaults = get_bundled_defaults_path()
    user_config_dir = data_dir / "config"
    
    default_files = [
        "asset_universe.csv",
        "adapter_registry.json",
        "ticker_map.json",
    ]
    
    for filename in default_files:
        src = bundled_defaults / filename
        dst = user_config_dir / filename
        
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)
            logger.info(f"Copied default config: {filename}")
        elif not src.exists():
            logger.warning(f"Bundled default not found: {src}")
    
    # Write version marker
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
