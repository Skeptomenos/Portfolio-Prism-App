import pytest
import pandas as pd
import numpy as np
import sys
from pathlib import Path

# Add paths for package resolution
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "portfolio_src"))

from portfolio_src.core.data_cleaner import DataCleaner


class TestDataCleaner:
    def test_cleanup_with_metadata_header(self):
        """Verify cleaner finds header row and drops metadata above it."""
        raw_data = pd.DataFrame(
            [
                ["Report: Portfolio Holdings", np.nan, np.nan],
                ["Date: 2024-01-01", np.nan, np.nan],
                ["", "", ""],
                ["ISIN", "Name", "Weight (%)"],  # Real header at index 3
                ["US0378331005", "Apple", "1.5"],
                ["US5949181045", "Microsoft", "2.0"],
                ["Total", "", "3.5"],
            ]
        )

        # Initially columns are 0, 1, 2
        cleaned = DataCleaner.cleanup(raw_data)

        assert len(cleaned) == 2
        assert "isin" in cleaned.columns
        assert "weight" in cleaned.columns
        assert cleaned.iloc[0]["isin"] == "US0378331005"
        assert cleaned.iloc[0]["weight"] == 1.5
        assert "Total" not in cleaned["name"].values

    def test_cleanup_junk_rows(self):
        """Verify cleaner drops empty rows and footer totals."""
        raw_data = pd.DataFrame(
            [
                {"isin": "US0378331005", "name": "Apple", "weight": 1.5},
                {"isin": np.nan, "name": np.nan, "weight": np.nan},
                {"isin": "INVALID", "name": "Short ISIN", "weight": 0.5},
                {"isin": "US5949181045", "name": "Portfolio Total", "weight": 100.0},
            ]
        )

        cleaned = DataCleaner.cleanup(raw_data)

        # Should only keep Apple.
        # INVALID is dropped (len < 12)
        # Portfolio Total is dropped (contains 'total')
        # NaN is dropped
        assert len(cleaned) == 1
        assert cleaned.iloc[0]["name"] == "Apple"

    def test_smart_load_csv(self, tmp_path):
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("isin,name,weight\nUS0378331005,Apple,1.5")

        df = DataCleaner.smart_load(str(csv_file))
        assert not df.empty
        assert df.iloc[0]["isin"] == "US0378331005"

    def test_smart_load_json(self, tmp_path):
        json_file = tmp_path / "test.json"
        json_file.write_text(
            '[{"isin": "US0378331005", "name": "Apple", "weight": 1.5}]'
        )

        df = DataCleaner.smart_load(str(json_file))
        assert not df.empty
        assert df.iloc[0]["isin"] == "US0378331005"
