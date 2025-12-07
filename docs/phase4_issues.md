# Phase 4 Issues Assessment

> **Date:** 2024-12-07
> **Status:** Phase 4 ~70% Complete — Issues require fixing before full functionality

---

## Summary

Phase 4 (Auth & Hive) code exists but has **1 critical issue** and **3 medium issues** that need resolution. The TR Login, Hive Client, and Cloudflare Worker code are implemented but not fully integrated.

---

## Critical Issues

### Issue 1: Missing Hidden Imports in prism.spec ✅ RESOLVED

**File:** `src-tauri/python/prism.spec`
**Lines:** 53-62 (hidden_imports list)

**Resolution:** Added all required hidden imports:
- keyring, keyring.backends, keyring.backends.macOS
- supabase, postgrest, gotrue, httpx, storage3, realtime

**Resolved:** 2024-12-07

---

## Medium Issues

### Issue 2: TR Login Not Accessible from Main Dashboard ✅ RESOLVED

**File:** `src-tauri/python/portfolio_src/dashboard/app.py`

**Resolution:** TR Login added as Tab 8:
- Line 15: `from dashboard.pages import tr_login`
- Lines 27-38: Added "🔐 TR Login" as 8th tab
- Lines 61-62: `with tab8: tr_login.render_login_ui()`

**Resolved:** 2024-12-07

---

### Issue 3: Cloudflare Worker Not Deployed

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

### Issue 4: Supabase Not Configured

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
| `python/prism.spec` | #1 | Add keyring, supabase hidden imports |
| `portfolio_src/dashboard/app.py` | #2 | Add TR Login as Tab 8 |
| Cloudflare Worker | #3 | Deploy and configure secrets |
| Supabase | #4 | Create project and table |

---

## Verification Checklist

After fixing issues:

- [x] Add hidden imports to prism.spec — Done
- [x] Add TR Login as Tab 8 — Done
- [ ] Rebuild binary: `pyinstaller prism.spec && cp dist/prism ../binaries/prism-aarch64-apple-darwin`
- [ ] Run `npm run tauri dev` — app launches
- [ ] All 8 tabs render (including TR Login)
- [ ] TR Login form appears, shows help section
- [ ] Cloudflare Worker responds: `curl https://proxy.portfolio-prism.workers.dev/health`
- [ ] Hive sync works (or gracefully falls back to cache)

---

## Recommended Fix Order

1. ~~**Fix Issue #1** — Add hidden imports to prism.spec~~ ✅ Done
2. ~~**Fix Issue #2** — Add TR Login as Tab 8 in app.py~~ ✅ Done
3. **Rebuild binary** — `pyinstaller prism.spec` ← NEXT
4. **Test locally** — Verify tabs work
5. **Deploy Cloudflare Worker** — Issue #3 (can be parallel)
6. **Configure Supabase** — Issue #4 (can be deferred to post-MVP)
