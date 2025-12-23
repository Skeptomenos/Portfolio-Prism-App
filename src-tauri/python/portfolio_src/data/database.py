"""
SQLite Database Management

Provides connection management and initialization for the Portfolio Prism database.
Uses PRISM_DATA_DIR environment variable to locate the database file.
"""

import os
import sqlite3
import logging
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

# Database filename
DB_FILENAME = "prism.db"

# Module-level connection cache
_connection: Optional[sqlite3.Connection] = None

logger = logging.getLogger(__name__)


def get_db_path() -> Path:
    """
    Get the path to the SQLite database file.

    Uses PRISM_DATA_DIR env var if set, otherwise falls back to a local path.

    Returns:
        Path to the database file
    """
    data_dir = os.environ.get("PRISM_DATA_DIR")
    if data_dir:
        db_path = Path(data_dir) / DB_FILENAME
    else:
        # Development fallback - use project data directory
        db_path = Path(__file__).parent.parent.parent / "data" / DB_FILENAME

    # Ensure parent directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)

    return db_path


def get_schema_path() -> Path:
    """Get path to the schema.sql file."""
    import sys

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        # PyInstaller frozen mode - schema is in bundled data
        return Path(meipass) / "portfolio_src" / "data" / "schema.sql"
    else:
        # Development mode
        return Path(__file__).parent / "schema.sql"


def init_db(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Initialize the database with schema.

    Creates tables if they don't exist. Safe to call multiple times.

    Args:
        db_path: Optional path to database. If None, uses get_db_path().
                 Use ":memory:" for in-memory testing.

    Returns:
        SQLite connection object
    """
    global _connection

    if db_path is None:
        db_path = str(get_db_path())

    # Create connection with row factory for dict-like access
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    # Read and execute schema
    schema_path = get_schema_path()

    logger.info(f"[DB] Database path: {db_path}")
    logger.info(f"[DB] Schema path: {schema_path}")
    logger.info(f"[DB] Schema exists: {schema_path.exists()}")

    if schema_path.exists():
        with open(schema_path, "r") as f:
            schema_sql = f.read()
        conn.executescript(schema_sql)

        # Migration: Add new columns to system_logs if they don't exist
        # Wrapped in IMMEDIATE transaction to prevent race conditions
        try:
            conn.execute("BEGIN IMMEDIATE")
            cursor = conn.execute("PRAGMA table_info(system_logs)")
            columns = [row["name"] for row in cursor.fetchall()]

            new_cols = [
                ("component", "TEXT"),
                ("category", "TEXT"),
                ("error_hash", "TEXT"),
                ("reported_at", "DATETIME"),
            ]

            for col_name, col_type in new_cols:
                if col_name not in columns:
                    logger.info(f"[DB] Migrating: Adding {col_name} to system_logs")
                    conn.execute(
                        f"ALTER TABLE system_logs ADD COLUMN {col_name} {col_type}"
                    )

            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"[DB] Migration error: {e}")

        logger.info(f"[DB] Schema applied successfully")
    else:
        logger.error(f"[DB] ERROR: Schema file not found!")
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    # Cache connection if not in-memory
    if db_path != ":memory:":
        _connection = conn

    return conn


@contextmanager
def get_connection():
    """
    Context manager for database connections.

    Always use with 'with' statement to ensure connections are closed:
        with get_connection() as conn:
            cursor = conn.execute(...)
    """
    db_path = str(get_db_path())
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()


def close_connection() -> None:
    """Close the cached database connection."""
    global _connection

    if _connection is not None:
        _connection.close()
        _connection = None


@contextmanager
def transaction():
    """
    Context manager for database transactions.

    Automatically commits on success, rolls back on exception.
    Always closes the connection when done.

    Usage:
        with transaction() as conn:
            conn.execute("INSERT INTO ...")
    """
    with get_connection() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# =============================================================================
# Query Helpers
# =============================================================================


def get_portfolio(portfolio_id: int = 1) -> Optional[dict]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, name, currency, created_at FROM portfolios WHERE id = ?",
            (portfolio_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_positions(portfolio_id: int = 1) -> list[dict]:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT 
                p.portfolio_id,
                p.isin,
                p.quantity,
                p.cost_basis,
                p.current_price,
                p.updated_at,
                a.name,
                a.symbol,
                a.asset_class,
                a.sector,
                a.region
            FROM positions p
            LEFT JOIN assets a ON p.isin = a.isin
            WHERE p.portfolio_id = ?
            ORDER BY (p.quantity * COALESCE(p.current_price, p.cost_basis, 0)) DESC
        """,
            (portfolio_id,),
        )
        return [dict(row) for row in cursor.fetchall()]


