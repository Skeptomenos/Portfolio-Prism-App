# Code Review: database.py

**File**: `src-tauri/python/portfolio_src/data/database.py`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED (2 Medium, 3 Low, 2 Info)

---

## Summary

The database module provides SQLite connection management and query helpers for Portfolio Prism. Overall, the code demonstrates good security practices with consistent use of parameterized queries. Key concerns are around connection management patterns and silent migration failures.

---

## [MEDIUM] Silent Migration Failure Could Leave Database Inconsistent

> Migration errors are caught and logged but not propagated, potentially leaving database in partial state

**File**: `src-tauri/python/portfolio_src/data/database.py:120-122`  
**Category**: Correctness  
**Severity**: Medium  

### Description

When the database migration fails (adding new columns to `system_logs`), the error is logged but the exception is swallowed. This means:
1. The application continues as if the migration succeeded
2. Subsequent code expecting the new columns will fail with confusing errors
3. There's no way for the caller to know the database is in an inconsistent state

### Current Code

```python
        except Exception as e:
            conn.rollback()
            logger.error(f"[DB] Migration error: {e}")
```

### Suggested Fix

```python
        except Exception as e:
            conn.rollback()
            logger.error(f"[DB] Migration error: {e}")
            raise RuntimeError(f"Database migration failed: {e}") from e
```

Alternatively, if graceful degradation is intended, at minimum track migration state:

```python
        except Exception as e:
            conn.rollback()
            logger.error(f"[DB] Migration error: {e}")
            # Store migration failure so code can adapt
            _migration_failed = True
```

### Verification

1. Force a migration failure (e.g., mock `conn.execute` to raise)
2. Verify the error is propagated or tracked
3. Ensure application startup fails fast rather than failing later with confusing errors

---

## [MEDIUM] Unused Connection Cache Creates Inconsistent Pattern

> Global connection cache is set but never used by query functions

**File**: `src-tauri/python/portfolio_src/data/database.py:21,129-131,136-153`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The module maintains a global `_connection` cache that is set during `init_db()` but the `get_connection()` context manager creates a new connection every time without checking or using the cache. This creates:
1. Confusion about intended connection management strategy
2. Dead code (`_connection` variable and `close_connection()` function)
3. Performance overhead from unnecessary connection churn

### Current Code

```python
# Line 21 - Module-level cache defined
_connection: Optional[sqlite3.Connection] = None

# Line 129-131 - Cache is set in init_db
if db_path != ":memory:":
    _connection = conn

# Line 136-153 - get_connection() ignores the cache
@contextmanager
def get_connection():
    db_path = str(get_db_path())
    conn = sqlite3.connect(db_path)  # Always creates new connection
    conn.row_factory = sqlite3.Row
    ...
```

### Suggested Fix

Either use the cache:

```python
@contextmanager
def get_connection():
    """Context manager for database connections."""
    global _connection
    
    if _connection is not None:
        yield _connection
        return
    
    # Fallback for when init_db hasn't been called
    db_path = str(get_db_path())
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()
```

Or remove the cache if per-query connections are intentional:

```python
# Remove lines 21, 74, 129-131, and the close_connection function
# Document that each query opens a fresh connection
```

### Verification

1. Add logging to verify connection behavior
2. Test that connection reuse doesn't cause issues with concurrent access
3. If removing cache, verify no callers depend on `close_connection()`

---

## [LOW] Inconsistent Commit Patterns Across Functions

> Some functions commit inside get_connection(), others use transaction() context manager

**File**: `src-tauri/python/portfolio_src/data/database.py`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The module uses two different patterns for committing transactions:
1. Manual commit inside `with get_connection()` (lines 250, 282, 308, 339, 362)
2. `transaction()` context manager with automatic commit (line 401)

This inconsistency makes it harder to understand transaction boundaries and could lead to bugs if a developer uses the wrong pattern.

### Current Code

```python
# Pattern 1: Manual commit (used in most write functions)
def update_sync_state(source: str, status: str, message: str = "") -> None:
    with get_connection() as conn:
        conn.execute(...)
        conn.commit()

# Pattern 2: transaction() context manager (used in sync_positions_from_tr)
with transaction() as conn:
    # All operations in one transaction
    pass  # commit is automatic on success
```

### Suggested Fix

Standardize on the `transaction()` pattern for all write operations:

```python
def update_sync_state(source: str, status: str, message: str = "") -> None:
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO sync_state (source, last_sync, status, message)
            ...
            """,
            (source, status, message),
        )
        # No explicit commit needed - handled by transaction()
```

### Verification

1. Update all write functions to use `transaction()`
2. Verify rollback behavior on errors
3. Run existing tests to ensure no regressions

---

## [LOW] No Direct Unit Tests for Database Module

> Database functions are only tested indirectly through mocked handler tests

**File**: `src-tauri/python/portfolio_src/data/database.py`  
**Category**: Testing  
**Severity**: Low  

