
import os
import sys
from pathlib import Path

# Add python path
sys.path.append(os.getcwd())

from portfolio_src.data.hive_client import get_hive_client, SUPABASE_AVAILABLE

def diag():
    print(f"SUPABASE_AVAILABLE: {SUPABASE_AVAILABLE}")
    
    client = get_hive_client()
    print(f"Supabase URL: {client.supabase_url}")
    print(f"Supabase Key: {'*' * len(client.supabase_key) if client.supabase_key else 'MISSING'}")
    
    hb = client._get_client()
    if hb:
        print("Successfully initialized Supabase Client")
        try:
            res = hb.from_("assets").select("*").limit(1).execute()
            if res.data:
                print(f"Columns in 'assets': {list(res.data[0].keys())}")
            else:
                print("No rows in 'assets' table to check columns.")
            
            # Try to list other common tables
            tables = ["listings", "aliases", "etf_holdings", "master_view"]
            for table in tables:
                try:
                    hb.from_(table).select("*").limit(1).execute()
                    print(f"Table '{table}' exists")
                except Exception as e:
                    print(f"Table '{table}' MISSING or error: {e}")
        except Exception as e:
            print(f"Query error: {e}")
    else:
        print("Failed to initialize Supabase Client")

if __name__ == "__main__":
    diag()
