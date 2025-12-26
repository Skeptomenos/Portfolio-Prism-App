# Pipeline Transparency & Visibility Plan

> **Workstream:** `frontend`
> **Created:** 2025-12-25
> **Status:** Planning
> **Priority:** High

---

## Problem Statement

The X-Ray tab shows a static progress display (0%, "Initializing pipeline...") even when the pipeline is actively running. Users have no visibility into:
- What the pipeline is currently doing
- How many holdings were found
- How many ETFs are being decomposed
- Which ISINs failed to resolve
- Why certain data might be missing

This creates a "black box" experience that undermines user trust and makes troubleshooting difficult.

---

## Root Cause Analysis

### Bug: SSE Events Not Reaching Frontend

The `broadcast_progress()` function in `echo_bridge.py` fails silently when called from the executor thread:

```python
# Current broken code (lines 83-92)
try:
    loop = asyncio.get_running_loop()  # Fails - no loop in executor thread
    loop.call_soon_threadsafe(_broadcast_sync, event_data)
except RuntimeError:
    try:
        loop = asyncio.get_event_loop()  # May return wrong loop
        if loop.is_running():
            loop.call_soon_threadsafe(_broadcast_sync, event_data)
    except RuntimeError:
        pass  # SILENT FAILURE - all events dropped
```

**Impact:** The SSE infrastructure exists and works, but events are never broadcast because the pipeline runs in `loop.run_in_executor()`.

### Gap: Rich Data Exists But Isn't Exposed

The backend already collects detailed statistics:
- `Decomposer.get_resolution_stats()` - resolution breakdown by source
- `ISINResolver.stats` - total/resolved/unresolved/skipped counts
- `PipelineMonitor` - phase timings and hive hit rates
- `pipeline_health.json` - comprehensive post-run report

None of this data is streamed to the frontend during execution.

---

## Implementation Phases

### Phase 1: Fix SSE Broadcast (Critical Bug)

**Goal:** Make existing progress events actually reach the frontend.

| Task ID | Description | Effort | Risk |
|---------|-------------|--------|------|
| **XRAY-001** | Store main event loop reference at FastAPI startup | 30 min | Low |
| **XRAY-002** | Update `broadcast_progress()` to use stored loop reference | 30 min | Low |
| **XRAY-003** | Add fallback logging when broadcast fails | 15 min | Low |
| **XRAY-004** | Verify SSE events flow end-to-end | 30 min | Low |

**Technical Approach:**
```python
# In echo_bridge.py
_main_loop: Optional[asyncio.AbstractEventLoop] = None
_last_broadcast_time: float = 0
_MIN_BROADCAST_INTERVAL: float = 0.1  # 100ms debounce

def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop

def broadcast_progress(progress: int, message: str, phase: str = "pipeline") -> None:
    global _last_broadcast_time
    
    if _main_loop is None:
        logger.warning("SSE broadcast: main loop not set")
        return
    
    # Rate limiting: skip if <100ms since last broadcast (unless phase change or 100%)
    now = time.time()
    is_important = phase != _last_phase or progress == 100
    if not is_important and (now - _last_broadcast_time) < _MIN_BROADCAST_INTERVAL:
        return  # Debounce non-critical updates
    
    _last_broadcast_time = now
    event_data = {"type": "progress", "progress": progress, "message": message, "phase": phase}
    _main_loop.call_soon_threadsafe(_broadcast_sync, event_data)
```

**Risk Mitigation (Rate Limiting):**
- Debounce progress events to max 10/second (100ms interval)
- Always emit phase changes and 100% completion immediately
- Prevents frontend jitter when decomposing many ETFs quickly

---

### Phase 2: Enrich Progress Messages

**Goal:** Make progress messages more informative without changing data structures.

| Task ID | Description | Effort | Risk |
|---------|-------------|--------|------|
| **XRAY-005** | Add holdings count to loading phase message | 30 min | Low |
| **XRAY-006** | Add per-ETF progress during decomposition | 1 hour | Low |
| **XRAY-007** | Add resolution summary after decomposition | 30 min | Low |
| **XRAY-008** | Add enrichment source breakdown | 30 min | Low |
| **XRAY-009** | Add unique securities count in aggregation | 15 min | Low |

