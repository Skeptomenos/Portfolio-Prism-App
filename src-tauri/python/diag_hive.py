import os
import sys
from pathlib import Path

sys.path.append(os.getcwd())

from portfolio_src.data.hive_client import get_hive_client, SUPABASE_AVAILABLE
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


def diag():
    logger.info(f"SUPABASE_AVAILABLE: {SUPABASE_AVAILABLE}")

    client = get_hive_client()
    masked_key = "*" * len(client.supabase_key) if client.supabase_key else "MISSING"
    logger.info(f"Supabase URL: {client.supabase_url}")
    logger.info(f"Supabase Key: {masked_key}")

    hb = client._get_client()
    if hb:
        logger.info("Successfully initialized Supabase Client")
        try:
            res = hb.from_("assets").select("*").limit(1).execute()
            if res.data:
                logger.info(f"Columns in 'assets': {list(res.data[0].keys())}")
            else:
                logger.info("No rows in 'assets' table to check columns.")

            tables = ["listings", "aliases", "etf_holdings", "master_view"]
            for table in tables:
                try:
                    hb.from_(table).select("*").limit(1).execute()
                    logger.info(f"Table '{table}' exists")
                except Exception as e:
                    logger.warning(f"Table '{table}' MISSING or error: {e}")
        except Exception as e:
            logger.error(f"Query error: {e}")
    else:
        logger.error("Failed to initialize Supabase Client")


if __name__ == "__main__":
    diag()