### Description

The database module lacks direct unit tests. Existing tests either:
1. Mock `get_connection()` entirely (handler tests)
2. Test a different database module (`test_pipeline_db.py` tests `PipelineDatabase`)

Missing test coverage for:
- Migration logic (lines 98-123)
- `close_connection()` function
- Error scenarios in `sync_positions_from_tr`
- Edge cases in query helpers

### Suggested Fix

Create `tests/test_database.py`:

```python
import pytest
import tempfile
from pathlib import Path
from portfolio_src.data.database import (
    init_db, get_connection, transaction,
    get_portfolio, get_positions, sync_positions_from_tr
)

class TestDatabase:
    @pytest.fixture
    def db_path(self, tmp_path):
        return str(tmp_path / "test.db")
    
    def test_init_db_creates_tables(self, db_path):
        conn = init_db(db_path)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = {row[0] for row in cursor.fetchall()}
        assert "portfolios" in tables
        assert "positions" in tables
    
    def test_sync_positions_empty_list(self, db_path):
        init_db(db_path)
        result = sync_positions_from_tr(1, [])
        assert result["synced_positions"] == 0
    
    def test_migration_adds_columns(self, db_path):
        # Test that migration logic works correctly
        pass
```

### Verification

1. Create test file with the suggested tests
2. Run `pytest tests/test_database.py -v`
3. Ensure coverage for critical paths

---

## [LOW] PRISM_DATA_DIR Environment Variable Not Validated

> Database path is constructed from environment variable without validation

**File**: `src-tauri/python/portfolio_src/data/database.py:35-40`  
**Category**: Security  
**Severity**: Low  

### Description

The `get_db_path()` function uses the `PRISM_DATA_DIR` environment variable to determine where to create the database file. While environment variables are controlled by the parent process (Tauri), there's no validation that the path:
1. Is within expected bounds (e.g., user's home directory)
2. Doesn't contain path traversal sequences
3. Is a valid directory path

In the current architecture, this is low risk because Tauri sets this variable, but defense-in-depth suggests validation.

### Current Code

```python
def get_db_path() -> Path:
    data_dir = os.environ.get("PRISM_DATA_DIR")
    if data_dir:
        db_path = Path(data_dir) / DB_FILENAME
    else:
        db_path = Path(__file__).parent.parent.parent / "data" / DB_FILENAME
    
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path
```

### Suggested Fix

```python
def get_db_path() -> Path:
    data_dir = os.environ.get("PRISM_DATA_DIR")
    if data_dir:
        db_path = Path(data_dir).resolve() / DB_FILENAME
        
        # Validate the path is reasonable
        home = Path.home()
        if not str(db_path).startswith(str(home)):
            logger.warning(f"[DB] PRISM_DATA_DIR outside home: {db_path}")
    else:
        db_path = Path(__file__).parent.parent.parent / "data" / DB_FILENAME
    
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path
```

### Verification

1. Test with various `PRISM_DATA_DIR` values including path traversal attempts
2. Verify application behavior when validation fails

---

## [INFO] Good: Consistent Use of Parameterized Queries

**File**: `src-tauri/python/portfolio_src/data/database.py`  
**Category**: Security  
**Severity**: Info  

All SQL queries use parameterized queries with `?` placeholders, which is the correct pattern for preventing SQL injection. Examples:

- Line 194: `WHERE id = ?`
- Line 219: `WHERE p.portfolio_id = ?`
- Line 231: `WHERE source = ?`
- Line 288-289: `WHERE session_id = ?`
- Lines 423-435, 439-449: Bulk insert with parameters

The one f-string in SQL (line 115-117 for `ALTER TABLE`) uses hardcoded column names from a literal list, not user input, so it's safe.

---

## [INFO] Good: WAL Mode and Foreign Keys Enabled

**File**: `src-tauri/python/portfolio_src/data/database.py:83-84,148-149`  
**Category**: Performance/Correctness  
**Severity**: Info  

The database is configured with:
- `PRAGMA foreign_keys = ON` - Ensures referential integrity
- `PRAGMA journal_mode = WAL` - Write-Ahead Logging for better concurrent access

These are best practices for SQLite in a desktop application.

---

## Review Checklist Summary

| Category | Status | Notes |
|----------|--------|-------|
| SQL Injection | PASS | All queries use parameterized statements |
| Path Traversal | PASS | Low risk, env var controlled by Tauri |
| Auth/Authz | N/A | Not applicable - no auth in this module |
| Secrets | PASS | No hardcoded secrets |
| Error Handling | WARN | Silent migration failure |
| Edge Cases | PASS | Empty list handled, null prices handled |
| N+1 Queries | PASS | JOINs used where appropriate |
| Connection Management | WARN | Unused cache, connection per query |
| Code Style | PASS | Consistent, good docstrings |
| Test Coverage | WARN | No direct tests |
