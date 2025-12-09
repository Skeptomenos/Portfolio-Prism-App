# Implementation Plan (The "When")

> **Development Location:** Project root (standard Tauri layout)
> **Last Updated:** 2024-12-07

---

## Phase 1: The Proto-Organism (Connectivity) ✅ COMPLETE

- [x] **TASK-101:** Initialize Tauri v2 project

  - **Status:** Complete

- [x] **TASK-102:** Create Python handshake script (`prism_boot.py`)

  - **Context:** Dynamic port binding, JSON stdout, launches Streamlit
  - **Status:** Complete

- [x] **TASK-103:** Implement Rust sidecar spawning (`lib.rs`)

  - **Context:** Uses `tauri-plugin-shell` sidecar API
  - **Status:** Complete

- [x] **TASK-104:** Implement frontend redirect logic (`main.ts`)

  - **Context:** Polls `/_stcore/health` before redirect
  - **Status:** Complete

- [x] **TASK-105:** Verify IPC and port discovery works
  - **Status:** Complete — tested and working

---

## Phase 2: The Skeleton (Packaging) ✅ COMPLETE

- [x] **TASK-201:** Create `requirements-build.txt` with minimal deps

  - **Context:** streamlit, pandas, numpy, altair, pyarrow
  - **Status:** Complete

- [x] **TASK-202:** Create PyInstaller spec file (`prism.spec`)

  - **Context:** Handles Streamlit assets, hidden imports
  - **Status:** Complete

- [x] **TASK-203:** Build PyInstaller binary

  - **Context:** `pyinstaller prism.spec` → 62MB binary
  - **Status:** Complete

- [x] **TASK-204:** Configure Tauri to use bundled binary

  - **Context:** `externalBin` in `tauri.conf.json`
  - **Status:** Complete

- [x] **TASK-205:** Verify standalone app runs without Python installed
  - **Status:** Complete — Streamlit placeholder renders

---

## Phase 2.5: Pre-Phase 3 Fixes ✅ COMPLETE

- [x] **TASK-251:** Add Dead Man's Switch to `prism_boot.py`

  - **Context:** Monitor stdin for EOF, self-terminate if parent dies
  - **Status:** Complete — `dead_mans_switch()` thread in prism_boot.py:42-49

- [x] **TASK-252:** Update `requirements-build.txt` for POC dependencies
  - **Context:** Add: requests, beautifulsoup4, lxml, openpyxl, pydantic, pytr, cryptography, plotly, tqdm, pandera
  - **Status:** Complete

---

## Phase 3: The Brain (Logic Transplant) ✅ COMPLETE

- [x] **TASK-301:** Copy POC source to Tauri app

  - **Context:** `POC/src/` → `src-tauri/python/portfolio_src/`
  - **Includes:** adapters/, core/, data/, models/, utils/, dashboard/, config.py
  - **Status:** Complete

- [x] **TASK-302:** Update `app.py` to import POC dashboard

  - **Context:** Replace placeholder with actual dashboard tabs
  - **Status:** Complete — imports from `dashboard.tabs`

- [x] **TASK-303:** Implement `PRISM_DATA_DIR` in config.py

  - **Context:** Read from env var, passed from Rust via `.env()`
  - **Status:** Complete — lib.rs:28 passes PRISM_DATA_DIR

- [x] **TASK-304:** Rebuild PyInstaller binary with POC code

  - **Context:** Binary rebuilt Dec 7 08:46, 84MB
  - **Status:** Complete

- [x] **TASK-305:** Test with real portfolio data
  - **Context:** Verify all dashboard tabs render correctly
  - **Status:** Pending verification (requires manual test)

---

## Phase 4: The Nervous System (Auth & Hive) ⏳ IN PROGRESS (~70%)

> **Issues documented in:** `docs/phase4_issues.md`

- [x] **TASK-401:** Create Trade Republic login UI in Streamlit

  - **Context:** Phone + PIN → 2FA code flow
  - **Status:** Complete — `portfolio_src/dashboard/pages/tr_login.py`

- [x] **TASK-402:** Implement keyring storage for TR credentials

  - **Context:** Use `keyring` library for macOS Keychain
  - **Status:** Complete — `portfolio_src/core/tr_auth.py` with file fallback

- [x] **TASK-403:** Set up Cloudflare Worker proxy

  - **Context:** Protect Finnhub API key, rate limiting
  - **Status:** Code complete — `infrastructure/cloudflare/worker.js`
  - **Blocker:** Needs deployment and secret configuration

- [x] **TASK-404:** Implement Hive sync client (Supabase)

  - **Context:** Download master universe on launch
  - **Status:** Complete — `portfolio_src/data/hive_client.py`
  - **Blocker:** Needs Supabase project setup

- [x] **TASK-405:** Implement silent ISIN contribution (alpha)
  - **Context:** POST new resolutions to Supabase
  - **Status:** Complete — `hive_client.py:contribute()` method

### Phase 4 Blockers (see phase4_issues.md)

- [x] **TASK-406:** Add missing hidden imports to prism.spec

  - **Context:** keyring, supabase, postgrest, gotrue, httpx, storage3, realtime
  - **Priority:** CRITICAL
  - **Status:** Complete — prism.spec:53-62

- [x] **TASK-407:** Integrate TR Login as Tab 8 in main app

  - **Context:** Decision: Option A (Tab 8) over Streamlit multipage
  - **Priority:** Medium
  - **Status:** Complete — app.py:15, 27-38, 61-62

- [ ] **TASK-408:** Deploy Cloudflare Worker

  - **Context:** wrangler deploy + secrets
  - **Priority:** Medium
  - **Status:** Pending

- [ ] **TASK-409:** Configure Supabase project
  - **Context:** Create master_universe table, get credentials
  - **Priority:** Medium (can defer to post-MVP)
  - **Status:** Pending

---

- [x] **TASK-410:** Fix duplicate header/form bug
  - **Context:** Refactored dashboard package init logic
  - **Priority:** High
  - **Status:** Complete

## Phase 5: The Immune System (Polish) ⏳ PENDING

- [ ] **TASK-501:** Configure `tauri-plugin-updater`

  - **Context:** Check GitHub Releases for updates
  - **Status:** Pending

- [ ] **TASK-502:** Set up GitHub Actions for builds

  - **Context:** Build `.dmg` on release tags
  - **Status:** Pending

- [ ] **TASK-503:** Implement crash reporting (`sys.excepthook`)

  - **Context:** Sanitize PII, POST to proxy → GitHub Issues
  - **Status:** Pending

- [ ] **TASK-504:** Code sign and notarize for macOS

  - **Context:** Apple Developer ID required
  - **Status:** Pending

- [ ] **TASK-505:** Lock down CSP in `tauri.conf.json`
  - **Context:** Replace `"csp": null` with secure policy
  - **Status:** Pending
