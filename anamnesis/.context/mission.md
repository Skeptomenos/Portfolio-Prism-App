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

## Success Looks Like

- [x] **MVP Launch:** Standalone `.app` running React UI + Python Engine
- [x] **2FA Flow:** Native React modal for Trade Republic authentication
- [x] **Real Data:** Portfolio sync from Trade Republic with 30+ positions
- [x] **Dashboard:** Real-time portfolio value, P&L, and top holdings
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

**Phase 5: Polish & Release.**
The MVP is functional. We are now focused on:
- Enhancing the Dashboard with better visualizations
- Setting up CI/CD for automated builds
- Preparing for alpha release

**Workstreams:**
* `infrastructure`: Active (CI/CD, Telemetry)
* `data-engine`: Stable (TR integration complete)
* `frontend`: Active (Dashboard enhancements)

**Next Steps:**
1. Implement dashboard metric cards and charts (TASK-401, 402)
2. Set up GitHub Actions CI/CD (TASK-502)
3. Build and sign `.dmg` for macOS distribution

## What's Working

| Component | Status |
|-----------|--------|
| Tauri Shell | Working |
| Python Headless Engine | Working |
| IPC Communication | Working |
| SQLite Database | Working |
| Trade Republic Auth | Working |
| Portfolio Sync | Working |
| Dashboard (real data) | Working |
| Portfolio Table | Working |

## Data Directory

```
~/Library/Application Support/com.skeptomenos.portfolioprism/
├── prism.db          # SQLite database
└── tr_cookies.txt    # TR session cookies
```
