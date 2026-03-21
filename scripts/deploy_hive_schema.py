#!/usr/bin/env python3
"""Deploy Hive schema and RPC functions to Supabase via psql."""

import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "infrastructure" / "supabase" / "migrations"
FUNCTIONS_FILE = PROJECT_ROOT / "infrastructure" / "supabase" / "functions.sql"


def run_sql_file(database_url: str, sql_file: Path) -> bool:
    """Execute a SQL file against the database."""
    if not sql_file.exists():
        print(f"❌ File not found: {sql_file}")
        return False

    print(f"📄 Executing: {sql_file.name}")

    try:
        result = subprocess.run(
            ["psql", database_url, "-f", str(sql_file)],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            print(f"❌ Error executing {sql_file.name}:")
            print(result.stderr)
            return False

        if result.stdout:
            for line in result.stdout.strip().split("\n"):
                if line and not line.startswith("SET"):
                    print(f"   {line}")

        print(f"✅ {sql_file.name} executed successfully")
        return True

    except subprocess.TimeoutExpired:
        print(f"❌ Timeout executing {sql_file.name}")
        return False
    except FileNotFoundError:
        print("❌ psql not found. Install PostgreSQL client tools.")
        return False


def main():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("❌ DATABASE_URL not set in environment")
        print("   Add DATABASE_URL to your .env file")
        print("   Format: postgresql://user:password@host:port/database")
        sys.exit(1)

    print("=" * 50)
    print("Hive Schema Deployment")
    print("=" * 50)

    all_success = True

    migration_file = MIGRATIONS_DIR / "20251224_add_aliases.sql"
    if migration_file.exists():
        if not run_sql_file(database_url, migration_file):
            all_success = False

    if FUNCTIONS_FILE.exists():
        if not run_sql_file(database_url, FUNCTIONS_FILE):
            all_success = False
    else:
        print(f"❌ Functions file not found: {FUNCTIONS_FILE}")
        all_success = False

    print("\n" + "=" * 50)
    if all_success:
        print("✅ Deployment complete!")
        print("\nRun verification: python3 scripts/test_hive_rpc.py")
    else:
        print("❌ Deployment had errors. Check output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
