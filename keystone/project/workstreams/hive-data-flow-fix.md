# Workstream: Hive Data Flow Fix

> **Feature Plan:** `keystone/plans/HIVE_DATA_FLOW_FIX_PLAN.md`
> **Owner:** root-session
> **Status:** Done
> **Last Heartbeat:** 2025-12-26 14:00

---

## Objective

Fix the 0% Hive hit rate caused by `sync_universe()` querying non-existent `master_view`. Bridge the working `LocalCache` (populated via RPCs) to `HiveEnrichmentService`.

## Critical Constraints

- [ ] Must not break existing `sync_identity_domain()` path (it works)
- [ ] Must maintain RLS bypass via SECURITY DEFINER RPCs
- [ ] Must be backward compatible with offline mode

---

## Tasks (Source of Truth)

- [x] **HIVE-FIX-001: Fix sync_universe() to use RPCs**
    - **Dependencies:** None
    - **Status:** Done
    - **Priority:** Critical
    - **File:** `src-tauri/python/portfolio_src/data/hive_client.py`
    - **Description:** Replace `client.from_("master_view")` with `client.rpc("get_all_assets_rpc")` and merge with listings
    - **Created:** 2025-12-26
    - **Completed:** 2025-12-26

- [x] **HIVE-FIX-002: Create get_etf_holdings_rpc SQL function**
    - **Dependencies:** None
    - **Status:** Done
    - **Priority:** High
    - **Files:** `supabase/functions/functions.sql`, `supabase/migrations/20251226_add_etf_holdings_rpc.sql`
    - **Description:** Create RPC to bypass RLS for ETF holdings queries
    - **Created:** 2025-12-26
    - **Completed:** 2025-12-26

- [x] **HIVE-FIX-003: Update get_etf_holdings() to use RPC**
    - **Dependencies:** HIVE-FIX-002
    - **Status:** Done
    - **Priority:** High
    - **File:** `src-tauri/python/portfolio_src/data/hive_client.py`
    - **Description:** Replace direct table access with RPC call
    - **Created:** 2025-12-26
    - **Completed:** 2025-12-26

- [x] **HIVE-FIX-004: Bridge HiveEnrichmentService to LocalCache**
    - **Dependencies:** HIVE-FIX-001
    - **Status:** Done
    - **Priority:** Critical
    - **File:** `src-tauri/python/portfolio_src/core/services/enricher.py`
    - **Description:** Check LocalCache first before calling batch_lookup()
    - **Created:** 2025-12-26
    - **Completed:** 2025-12-26

- [x] **HIVE-FIX-005: Add aliases table to schema.sql**
    - **Dependencies:** None
    - **Status:** Done
    - **Priority:** Low
    - **File:** `supabase/schema.sql`
    - **Description:** Add aliases table definition for documentation completeness
    - **Created:** 2025-12-26
    - **Completed:** 2025-12-26

---

## Active State (Session Log)

> **Current Focus:** COMPLETE - All 5 tasks implemented and verified

### Iteration Log
- [2025-12-26 14:18] **Completed:** All 5 tasks implemented. 384/385 tests passing (1 pre-existing failure unrelated to changes)
- [2025-12-26 14:00] **Created:** Implementation plan based on Opus, Gemini, and UI-focused AI reviews
- [2025-12-26 13:50] **Verified:** All bulk sync RPCs working (1000 assets, 1000 listings)
- [2025-12-26 13:45] **Confirmed:** `master_view` does not exist (PGRST205 error)

### Artifacts Produced
- [x] `keystone/plans/HIVE_DATA_FLOW_FIX_PLAN.md`
- [x] `keystone/project/workstreams/hive-data-flow-fix.md`
- [x] `supabase/migrations/20251226_add_etf_holdings_rpc.sql`

### Files Modified
- `src-tauri/python/portfolio_src/data/hive_client.py` - Fixed sync_universe() and get_etf_holdings() to use RPCs
- `src-tauri/python/portfolio_src/core/services/enricher.py` - Added LocalCache lookup before HiveClient
- `supabase/functions/functions.sql` - Added get_etf_holdings_rpc function
- `supabase/schema.sql` - Added aliases table definition

### Parked Items / Ideas
- [ ] Consider adding `sector` and `geography` fields to AssetEntry
- [ ] Consider background sync thread for LocalCache (post-fix)

---

## Context for Resume (Handover)

- **Next Action:** Deploy `get_etf_holdings_rpc` migration to Supabase, then verify Hive hit rate > 0%
- **State:** Implementation complete, tests passing
- **Verification Needed:** Run live pipeline and confirm Hive hit rate improves from 0%
