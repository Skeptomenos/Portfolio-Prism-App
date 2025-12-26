# Portfolio Prism: Remediation Plan
**Date:** 2025-12-26
**Context:** Post-Audit Fixes (Opus & Gemini Findings)

## 1. Critical Fixes (Security & Stability)

### A. Secure ETF Holdings Access (RLS Fix)
The current implementation uses direct table access, which fails if RLS is enabled.
- [ ] **SQL:** Add `get_etf_holdings_rpc` to `supabase/functions/functions.sql`.
- [ ] **Python:** Update `hive_client.py` to use `client.rpc("get_etf_holdings_rpc", ...)` instead of direct select.

### B. Fix Schema Drift
The `aliases` table exists in migrations but is missing from the master schema definition.
- [ ] **SQL:** Copy `CREATE TABLE public.aliases` definition from `migrations/20251224_add_aliases.sql` to `supabase/schema.sql`.

## 2. Cleanup (Legacy Code)
- [x] **Delete:** `src-tauri/python/portfolio_src/data/community_sync.py` (Completed)

## 3. Verification
- [ ] **Test:** Run `scripts/test_hive_rpc.py` (after deploying SQL).
- [ ] **Manual:** Verify X-Ray view populates correctly.
