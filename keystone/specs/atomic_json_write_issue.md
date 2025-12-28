# Atomic JSON Write Issue

> **Status:** Resolved  
> **Related Issues:** #12, #13  
> **Priority:** High  
> **Component:** Pipeline Health Reporting  
> **Resolution:** Implemented `write_json_atomic()` utility function using temp file + rename pattern

## Problem Statement

The `pipeline_health.json` file is frequently left in a corrupted/truncated state, causing cascading failures throughout the application.

## Evidence

### Current File State
```bash
$ wc -c ~/Library/Application\ Support/PortfolioPrism/outputs/pipeline_health.json
853 bytes  # Truncated

$ tail -c 100 pipeline_health.json
..."status": "success",
        "source":   # ← Truncated mid-value
```

### Error Message
```
json.decoder.JSONDecodeError: Expecting value: line 36 column 19 (char 853)
```

### Affected Components
1. **Frontend:** `HealthView.tsx` crashes when loading health report
2. **Backend:** `handlers/holdings.py:handle_get_pipeline_report()` returns error
3. **Auto-reporter:** Creates duplicate crash issues (#12, #13, #14, #15)

## Root Cause

### Location
`src-tauri/python/portfolio_src/core/pipeline.py:589-591`

```python
PIPELINE_HEALTH_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(PIPELINE_HEALTH_PATH, "w") as f:
    json.dump(health_data, f, indent=2)
```

### Why It Fails

1. **Non-atomic write:** `open(..., "w")` truncates the file immediately
2. **No error handling:** If `json.dump()` fails or process is interrupted, file is left truncated
3. **No flush/sync:** Data may be in OS buffer when process terminates
4. **Race condition:** Frontend may read while backend is writing

## Fix Plan

### Solution: Atomic Write Pattern

```python
import tempfile
import os

def write_json_atomic(path: Path, data: dict) -> None:
    """Write JSON file atomically using temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write to temporary file in same directory
    fd, temp_path = tempfile.mkstemp(
        dir=path.parent,
        suffix='.json.tmp'
    )
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())  # Force write to disk
        
        # Atomic rename (POSIX guarantees atomicity)
        os.replace(temp_path, path)
    except Exception:
        # Clean up temp file on failure
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

### Why This Works

1. **Temp file:** Original file untouched until write completes
2. **fsync:** Ensures data is on disk, not just in OS buffer
3. **os.replace:** Atomic operation on POSIX systems
4. **Cleanup:** Temp file removed on failure

## Files to Modify

| File | Change |
|------|--------|
| `src-tauri/python/portfolio_src/core/pipeline.py` | Replace `json.dump()` with atomic write |
| `src-tauri/python/portfolio_src/core/utils.py` | Add `write_json_atomic()` utility function |

## Verification

After fix:
1. Kill Python process mid-pipeline → file should be valid JSON (previous version)
2. Concurrent reads during write → no partial data
3. `python3 -c "import json; json.load(open('pipeline_health.json'))"` → no errors

## Additional Recommendations

1. **Add file locking** for extra safety on Windows
2. **Add checksum** to detect corruption
3. **Keep backup** of last known good file
