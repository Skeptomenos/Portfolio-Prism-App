# Workstream: bug-fixes

> **Feature Plan:** `keystone/project/workstreams/bug-fixes.md`
> **Owner:** OptiPie
> **Status:** Active
> **Last Heartbeat:** 2025-12-25

---

## 🎯 Objective
Fix critical bugs identified during code reviews and testing to ensure system stability and data integrity.

## 🚨 Critical Constraints
- [ ] Fix root causes, not symptoms
- [ ] Maintain 100% test coverage for fixes

---

## 📋 Tasks (Source of Truth)

- [x] **BUG-001: Unreachable code in `pipeline.py`**
    - **Status:** Done
    - **Workstream:** bug-fixes
    - **Details:** Code after a `return` statement in an `except` block is never executed. Health reports won't be written on pipeline failure.
    - **Fix:** Restored `finally:` block so reports are always written.

- [x] **BUG-002: `batch_resolve_tickers_rpc` non-deterministic results**
    - **Status:** Done
    - **Workstream:** bug-fixes
    - **Details:** `DISTINCT ON` without `ORDER BY` returns arbitrary row when ticker exists on multiple exchanges.
    - **Fix:** Added `ORDER BY UPPER(l.ticker), l.exchange` for deterministic results.

- [x] **BUG-003: `contribute_alias` missing error logging**
    - **Status:** Done
    - **Workstream:** bug-fixes
    - **Details:** `contribute_alias` doesn't log failures to the `contributions` table unlike `contribute_asset`.
    - **Fix:** Added INSERT into `contributions` table with `alias_rpc_error` target for both `foreign_key_violation` and generic exceptions.

---

## 🧠 Active State (Session Log)
> **Current Focus:** None - all bugs fixed

### Iteration Log
- **2025-12-26:** Fixed BUG-003. Added error logging to `contribute_alias` RPC function.
- **2025-12-25:** Fixed BUG-001 and BUG-002. Verified with integration tests.

### Artifacts Produced
- [ ] `src-tauri/python/portfolio_src/core/pipeline.py`
- [x] `supabase/functions/functions.sql`

### Parked Items / Ideas
- [ ] None

---

## 💾 Context for Resume (Handover)
- **Next Action:** Fix BUG-003 in `functions.sql`.
- **State:** Pipeline stability improved, Hive data integrity enhanced.
