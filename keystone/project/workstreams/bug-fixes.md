# Workstream: bug-fixes

> **Owner:** OptiPie
> **Status:** Active
> **Last Heartbeat:** 2025-12-25

---

## Objective

Fix critical bugs identified during code reviews and testing to ensure system stability and data integrity.

---

## Tasks

### Pipeline Stability
- [x] **BUG-001: Unreachable code in `pipeline.py`**
    - **Priority:** High
    - **Status:** Fixed (2025-12-25)
    - **Details:** Code after a `return` statement in an `except` block is never executed. Health reports won't be written on pipeline failure.
    - **Fix:** Restored `finally:` block so reports are always written.
    - **Location:** `src-tauri/python/portfolio_src/core/pipeline.py`

### Hive Data Integrity
- [x] **BUG-002: `batch_resolve_tickers_rpc` non-deterministic results**
    - **Priority:** Medium
    - **Status:** Fixed (2025-12-25)
    - **Details:** `DISTINCT ON` without `ORDER BY` returns arbitrary row when ticker exists on multiple exchanges.
    - **Fix:** Added `ORDER BY UPPER(l.ticker), l.exchange` for deterministic results.
    - **Location:** `infrastructure/supabase/functions.sql`

- [ ] **BUG-003: `contribute_alias` missing error logging**
    - **Priority:** Low
    - **Details:** `contribute_alias` doesn't log failures to the `contributions` table unlike `contribute_asset`.
    - **Location:** `infrastructure/supabase/functions.sql`
