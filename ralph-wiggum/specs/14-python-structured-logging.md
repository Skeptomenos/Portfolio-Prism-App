# Spec: Implement Python Structured Logging

> **Goal**: Replace unstructured f-strings with proper `extra=` parameter logging in Python to support machine-readable logs.
> **Estimated Time**: 25 minutes.
> **Priority**: MEDIUM

## 1. Overview

The Python codebase uses f-strings in logging calls (e.g., `logger.info(f"Loaded {count} items")`). This burns the data into the message string, making it impossible to filter logs by `count` or aggregate metrics in the `SQLiteLogHandler`.

### Rule Reference
`rules/logging.md` Section 2 (Best Practice: Structured Logging):
> "Logs must be machine-readable (JSON) ... Use `extra={'key': 'value'}`"

## 2. Current Violations

**Files:** 50+ files in `src-tauri/python/portfolio_src/`

```python
# CURRENT (BAD)
logger.info(f"Saved {len(positions)} positions to {output_path}")
logger.info(f"[DEBUG] Wrote snapshot: {path}")
logger.error(f"Failed to sync: {e}")
```

## 3. Implementation Steps

### 3.1 Create Logging Helper (Optional but Recommended)

**File:** `src-tauri/python/portfolio_src/prism_utils/logging_config.py`

```python
def log_structured(logger, level, message, **kwargs):
    """
    Helper to ensure structured logging.
    Usage: log_structured(logger, logging.INFO, "Saved positions", count=10, path="/tmp/x")
    """
    logger.log(level, message, extra=kwargs)
```

### 3.2 Refactor Logging Calls

Go through the codebase and replace f-strings with static messages + `extra` dicts.

#### Example 1: Data Sync
```python
# BEFORE
logger.info(f"Saved {len(positions)} positions to {output_path}")

# AFTER
logger.info("Saved positions", extra={
    "count": len(positions),
    "path": str(output_path)
})
```

#### Example 2: Error Handling
```python
# BEFORE
logger.error(f"Failed to sync: {e}")

# AFTER
logger.error("Sync failed", extra={
    "error": str(e),
    "error_type": type(e).__name__
}, exc_info=True)
```

#### Example 3: Debugging
```python
# BEFORE
logger.debug(f"Processing item {item.id} with status {item.status}")

# AFTER
logger.debug("Processing item", extra={
    "item_id": item.id,
    "status": item.status
})
```

### 3.3 Update Log Formatter

Ensure the `SQLiteLogHandler` or console formatter actually uses the `extra` fields.

**File:** `src-tauri/python/portfolio_src/prism_utils/logging_config.py`

Check if the `JsonFormatter` (if exists) or the database handler iterates over `record.__dict__` or explicitly looks for `extra`.

## 4. Verification

### 4.1 Run Pipeline
Run the pipeline and check the `system_logs` table in SQLite (or the log file).

```sql
SELECT context FROM system_logs WHERE message = 'Saved positions';
```
Should return JSON: `{"count": 10, "path": "..."}`

## 5. Acceptance Criteria

- [ ] No `logger.info(f"...")` calls in `core/` or `data/` modules
- [ ] `extra=` parameter used for all variable data
- [ ] Log messages are static string literals (easier to group/search)
- [ ] `exc_info=True` used for exceptions instead of string formatting

## 6. Related Files

| File | Action |
|------|--------|
| `src-tauri/python/portfolio_src/prism_utils/logging_config.py` | Verify formatter support |
| `src-tauri/python/portfolio_src/**/*.py` | Refactor log calls |
