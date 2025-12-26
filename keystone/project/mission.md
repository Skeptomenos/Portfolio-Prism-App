den# Project Objective

> **Purpose:** This is the living objective for this project. It evolves as understanding deepens through iteration.
> **Read this:** At session start to orient on the big picture.
> **Last Updated:** 2025-12-26

---

## Current Idea

Build a **privacy-first desktop portfolio analyzer** using a "Three-Tier Hybrid" architecture: **Tauri (Rust)** for the shell, **React** for the UI, and a **Headless Python Engine** for analytics. The app enables investors to analyze their portfolios locally without relying on cloud services, while optionally contributing to a community knowledge base ("The Hive"). "Project Echo" provides a unified development bridge and autonomous, privacy-first bug reporting.

## Evolution

- **2024-12**: Initial feasibility analysis completed. Tauri v2 selected over Electron.
- **2024-12**: Phase 1-3 completed (Streamlit POC).
- **2024-12**: Strategic Pivot to **React-First UI** to enable rapid feedback loops and native feel.
- **2024-12-15**: **MVP COMPLETE** - Full Trade Republic integration working with real portfolio data.
- **2024-12-17**: **CLEANUP COMPLETE** - Removed legacy Streamlit code and unified build system.
- **2024-12-19**: **RELEASE READY** - Dashboard finalized (Charts/Metrics) & CI/CD pipeline established.
- **2025-12-20**: **PROJECT ECHO COMPLETE** - Unified Sidecar (FastAPI) and Redacted Reporter (GitHub) integrated.

## Success Looks Like

- [x] **MVP Launch:** Standalone `.app` running React UI + Python Engine
- [x] **Cleanup:** Zero legacy code, single build pipeline
- [x] **2FA Flow:** Native React modal for Trade Republic authentication
- [x] **Real Data:** Portfolio sync from Trade Republic with 30+ positions
- [x] **Dashboard:** Real-time portfolio value, P&L, 30-day Chart, and top holdings
- [x] **CI/CD:** Automated builds for macOS via GitHub Actions
- [x] **Instant Startup:** App launches and displays dashboard in < 2 seconds
- [x] **Offline Mode:** App functions with cached data (SQLite/Parquet) when disconnected
- [x] **Zero-Effort Reporting:** Crashes automatically reported to GitHub Issues (opt-in)

## Constraints

- **No Chromium:** Tauri uses system WebKit - app must not bundle a browser engine
- **API Key Security:** Finnhub key must be proxied via Cloudflare Worker
- **Local-First:** Core functionality must work offline; cloud features are optional
- **React-First:** No new Streamlit development. All UI must be React components.
- **Throttled Sync:** Python engine must respect API rate limits (max 5 concurrent requests)
- **Echo-Bridge:** Browser-based development must use the exact same Python logic as the native app.

## Current Phase

**Phase 6: Identity Resolution (TOP PRIORITY)**

The X-Ray pipeline cannot deliver accurate results without solving **Identity Resolution Hell**.

### The Core Problem

ETF holdings data comes from multiple sources with **inconsistent identifiers**:

```
Source 1 (Trade Republic):  ISIN: US67066G1040, Name: "NVIDIA"
Source 2 (iShares CSV):     Name: "NVIDIA CORP", Ticker: "NVDA" (NO ISIN)
Source 3 (Vanguard CSV):    Name: "Nvidia Inc", Ticker: "NVDA US" (NO ISIN)
Source 4 (justETF):         Name: "NVIDIA Corporation", Ticker: "NVDA.OQ"
```

**These are ALL the same company.** Without resolution, we can't:
- Calculate true exposure (is NVIDIA in both ETFs the same?)
- Detect overlaps (am I double-exposed?)
- Aggregate by sector (what sector is "NVIDIA CORP"?)

### The Hive's Purpose

The Hive is an **identity resolver**, not just a ticker lookup:
- **Input:** Any name variant, any ticker format, any partial match
- **Output:** Canonical ISIN (the unique global identifier)
- **Growth:** Every user contributes new resolutions automatically

### Priority Tasks

1. **Normalization Layer** - Clean names before lookup (remove "Corp", "Inc", uppercase, etc.)
2. **Ticker Parser** - Handle Bloomberg ("NVDA US"), Reuters ("NVDA.OQ"), Yahoo ("NVDA.DE") formats
3. **Eager Contribution** - Contribute immediately on API resolution, don't wait for pipeline end
4. **Confidence Scoring** - Avoid bad fuzzy matches (exact match > ticker > fuzzy name)
5. **Resolution Cascade** - Local Cache → Hive → Wikidata → Finnhub → yFinance

### Success Metrics

- **Resolution Rate:** >95% of ETF holdings resolved to ISIN
- **Hive Growth:** Each user run contributes new aliases
- **Cache Hit Rate:** >80% resolved from Local/Hive (no API calls)

**Workstreams:**

- `data-engine`: Identity Resolution (ACTIVE - TOP PRIORITY)
- `infrastructure`: Done (CI/CD active)
- `frontend`: Done (Dashboard Complete)

**Next Steps:**

1. Audit current normalization in `ISINResolver`
2. Implement `IdentifierNormalizer` class
3. Refactor resolution to contribute immediately
4. Add confidence scoring to resolution results

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
| Project Echo (Bridge)  | Working |
| Project Echo (Report)  | Working |

## Data Directory

```
~/Library/Application Support/com.skeptomenos.portfolioprism/
├── prism.db          # SQLite database
└── tr_cookies.txt    # TR session cookies
```
