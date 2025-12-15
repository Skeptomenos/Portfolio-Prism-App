# Data Engine Workstream

> **Focus:** Python Backend, SQLite Migration, Data Contracts, and IPC.
> **See Plan:** `docs/MVP_IMPLEMENTATION_PLAN.md` - Phase 1 & 2.

---

## Active Tasks

### 1. SQLite Schema Implementation
- [ ] Create `schema.sql` based on `specs/data_schema.md`.
- [ ] Initialize SQLite database at `PRISM_DATA_DIR`.

### 2. Pydantic Contracts
- [ ] Create `contracts.py` with `Asset`, `Position`, `Transaction` models.
- [ ] Ensure strict validation for data integrity.

### 3. Data Migration
- [ ] Write script to migrate legacy CSV/JSON data to new SQLite schema.
- [ ] Verify data consistency post-migration.

### 4. Headless Engine Refactor
- [ ] Create `headless.py` entry point.
- [ ] Implement `stdin` command loop.
- [ ] Refactor `Decomposer` to read from SQLite.

## Decisions Log
- **2024-12-12:** Engine is now "Headless" - no Streamlit. Pure IO worker.