**Message Examples:**
```
Current:  "Loading portfolio..."
Enhanced: "Found 12 holdings (5 stocks, 7 ETFs) worth €47,234"

Current:  "Decomposing 7 ETFs..."
Enhanced: "Decomposing ETF 3/7: iShares Core MSCI World (847 holdings)"

Current:  "Enriching 1349 holdings..."
Enhanced: "Resolved 1,234/1,349 ISINs (91.5%) - 890 from Hive, 234 from API"
```

---

### Phase 3: Add Pipeline Summary Event

**Goal:** Send a rich summary at pipeline completion for detailed UI display.

| Task ID | Description | Effort | Risk |
|---------|-------------|--------|------|
| **XRAY-010** | Define `pipeline_summary` SSE event schema | 30 min | Low |
| **XRAY-011** | Collect resolution stats from Decomposer | 30 min | Low |
| **XRAY-012** | Collect unresolved ISINs list | 1 hour | Medium |
| **XRAY-013** | Emit summary event at pipeline completion | 30 min | Low |
| **XRAY-014** | Update `usePipelineProgress` hook to handle summary | 1 hour | Low |

**Event Schema:**
```typescript
interface PipelineSummaryEvent {
  type: 'pipeline_summary';
  data: {
    holdings: {
      stocks: number;
      etfs: number;
      total_value: number;
    };
    decomposition: {
      etfs_processed: number;
      etfs_failed: number;
      total_underlying: number;
      per_etf: Array<{
        isin: string;
        name: string;
        holdings_count: number;
        status: 'success' | 'failed' | 'partial';
      }>;
    };
    resolution: {
      total: number;
      resolved: number;
      unresolved: number;
      skipped_tier2: number;
      by_source: Record<string, number>;
    };
    timing: {
      total_seconds: number;
      phases: Record<string, number>;  // Keys: "loading", "decomposition", "enrichment", "aggregation"
    };
    // IMPORTANT: Only Tier 1 failures (actionable items), NOT tier2_skipped
    // Truncated to max 100 items to prevent payload bloat
    unresolved: Array<{
      ticker: string;
      name: string;
      weight: number;
      parent_etf: string;
      reason: string;  // "api_all_failed" | "no_ticker" | "invalid_isin"
    }>;
    unresolved_truncated: boolean;  // true if >100 failures exist
    unresolved_total: number;       // actual count before truncation
  };
}
```

