# Phase 3 Implementation Plan: SQLite Storage

> **Parent Plan:** `keystone/plans/value-semantics-fix.md`
> **Prerequisite:** Phase 2 complete and verified
> **Status:** Pending
> **Estimated Time:** 6 hours

---

## Objective

Replace CSV file outputs with SQLite database storage. The database enforces schema constraints including a GENERATED column for `market_value` that makes incorrect calculations impossible at the storage layer.

---

## Key Design Principle

> **The database is the final line of defense.**
> 
> Even if Python code has bugs, the database will:
> - Reject invalid data (CHECK constraints)
> - Compute market_value correctly (GENERATED column)
> - Maintain referential integrity (FOREIGN KEYS)
> - Provide audit trail (pipeline_runs table)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `portfolio_src/data/pipeline_db.py` | Create | SQLite operations |
| `portfolio_src/core/pipeline.py` | Modify | Write to SQLite |
| `portfolio_src/headless/handlers/holdings.py` | Modify | Read from SQLite |
| `tests/test_pipeline_db.py` | Create | Database tests |

---

## Database Schema

### Table: positions

```sql
CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isin TEXT NOT NULL CHECK(length(isin) = 12),
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    -- GENERATED column: database enforces correct calculation
    market_value REAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
    currency TEXT DEFAULT 'EUR',
    source TEXT NOT NULL,
    asset_type TEXT DEFAULT 'Stock',
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pipeline_run_id INTEGER REFERENCES pipeline_runs(id),
    
    UNIQUE(isin, source, pipeline_run_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_isin ON positions(isin);
CREATE INDEX IF NOT EXISTS idx_positions_run ON positions(pipeline_run_id);
```

### Table: holdings_breakdown

```sql
CREATE TABLE IF NOT EXISTS holdings_breakdown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_isin TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    child_isin TEXT NOT NULL,
    child_name TEXT NOT NULL,
    weight_percent REAL NOT NULL CHECK(weight_percent >= 0 AND weight_percent <= 100),
    value_eur REAL NOT NULL CHECK(value_eur >= 0),
    sector TEXT,
    geography TEXT,
    resolution_status TEXT DEFAULT 'pending',
    resolution_source TEXT,
    resolution_confidence REAL DEFAULT 1.0,
    ticker TEXT,
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pipeline_run_id INTEGER REFERENCES pipeline_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_parent ON holdings_breakdown(parent_isin);
CREATE INDEX IF NOT EXISTS idx_holdings_child ON holdings_breakdown(child_isin);
CREATE INDEX IF NOT EXISTS idx_holdings_run ON holdings_breakdown(pipeline_run_id);
```

### Table: pipeline_runs

```sql
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    status TEXT CHECK(status IN ('running', 'completed', 'failed')) DEFAULT 'running',
    positions_count INTEGER DEFAULT 0,
    etf_count INTEGER DEFAULT 0,
    holdings_count INTEGER DEFAULT 0,
    errors_json TEXT,
    metrics_json TEXT,
    
    CHECK(completed_at IS NULL OR completed_at >= started_at)
);
```

---

## Step-by-Step Implementation

### Step 1: Create Pipeline Database Module

**File:** `portfolio_src/data/pipeline_db.py`

