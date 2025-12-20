# Project Objective

> **Purpose:** This is the living objective for this project. It evolves as understanding deepens through iteration.
> **Read this:** At session start to orient on the big picture.
> **Last Updated:** 2024-12-15

---

## Current Idea

Build a **privacy-first desktop portfolio analyzer** using a "Three-Tier Hybrid" architecture: **Tauri (Rust)** for the shell, **React** for the UI, and a **Headless Python Engine** for analytics. The app enables investors to analyze their portfolios locally without relying on cloud services, while optionally contributing to a community knowledge base ("The Hive").

## Evolution

- **2024-12**: Initial feasibility analysis completed. Tauri v2 selected over Electron.
- **2024-12**: Phase 1-3 completed (Streamlit POC).
- **2024-12**: Strategic Pivot to **React-First UI** to enable rapid feedback loops and native feel.
- **2024-12-15**: **MVP COMPLETE** - Full Trade Republic integration working with real portfolio data.
- **2024-12-17**: **CLEANUP COMPLETE** - Removed legacy Streamlit code and unified build system.
- **2024-12-19**: **RELEASE READY** - Dashboard finalized (Charts/Metrics) & CI/CD pipeline established.

## Success Looks Like

- [x] **MVP Launch:** Standalone `.app` running React UI + Python Engine
- [x] **Cleanup:** Zero legacy code, single build pipeline
- [x] **2FA Flow:** Native React modal for Trade Republic authentication
- [x] **Real Data:** Portfolio sync from Trade Republic with 30+ positions
- [x] **Dashboard:** Real-time portfolio value, P&L, 30-day Chart, and top holdings
- [x] **CI/CD:** Automated builds for macOS via GitHub Actions
- [ ] **Instant Startup:** App launches and displays dashboard in < 2 seconds
- [ ] **Offline Mode:** App functions with cached data (SQLite/Parquet) when disconnected
- [ ] **Zero-Effort Reporting:** Crashes automatically reported to GitHub Issues (opt-in)

## Constraints

- **No Chromium:** Tauri uses system WebKit - app must not bundle a browser engine
- **API Key Security:** Finnhub key must be proxied via Cloudflare Worker
- **Local-First:** Core functionality must work offline; cloud features are optional
- **React-First:** No new Streamlit development. All UI must be React components.
- **Throttled Sync:** Python engine must respect API rate limits (max 5 concurrent requests)

## Current Phase

**Phase 5: Release Polish.**
The application is feature-complete and infrastructure is ready. We are now focused on:

- Manual Verification of the Release Candidate.
- addressing minor backlog items (data migration script).

**Workstreams:**

- `data-engine`: Maintenance
- `infrastructure`: Done (CI/CD active)
- `frontend`: Done (Dashboard Complete)

**Next Steps:**

1. Push `v0.1.0` tag to trigger first CI/CD release.
2. Verified `.dmg` artifact.
3. Clean up backlog (Task 103/104).

## What's Working

| Component              | Status  |
| ---------------------- | ------- |
| Tauri Shell            | Working |
| Python Headless Engine | Working |
| IPC Communication      | Working |
| SQLite Database        | Working |
| Trade Republic Auth    | Working |
| Portfolio Sync         | Working |
| Dashboard (real data)  | Working |
| Portfolio Table        | Working |

## Data Directory

```
~/Library/Application Support/com.skeptomenos.portfolioprism/
├── prism.db          # SQLite database
└── tr_cookies.txt    # TR session cookies
```
