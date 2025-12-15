import json
import pandas as pd
import os
from pathlib import Path
import streamlit as st
from datetime import datetime, timedelta
from portfolio_src import config # Import centralized config


# Bundle-safe path utilities
def resource_path(relative_path: str) -> str:
    """
    Get the absolute path to a resource.
    Works for both dev mode and PyInstaller frozen mode.
    """
    if hasattr(os, "_MEIPASS"):
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = os.path.dirname(os.path.abspath(__file__))
        # For dashboard, go up to portfolio_src level
        base_path = os.path.dirname(base_path)  # up to portfolio_src
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
        base_path = os.path.dirname(base_path)  # up to portfolio_src
    return os.path.join(base_path, relative_path)


def get_project_root() -> Path:
    """Get the project root directory in a bundle-safe way."""
    return Path(resource_path(".."))  # portfolio_src/.. = project root


def get_data_dir() -> Path:
    """
    Get the user data directory.
    
    In production (Tauri), PRISM_DATA_DIR is set by the Rust shell.
    In dev mode, falls back to ~/.prism/data.
    """
    data_dir = os.environ.get("PRISM_DATA_DIR", os.path.expanduser("~/.prism/data"))
    return Path(data_dir)


# Constants - Use config for paths to ensure consistency with pipeline/state_manager
PROJECT_ROOT = config.PROJECT_ROOT

# Map config paths to local constants
DATA_DIR = config.WORKING_DIR  # utils.DATA_DIR historically pointed to working dir
SNAPSHOTS_DIR = config.WORKING_DIR / "snapshots"
HOLDINGS_PATH = config.WORKING_DIR / "calculated_holdings.csv"

OUTPUTS_DIR = config.OUTPUTS_DIR
CONFIG_DIR = config.CONFIG_DIR

# Ensure snapshots dir exists (config ensures others)
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

PIPELINE_HEALTH_PATH = OUTPUTS_DIR / "pipeline_health.json"
SNAPSHOT_MAX_AGE_HOURS = 24  # Create new snapshot if older than this
@st.cache_data
def load_pipeline_health() -> dict:
    """Load the pipeline health JSON file."""
    if not PIPELINE_HEALTH_PATH.exists():
        return {}

    try:
        with open(PIPELINE_HEALTH_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        st.error(f"Failed to load pipeline health: {e}")
        return {}


@st.cache_data
def load_direct_holdings() -> pd.DataFrame:
    """Load direct holdings report."""
    path = config.DIRECT_HOLDINGS_REPORT
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path)
    
    # Normalize columns for UI - Prevent duplicates
    # 1. Ensure 'name' column exists
    if "name" not in df.columns and "TR_Name" in df.columns:
        df = df.rename(columns={"TR_Name": "name"})
    
    # 2. Ensure 'market_value' column exists
    if "market_value" not in df.columns:
        if "tr_value" in df.columns:
            df = df.rename(columns={"tr_value": "market_value"})
        elif "NetValue" in df.columns:
            df = df.rename(columns={"NetValue": "market_value"})
         
    return df


@st.cache_data
def load_holdings_breakdown() -> pd.DataFrame:
    """Load holdings breakdown report."""
    path = OUTPUTS_DIR / "holdings_breakdown.csv"
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


@st.cache_data
def load_asset_universe() -> pd.DataFrame:
    """Load asset universe configuration."""
    path = CONFIG_DIR / "asset_universe.csv"
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


@st.cache_data
def load_exposure_report() -> pd.DataFrame:
    """Load true exposure report."""
    path = OUTPUTS_DIR / "true_exposure_report.csv"
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def get_isin_name_mapping(breakdown_df: pd.DataFrame) -> dict:
    """
    Build mapping of ISIN -> canonical name.

    Priority for canonical name:
    1. Name from asset_universe.csv (if ISIN exists there)
    2. Most frequent name in breakdown data for that ISIN

    Args:
        breakdown_df: Holdings breakdown DataFrame with child_isin, child_name columns

    Returns:
        dict[str, str]: {isin: canonical_name}
    """
    if breakdown_df.empty:
        return {}

    # Load asset universe for canonical names
    universe_df = load_asset_universe()
    universe_names = {}
    if (
        not universe_df.empty
        and "ISIN" in universe_df.columns
        and "Name" in universe_df.columns
    ):
        universe_names = (
            universe_df.dropna(subset=["ISIN", "Name"])
            .drop_duplicates(subset=["ISIN"], keep="first")
            .set_index("ISIN")["Name"]
            .to_dict()
        )

    # Get unique ISINs from breakdown
    isin_to_name = {}

    for isin in breakdown_df["child_isin"].dropna().unique():
        isin_str = str(isin)

        # Priority 1: Use name from asset_universe if available
        if isin_str in universe_names:
            isin_to_name[isin_str] = universe_names[isin_str]
            continue

        # Priority 2: Use most frequent name in breakdown data
        names_for_isin = breakdown_df[breakdown_df["child_isin"] == isin]["child_name"]
        if not names_for_isin.empty:
            # Get most common name
            most_common = names_for_isin.mode()
            if len(most_common) > 0:
                isin_to_name[isin_str] = most_common.iloc[0]
            else:
                isin_to_name[isin_str] = names_for_isin.iloc[0]

    return isin_to_name


