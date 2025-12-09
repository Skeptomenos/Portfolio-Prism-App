import os
from pathlib import Path

# Base project directory (2 levels up from src/config.py)
PROJECT_ROOT = Path(__file__).parent.parent.resolve()

# Proxy configuration (for Docker distribution)
# When set, API calls route through the proxy instead of direct calls
PROXY_URL = os.getenv("PROXY_URL")  # e.g., https://portfolio-api.helmus.me
PROXY_API_KEY = os.getenv("PROXY_API_KEY")

# ===== DYNAMIC DATA DIRECTORY (For Tauri Desktop App) =====
# In production, PRISM_DATA_DIR points to ~/Library/Application Support/...
# In development, falls back to PROJECT_ROOT/data
_prism_data_dir = os.getenv("PRISM_DATA_DIR")
if _prism_data_dir:
    DATA_DIR = Path(_prism_data_dir)
    CONFIG_DIR = DATA_DIR / "config"  # User-writable config location
    OUTPUTS_DIR = DATA_DIR / "outputs"  # User-writable outputs location
else:
    # Development fallback
    DATA_DIR = PROJECT_ROOT / "data"
    CONFIG_DIR = PROJECT_ROOT / "config"
    OUTPUTS_DIR = PROJECT_ROOT / "outputs"

# Data Directories
INPUTS_DIR = DATA_DIR / "inputs"
MANUAL_INPUTS_DIR = INPUTS_DIR / "manual_holdings"
WORKING_DIR = DATA_DIR / "working"
RAW_DOWNLOADS_DIR = WORKING_DIR / "raw_downloads"

# File Paths
ASSET_UNIVERSE_PATH = CONFIG_DIR / "asset_universe.csv"

# Output Directories
REPORTS_DIR = OUTPUTS_DIR  # For now, reports go to root of outputs

# File Paths
TRUE_EXPOSURE_REPORT = REPORTS_DIR / "true_exposure_report.csv"
DIRECT_HOLDINGS_REPORT = REPORTS_DIR / "direct_holdings_report.csv"
HOLDINGS_BREAKDOWN_PATH = OUTPUTS_DIR / "holdings_breakdown.csv"
TRADES_FILE = OUTPUTS_DIR / "trades.csv"
POSITIONS_FILE = OUTPUTS_DIR / "positions_with_prices.csv"

# Cache and error tracking
ENRICHMENT_CACHE_PATH = WORKING_DIR / "enrichment_cache.json"
PIPELINE_ERRORS_PATH = OUTPUTS_DIR / "pipeline_errors.json"
PIPELINE_HEALTH_PATH = OUTPUTS_DIR / "pipeline_health.json"

# Ensure directories exist
for directory in [
    DATA_DIR,
    INPUTS_DIR,
    MANUAL_INPUTS_DIR,
    WORKING_DIR,
    RAW_DOWNLOADS_DIR,
    OUTPUTS_DIR,
]:
    directory.mkdir(parents=True, exist_ok=True)
