# Spec: Refactor Python Service Layer IO

> **Goal**: Move all file system and network IO operations from the Python Service layer (`core/`) to the Data layer (`data/`).
> **Estimated Time**: 40 minutes.
> **Priority**: HIGH

## 1. Overview

The `core/` directory (Service Layer) currently performs direct IO operations (`open()`, `urllib`, `requests`). This violates the 3-Layer Architecture. Services should be pure business logic that orchestrates Data layer components.

### Rule Reference
`rules/architecture.md` Section 1 (The 3-Layer Pattern):
> "Service (Domain Logic): Pure. No IO knowledge."
> "Data (Repository): Only layer allowed to touch fs or fetch."

## 2. Current Violations

| File | Violation |
|------|-----------|
| `src-tauri/python/portfolio_src/core/services/sync_service.py` | Performs network requests via `urllib` or `requests` |
| `src-tauri/python/portfolio_src/core/pipeline.py` | Performs file IO via `open()` for snapshots |
| `src-tauri/python/portfolio_src/core/harvesting.py` | Reads/Writes files directly |
| `src-tauri/python/portfolio_src/core/health.py` | Checks disk usage/file existence directly |

## 3. Implementation Steps

### 3.1 Create Data Repositories

**Create/Update:** `src-tauri/python/portfolio_src/data/repositories/`

1. **`snapshot_repo.py`**:
   - Encapsulate all logic for reading/writing pipeline snapshots.
   - Methods: `save_snapshot(data)`, `load_latest_snapshot()`, `list_snapshots()`.

2. **`sync_repo.py`** (or update `tr_sync.py`):
   - Encapsulate all network calls to Trade Republic or other sync sources.
   - Methods: `fetch_portfolio()`, `fetch_transactions()`.

3. **`system_repo.py`**:
   - Encapsulate system health checks (disk space, memory, version).
   - Methods: `get_disk_usage()`, `check_file_exists()`.

### 3.2 Refactor Pipeline Service

**File:** `src-tauri/python/portfolio_src/core/pipeline.py`

```python
# BEFORE (BAD)
def save_snapshot(self, data):
    with open("snapshot.json", "w") as f:
        json.dump(data, f)

# AFTER (GOOD)
def save_snapshot(self, data):
    self.snapshot_repo.save(data)
```

1. Inject `SnapshotRepository` into `Pipeline` class.
2. Replace `open()`, `json.dump()`, `os.path.exists()` calls with repository methods.

### 3.3 Refactor Sync Service

**File:** `src-tauri/python/portfolio_src/core/services/sync_service.py`

1. Inject `SyncRepository` (or `TRClient`).
2. Remove any direct `requests` or `urllib` calls.
3. Service should only handle the *logic* of syncing (when to sync, how to merge), not the *mechanics* of HTTP.

### 3.4 Refactor Health Service

**File:** `src-tauri/python/portfolio_src/core/health.py`

1. Create `SystemRepository` in `data/`.
2. Move `psutil` or `shutil` calls to the repository.
3. Service calls `repo.get_system_metrics()`.

## 4. Verification

### 4.1 Search for IO in Core
```bash
# Should return 0 results in core/ (after refactor)
grep -r "open(" src-tauri/python/portfolio_src/core/
grep -r "requests\." src-tauri/python/portfolio_src/core/
grep -r "urllib" src-tauri/python/portfolio_src/core/
```

### 4.2 Test with Mocks
Unit tests for `core/` services should now be easier to write by mocking the Repositories instead of patching `builtins.open` or `requests.get`.

## 5. Acceptance Criteria

- [ ] `core/` directory contains NO `open()` calls
- [ ] `core/` directory contains NO `requests` or `urllib` calls (except inside strictly defined adapters if necessary, though those should be in `adapters/`)
- [ ] New repositories exist in `data/`
- [ ] Services use Dependency Injection for data access

## 6. Dependencies

- No new external dependencies.
