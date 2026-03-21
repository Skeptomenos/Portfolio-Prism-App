#!/usr/bin/env python3
"""
One-time script to seed Hive with known ticker->ISIN mappings.

Run from src-tauri/python/:
    python scripts/seed_hive.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_src.data.hive_client import get_hive_client
from portfolio_src.data.local_cache import get_local_cache

SEED_MAPPINGS = [
    ("SAP.DE", "DE0007164600", "XETRA", "EUR"),
    ("SIE.DE", "DE0007236101", "XETRA", "EUR"),
    ("7203.T", "JP3633400001", "TSE", "JPY"),
    ("8306.T", "JP3902900004", "TSE", "JPY"),
    ("NOVO-B.CO", "DK0062498333", "CPH", "DKK"),
    ("TJX", "US8725401090", "NYSE", "USD"),
    ("NEE", "US65339F1012", "NYSE", "USD"),
    ("BLK", "US09247X1019", "NYSE", "USD"),
    ("NXPI", "NL0009538784", "NASDAQ", "USD"),
    ("CBA.AX", "AU000000CBA7", "ASX", "AUD"),
]


def main():
    hive = get_hive_client()
    local_cache = get_local_cache()

    if not hive or not hive.is_configured:
        print(
            "ERROR: Hive client not configured. Check SUPABASE_URL and SUPABASE_ANON_KEY."
        )
        sys.exit(1)

    success = 0
    failed = 0

    for ticker, isin, exchange, currency in SEED_MAPPINGS:
        try:
            hive.contribute_listing(
                isin=isin, ticker=ticker, exchange=exchange, currency=currency
            )
            if local_cache:
                local_cache.upsert_listing(ticker, exchange, isin, currency)
            print(f"  OK: {ticker} -> {isin}")
            success += 1
        except Exception as e:
            print(f"FAIL: {ticker} -> {e}")
            failed += 1

    print(f"\nSeeded {success} mappings, {failed} failed.")


if __name__ == "__main__":
    main()
