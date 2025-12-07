# Phase 4 Issues Assessment

> **Date:** 2024-12-07
> **Status:** Phase 4 ~70% Complete — Issues require fixing before full functionality

---

## Summary

Phase 4 (Auth & Hive) code exists but has **1 critical issue** and **3 medium issues** that need resolution. The TR Login, Hive Client, and Cloudflare Worker code are implemented but not fully integrated.

---

## Critical Issues

### Issue 1: Missing Hidden Imports in prism.spec

**File:** `src-tauri/python/prism.spec`
**Lines:** 30-53 (hidden_imports list)

**Current State:**
`keyring` and `supabase` are in `requirements-build.txt` but NOT in `prism.spec` hidden imports.

**Problem:**
The binary will crash with `ModuleNotFoundError` when:
- User attempts TR login (uses `keyring`)
- Hive sync runs (uses `supabase`)

**Fix Required:**
Add to `hidden_imports` list in `prism.spec`:
```python
# Phase 4: Auth & Hive dependencies
'keyring',
'supabase',
'postgrest',      # supabase dependency
'gotrue',         # supabase auth dependency
'httpx',          # supabase http client
'storage3',       # supabase storage
'realtime',       # supabase realtime
```

**After Fix:** Rebuild binary with `pyinstaller prism.spec`

**Severity:** CRITICAL — App will crash when Phase 4 features are used

---

## Medium Issues

### Issue 2: TR Login Not Accessible from Main Dashboard

**File:** `src-tauri/python/portfolio_src/dashboard/app.py`

**Current State:**
- TR login page exists at `portfolio_src/dashboard/pages/tr_login.py`
- Main app has 7 tabs, none linking to TR login
- Streamlit multipage structure exists but may not work in PyInstaller frozen apps

**Decision:** Use Option A — Add TR Login as Tab 8

**Fix Required:**
Update `portfolio_src/dashboard/app.py`:
1. Import tr_login module
2. Add 8th tab for TR Login

```python
from dashboard.pages import tr_login

# Update tabs (add 8th)
tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8 = st.tabs([
    "Performance",
    "Portfolio X-Ray",
    "ETF Overlap",
    "Holdings Analysis",
    "Data Manager",
    "Pipeline Health",
    "Missing Data",
    "TR Login",  # NEW
])

# ... existing tab content ...

with tab8:
    tr_login.render_login_ui()
```

**Severity:** MEDIUM — TR Login feature is not accessible

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

- [ ] Rebuild binary: `pyinstaller prism.spec && cp dist/prism ../binaries/prism-aarch64-apple-darwin`
- [ ] Run `npm run tauri dev` — app launches
- [ ] All 8 tabs render (including TR Login)
- [ ] TR Login form appears, shows help section
- [ ] Cloudflare Worker responds: `curl https://proxy.portfolio-prism.workers.dev/health`
- [ ] Hive sync works (or gracefully falls back to cache)

---

## Recommended Fix Order

1. **Fix Issue #1** — Add hidden imports to prism.spec
2. **Fix Issue #2** — Add TR Login as Tab 8 in app.py
3. **Rebuild binary** — `pyinstaller prism.spec`
4. **Test locally** — Verify tabs work
5. **Deploy Cloudflare Worker** — Issue #3 (can be parallel)
6. **Configure Supabase** — Issue #4 (can be deferred to post-MVP)