```python
"""
Pipeline Database Module.

Manages SQLite storage for pipeline outputs with schema enforcement.
"""

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

# Database path
PIPELINE_DB_PATH = DATA_DIR / "pipeline.db"


class PipelineDatabase:
    """SQLite database for pipeline outputs."""
    
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or PIPELINE_DB_PATH
        self._ensure_schema()
    
    @contextmanager
    def _connection(self):
        """Context manager for database connections."""
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
        """Create tables if they don't exist."""
        with self._connection() as conn:
            # Pipeline runs table
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
            
            # Positions table with GENERATED column
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
            
            # Holdings breakdown table
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
            
            # Indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_positions_isin ON positions(isin)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_positions_run ON positions(pipeline_run_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_holdings_parent ON holdings_breakdown(parent_isin)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_holdings_child ON holdings_breakdown(child_isin)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_holdings_run ON holdings_breakdown(pipeline_run_id)")
            
            logger.info(f"Pipeline database schema ensured at {self.db_path}")
    
    # =========================================================================
    # Pipeline Run Management
    # =========================================================================
    
    def start_run(self) -> int:
        """Start a new pipeline run. Returns run ID."""
        with self._connection() as conn:
            cursor = conn.execute(
                "INSERT INTO pipeline_runs (started_at, status) VALUES (?, 'running')",
                (datetime.now().isoformat(),)
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
        """Mark a pipeline run as completed."""
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
                )
            )
            logger.info(f"Completed pipeline run {run_id}")
    
    def fail_run(self, run_id: int, errors: List[Dict]):
        """Mark a pipeline run as failed."""
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs 
                SET completed_at = ?, status = 'failed', errors_json = ?
                WHERE id = ?
                """,
                (datetime.now().isoformat(), json.dumps(errors), run_id)
            )
            logger.warning(f"Failed pipeline run {run_id}")
    
    def get_latest_run(self) -> Optional[Dict]:
        """Get the most recent completed pipeline run."""
        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT * FROM pipeline_runs 
                WHERE status = 'completed' 
                ORDER BY completed_at DESC LIMIT 1
                """
            ).fetchone()
            return dict(row) if row else None
    
    # =========================================================================
    # Positions
    # =========================================================================
    
    def insert_positions(self, positions: List[Dict], run_id: int):
        """Insert positions for a pipeline run."""
        with self._connection() as conn:
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
                        )
                    )
                except sqlite3.IntegrityError as e:
                    logger.warning(f"Failed to insert position {pos.get('isin')}: {e}")
            
            logger.info(f"Inserted {len(positions)} positions for run {run_id}")
    
    def get_positions(self, run_id: Optional[int] = None) -> pd.DataFrame:
        """Get positions, optionally for a specific run."""
        with self._connection() as conn:
            if run_id:
                query = "SELECT * FROM positions WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(run_id,))
            else:
                # Get from latest completed run
                latest = self.get_latest_run()
                if not latest:
                    return pd.DataFrame()
                query = "SELECT * FROM positions WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(latest["id"],))
            return df
    
    # =========================================================================
    # Holdings Breakdown
    # =========================================================================
    
    def insert_holdings(self, holdings: List[Dict], run_id: int):
        """Insert holdings breakdown for a pipeline run."""
        with self._connection() as conn:
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
                        )
                    )
                except sqlite3.IntegrityError as e:
                    logger.warning(f"Failed to insert holding: {e}")
            
            logger.info(f"Inserted {len(holdings)} holdings for run {run_id}")
    
    def get_holdings(self, run_id: Optional[int] = None) -> pd.DataFrame:
        """Get holdings breakdown, optionally for a specific run."""
        with self._connection() as conn:
            if run_id:
                query = "SELECT * FROM holdings_breakdown WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(run_id,))
            else:
                # Get from latest completed run
                latest = self.get_latest_run()
                if not latest:
                    return pd.DataFrame()
                query = "SELECT * FROM holdings_breakdown WHERE pipeline_run_id = ?"
                df = pd.read_sql_query(query, conn, params=(latest["id"],))
            return df
    
    def get_aggregated_holdings(self, run_id: Optional[int] = None) -> pd.DataFrame:
        """Get holdings aggregated by child_isin (for UI display)."""
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


# Singleton instance
_db_instance: Optional[PipelineDatabase] = None


def get_pipeline_db() -> PipelineDatabase:
    """Get or create the pipeline database instance."""
    global _db_instance
    if _db_instance is None:
        _db_instance = PipelineDatabase()
    return _db_instance
```

### Step 2: Update Pipeline to Write to SQLite

**File:** `portfolio_src/core/pipeline.py`

Add database integration alongside existing CSV output (parallel write during transition):

```python
from portfolio_src.data.pipeline_db import get_pipeline_db

# In run() method, after processing:
def _write_to_database(self, run_id: int, holdings_rows: List[Dict]):
    """Write pipeline results to SQLite database."""
    try:
        db = get_pipeline_db()
        db.insert_holdings(holdings_rows, run_id)
        logger.info(f"Wrote {len(holdings_rows)} holdings to database")
    except Exception as e:
        logger.error(f"Failed to write to database: {e}")
```

### Step 3: Update Holdings Handler to Read from SQLite

**File:** `portfolio_src/headless/handlers/holdings.py`

Add option to read from database:

```python
from portfolio_src.data.pipeline_db import get_pipeline_db

def get_holdings_from_db() -> pd.DataFrame:
    """Get holdings from SQLite database."""
    db = get_pipeline_db()
    return db.get_aggregated_holdings()
```

### Step 4: Add Database Tests

**File:** `tests/test_pipeline_db.py`

```python
import pytest
import tempfile
from pathlib import Path
from portfolio_src.data.pipeline_db import PipelineDatabase


class TestPipelineDatabase:
    @pytest.fixture
    def db(self):
        """Create a temporary database for testing."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = Path(f.name)
        db = PipelineDatabase(db_path)
        yield db
        db_path.unlink()  # Cleanup
    
    def test_start_and_complete_run(self, db):
        run_id = db.start_run()
        assert run_id > 0
        
        db.complete_run(run_id, positions_count=10, holdings_count=100)
        
        latest = db.get_latest_run()
        assert latest["id"] == run_id
        assert latest["status"] == "completed"
        assert latest["positions_count"] == 10
    
    def test_insert_positions_with_generated_value(self, db):
        """Test that market_value is computed by database."""
        run_id = db.start_run()
        
        positions = [
            {"isin": "US67066G1040", "name": "NVIDIA", "quantity": 10.5, "unit_price": 159.84},
            {"isin": "XF000BTC0017", "name": "Bitcoin", "quantity": 0.000231, "unit_price": 74372.29},
        ]
        db.insert_positions(positions, run_id)
        
        df = db.get_positions(run_id)
        
        # Verify GENERATED column computed correctly
        nvidia = df[df["isin"] == "US67066G1040"].iloc[0]
        assert abs(nvidia["market_value"] - 1678.32) < 0.01
        
        bitcoin = df[df["isin"] == "XF000BTC0017"].iloc[0]
        assert abs(bitcoin["market_value"] - 17.18) < 0.01
    
    def test_insert_holdings(self, db):
        run_id = db.start_run()
        
        holdings = [
            {
                "parent_isin": "DIRECT",
                "parent_name": "Direct Holdings",
                "child_isin": "US67066G1040",
                "child_name": "NVIDIA",
                "weight_percent": 100.0,
                "value_eur": 1679.37,
            }
        ]
        db.insert_holdings(holdings, run_id)
        
        df = db.get_holdings(run_id)
        assert len(df) == 1
        assert df.iloc[0]["child_isin"] == "US67066G1040"
    
    def test_constraint_rejects_invalid_isin(self, db):
        """Test CHECK constraint on ISIN length."""
        run_id = db.start_run()
        
        # This should fail silently (logged warning)
        positions = [{"isin": "INVALID", "name": "Bad", "quantity": 1, "unit_price": 100}]
        db.insert_positions(positions, run_id)
        
        df = db.get_positions(run_id)
        assert len(df) == 0  # Invalid position not inserted
```

---

## Migration Strategy

### Parallel Write Period

During transition, write to both CSV and SQLite:

1. Pipeline writes to CSV (existing behavior)
2. Pipeline also writes to SQLite (new behavior)
3. UI reads from CSV (existing behavior)
4. Verify SQLite data matches CSV
5. Switch UI to read from SQLite
6. Keep CSV as export-only feature

### Rollback

If SQLite causes issues:
- UI can fall back to CSV reading
- Database file can be deleted and recreated

---

## Verification Steps

1. **Run database tests:**
   ```bash
   cd src-tauri/python && python -m pytest tests/test_pipeline_db.py -v
   ```

2. **Verify GENERATED column:**
   ```sql
   SELECT isin, quantity, unit_price, market_value FROM positions;
   -- market_value should equal quantity * unit_price
   ```

3. **Verify constraints:**
   - Try inserting invalid ISIN → should fail
   - Try inserting negative price → should fail

4. **Compare with CSV:**
   - Run pipeline
   - Compare SQLite holdings with CSV holdings
   - Values should match

---

## Success Criteria

- [ ] Database schema created correctly
- [ ] GENERATED column computes market_value
- [ ] CHECK constraints reject invalid data
- [ ] Pipeline writes to both CSV and SQLite
- [ ] UI can read from SQLite
- [ ] All database tests pass
- [ ] No regressions in existing functionality
- [ ] Audit trail (pipeline_runs) populated correctly
