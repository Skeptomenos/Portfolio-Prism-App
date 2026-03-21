#!/usr/bin/env python3
"""
Smoke Test: Verify all critical pipeline modules can be imported.

Run from: src-tauri/python/
Command: python3 tests/smoke_test_imports.py
"""

import sys
from pathlib import Path

# Add portfolio_src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "portfolio_src"))

MODULES_TO_TEST = [
    # Core modules
    ("core.aggregation", "run_aggregation"),
    ("core.reporting", "generate_report"),
    ("core.validation", "validate_final_report"),
    ("core.direct_reporting", "generate_direct_holdings_report"),
    ("core.health", "health"),
    ("core.enrichment_gaps", "EnrichmentGapCollector"),
    
    # Data modules
    ("data.state_manager", "load_portfolio_state"),
    ("data.holdings_cache", "HoldingsCache"),
    ("data.enrichment", None),
    ("data.historical_prices", None),
    
    # Adapters
    ("adapters.registry", "AdapterRegistry"),
    
    # Utils
    ("prism_utils.logging_config", "get_logger"),
    ("prism_utils.schemas", "HoldingsSchema"),
    ("prism_utils.metrics", "tracker"),
    
    # Config
    ("config", "ASSET_UNIVERSE_PATH"),
    ("config", "ENRICHMENT_CACHE_PATH"),
    ("config", "PIPELINE_ERRORS_PATH"),
    
    # Phase 5 Dependencies
    ("matplotlib", "pyplot"),
    ("yfinance", None),
]

def test_imports():
    """Test all module imports."""
    results = {"passed": [], "failed": []}
    
    for module_path, expected_attr in MODULES_TO_TEST:
        try:
            module = __import__(module_path, fromlist=[expected_attr] if expected_attr else [])
            if expected_attr and not hasattr(module, expected_attr):
                results["failed"].append((module_path, f"Missing attribute: {expected_attr}"))
            else:
                results["passed"].append(module_path)
        except ImportError as e:
            results["failed"].append((module_path, str(e)))
        except Exception as e:
            results["failed"].append((module_path, f"Unexpected error: {e}"))
    
    return results


def main():
    print("=" * 60)
    print("Pipeline Import Smoke Test")
    print("=" * 60)
    
    results = test_imports()
    
    print(f"\n✅ PASSED ({len(results['passed'])})")
    for module in results['passed']:
        print(f"   {module}")
    
    if results['failed']:
        print(f"\n❌ FAILED ({len(results['failed'])})")
        for module, error in results['failed']:
            print(f"   {module}: {error}")
        print("\n" + "=" * 60)
        print("RESULT: FAIL")
        sys.exit(1)
    else:
        print("\n" + "=" * 60)
        print("RESULT: ALL IMPORTS SUCCESSFUL")
        sys.exit(0)


if __name__ == "__main__":
    main()
