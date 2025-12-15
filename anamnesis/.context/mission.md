# Project Objective

> **Purpose:** This is the living objective for this project. It evolves as understanding deepens through iteration.
> **Read this:** At session start to orient on the big picture.

---

## Current Idea

Build a **privacy-first desktop portfolio analyzer** using a "Three-Tier Hybrid" architecture: **Tauri (Rust)** for the shell, **React** for the UI, and a **Headless Python Engine** for analytics. The app enables investors to analyze their portfolios locally without relying on cloud services, while optionally contributing to a community knowledge base ("The Hive").

## Evolution

- **2024-12**: Initial feasibility analysis completed. Tauri v2 selected over Electron.
- **2024-12**: Phase 1-3 completed (Streamlit POC).
- **2024-12**: Strategic Pivot to **React-First UI** to enable rapid feedback loops and native feel.
- **Current**: **Phase 0 (Infrastructure & Migration)**. Establishing the React foundation and archiving legacy Streamlit code.

## Success Looks Like

- [ ] **MVP Launch:** Standalone `.app` running React UI + Python Engine
- [ ] **Instant Startup:** App launches and displays dashboard in < 2 seconds
- [ ] **2FA Flow:** Native React modal for Trade Republic authentication
- [ ] **Offline Mode:** App functions with cached data (SQLite/Parquet) when disconnected
- [ ] **Zero-Effort Reporting:** Crashes automatically reported to GitHub Issues (opt-in)

## Constraints

- **No Chromium:** Tauri uses system WebKit — app must not bundle a browser engine
- **API Key Security:** Finnhub key must be proxied via Cloudflare Worker
- **Local-First:** Core functionality must work offline; cloud features are optional
- **React-First:** No new Streamlit development. All UI must be React components.
- **Throttled Sync:** Python engine must respect API rate limits (max 5 concurrent requests)

## Current Phase

**Phase 0: Infrastructure & Migration.**
We are actively transitioning from the Streamlit POC to the React MVP architecture.

**Workstreams:**
*   `infrastructure`: Active (Archiving legacy, Scaffolding React)
*   `data-engine`: Pending (SQLite Schema, Headless Refactor)
*   `frontend`: Pending (State, IPC Bridge)

**Next Steps:**
1.  Archive legacy dashboard code
2.  Scaffold Vite+React project in `src/`
3.  Implement SQLite schema and migration scripts
