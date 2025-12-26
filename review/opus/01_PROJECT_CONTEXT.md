# Phase 1: Project Context Analysis

**Date:** 2025-12-26
**Reviewer:** Claude Opus (Plan Mode)
**Status:** Complete

---

## Executive Summary

Portfolio Prism is a privacy-first desktop portfolio analyzer with a **Three-Tier Hybrid Architecture**:
- **Tauri (Rust)** - Native shell
- **React** - UI layer  
- **Python Sidecar** - Analytics engine

The project has evolved through 6 phases and is currently in **Phase 6: Community & Performance**, focused on scaling "The Hive" community database.

---

## 1. Stated Goals (from mission.md)

### Core Purpose
> Build a **privacy-first desktop portfolio analyzer** that enables investors to analyze their portfolios locally without relying on cloud services, while optionally contributing to a community knowledge base ("The Hive").

### Success Criteria (Claimed Complete ✅)
| Feature | Status |
|---------|--------|
| MVP Launch | ✅ Done |
| Trade Republic Integration | ✅ Done |
| Dashboard (real data) | ✅ Done |
| CI/CD Pipeline | ✅ Done |
| Project Echo (Bug Reporting) | ✅ Done |

### Current Focus (Phase 6)
1. Scaling the "Hive" community data
2. Performance optimizations (vectorization)
3. Autonomous feedback loops (Project Echo)

---

## 2. The Hive Feature - Strategic Intent

### What The Hive Should Do
| Domain | Purpose |
|--------|---------|
| **Identity Resolution** | Map ticker/name/alias → ISIN |
| **ETF Compositions** | Store what's inside each ETF (X-Ray) |
| **Community Contributions** | Crowdsourced data with trust scoring |

### Architecture Decision: Normalized Relational Schema
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     assets      │ ←── │    listings     │     │   etf_holdings  │
│   (ISIN=PK)     │     │(ticker+exchange)│     │ (etf+holding)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         ▲                                               │
         │                                               │
         └───────────────────────────────────────────────┘
                    (FK: holding_isin → assets.isin)
```

### RLS Fix Strategy (SECURITY DEFINER)
The Hive data exists (~1,100 assets, ~2,000 listings) but **Row Level Security (RLS) was blocking anonymous reads**. The fix: `SECURITY DEFINER` RPC functions.

---

## 3. Pipeline Architecture

### Decoupled Design (as of 2025-12-25)

```
User clicks "Sync"                    User clicks "Run Analysis"
        │                                        │
        ▼                                        ▼
┌─────────────────┐                    ┌─────────────────┐
│ sync_portfolio  │                    │  run_pipeline   │
│  (~5 seconds)   │                    │ (~30-60 secs)   │
├─────────────────┤                    ├─────────────────┤
│ Fetch from TR   │                    │ 1. Decompose    │
│ Save to SQLite  │                    │ 2. Enrich       │
│ Done!           │                    │ 3. Aggregate    │
└─────────────────┘                    │ 4. Report       │
                                       └─────────────────┘
```

**Why Decoupled?**
- Users wanted fast sync without waiting for full analysis
- Pipeline can now be triggered on-demand

### Pipeline Phases
1. **Loading** - Read positions from SQLite
2. **Decomposition** - Fetch ETF holdings, resolve ISINs
3. **Enrichment** - Add sector/geography metadata
4. **Aggregation** - Calculate true exposure
5. **Reporting** - Write CSV reports

---

## 4. Key Configuration Flags

| Flag | Current Value | Purpose |
|------|---------------|---------|
| `USE_LEGACY_CSV` | `False` | Use Hive + LocalCache instead of deprecated CSV |
| `tier1_threshold` | `0.5` | Only API-resolve holdings > 0.5% weight |

---

## 5. Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW OVERVIEW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Trade Republic ──► sync_portfolio ──► SQLite (prism.db)                │
│                                              │                          │
│                                              ▼                          │
│  Pipeline:                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Decomposer: ETFs → Holdings (via Adapters)                    │  │
│  │ 2. ISINResolver: Ticker → ISIN (LocalCache → Hive → APIs)        │  │
│  │ 3. Enricher: ISIN → Sector/Geography (HiveEnrichmentService)     │  │
│  │ 4. Aggregator: Calculate true exposure %                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                              │                          │
│                                              ▼                          │
│  Reports (CSV files):                                                   │
│  - TRUE_EXPOSURE_REPORT                                                 │
│  - HOLDINGS_BREAKDOWN_PATH                                              │
│  - PIPELINE_HEALTH_PATH (JSON)                                          │
│                                              │                          │
│                                              ▼                          │
│  UI (React):                                                            │
│  - Dashboard reads from IPC handlers                                    │
│  - XRayView reads pipeline health report                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Documentation Inventory

| Category | Key Files |
|----------|-----------|
| **Mission** | `keystone/project/mission.md` |
| **Hive Architecture** | `keystone/strategy/HIVE_ARCHITECTURE_STRATEGY.md`, `HIVE_EXTENSION_STRATEGY.md` |
| **Hive Schema** | `keystone/architecture/HIVE_DATABASE_SCHEMA.md` |
| **Pipeline Design** | `keystone/specs/pipeline_triggering.md`, `ipc_api.md` |
| **Implementation Plans** | `keystone/plans/HIVE_PHASE_0_PLAN.md` through `HIVE_PHASE_5_PLAN.md` |
| **Product Requirements** | `conductor/product.md` |

---

## 7. Initial Observations

### Potential Issues Identified (Require Deeper Analysis)

1. **Hive Sync RPC Functions**: The code references `get_all_assets_rpc`, `get_all_listings_rpc`, `get_all_aliases_rpc` but I don't see these defined in the functions.sql - only the resolve functions.

2. **ETF Holdings from Hive**: `etf_holdings` table exists but I don't see RPC functions to fetch them with SECURITY DEFINER.

3. **LocalCache Sync**: The sync relies on RPC functions that may not exist, potentially causing silent failures.

4. **UI Data Source**: Dashboard reads from SQLite positions, but X-Ray reads from CSV files generated by pipeline. If pipeline fails, X-Ray shows stale/no data.

5. **Circular Dependency Risk**: The Decomposer needs ISINResolver, which needs HiveClient, which needs network access. Complex failure modes.

---

## Next Steps

→ **Phase 2**: Deep-dive into actual implementation code to verify:
- Are the required RPC functions actually deployed?
- Is LocalCache successfully syncing from Hive?
- Where exactly does the pipeline break?
- What does the UI show when pipeline fails?

