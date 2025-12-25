# Pipeline Triggering Specification

**Status:** Implemented  
**Last Updated:** 2025-12-25  
**Related:** `ipc_api.md`, `HIVE_EXTENSION_STRATEGY.md`

---

## Overview

The analytics pipeline (X-Ray decomposition, enrichment, aggregation) is **decoupled** from portfolio sync. This document explains when and how the pipeline is triggered.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DECOUPLED ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────┐         ┌─────────────────┐               │
│   │  sync_portfolio │         │   run_pipeline  │               │
│   │   (TR Sync)     │         │   (X-Ray)       │               │
│   └────────┬────────┘         └────────┬────────┘               │
│            │                           │                        │
│            ▼                           ▼                        │
│   ┌─────────────────┐         ┌─────────────────┐               │
│   │ Fetch positions │         │ Decompose ETFs  │               │
│   │ from Trade Rep. │         │ Enrich holdings │               │
│   │ Save to SQLite  │         │ Aggregate data  │               │
│   └─────────────────┘         └─────────────────┘               │
│                                                                 │
│   FAST (~5 seconds)           SLOW (~30-60 seconds)             │
│   User can sync often         User triggers when needed         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Commands

### `sync_portfolio`

**Purpose:** Fetch latest positions from Trade Republic and save to local database.

**Triggers Pipeline:** ❌ NO (as of 2025-12-25)

**Use Case:** User wants to update their holdings without waiting for full analysis.

**Duration:** ~5 seconds

### `run_pipeline`

**Purpose:** Run X-Ray decomposition, enrichment, and aggregation.

**Triggers Pipeline:** ✅ YES (this IS the pipeline)

**Use Case:** User wants to see updated sector/region exposure after sync.

**Duration:** ~30-60 seconds (depends on number of ETFs and cache state)

---

## UI Integration

### Recommended Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. User clicks "Sync" button                                  │
│      └─► Calls sync_portfolio                                   │
│      └─► Shows "Synced 15 positions" toast                      │
│      └─► Updates holdings table immediately                     │
│                                                                 │
│   2. User navigates to X-Ray view                               │
│      └─► Check if pipeline results are stale                    │
│      └─► If stale: Show "Run Analysis" button                   │
│      └─► If fresh: Show cached results                          │
│                                                                 │
│   3. User clicks "Run Analysis" button                          │
│      └─► Calls run_pipeline                                     │
│      └─► Shows progress bar (0-100%)                            │
│      └─► Updates X-Ray charts when complete                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Staleness Detection

Pipeline results are considered **stale** when:
- Last sync timestamp > last pipeline timestamp
- User has added/removed positions since last pipeline run
- More than 24 hours since last pipeline run (optional)

---

## Why Decoupled?

### Problem (Before)

```
User clicks Sync
    └─► Fetches positions (5s)
    └─► Auto-triggers pipeline (60s)  ← BLOCKING
    └─► User waits 65 seconds total
    └─► User just wanted to check if sync worked
```

### Solution (After)

```
User clicks Sync
    └─► Fetches positions (5s)
    └─► Done! User sees updated holdings immediately

User clicks "Run Analysis" (when they want it)
    └─► Runs pipeline (60s)
    └─► User chose to wait for this
```

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Sync duration | 65+ seconds | 5 seconds |
| User control | None | Full |
| Perceived speed | Slow | Fast |
| Resource usage | Always high | On-demand |

---

## Implementation Details

### Handler: `handle_sync_portfolio`

**File:** `src-tauri/python/portfolio_src/headless/handlers/sync.py`

```python
async def handle_sync_portfolio(cmd_id: int, payload: dict) -> dict:
    # ... fetch from TR, save to DB ...
    
    emit_progress(100, "Sync complete!", "sync")
    
    # Pipeline decoupled - triggered separately via run_pipeline command
    # This allows users to sync without running expensive analysis
    
    return {"status": "success", "data": {...}}
```

### Handler: `handle_run_pipeline`

**File:** `src-tauri/python/portfolio_src/headless/handlers/sync.py`

```python
async def handle_run_pipeline(cmd_id: int, payload: dict) -> dict:
    emit_progress(0, "Starting Deep Analysis...", "pipeline")
    
    pipeline = Pipeline()
    result = pipeline.run()
    
    emit_progress(100, "Analysis complete!", "pipeline")
    
    return {"status": "success", "data": {...}}
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-25 | Decouple sync from pipeline | Users wanted fast sync without waiting for analysis |
| 2025-12-25 | Separate IPC commands | Clean separation of concerns, independent triggering |
| 2025-12-25 | UI shows "Run Analysis" button | Explicit user control over expensive operations |

---

## Related Files

| File | Purpose |
|------|---------|
| `headless/handlers/sync.py` | Sync and pipeline handlers |
| `core/pipeline.py` | Pipeline orchestrator |
| `ipc_api.md` | IPC command specifications |
| `HIVE_EXTENSION_STRATEGY.md` | Phase 5 implementation details |
