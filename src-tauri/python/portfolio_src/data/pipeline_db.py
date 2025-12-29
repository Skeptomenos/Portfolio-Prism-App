import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import pandas as pd

from portfolio_src.config import DATA_DIR
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

PIPELINE_DB_PATH = DATA_DIR / "pipeline.db"


class PipelineDatabase:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or PIPELINE_DB_PATH
        self._ensure_schema()

    @contextmanager
    def _connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _ensure_schema(self):
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TIMESTAMP NOT NULL,
                    completed_at TIMESTAMP,
                    status TEXT CHECK(status IN ('running', 'completed', 'failed')) DEFAULT 'running',
                    positions_count INTEGER DEFAULT 0,
                    etf_count INTEGER DEFAULT 0,
                    holdings_count INTEGER DEFAULT 0,
                    errors_json TEXT,
                    metrics_json TEXT
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    isin TEXT NOT NULL CHECK(length(isin) = 12),
                    name TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    unit_price REAL NOT NULL CHECK(unit_price >= 0),
                    market_value REAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
                    currency TEXT DEFAULT 'EUR',
                    source TEXT NOT NULL,
                    asset_type TEXT DEFAULT 'Stock',
                    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    pipeline_run_id INTEGER REFERENCES pipeline_runs(id),
                    UNIQUE(isin, source, pipeline_run_id)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS holdings_breakdown (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_isin TEXT NOT NULL,
                    parent_name TEXT NOT NULL,
                    child_isin TEXT NOT NULL,
                    child_name TEXT NOT NULL,
                    weight_percent REAL NOT NULL CHECK(weight_percent >= 0 AND weight_percent <= 100),
                    value_eur REAL NOT NULL,
                    sector TEXT,
                    geography TEXT,
                    resolution_status TEXT DEFAULT 'pending',
                    resolution_source TEXT,
                    resolution_confidence REAL DEFAULT 1.0,
                    ticker TEXT,
                    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    pipeline_run_id INTEGER REFERENCES pipeline_runs(id)
                )
            """)

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_positions_isin ON positions(isin)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_positions_run ON positions(pipeline_run_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_holdings_parent ON holdings_breakdown(parent_isin)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_holdings_child ON holdings_breakdown(child_isin)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_holdings_run ON holdings_breakdown(pipeline_run_id)"
            )

            logger.info(f"Pipeline database schema ensured at {self.db_path}")

    def start_run(self) -> int:
        with self._connection() as conn:
            cursor = conn.execute(
                "INSERT INTO pipeline_runs (started_at, status) VALUES (?, 'running')",
                (datetime.now().isoformat(),),
            )
            run_id = cursor.lastrowid
            logger.info(f"Started pipeline run {run_id}")
            return run_id

    def complete_run(
        self,
        run_id: int,
        positions_count: int = 0,
        etf_count: int = 0,
        holdings_count: int = 0,
        metrics: Optional[Dict] = None,
    ):
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs 
                SET completed_at = ?, status = 'completed',
                    positions_count = ?, etf_count = ?, holdings_count = ?,
                    metrics_json = ?
                WHERE id = ?
                """,
                (
                    datetime.now().isoformat(),
                    positions_count,
                    etf_count,
                    holdings_count,
                    json.dumps(metrics) if metrics else None,
                    run_id,
                ),
            )
            logger.info(f"Completed pipeline run {run_id}")

    def fail_run(self, run_id: int, errors: List[Dict]):
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs 
                SET completed_at = ?, status = 'failed', errors_json = ?
                WHERE id = ?
                """,
                (datetime.now().isoformat(), json.dumps(errors), run_id),
            )
            logger.warning(f"Failed pipeline run {run_id}")

    def get_latest_run(self) -> Optional[Dict]:
        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT * FROM pipeline_runs 
                WHERE status = 'completed' 
                ORDER BY completed_at DESC LIMIT 1
                """
            ).fetchone()
            return dict(row) if row else None

    def insert_positions(self, positions: List[Dict], run_id: int):
        with self._connection() as conn:
            inserted = 0
            for pos in positions:
                try:
                    conn.execute(
                        """
                        INSERT INTO positions 
                        (isin, name, quantity, unit_price, currency, source, asset_type, pipeline_run_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            pos["isin"],
                            pos.get("name", "Unknown"),
                            pos["quantity"],
                            pos.get("unit_price", pos.get("price", 0)),
                            pos.get("currency", "EUR"),
                            pos.get("source", "unknown"),
                            pos.get("asset_type", "Stock"),
                            run_id,
                        ),
                    )
                    inserted += 1
                except sqlite3.IntegrityError as e:
                    logger.warning(f"Failed to insert position {pos.get('isin')}: {e}")

            logger.info(f"Inserted {inserted} positions for run {run_id}")

    def get_positions(self, run_id: Optional[int] = None) -> pd.DataFrame:
        with self._connection() as conn:
            if run_id:
                query = "SELECT * FROM positions WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(run_id,))
            else:
                latest = self.get_latest_run()
                if not latest:
                    return pd.DataFrame()
                query = "SELECT * FROM positions WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(latest["id"],))
            return df

    def insert_holdings(self, holdings: List[Dict], run_id: int):
        with self._connection() as conn:
            inserted = 0
            for h in holdings:
                try:
                    conn.execute(
                        """
                        INSERT INTO holdings_breakdown 
                        (parent_isin, parent_name, child_isin, child_name, 
                         weight_percent, value_eur, sector, geography,
                         resolution_status, resolution_source, resolution_confidence,
                         ticker, pipeline_run_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            h["parent_isin"],
                            h["parent_name"],
                            h["child_isin"],
                            h["child_name"],
                            h["weight_percent"],
                            h["value_eur"],
                            h.get("sector"),
                            h.get("geography"),
                            h.get("resolution_status", "pending"),
                            h.get("resolution_source"),
                            h.get("resolution_confidence", 1.0),
                            h.get("ticker"),
                            run_id,
                        ),
                    )
                    inserted += 1
                except sqlite3.IntegrityError as e:
                    logger.warning(f"Failed to insert holding: {e}")

            logger.info(f"Inserted {inserted} holdings for run {run_id}")

    def get_holdings(self, run_id: Optional[int] = None) -> pd.DataFrame:
        with self._connection() as conn:
            if run_id:
                query = "SELECT * FROM holdings_breakdown WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(run_id,))
            else:
                latest = self.get_latest_run()
                if not latest:
                    return pd.DataFrame()
                query = "SELECT * FROM holdings_breakdown WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(latest["id"],))
            return df

    def get_aggregated_holdings(self, run_id: Optional[int] = None) -> pd.DataFrame:
        with self._connection() as conn:
            if not run_id:
                latest = self.get_latest_run()
                if not latest:
                    return pd.DataFrame()
                run_id = latest["id"]

            query = """
                SELECT 
                    child_isin,
                    child_name,
                    SUM(value_eur) as total_value,
                    GROUP_CONCAT(DISTINCT sector) as sectors,
                    GROUP_CONCAT(DISTINCT geography) as geographies,
                    COUNT(*) as occurrence_count
                FROM holdings_breakdown
                WHERE pipeline_run_id = ?
                GROUP BY child_isin, child_name
                ORDER BY total_value DESC
            """
            return pd.read_sql_query(query, conn, params=(run_id,))


_db_instance: Optional[PipelineDatabase] = None


def get_pipeline_db() -> PipelineDatabase:
    global _db_instance
    if _db_instance is None:
        _db_instance = PipelineDatabase()
    return _db_instance
