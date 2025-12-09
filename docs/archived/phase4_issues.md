# Phase 4 Issues Assessment

> **Date:** 2024-12-07
> **Updated:** 2024-12-07 (Post-Investigation)
> **Status:** Phase 4 ~70% Complete — Critical auth bugs identified, plan ready

---

## Summary

Phase 4 (Auth & Hive) code exists but has **4 critical bugs** in the TR authentication code and **2 medium issues** (infrastructure). 

**See also:** `docs/PLAN_NATIVE_INTEGRATION.md` for the comprehensive fix plan with verified pytr API details.

---

## Critical Issues (TR Authentication)

> **Full details:** See `docs/PLAN_NATIVE_INTEGRATION.md` Section 2.4

### Issue 1: Wrong Import Name in tr_auth.py ❌ NOT FIXED

**File:** `src-tauri/python/portfolio_src/core/tr_auth.py` Line 26
**Current:** `from pytr.api import Api as TRApi`
**Fix:** `from pytr.api import TradeRepublicApi as TRApi`

### Issue 2: Wrong Authentication Methods ❌ NOT FIXED

**File:** `src-tauri/python/portfolio_src/core/tr_auth.py` Lines 201, 247
**Current:** Uses `login()` and `complete_login()` (Device auth / non-existent)
**Fix:** Use `inititate_weblogin()` and `complete_weblogin()` (Web Login flow)

**Note:** `inititate_weblogin` is a typo in pytr library — this is correct.

### Issue 3: Missing Session Persistence ❌ NOT FIXED

**File:** `src-tauri/python/portfolio_src/core/tr_auth.py`
**Issue:** No cookie-based session persistence
**Fix:** Add `save_cookies=True` to API constructor, use `resume_websession()` on startup

### Issue 4: Missing pytr Hidden Imports ❌ NOT FIXED

**File:** `src-tauri/python/prism.spec`
**Issue:** Only has `'pytr'`, missing all submodules and dependencies
**Fix:** Add ~30 hidden imports (see `PLAN_NATIVE_INTEGRATION.md` Section 2.3)

---

## Resolved Issues

### Issue 5: Hidden Imports for keyring/supabase ✅ RESOLVED

**Resolved:** 2024-12-07

### Issue 6: TR Login Not Accessible from Main Dashboard ✅ RESOLVED

**Resolved:** 2024-12-07

---

## Medium Issues (Infrastructure)

### Issue 7: Cloudflare Worker Not Deployed

**Files:**
- `infrastructure/cloudflare/worker.js`
- `infrastructure/cloudflare/wrangler.toml`

**Current State:**
Worker code exists but requires deployment and secret configuration.

**Setup Required:**
1. Install Wrangler CLI: `npm install -g wrangler`
2. Login to Cloudflare: `wrangler login`
3. Set secrets:
   ```bash
   cd infrastructure/cloudflare
   wrangler secret put FINNHUB_API_KEY
   wrangler secret put GITHUB_TOKEN
   wrangler secret put GITHUB_REPO
   ```
4. Deploy: `wrangler deploy`

**After Deploy:**
- Update `proxy_client.py` `DEFAULT_PROXY_URL` if worker URL differs
- Or set `PROXY_URL` environment variable

**Severity:** MEDIUM — Finnhub API calls will fail, but app runs offline

---

### Issue 8: Supabase Not Configured

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

**Current State:**
Client expects environment variables that aren't set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

**Setup Required:**
1. Create Supabase project at https://supabase.com
2. Create `master_universe` table:
   ```sql
   CREATE TABLE master_universe (
       isin TEXT PRIMARY KEY,
       ticker TEXT NOT NULL,
       name TEXT,
       asset_type TEXT DEFAULT 'Unknown',
       contributor_count INTEGER DEFAULT 1,
       last_updated TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Enable Row Level Security
   ALTER TABLE master_universe ENABLE ROW LEVEL SECURITY;
   
   -- Public read access
   CREATE POLICY "Public read" ON master_universe
       FOR SELECT USING (true);
   
   -- Authenticated write access
   CREATE POLICY "Auth write" ON master_universe
       FOR INSERT WITH CHECK (auth.role() = 'authenticated');
   ```
3. Get project URL and anon key from Supabase dashboard
4. Inject into app environment (via Rust or config file)

**Graceful Degradation:**
The client falls back to local cache if Supabase is unavailable. App will function but won't sync community data.

**Severity:** MEDIUM — Hive sync disabled, local-only mode works

---

## Files Requiring Changes

| File | Issue | Change Required |
|------|-------|-----------------|
| `portfolio_src/core/tr_auth.py` | #1-3 | Fix import, auth flow, session persistence |
| `python/prism.spec` | #4 | Add ~30 pytr hidden imports |
| `prism_utils/error_reporter.py` | NEW | Create error reporter module |
| `data/tr_sync.py` | NEW | Create data sync module |
| Cloudflare Worker | #7 | Deploy and configure secrets |
| Supabase | #8 | Create project and table |

---

## Verification Checklist

After fixing issues:

- [x] Add keyring/supabase hidden imports to prism.spec — Done
- [x] Add TR Login as Tab 8 — Done
- [ ] Fix tr_auth.py import: `Api` → `TradeRepublicApi`
- [ ] Fix tr_auth.py auth flow: `login()` → `inititate_weblogin()`
- [ ] Add pytr hidden imports to prism.spec (~30 imports)
- [ ] Create error_reporter.py for verbose logging
- [ ] Create tr_sync.py for portfolio fetching
- [ ] Rebuild binary: `pyinstaller prism.spec`
- [ ] Test TR Login with real account
- [ ] Test portfolio sync with real account
- [ ] Cloudflare Worker responds: `curl https://proxy.portfolio-prism.workers.dev/health`
- [ ] Hive sync works (or gracefully falls back to cache)

---

## Recommended Fix Order

> **Full implementation plan:** See `docs/PLAN_NATIVE_INTEGRATION.md`

### Phase 1: Fix Auth & Dependencies (Critical)
1. Fix `tr_auth.py` import — Issue #1
2. Fix `tr_auth.py` auth flow — Issue #2
3. Add session persistence — Issue #3
4. Add pytr hidden imports — Issue #4
5. Create `error_reporter.py`
6. Rebuild binary
7. Test with TR account

### Phase 2: Data Sync
8. Create `tr_sync.py`
9. Add "Sync Portfolio" button to UI
10. Test full flow

### Phase 3: Infrastructure (Deferred)
11. Deploy Cloudflare Worker — Issue #7
12. Configure Supabase — Issue #8
