#!/usr/bin/env python3
"""Test script to verify Hive RPC functions work via anon client."""

import os
from dotenv import load_dotenv

load_dotenv()


def test_hive_rpcs():
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")

    if not url or not key:
        print("❌ SUPABASE_URL or SUPABASE_ANON_KEY not set")
        return False

    client = create_client(url, key)
    all_passed = True

    # Test 1: Single ticker resolution
    print("\n=== Test 1: resolve_ticker_rpc ===")
    try:
        result = client.rpc("resolve_ticker_rpc", {"p_ticker": "AAPL"}).execute()
        if result.data and len(result.data) > 0:
            isin = result.data[0].get("isin")
            print(f"✅ AAPL -> {isin}")
            if isin != "US0378331005":
                print(f"⚠️  Expected US0378331005, got {isin}")
        else:
            print("❌ No data returned")
            all_passed = False
    except Exception as e:
        print(f"❌ Error: {e}")
        all_passed = False

    # Test 2: Batch resolution
    print("\n=== Test 2: batch_resolve_tickers_rpc ===")
    try:
        result = client.rpc(
            "batch_resolve_tickers_rpc", {"p_tickers": ["AAPL", "MSFT", "NVDA"]}
        ).execute()
        if result.data:
            print(f"✅ Returned {len(result.data)} results")
            for row in result.data:
                print(f"   {row['ticker']} -> {row['isin']}")
        else:
            print("❌ No data returned")
            all_passed = False
    except Exception as e:
        print(f"❌ Error: {e}")
        all_passed = False

    # Test 3: Alias lookup (may be empty if aliases table is new)
    print("\n=== Test 3: lookup_alias_rpc ===")
    try:
        result = client.rpc("lookup_alias_rpc", {"p_alias": "Apple"}).execute()
        if result.data and len(result.data) > 0:
            print(f"✅ 'Apple' -> {result.data[0].get('isin')}")
        else:
            print("⚠️  No alias found (expected if aliases table is empty)")
    except Exception as e:
        print(f"❌ Error: {e}")
        all_passed = False

    # Test 4: Count accessible data
    print("\n=== Test 4: Data accessibility ===")
    try:
        # This should work via RPC even though direct SELECT is blocked
        result = client.rpc("batch_resolve_tickers_rpc", {"p_tickers": []}).execute()
        print("✅ RPC functions are accessible")
    except Exception as e:
        print(f"❌ RPC access failed: {e}")
        all_passed = False

    print("\n" + "=" * 40)
    if all_passed:
        print("✅ All tests passed! Phase 0 complete.")
    else:
        print("❌ Some tests failed. Check RPC deployment.")

    return all_passed


if __name__ == "__main__":
    test_hive_rpcs()
