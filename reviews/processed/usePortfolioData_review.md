# Code Review: src/hooks/usePortfolioData.ts

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**File**: `src/hooks/usePortfolioData.ts`  
**Lines**: 99  

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 2 |
| Info | 1 |

**Verdict**: PASSED (0 critical, 0 high)

---

## Findings

---

## [MEDIUM] useXRayData Ignores portfolioId Parameter

> The hook accepts portfolioId but doesn't use it, calling getTrueHoldings() without parameters

**File**: `src/hooks/usePortfolioData.ts:60-65`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `useXRayData` hook signature accepts a `portfolioId` parameter, but the underlying `getTrueHoldings()` IPC call ignores it. This creates a misleading API where:
1. Callers expect per-portfolio X-Ray data isolation
2. The query key includes `portfolioId` suggesting proper caching
3. But all portfolios share the same underlying data

This may be intentional if X-Ray is a global feature, but the API contract is confusing.

### Current Code

```typescript
export function useXRayData(portfolioId: number) {
  return useQuery({
    queryKey: ['xray', portfolioId],
    queryFn: getTrueHoldings,  // Ignores portfolioId!
  });
}
```

### Suggested Fix

**Option A: If X-Ray should be per-portfolio:**

```typescript
export function useXRayData(portfolioId: number) {
  return useQuery({
    queryKey: ['xray', portfolioId],
    queryFn: () => getTrueHoldings(portfolioId),
  });
}
```

**Option B: If X-Ray is intentionally global, remove misleading parameter:**

```typescript
export function useXRayData() {
  return useQuery({
    queryKey: ['xray'],
    queryFn: getTrueHoldings,
  });
}
```

### Verification

1. Check `getTrueHoldings` IPC implementation to confirm if it supports portfolioId
2. Check component usages (`XRayView.tsx`) to understand expected behavior
3. If changing signature, update all call sites

---

## [MEDIUM] useSyncPortfolio Does Not Invalidate xray Query

> After sync, dashboard and holdings are invalidated but xray cache is stale

**File**: `src/hooks/usePortfolioData.ts:87-93`  
**Category**: Correctness  
**Severity**: Medium  

### Description

When `useSyncPortfolio` succeeds, it invalidates `['dashboard']` and `['holdings']` queries but not `['xray']`. If the sync updates portfolio composition (new ETFs, changed allocations), the X-Ray view will show stale look-through data until:
- User refreshes the page
- The stale time expires (default: Infinity with no `staleTime` set)
- User navigates away and back

### Current Code

```typescript
onSuccess: () => {
  completeSync();
  // Invalidate queries to refetch fresh data
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['holdings'] });
  // Missing: queryClient.invalidateQueries({ queryKey: ['xray'] });
},
```

### Suggested Fix

```typescript
onSuccess: () => {
  completeSync();
  // Invalidate all portfolio data queries to refetch fresh data
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['holdings'] });
  queryClient.invalidateQueries({ queryKey: ['xray'] });
},
```

### Verification

1. Perform a sync that changes portfolio composition
2. Navigate to X-Ray view immediately
3. Verify data reflects new portfolio state

---

## [LOW] getHoldings Causes Redundant Dashboard Fetch

> Using both useDashboardData and useHoldingsData in same component causes duplicate IPC calls

**File**: `src/hooks/usePortfolioData.ts:50-55` (hook) and `src/lib/ipc.ts:119-127` (IPC)  
**Category**: Performance  
**Severity**: Low  

### Description

The `getHoldings()` IPC function internally calls `getDashboardData()` and extracts `topHoldings`. If a component uses both `useDashboardData` and `useHoldingsData`, TanStack Query's deduplication won't help because:
- Different query keys: `['dashboard', portfolioId]` vs `['holdings', portfolioId]`
- Both trigger separate IPC calls
- `getHoldings` calls `getDashboardData` again

The IPC layer has `deduplicatedCall` for concurrent requests, but sequential calls will still hit the backend twice.

### Current Code

```typescript
// ipc.ts
export async function getHoldings(portfolioId: number): Promise<Holding[]> {
  try {
    const dashboard = await getDashboardData(portfolioId);  // Separate call
    return dashboard.topHoldings;
  } catch (error) {
    console.error('[IPC] getHoldings failed:', error);
    throw error;
  }
}
```

### Suggested Fix

**Option A: Derive holdings from dashboard data in the hook:**