**Risk Mitigation (Payload Size):**
- `unresolved` array capped at 100 items max
- `unresolved_truncated` flag indicates if list was cut
- `unresolved_total` provides actual count for UI display ("and 423 more...")
- Tier 2 skips are NOT included in `unresolved` (they're in `skipped_tier2` count only)

**Type Safety Contract:**
- Python backend MUST use `TypedDict` or Pydantic model matching this interface
- Phase keys are lowercase: `"loading"`, `"decomposition"`, `"enrichment"`, `"aggregation"`
- Create shared constants file if needed to prevent key mismatches

---

### Phase 4: Frontend UI Enhancements

> **Detailed Spec:** `keystone/plans/PIPELINE_TRANSPARENCY_PHASE4_UI.md`

**Goal:** Display the rich data in the X-Ray view.

| Task ID | Description | Effort | Risk | Delegate |
|---------|-------------|--------|------|----------|
| **XRAY-015** | Add summary state to `usePipelineProgress` hook | 1 hour | Low | No |
| **XRAY-016** | Create `PipelineSummaryCard` component | 3 hours | Medium | Yes (frontend-ui-ux-engineer) |
| **XRAY-017** | Add resolution success rate badge | 1 hour | Low | Yes |
| **XRAY-018** | Create collapsible unresolved ISINs list | 2 hours | Medium | Yes |
| **XRAY-019** | Add phase timing breakdown display | 1 hour | Low | Yes |
| **XRAY-020** | Integrate summary card into XRayView | 1 hour | Low | No |

See `PIPELINE_TRANSPARENCY_PHASE4_UI.md` for:
- Component specifications and props interfaces
- Layout mockups and responsive breakpoints
- Color logic and design tokens
- Accessibility requirements
- Delegation instructions for frontend-ui-ux-engineer

---

### Phase 5: Testing & Polish

| Task ID | Description | Effort | Risk |
|---------|-------------|--------|------|
| **XRAY-021** | Unit tests for SSE broadcast fix | 1 hour | Low |
| **XRAY-022** | Integration test: progress events flow | 1 hour | Low |
| **XRAY-023** | Test with large portfolio (1000+ holdings) | 30 min | Low |
| **XRAY-024** | Test reconnection during pipeline run | 30 min | Low |
| **XRAY-025** | Update `pipeline-progress-ux` workstream docs | 30 min | Low |

---

## Task Dependencies

```
Phase 1 (Bug Fix):
  XRAY-001 → XRAY-002 → XRAY-003 → XRAY-004

Phase 2 (Messages):
  XRAY-004 → XRAY-005, XRAY-006, XRAY-007, XRAY-008, XRAY-009 (parallel)

Phase 3 (Summary Event):
  XRAY-004 → XRAY-010 → XRAY-011 → XRAY-012 → XRAY-013 → XRAY-014

Phase 4 (UI):
  XRAY-014 → XRAY-015 → XRAY-016, XRAY-017, XRAY-018, XRAY-019 (parallel) → XRAY-020

Phase 5 (Testing):
  XRAY-020 → XRAY-021, XRAY-022, XRAY-023, XRAY-024 (parallel) → XRAY-025
```

---

## Effort Summary

| Phase | Tasks | Effort | Risk | Confidence |
|-------|-------|--------|------|------------|
| Phase 1: Bug Fix | 4 | 2 hours | Low | 95% |
| Phase 2: Messages | 5 | 3 hours | Low | 90% |
| Phase 3: Summary | 5 | 4 hours | Medium | 85% |
| Phase 4: UI | 6 | 9 hours | Medium | 80% |
| Phase 5: Testing | 5 | 4 hours | Low | 90% |
| **Total** | **25** | **22 hours** | **Medium** | **85%** |

---

## Risk Mitigations

| Risk | Description | Mitigation | Task |
|------|-------------|------------|------|
| **A: Event Flooding** | Per-ETF progress could burst 50+ events in <1s | 100ms debounce in `broadcast_progress()`, always emit phase changes | XRAY-002 |
| **B: Tier 2 Noise** | Skipped items clutter actionable failures list | Exclude `tier2_skipped` from unresolved list, show as separate info | XRAY-012, XRAY-018 |
| **C: Payload Size** | 1000+ failures could crash renderer | Truncate to 100 items, add `unresolved_truncated` flag | XRAY-012 |
| **D: Type Mismatch** | Python/TS interface drift | Use TypedDict in Python, lowercase phase keys | XRAY-010 |

---

## Success Criteria

1. **Progress events stream in real-time** - User sees percentage update as pipeline runs
2. **Informative messages** - User knows exactly what's happening at each phase
3. **Summary visible after completion** - User can see resolution stats and failures
4. **Unresolved ISINs accessible** - User can identify which securities need manual attention
5. **No regressions** - Existing Tauri mode (stdout) continues to work

---

## Files to Modify

### Backend (Python)
- `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py` - Fix broadcast
- `src-tauri/python/portfolio_src/headless/handlers/sync.py` - Enhanced messages
- `src-tauri/python/portfolio_src/core/pipeline.py` - Collect and emit summary
- `src-tauri/python/portfolio_src/core/services/decomposer.py` - Expose stats

### Frontend (TypeScript)
- `src/hooks/usePipelineProgress.ts` - Handle summary event
- `src/components/common/PipelineProgressCard.tsx` - Enhanced display
- `src/components/common/PipelineSummaryCard.tsx` - New component
- `src/components/views/XRayView.tsx` - Integration

### Tests
- `src-tauri/python/tests/headless/test_sse_progress.py` - New tests

---

## Out of Scope (Future Enhancements)

- Historical pipeline runs (requires SQLite schema changes)
- ETF decomposition tree view (complex UI)
- Tauri native event integration (separate workstream)
- WebSocket upgrade (not needed for current use case)
