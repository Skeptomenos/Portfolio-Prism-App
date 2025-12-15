"""
SQLite Database Management

Provides connection management and initialization for the Portfolio Prism database.
Uses PRISM_DATA_DIR environment variable to locate the database file.
"""

import os
import sqlite3
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

# Database filename
DB_FILENAME = "prism.db"

# Module-level connection cache
_connection: Optional[sqlite3.Connection] = None


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

    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON")

    # Read and execute schema
    schema_path = get_schema_path()
    if schema_path.exists():
        with open(schema_path, "r") as f:
            schema_sql = f.read()
        conn.executescript(schema_sql)
        conn.commit()
    else:
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    # Cache connection if not in-memory
    if db_path != ":memory:":
        _connection = conn

    return conn


def get_connection() -> sqlite3.Connection:
    """
    Get the cached database connection, initializing if needed.

    Returns:
        SQLite connection object
    """
    global _connection

    if _connection is None:
        _connection = init_db()

    return _connection


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

    Usage:
        with transaction() as conn:
            conn.execute("INSERT INTO ...")
    """
    conn = get_connection()
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
    """
    Get portfolio by ID.

    Args:
        portfolio_id: Portfolio ID (default: 1)

    Returns:
        Portfolio dict or None if not found
    """
    conn = get_connection()
    cursor = conn.execute(
        "SELECT id, name, currency, created_at FROM portfolios WHERE id = ?",
        (portfolio_id,),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def get_positions(portfolio_id: int = 1) -> list[dict]:
    """
    Get all positions for a portfolio with asset details.

    Args:
        portfolio_id: Portfolio ID (default: 1)

    Returns:
        List of position dicts with joined asset info
    """
    conn = get_connection()
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
    """
    Get sync state for a data source.

    Args:
        source: Source identifier (e.g., 'trade_republic', 'manual')

    Returns:
        Sync state dict or None
    """
    conn = get_connection()
    cursor = conn.execute(
        "SELECT source, last_sync, status, message FROM sync_state WHERE source = ?",
        (source,),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def update_sync_state(source: str, status: str, message: str = "") -> None:
    """
    Update sync state for a data source.

    Args:
        source: Source identifier
        status: 'success', 'error', or 'pending'
        message: Optional status message
    """
    conn = get_connection()
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


def count_positions(portfolio_id: int = 1) -> int:
    """
    Count positions in a portfolio.

    Args:
        portfolio_id: Portfolio ID (default: 1)

    Returns:
        Number of positions
    """
    conn = get_connection()
    cursor = conn.execute(
        "SELECT COUNT(*) FROM positions WHERE portfolio_id = ?", (portfolio_id,)
    )
    return cursor.fetchone()[0]