def create_portfolio_snapshot() -> dict:
    """
    Create a snapshot of current portfolio state.

    Returns dict with portfolio summary and per-position data.
    """
    if not HOLDINGS_PATH.exists():
        return {}

    df = pd.read_csv(HOLDINGS_PATH)

    # Calculate totals
    df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce").fillna(0)
    df["AvgCost"] = pd.to_numeric(df["AvgCost"], errors="coerce").fillna(0)
    df["CurrentPrice"] = pd.to_numeric(df["CurrentPrice"], errors="coerce").fillna(0)
    df["NetValue"] = pd.to_numeric(df["NetValue"], errors="coerce").fillna(0)

    df["cost_basis"] = df["AvgCost"] * df["Quantity"]

    total_value = df["NetValue"].sum()
    total_cost = df["cost_basis"].sum()
    unrealized_pl = total_value - total_cost
    unrealized_pl_pct = ((total_value / total_cost) - 1) * 100 if total_cost > 0 else 0

    # Build positions list
    positions = []
    for _, row in df.iterrows():
        cost_basis = row["cost_basis"]
        current_value = row["NetValue"]
        pl = current_value - cost_basis
        pl_pct = ((current_value / cost_basis) - 1) * 100 if cost_basis > 0 else 0

        positions.append(
            {
                "isin": row["ISIN"],
                "name": row.get("TR_Name", "Unknown"),
                "quantity": float(row["Quantity"]),
                "avg_cost": float(row["AvgCost"]),
                "current_price": float(row["CurrentPrice"]),
                "value": float(current_value),
                "cost_basis": float(cost_basis),
                "pl": float(pl),
                "pl_pct": float(pl_pct),
            }
        )

    now = datetime.now()

    return {
        "date": now.strftime("%Y-%m-%d"),
        "timestamp": now.isoformat(),
        "total_value": float(total_value),
        "total_cost_basis": float(total_cost),
        "unrealized_pl": float(unrealized_pl),
        "unrealized_pl_pct": float(unrealized_pl_pct),
        "position_count": len(positions),
        "positions": positions,
    }


def save_snapshot_if_needed() -> bool:
    """
    Save a snapshot if the last one is older than SNAPSHOT_MAX_AGE_HOURS.

    Called automatically when dashboard loads.

    Returns True if a new snapshot was created.
    """
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    # Check for existing snapshots
    today = datetime.now().strftime("%Y-%m-%d")
    today_snapshot = SNAPSHOTS_DIR / f"{today}.json"

    # If today's snapshot exists, check age
    if today_snapshot.exists():
        try:
            with open(today_snapshot, "r") as f:
                existing = json.load(f)

            last_timestamp = datetime.fromisoformat(
                existing.get("timestamp", "2000-01-01")
            )
            age = datetime.now() - last_timestamp

            if age < timedelta(hours=SNAPSHOT_MAX_AGE_HOURS):
                return False  # Recent enough, no need to create
        except Exception:
            pass  # If can't read, create new one

    # Create new snapshot
    snapshot = create_portfolio_snapshot()
    if not snapshot:
        return False

    with open(today_snapshot, "w") as f:
        json.dump(snapshot, f, indent=2)

    return True


def load_snapshots(days: int = 30) -> list[dict]:
    """
    Load historical snapshots.

    Args:
        days: Number of days to look back

    Returns:
        List of snapshot dicts, sorted by date (oldest first)
    """
    if not SNAPSHOTS_DIR.exists():
        return []

    snapshots = []
    cutoff = datetime.now() - timedelta(days=days)

    for path in SNAPSHOTS_DIR.glob("*.json"):
        try:
            with open(path, "r") as f:
                snapshot = json.load(f)

            snap_date = datetime.fromisoformat(snapshot.get("timestamp", "2000-01-01"))
            if snap_date >= cutoff:
                snapshots.append(snapshot)
        except Exception:
            continue

    # Sort by date
    snapshots.sort(key=lambda x: x.get("timestamp", ""))

    return snapshots
