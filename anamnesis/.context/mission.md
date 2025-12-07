# Project Objective

> **Purpose:** This is the living objective for this project. It evolves as understanding deepens through iteration.
> **Read this:** At session start to orient on the big picture.

---

## Current Idea

Build a **privacy-first desktop portfolio analyzer** that wraps an existing Python/Streamlit analytics engine in a native Tauri container. The app enables investors to analyze their portfolios locally without relying on cloud services, while optionally contributing to a community knowledge base ("The Hive") for ISIN resolution.

## Evolution

- **2024-12**: Initial feasibility analysis completed. Tauri v2 selected over Electron for smaller bundle size (~50MB vs 300MB+) and native WebKit rendering.
- **2024-12**: Playwright scraping deprecated in favor of community-sourced ETF data ("The Hive") to reduce bundle size by ~300MB.
- **2024-12**: Phase 1 (Proto-Organism) completed — Tauri↔Python IPC working.
- **2024-12**: Phase 2 (Skeleton) completed — PyInstaller binary (62MB) with Streamlit bundled.
- **2024-12**: Phase 3 (Brain) completed — POC code transplanted to `portfolio_src/`, binary rebuilt (84MB).
- **Current**: Phase 4 in progress (~70%) — Auth & Hive code exists, blockers documented.

## Success Looks Like

- [ ] **MVP Launch:** Standalone `.app` that runs portfolio analysis without Python installed
- [ ] **2FA Flow:** User can authenticate with Trade Republic via in-app 2FA
- [ ] **Offline Mode:** App functions with cached data when disconnected
- [ ] **Community Contribution:** New ISIN resolutions sync to/from Supabase "Hive"
- [ ] **Auto-Updates:** App checks for and applies updates via GitHub Releases

## Constraints

- **No Chromium:** Tauri uses system WebKit — app must not bundle a browser engine
- **API Key Security:** Finnhub key must be proxied via Cloudflare Worker, never embedded in client
- **Local-First:** Core functionality must work offline; cloud features are optional enhancements
- **Single Developer:** Pragmatic scope — favor working software over comprehensive features
- **macOS Primary:** Windows/Linux compatibility is secondary goal

## Current Phase

**Phase 3 Complete.** POC dashboard code transplanted to `src-tauri/python/portfolio_src/`. Binary rebuilt (84MB, Dec 7).

**Phase 4 In Progress (~70%).** Auth & Hive code exists but has blockers:
- Missing hidden imports in prism.spec (keyring, supabase)
- TR Login not accessible from main dashboard (needs Tab 8 integration)
- Cloudflare Worker not deployed
- Supabase project not configured

**Project Layout:** Standard Tauri layout at repo root (flattened from `tauri-app/`)

**Next Steps:** Fix Phase 4 blockers documented in `docs/phase4_issues.md`
