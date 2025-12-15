# TASK-301 Implementation Plan: Frontend State Setup

> **Branch:** `feat/react-foundation`
> **Created:** 2024-12-15
> **Purpose:** Add Zustand for global state and TanStack Query for async data fetching

---

## Overview

| Component | Purpose | Package |
|-----------|---------|---------|
| **Zustand** | Lightweight global state (UI state, engine status) | `zustand` |
| **TanStack Query** | Async data fetching, caching, invalidation | `@tanstack/react-query` |
| **DevTools** | Development debugging | `@tanstack/react-query-devtools` |

**Estimated Time:** 45 minutes

---

## Why This Architecture?

### Zustand vs Redux/Context
- **Minimal boilerplate** - No providers needed for basic use
- **TypeScript-first** - Excellent type inference
- **Selective subscriptions** - Components only re-render on used state changes
- **Tiny bundle** - ~1KB gzipped

### TanStack Query vs useEffect
- **Automatic caching** - No manual cache management
- **Background refetching** - Stale-while-revalidate pattern
- **Cache invalidation** - Trigger refetch on events (e.g., `portfolio-updated`)
- **Loading/error states** - Built-in state machine

---

## State Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │  useAppStore    │         │  TanStack Query Cache   │   │
│  │  (Zustand)      │         │                         │   │
│  ├─────────────────┤         ├─────────────────────────┤   │
│  │ • currentView   │         │ • dashboardData         │   │
│  │ • engineStatus  │         │ • holdingsData          │   │
│  │ • syncProgress  │         │ • xrayData              │   │
│  │ • lastSyncTime  │         │ • overlapData           │   │
│  │ • notifications │         │                         │   │
│  └─────────────────┘         └─────────────────────────┘   │
│         ▲                              ▲                    │
│         │                              │                    │
│    Sync State                    Async Data                 │
│    (Immediate)                   (Cached)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What Goes Where?

| State Type | Location | Examples |
|------------|----------|----------|
| **UI State** | Zustand | Current view, sidebar open, modal state |
| **Engine State** | Zustand | Connection status, sync progress, errors |
| **Portfolio Data** | TanStack Query | Dashboard metrics, holdings, charts |
| **User Preferences** | Zustand (persisted) | Theme, last portfolio ID |

---

## Implementation Steps

### Step 1: Install Dependencies
```bash
npm install zustand @tanstack/react-query @tanstack/react-query-devtools
```

### Step 2: Create Directory Structure
```
src/
├── lib/
│   └── queryClient.ts      # TanStack Query configuration
├── store/
│   └── useAppStore.ts      # Zustand global store
├── hooks/
│   └── usePortfolioData.ts # Custom query hooks
└── types/
    └── index.ts            # Shared TypeScript types
```

### Step 3: Create Type Definitions
Based on `ipc_api.md`, define:
- `EngineStatus`: 'idle' | 'connecting' | 'processing' | 'error'
- `SyncProgress`: { status, progress, message }
- `DashboardData`: Portfolio metrics
- `ViewType`: Navigation views

### Step 4: Create Zustand Store
```typescript
// useAppStore.ts
interface AppState {
  // Navigation
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  
  // Engine Status
  engineStatus: EngineStatus;
  syncProgress: SyncProgress | null;
  lastSyncTime: Date | null;
  
  // Actions
  setEngineStatus: (status: EngineStatus) => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
}
```

### Step 5: Create Query Client
```typescript
// queryClient.ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutes
      gcTime: 30 * 60 * 1000,        // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,   // Desktop app, not browser
      retry: 1,
    },
  },
});
```

### Step 6: Create Query Hooks
```typescript
// usePortfolioData.ts
export function useDashboardData(portfolioId: number) {
  return useQuery({
    queryKey: ['dashboard', portfolioId],
    queryFn: () => getDashboardData(portfolioId), // Will be IPC call
  });
}
```

### Step 7: Update App.tsx
- Wrap with `QueryClientProvider`
- Migrate `currentView` state to Zustand
- Add DevTools (dev only)

### Step 8: Update Sidebar
- Use Zustand store instead of props
- Remove prop drilling

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add dependencies |
| `src/types/index.ts` | Create | Shared type definitions |
| `src/lib/queryClient.ts` | Create | Query client config |
| `src/store/useAppStore.ts` | Create | Zustand store |
| `src/hooks/usePortfolioData.ts` | Create | Query hooks with mock data |
| `src/App.tsx` | Modify | Add providers, use store |
| `src/components/Sidebar.tsx` | Modify | Use store instead of props |
| `src/main.tsx` | Modify | Add QueryClientProvider at root |

---

## Mock Data Strategy

Since the Rust IPC bridge isn't ready yet (TASK-302), we'll create mock implementations:

```typescript
// Mock IPC functions (to be replaced with real Tauri invoke calls)
async function getDashboardData(portfolioId: number): Promise<DashboardData> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return MOCK_DASHBOARD_DATA;
}
```

This allows us to:
1. Build and test the UI now
2. Swap in real IPC calls later without changing component code
3. Validate loading/error state handling

---

## Validation Checklist

After implementation:

- [ ] `npm run build` succeeds
- [ ] `npm run dev` starts without errors
- [ ] DevTools visible in development (bottom-right corner)
- [ ] View navigation works (click sidebar items)
- [ ] Console shows Zustand state changes (if debug enabled)
- [ ] No TypeScript errors in IDE
- [ ] Components re-render correctly on state changes

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Bundle size increase | Zustand is ~1KB, TanStack Query ~12KB - acceptable |
| Over-engineering | Keep store minimal; add state as needed |
| Mock data drift | Types shared between mock and real implementation |
| Provider nesting | QueryClientProvider only; Zustand needs no provider |

---

## Future Integration Points

When TASK-302 (IPC Bridge) is complete:

1. Replace mock functions with `invoke()` calls
2. Add `listen()` for Tauri events
3. Invalidate queries on `portfolio-updated` event:
   ```typescript
   listen('portfolio-updated', () => {
     queryClient.invalidateQueries({ queryKey: ['dashboard'] });
   });
   ```