def get_sync_state(source: str) -> Optional[dict]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT source, last_sync, status, message FROM sync_state WHERE source = ?",
            (source,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def update_sync_state(source: str, status: str, message: str = "") -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sync_state (source, last_sync, status, message)
            VALUES (?, CURRENT_TIMESTAMP, ?, ?)
            ON CONFLICT(source) DO UPDATE SET
                last_sync = CURRENT_TIMESTAMP,
                status = excluded.status,
                message = excluded.message
        """,
            (source, status, message),
        )
        conn.commit()


def log_system_event(
    session_id: str,
    level: str,
    source: str,
    message: str,
    context: Optional[dict] = None,
    component: Optional[str] = None,
    category: Optional[str] = None,
    error_hash: Optional[str] = None,
) -> None:
    import json

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO system_logs (session_id, level, source, message, context, component, category, error_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                session_id,
                level,
                source,
                message,
                json.dumps(context) if context else None,
                component,
                category,
                error_hash,
            ),
        )
        conn.commit()


def get_unprocessed_logs(session_id: Optional[str] = None) -> list[dict]:
    with get_connection() as conn:
        if session_id:
            cursor = conn.execute(
                "SELECT * FROM system_logs WHERE session_id = ? AND processed = 0 ORDER BY timestamp ASC",
                (session_id,),
            )
        else:
            cursor = conn.execute(
                "SELECT * FROM system_logs WHERE processed = 0 ORDER BY timestamp ASC"
            )
        return [dict(row) for row in cursor.fetchall()]


def mark_logs_processed(log_ids: list[int]) -> None:
    if not log_ids:
        return
    with get_connection() as conn:
        placeholders = ",".join(["?"] * len(log_ids))
        conn.execute(
            f"UPDATE system_logs SET processed = 1 WHERE id IN ({placeholders})",
            log_ids,
        )
        conn.commit()


# =============================================================================
# Write Functions (for TR sync)
# =============================================================================


def upsert_asset(
    isin: str,
    name: str,
    symbol: str,
    asset_class: str = "stock",
    sector: Optional[str] = None,
    region: Optional[str] = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO assets (isin, name, symbol, asset_class, sector, region)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(isin) DO UPDATE SET
                name = excluded.name,
                symbol = excluded.symbol,
                asset_class = excluded.asset_class,
                sector = excluded.sector,
                region = excluded.region,
                updated_at = CURRENT_TIMESTAMP
        """,
            (isin, name, symbol, asset_class, sector, region),
        )
        conn.commit()


def upsert_position(
    portfolio_id: int,
    isin: str,
    quantity: float,
    cost_basis: float,
    current_price: Optional[float] = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO positions (portfolio_id, isin, quantity, cost_basis, current_price)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(portfolio_id, isin) DO UPDATE SET
                quantity = excluded.quantity,
                cost_basis = excluded.cost_basis,
                current_price = excluded.current_price,
                updated_at = CURRENT_TIMESTAMP
        """,
            (portfolio_id, isin, quantity, cost_basis, current_price),
        )
        conn.commit()


def sync_positions_from_tr(portfolio_id: int, tr_positions: list[dict]) -> dict:
    """
    Bulk sync positions from Trade Republic data.

    Args:
        portfolio_id: Portfolio ID to sync to
        tr_positions: List of TR position dicts with keys:
            - isin: ISIN identifier
            - name: Asset name
            - symbol: Trading symbol
            - quantity: Number of shares
            - cost_basis: Average cost per share
            - current_price: Current market price
            - asset_class: Asset classification
            - sector: Sector (optional)
            - region: Region (optional)

    Returns:
        Dict with sync statistics:
            - synced_positions: Total positions processed
            - new_positions: New positions added
            - updated_positions: Existing positions updated
            - total_value: Total portfolio value
    """
    if not tr_positions:
        return {
            "synced_positions": 0,
            "new_positions": 0,
            "updated_positions": 0,
            "total_value": 0.0,
        }

    new_positions = 0
    updated_positions = 0
    total_value = 0.0

    with transaction() as conn:
        # Get existing positions for comparison
        cursor = conn.execute(
            "SELECT isin FROM positions WHERE portfolio_id = ?", (portfolio_id,)
        )
        existing_isins = {row[0] for row in cursor.fetchall()}

        for pos in tr_positions:
            isin = pos["isin"]
            name = pos["name"]
            symbol = pos["symbol"]
            quantity = float(pos["quantity"])
            cost_basis = float(pos["cost_basis"])
            current_price = pos.get("current_price")
            if current_price is not None:
                current_price = float(current_price)

            asset_class = pos.get("asset_class", "Equity")
            sector = pos.get("sector")
            region = pos.get("region")

            # Upsert asset first
            conn.execute(
                """
                INSERT INTO assets (isin, name, symbol, asset_class, sector, region)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(isin) DO UPDATE SET
                    name = excluded.name,
                    symbol = excluded.symbol,
                    asset_class = excluded.asset_class,
                    sector = excluded.sector,
                    region = excluded.region,
                    updated_at = CURRENT_TIMESTAMP
            """,
                (isin, name, symbol, asset_class, sector, region),
            )

            # Upsert position
            conn.execute(
                """
                INSERT INTO positions (portfolio_id, isin, quantity, cost_basis, current_price)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(portfolio_id, isin) DO UPDATE SET
                    quantity = excluded.quantity,
                    cost_basis = excluded.cost_basis,
                    current_price = excluded.current_price,
                    updated_at = CURRENT_TIMESTAMP
            """,
                (portfolio_id, isin, quantity, cost_basis, current_price),
            )

            # Track statistics
            if isin in existing_isins:
                updated_positions += 1
            else:
                new_positions += 1

            # Calculate value (use current_price if available, else cost_basis)
            price = current_price if current_price is not None else cost_basis
            total_value += quantity * price

    return {
        "synced_positions": len(tr_positions),
        "new_positions": new_positions,
        "updated_positions": updated_positions,
        "total_value": round(total_value, 2),
    }
