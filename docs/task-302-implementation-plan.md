# TASK-302 Implementation Plan: IPC Bridge

> **Branch:** `feat/ipc-bridge`
> **Created:** 2024-12-15
> **Purpose:** Connect React frontend to Rust backend via Tauri's invoke/listen APIs

---

## Overview

The IPC Bridge enables bidirectional communication between React and Rust/Python:

```
┌─────────────┐     invoke()      ┌─────────────┐     stdin/stdout    ┌─────────────┐
│   React     │ ───────────────► │    Rust     │ ──────────────────► │   Python    │
│  Frontend   │ ◄─────────────── │   (Tauri)   │ ◄────────────────── │   Engine    │
└─────────────┘     listen()      └─────────────┘                     └─────────────┘
```

**Estimated Time:** 1-1.5 hours

---

## Current State

### Rust Side (`lib.rs`)
- Has `greet` command (placeholder)
- Spawns Python sidecar
- Emits `python-ready` event
- Does NOT have: `get_dashboard_data`, `sync_portfolio`, `get_health` commands

### React Side
- Has mock data fetching in `usePortfolioData.ts`
- Has `@tauri-apps/api` dependency
- Does NOT have: Real `invoke()` calls, `listen()` for events

---

## Implementation Strategy

### Phase A: React IPC Layer (TypeScript)
Create a clean abstraction layer that:
1. Wraps Tauri's `invoke()` and `listen()`
2. Provides typed interfaces matching `ipc_api.md`
3. Falls back to mock data when Tauri is unavailable (for browser dev)

### Phase B: Rust Commands (Stub Implementation)
Add Rust commands that:
1. Return mock data (same shape as Python will return)
2. Emit events to the frontend
3. Ready to connect to Python sidecar later (TASK-201/202)

### Phase C: Event Listeners
Wire up React to:
1. Listen for `engine-status` events
2. Update Zustand store on events
3. Invalidate TanStack Query cache on `portfolio-updated`

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tauri.ts` | Create | Tauri API wrapper with type safety |
| `src/lib/ipc.ts` | Create | IPC commands (invoke wrappers) |
| `src/hooks/useTauriEvents.ts` | Create | Event listener hooks |
| `src/hooks/usePortfolioData.ts` | Modify | Use real IPC instead of mock |
| `src/App.tsx` | Modify | Initialize event listeners |
| `src-tauri/src/lib.rs` | Modify | Add Rust commands |
| `src-tauri/src/commands.rs` | Create | Separate module for commands |

---

## Implementation Steps

### Step 1: Create Tauri API Wrapper
- Detect if running in Tauri vs browser
- Provide `invoke` and `listen` wrappers with fallbacks
- Export typed command functions

### Step 2: Create IPC Commands Module
- `getEngineHealth()` - Get Python engine status
- `getDashboardData(portfolioId)` - Get dashboard metrics
- `syncPortfolio(force)` - Trigger sync
- Each returns typed Promise

### Step 3: Create Event Listener Hooks
- `useTauriEvents()` - Set up all event listeners
- Update Zustand store on `engine-status`
- Invalidate queries on `portfolio-updated`

### Step 4: Add Rust Commands (Stubs)
- `get_engine_health` - Return mock health data
- `get_dashboard_data` - Return mock dashboard
- `sync_portfolio` - Emit progress events, return success

### Step 5: Update Query Hooks
- Replace mock fetch functions with IPC calls
- Keep mock fallback for browser development

### Step 6: Wire Up Event Listeners
- Initialize listeners in App.tsx
- Connect to Zustand store actions

### Step 7: Test End-to-End
- Verify `npm run tauri dev` works
- Verify commands return data
- Verify events update UI

---

## Type Definitions

### IPC Commands (React → Rust)
```typescript
// Commands the frontend can invoke
interface IPCCommands {
  get_engine_health: () => Promise<EngineHealth>;
  get_dashboard_data: (portfolioId: number) => Promise<DashboardData>;
  sync_portfolio: (force: boolean) => Promise<SyncResult>;
}
```

### IPC Events (Rust → React)
```typescript
// Events the frontend listens for
interface IPCEvents {
  'engine-status': EngineStatusEvent;
  'portfolio-updated': PortfolioUpdatedEvent;
  'sync-progress': SyncProgress;
}
```

---

## Mock vs Real Data Strategy

```typescript
// In production (Tauri), use real IPC
if (isTauri()) {
  return await invoke('get_dashboard_data', { portfolioId });
}

// In development (browser), use mock data
return await mockGetDashboardData(portfolioId);
```

This allows:
1. Browser development without Tauri
2. Easy testing with predictable mock data
3. Seamless transition to real data

---

## Rust Command Structure

```rust
// src-tauri/src/commands.rs

#[tauri::command]
async fn get_engine_health() -> Result<EngineHealth, String> {
    // For now, return mock data
    // Later: Query Python sidecar via stdin/stdout
    Ok(EngineHealth {
        version: "0.1.0".into(),
        memory_usage_mb: 45.2,
        status: "idle".into(),
    })
}

#[tauri::command]
async fn get_dashboard_data(portfolio_id: u32) -> Result<DashboardData, String> {
    // For now, return mock data
    // Later: Read from SQLite/Parquet via Python
    Ok(MOCK_DASHBOARD_DATA)
}
```

---

## Validation Checklist

After implementation:

- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] `npm run dev` works (browser with mock data)
- [ ] `npm run tauri dev` works (Tauri with Rust commands)
- [ ] Sidebar shows engine status from Rust
- [ ] Dashboard displays data from Rust commands
- [ ] Console shows event logs when status changes
- [ ] No errors in Rust compilation

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tauri not available in browser | `isTauri()` check with mock fallback |
| Type mismatch React/Rust | Shared type definitions, JSON serialization |
| Event listener memory leak | Cleanup with `unlisten()` in useEffect |
| Rust compilation errors | Incremental changes, test after each step |

---

## Future Integration (TASK-201/202)

When Python headless engine is ready:

1. Replace mock data in Rust with actual Python calls
2. Rust sends commands to Python via stdin
3. Rust receives responses from Python via stdout
4. Rust forwards to React via events/responses

The React side won't need changes - the IPC contract is stable.
