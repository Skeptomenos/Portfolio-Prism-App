# TASK-303: System Status Component Implementation Plan

> **Status:** In Progress
> **Branch:** `feat/system-status-component`
> **Dependencies:** TASK-302 (Done)
> **Last Updated:** 2024-12-15

## Objective

Create a dedicated React component that displays the engine connection status and provides a sync button. This component will be the first "real" UI element that uses the IPC bridge established in TASK-302.

---

## Current State Analysis

### What Already Exists

1. **Zustand Store** (`src/store/useAppStore.ts`)
   - `engineStatus`: 'idle' | 'connecting' | 'processing' | 'error' | 'disconnected'
   - `syncProgress`: { status, progress, message }
   - `lastSyncTime`: Date | null
   - Actions: `startSync()`, `completeSync()`, `failSync()`

2. **Sidebar** (`src/components/Sidebar.tsx`)
   - Already has a basic status footer showing engine status
   - Uses `getStatusDisplay()` for color/label mapping
   - Shows "Last updated: X ago"

3. **IPC Layer** (`src/lib/ipc.ts`)
   - `getEngineHealth()` - returns version, memory usage
   - `syncPortfolio()` - triggers sync with progress events

4. **Query Hooks** (`src/hooks/usePortfolioData.ts`)
   - `useSyncPortfolio()` - mutation hook that calls `syncPortfolio()`

### Gap Analysis

The Sidebar already has basic status display, but it lacks:
1. **Sync Button** - No way to trigger a sync from the UI
2. **Engine Health Details** - Version, memory not shown
3. **Progress Indicator** - No visual progress bar during sync
4. **Reusable Component** - Status logic is embedded in Sidebar

---

## Implementation Plan

### Step 1: Create SystemStatus Component

**What:** Create a new `src/components/SystemStatus.tsx` component

**Changes:**
- New file: `src/components/SystemStatus.tsx`
- Extracts status display logic from Sidebar
- Adds sync button with loading state
- Shows sync progress bar when syncing
- Shows engine health on hover/expand

**Breaks:** Nothing - additive change

**Validation:**
- Component renders without errors
- Shows correct status colors
- Button triggers sync mutation

---

### Step 2: Integrate into Sidebar

**What:** Replace inline status footer in Sidebar with SystemStatus component

**Changes:**
- Modify: `src/components/Sidebar.tsx`
- Remove inline status footer (lines ~131-157)
- Import and use `<SystemStatus />`

**Breaks:** Nothing - same visual, better structure

**Validation:**
- Sidebar renders with SystemStatus
- Visual appearance unchanged
- Functionality preserved

---

### Step 3: Add Engine Health Query

**What:** Create a query hook for engine health data

**Changes:**
- Modify: `src/hooks/usePortfolioData.ts`
- Add `useEngineHealth()` query hook
- Uses `getEngineHealth()` from IPC layer

**Breaks:** Nothing - additive change

**Validation:**
- Hook returns health data in Tauri
- Returns mock data in browser

---

### Step 4: Enhance SystemStatus with Health Details

**What:** Show engine version and memory usage in expanded state

**Changes:**
- Modify: `src/components/SystemStatus.tsx`
- Add expandable details section
- Show version, memory on click

**Breaks:** Nothing - additive UI

**Validation:**
- Click expands details
- Shows version: 0.1.0
- Shows memory usage

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/SystemStatus.tsx` | Create | New status component |
| `src/components/Sidebar.tsx` | Modify | Use SystemStatus component |
| `src/hooks/usePortfolioData.ts` | Modify | Add useEngineHealth hook |

---

## Visual Design

### Collapsed State (Default)
```
┌─────────────────────────────┐
│ ● Connected                 │
│   Last sync: 5m ago    [↻]  │
└─────────────────────────────┘
```

### Syncing State
```
┌─────────────────────────────┐
│ ● Syncing...                │
│   Fetching prices...        │
│   ████████░░░░░░░░ 45%      │
└─────────────────────────────┘
```

### Expanded State (Click)
```
┌─────────────────────────────┐
│ ● Connected            [▼]  │
│   Last sync: 5m ago    [↻]  │
├─────────────────────────────┤
│   Version: 0.1.0            │
│   Memory: 45.2 MB           │
└─────────────────────────────┘
```

---

## Testing Strategy

1. **Browser Mode** (`npm run dev`)
   - Verify mock data displays
   - Click sync button, see loading state
   - Check console for mock IPC logs

2. **Tauri Mode** (`npm run tauri dev`)
   - Verify real IPC commands work
   - Sync button triggers Rust command
   - Status updates from events

---

## Rollback Plan

If issues arise:
1. Revert Sidebar changes to restore inline status
2. Delete SystemStatus.tsx
3. Revert usePortfolioData.ts hook changes

All changes are isolated and reversible.
