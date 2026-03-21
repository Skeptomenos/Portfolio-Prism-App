import pytest
import pandas as pd
from pathlib import Path
import shutil

@pytest.fixture
def mock_e2e_data_dir(tmp_path):
    """Create a temporary data directory structure for E2E tests."""
    data_dir = tmp_path / "data"
    inputs_dir = data_dir / "inputs"
    working_dir = data_dir / "working"
    cache_dir = working_dir / "cache"
    outputs_dir = data_dir / "outputs"
    
    for d in [inputs_dir, working_dir, cache_dir, outputs_dir]:
        d.mkdir(parents=True, exist_ok=True)
        
    return data_dir

@pytest.fixture
def clean_e2e_env(mock_e2e_data_dir):
    """Provide a clean environment and ensure cleanup."""
    yield mock_e2e_data_dir
    # Cleanup if needed (tmp_path handles this usually)

def create_mock_positions(data_dir: Path):
    """Create a mock positions.csv in working/raw_downloads."""
    raw_dir = data_dir / "working" / "raw_downloads"
    raw_dir.mkdir(parents=True, exist_ok=True)
    
    df = pd.DataFrame({
        "ISIN": ["US0378331005", "IE00B4L5Y983", "IE00B3RBWM25"],
        "Name": ["Apple Inc.", "iShares Core MSCI World", "Vanguard FTSE All-World"],
        "asset_type": ["Stock", "ETF", "ETF"],
        "Quantity": [10, 50, 20],
        "avg_cost": [150.0, 70.0, 90.0],
        "tr_price": [180.0, 85.0, 105.0],
        "tr_value": [1800.0, 4250.0, 2100.0]
    })
    # Save as if it came from TR export
    df.to_csv(data_dir / "working" / "calculated_holdings.csv", index=False)
    
def create_mock_enrichment_cache(data_dir: Path):
    """Create a mock enrichment cache."""
    cache_path = data_dir / "working" / "cache" / "enrichment_cache.json"
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    
    cache_data = {
        "US0378331005": {
            "isin": "US0378331005",
            "name": "Apple Inc.",
            "ticker": "AAPL",
            "sector": "Technology",
            "geography": "United States",
            "asset_class": "Stock"
        },
        "IE00B4L5Y983": {
            "isin": "IE00B4L5Y983",
            "name": "iShares Core MSCI World",
            "ticker": "SWDA.L",
            "sector": "Equity",
            "geography": "Global",
            "asset_class": "ETF"
        }
    }
    
    import json
    with open(cache_path, "w") as f:
        json.dump(cache_data, f)


def create_mock_etf_holdings(data_dir: Path):
    """Create mock ETF holdings CSV files."""
    manual_dir = data_dir / "inputs" / "manual_holdings"
    manual_dir.mkdir(parents=True, exist_ok=True)
    
    # iShares MSCI World holdings
    ishares_df = pd.DataFrame({
        "isin": ["US0378331005", "US5949181045", "US0231351067"],
        "name": ["Apple Inc.", "Microsoft Corp.", "Amazon.com Inc."],
        "weight_percentage": [5.0, 4.5, 3.2],
        "sector": ["Technology", "Technology", "Consumer Discretionary"],
        "geography": ["United States", "United States", "United States"]
    })
    ishares_df.to_csv(manual_dir / "IE00B4L5Y983.csv", index=False)
    
    # Vanguard FTSE holdings
    vanguard_df = pd.DataFrame({
        "isin": ["US0378331005", "CH0038863350", "GB0002875804"],
        "name": ["Apple Inc.", "Nestle SA", "British American Tobacco"],
        "weight_percentage": [4.0, 2.5, 1.8],
        "sector": ["Technology", "Consumer Staples", "Consumer Staples"],
        "geography": ["United States", "Switzerland", "United Kingdom"]
    })
    vanguard_df.to_csv(manual_dir / "IE00B3RBWM25.csv", index=False)


def create_mock_asset_universe(data_dir: Path):
    """Create a mock asset_universe.csv."""
    config_dir = data_dir / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    
    df = pd.DataFrame({
        "ISIN": ["US0378331005"],
        "TR_Ticker": ["AAPL"],
        "Yahoo_Ticker": ["AAPL"],
        "Name": ["Apple Inc."],
        "Provider": [""],
        "Asset_Class": ["Stock"]
    })
    df.to_csv(config_dir / "asset_universe.csv", index=False)


def setup_full_mock_environment(data_dir: Path):
    """Setup complete mock environment for E2E testing."""
    create_mock_positions(data_dir)
    create_mock_enrichment_cache(data_dir)
    create_mock_etf_holdings(data_dir)
    create_mock_asset_universe(data_dir)
