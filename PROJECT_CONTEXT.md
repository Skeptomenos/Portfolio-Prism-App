# Project Context

> **Last Updated**: January 2026
> **Status**: Active Development (Phase 6)

## 1. Core Vision (PROTECTED)

### Objective

Build a **privacy-first desktop portfolio analyzer** that runs entirely on user machines. Enables investors to analyze portfolios locally without cloud dependencies, while optionally contributing to a community knowledge base ("The Hive").

**Tagline:** "Battery Included, Browser Free"

### Technical Constraints

- **Stack**: Tauri v2 (Rust shell) + React/Vite (UI) + Python 3.12 (Headless sidecar)
- **No Chromium**: Tauri uses system WebKit (~10MB vs 300MB+ Electron)
- **Bundle Target**: < 150MB total (shell + sidecar + assets)
- **API Key Security**: All API calls routed through Cloudflare Worker proxy
- **Local-First**: Core functionality works offline; cloud features are opt-in
- **IPC Pattern**: Stdin/Stdout JSON IPC (no HTTP server in sidecar)
- **Data Storage**: `~/Library/Application Support/com.skeptomenos.portfolioprism/`

### Architecture

```
Tauri Shell (Rust) → React UI (Vite) ↔ Python Sidecar (Headless)
                                              ↓
                     SQLite (local) / Cloudflare Proxy / Supabase (Hive)
```

### Anti-Patterns (What NOT to do)

- Do not embed API keys in client code
- Do not use HTTP ports for Python-Tauri communication
- Do not introduce Streamlit (legacy, deprecated)
- Do not bundle Chromium or any browser engine
- Do not use Parquet as primary database (SQLite is source of truth)
- Do not make blocking network calls that freeze UI

---

## 2. Active Roadmap (DYNAMIC)

### Current Focus

**Phase 6: Identity Resolution** (TOP PRIORITY)

The X-Ray pipeline cannot deliver accurate results without solving **Identity Resolution Hell** - ETF holdings come from multiple sources with inconsistent identifiers (ISIN, ticker variants, name variants).

**The Core Problem:**
```
Source 1 (Trade Republic):  ISIN: US67066G1040, Name: "NVIDIA"
Source 2 (iShares CSV):     Name: "NVIDIA CORP", Ticker: "NVDA" (NO ISIN)
Source 3 (Vanguard CSV):    Name: "Nvidia Inc", Ticker: "NVDA US" (NO ISIN)
```
These are ALL the same company. Without resolution, exposure calculations are wrong.

**Priority Tasks:**
1. Normalization Layer - Clean names before lookup
2. Ticker Parser - Handle Bloomberg/Reuters/Yahoo formats
3. Eager Contribution - Contribute immediately on API resolution
4. Confidence Scoring - Avoid bad fuzzy matches
5. Resolution Cascade - Local Cache -> Hive -> Wikidata -> Finnhub -> yFinance

**Success Metrics:**
- Resolution Rate: >95% of ETF holdings resolved to ISIN
- Cache Hit Rate: >80% resolved from Local/Hive (no API calls)

### Recent Decisions

- Legacy CSV resolution removed; Hive + LocalCache is the only path
- Unified sidecar entry point (`--http` flag) prevents dev/prod drift
- Feature flag pattern validated for safe refactors

### What's Working

| Component              | Status  |
| ---------------------- | ------- |
| Tauri Shell            | Done |
| Python Headless Engine | Done |
| IPC Communication      | Done |
| SQLite Database        | Done |
| Trade Republic Auth    | Done |
| Portfolio Sync         | Done |
| Dashboard (real data)  | Done |
| Project Echo (Bridge)  | Done |
| CI/CD Pipeline         | Done |

### Active Workstreams

- `data-engine`: Identity Resolution (ACTIVE - TOP PRIORITY)
- `infrastructure`: Done
- `frontend`: Done

### Key Files (Pipeline)

| File | Purpose |
|------|---------|
| `core/pipeline.py` | Orchestrator (5-phase) |
| `core/services/decomposer.py` | ETF decomposition |
| `core/services/enricher.py` | Metadata enrichment |
| `core/services/aggregator.py` | Exposure aggregation |
| `data/resolution.py` | ISIN resolution |
| `data/hive_client.py` | Community sync |

---

## 3. Known Issues (From Pipeline Audit)

| Severity | Issue | Location |
|----------|-------|----------|
| CRITICAL | NaN handling bug in asset_class split | pipeline.py:472 |
| CRITICAL | No weight sum validation for ETF holdings | aggregator.py |
| HIGH | Geography always "Unknown" | enricher.py |
| HIGH | First-wins aggregation strategy loses quality | aggregator.py |
| MEDIUM | Synchronous Hive contribution blocks pipeline | decomposer.py |
| MEDIUM | No currency conversion (assumes EUR) | aggregator.py |

---

## 4. Commands

```bash
# Development
npm run tauri dev

# Production Build
npm run tauri build

# Python Sidecar (standalone)
cd src-tauri/python && source venv-build/bin/activate
python prism_headless.py
```
