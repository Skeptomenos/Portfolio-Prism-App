import pandas as pd
import sys
from pathlib import Path

# Add src-tauri/python to path
sys.path.append(str(Path(__file__).parent / "src-tauri" / "python"))

from portfolio_src.core.utils import SchemaNormalizer, get_weight_column


def test_schema_normalizer():
    print("Testing SchemaNormalizer...")
    df = pd.DataFrame({"ticker": ["AAPL", "MSFT"], "weight_percentage": [5.0, 3.0]})

    print(f"Original columns: {df.columns.tolist()}")

    norm_df = SchemaNormalizer.normalize_columns(df)
    print(f"Normalized columns: {norm_df.columns.tolist()}")

    weight_col = get_weight_column(df)
    print(f"get_weight_column(df) returns: {weight_col}")

    if "weight" in norm_df.columns:
        print("SUCCESS: weight_percentage mapped to weight")
    else:
        print("FAILURE: weight_percentage NOT mapped to weight")


def test_enrichment_error():
    print("\nTesting Enrichment Error (Duplicate Index)...")
    # Simulate duplicate index
    df = pd.DataFrame(
        {"ticker": ["AAPL", "AAPL"], "name": ["Apple", "Apple Inc"]},
        index=["US0378331005", "US0378331005"],
    )

    print(f"DataFrame with duplicate index:\n{df}")
    print(f"Index is unique: {df.index.is_unique}")

    try:
        # Simulate what enricher does (reindexing)
        # enricher.py line 156: enriched_map[isin] = enriched_holdings.loc[holdings.index]
        # But wait, enricher.py line 138: all_holdings = pd.concat(holdings_map.values())
        # Then it enriches all_holdings.
        # Then it splits it back?

        # Let's look at enricher.py logic
        pass
    except Exception as e:
        print(f"Caught expected error: {e}")


if __name__ == "__main__":
    test_schema_normalizer()
    test_enrichment_error()