```typescript
export function useHoldingsData(portfolioId: number) {
  const dashboardQuery = useDashboardData(portfolioId);
  
  return {
    ...dashboardQuery,
    data: dashboardQuery.data?.topHoldings,
  };
}
```

**Option B: Use TanStack Query's `select` for derived data:**

```typescript
export function useHoldingsData(portfolioId: number) {
  return useQuery({
    queryKey: ['dashboard', portfolioId],
    queryFn: () => getDashboardData(portfolioId),
    select: (data) => data.topHoldings,
  });
}
```

### Verification

1. Enable network/IPC logging
2. Use both hooks in a component
3. Verify single IPC call to backend

---

## [LOW] No Enabled Flag for Hooks with Invalid portfolioId

> Hooks will fire IPC calls even with invalid portfolioId (0, -1, undefined coerced to NaN)

**File**: `src/hooks/usePortfolioData.ts:39-44, 50-55, 60-65`  
**Category**: Correctness  
**Severity**: Low  

### Description

The query hooks don't have an `enabled` check for valid `portfolioId`. If called with:
- `portfolioId = 0` (falsy but valid number)
- `portfolioId = -1` (invalid)
- Before portfolio is selected (if store returns null/undefined)

The queries will fire and likely fail, causing unnecessary error states and IPC calls.

### Current Code

```typescript
export function useDashboardData(portfolioId: number) {
  return useQuery({
    queryKey: ['dashboard', portfolioId],
    queryFn: () => getDashboardData(portfolioId),
    // No enabled check
  });
}
```

### Suggested Fix

```typescript
export function useDashboardData(portfolioId: number) {
  return useQuery({
    queryKey: ['dashboard', portfolioId],
    queryFn: () => getDashboardData(portfolioId),
    enabled: portfolioId > 0,
  });
}
```

### Verification

1. Check how `portfolioId` is obtained in consuming components
2. Verify initial state before portfolio selection
3. Add `enabled` checks if early calls are possible

---

## [INFO] useEngineHealth Refetch Could Be Configurable

> 30-second refetch interval is hardcoded; consider making it configurable

**File**: `src/hooks/usePortfolioData.ts:26-33`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `useEngineHealth` hook has hardcoded timing values:
- `refetchInterval: 30000` (30 seconds)
- `staleTime: 10000` (10 seconds)

For development/debugging, faster intervals might be useful. For production, these seem reasonable but could be extracted to a config.

### Current Code

```typescript
export function useEngineHealth() {
  return useQuery({
    queryKey: ['engineHealth'],
    queryFn: getEngineHealth,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
```

### Suggested Improvement

```typescript
const ENGINE_HEALTH_CONFIG = {
  refetchInterval: import.meta.env.DEV ? 10000 : 30000,
  staleTime: import.meta.env.DEV ? 5000 : 10000,
} as const;

export function useEngineHealth() {
  return useQuery({
    queryKey: ['engineHealth'],
    queryFn: getEngineHealth,
    ...ENGINE_HEALTH_CONFIG,
  });
}
```

### Verification

No action required - informational only.

---

## Checklist Summary

### Security (P0)
- [x] No security concerns - hooks are data fetching wrappers
- [x] No sensitive data handling in this layer
- [x] IPC layer handles credential concerns (reviewed separately)

### Correctness (P1)
- [ ] `useXRayData` ignores portfolioId parameter (Medium)
- [ ] `useSyncPortfolio` doesn't invalidate xray cache (Medium)
- [x] Query keys include portfolioId for cache isolation
- [x] Error states properly surfaced via TanStack Query
- [x] Mutation has proper onSuccess/onError callbacks

### Performance (P2)
- [ ] `getHoldings` causes redundant dashboard fetch (Low)
- [x] Request deduplication handled by IPC layer
- [x] Appropriate stale times on health check

### Maintainability (P3)
- [x] Clean, readable hook implementations
- [x] Consistent patterns across all hooks
- [x] Good JSDoc comments
- [ ] Hardcoded timing values (Info)

### Testing (P4)
- [x] Comprehensive tests exist (`usePortfolioData.test.tsx`)
- [x] Tests cover success, error, and loading states
- [x] Tests verify correct IPC calls
- [x] Tests mock store dependencies properly

---

## Verdict

**PASSED** - No critical or high severity issues. The medium findings are correctness issues that should be addressed but don't block the current functionality. The codebase follows good patterns for TanStack Query integration.
