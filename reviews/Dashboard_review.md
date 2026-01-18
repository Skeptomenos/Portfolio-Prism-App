# Code Review: Dashboard.tsx

**File**: `src/components/views/Dashboard.tsx`  
**Date**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (1 Medium, 4 Low, 2 Info)

---

## [MEDIUM] Potential Null Access on history Array

> sparklineData creation may throw if history is undefined/null

**File**: `src/components/views/Dashboard.tsx:131`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The code accesses `dashboardData.history.map()` without verifying that `history` is defined. While the TypeScript type indicates `history` is a required array, the backend could potentially return null/undefined, causing a runtime crash.

### Current Code

```typescript
const sparklineData = dashboardData.history.map(h => h.value);
```

### Suggested Fix

```typescript
const sparklineData = dashboardData.history?.map(h => h.value) ?? [];
```

### Verification

1. Test with mocked data where `history` is undefined
2. Verify chart still renders with empty sparkline

---

## [MEDIUM] Component Length Exceeds Recommended Limit

> 320 lines is lengthy for a single component

**File**: `src/components/views/Dashboard.tsx:1-320`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The component is 320 lines, which exceeds the recommended ~50-100 line guideline. This makes it harder to test, understand, and maintain. The component contains distinct sections that could be extracted.

### Suggested Fix

Extract sub-components:
- `DashboardSkeleton` - Loading state (lines 31-65)
- `TopHoldingsList` - Top holdings section (lines 181-246)
- `TrueExposureCard` - True exposure section (lines 248-316)

```typescript
// TopHoldingsList.tsx
interface TopHoldingsListProps {
  holdings: Holding[];
}

export function TopHoldingsList({ holdings }: TopHoldingsListProps) {
  if (holdings.length === 0) {
    return <p style={...}>No holdings data available</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {holdings.slice(0, 5).map((holding, index) => (
        // ... holding card
      ))}
    </div>
  );
}
```

### Verification

1. Extract components and ensure tests still pass
2. No change in visual appearance

---

## [LOW] Using || Instead of ?? for Numeric Defaults

> Treats zero as falsy, potentially masking real zero values

**File**: `src/components/views/Dashboard.tsx:158-163`  
**Category**: Correctness  
**Severity**: Low  

### Description

The code uses `|| 0` for numeric defaults, which treats a real value of `0` as falsy and replaces it. For financial data, a zero day change is meaningful and should be displayed.

### Current Code

```typescript
value={`${(dashboardData.dayChange || 0) >= 0 ? '+' : ''}€${(dashboardData.dayChange || 0).toLocaleString(...)}`}
subtitle={`${(dashboardData.dayChange || 0) >= 0 ? '+' : ''}${(dashboardData.dayChangePercent || 0).toFixed(2)}%`}
```

### Suggested Fix

```typescript
value={`${(dashboardData.dayChange ?? 0) >= 0 ? '+' : ''}€${(dashboardData.dayChange ?? 0).toLocaleString(...)}`}
subtitle={`${(dashboardData.dayChange ?? 0) >= 0 ? '+' : ''}${(dashboardData.dayChangePercent ?? 0).toFixed(2)}%`}
```

### Verification

1. Test with `dayChange: 0` and verify it displays "+€0.00" not fallback

---

## [LOW] Heavy Inline Style Usage

> Styles are recreated on every render and hard to maintain

**File**: `src/components/views/Dashboard.tsx:33-62, 136-314`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The component uses extensive inline styles, which:
1. Are recreated as new objects on every render
2. Cannot be cached or reused
3. Make styling changes difficult to track

### Suggested Fix

Consider extracting to CSS module or defining style objects outside the component:

```typescript
const styles = {
  holdingCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  } as const,
  // ... other styles
};
```

### Verification

1. Extract styles and verify no visual changes
2. Check rendering performance in React DevTools

---

## [LOW] Magic Numbers in Loading Skeleton

> Hardcoded dimensions reduce maintainability

**File**: `src/components/views/Dashboard.tsx:46-58`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The loading skeleton uses magic numbers (20px, 36px, 60%, 80%) that could change and aren't self-documenting.

### Current Code

```typescript
height: '20px', 
width: '60%',
// ...
height: '36px', 
width: '80%',
```

### Suggested Fix

Define constants or extract to a Skeleton component:

```typescript
const SKELETON_HEIGHTS = {
  label: '20px',
  value: '36px',
};

// Or use existing Skeleton component
import { Skeleton } from '../ui/Skeleton';
```

### Verification

1. Refactor and verify skeleton appearance is unchanged

---

## [LOW] Minor Test Coverage Gaps

> Some edge cases and interactions not tested

**File**: `src/components/views/Dashboard.test.tsx`  
**Category**: Testing  
**Severity**: Low  

### Description

The test file covers most scenarios but misses:
1. Retry button click actually triggers refetch
2. Day change display verification
3. Sparkline data edge cases

### Suggested Fix

Add tests:

```typescript
it('calls refetch when retry button is clicked', async () => {
  vi.mocked(ipc.getDashboardData).mockRejectedValueOnce(new Error('Failed'));
  vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData);
  
  render(<Dashboard />);
  
  await waitFor(() => {
    expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
  });
  
  fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
  
  await waitFor(() => {
    expect(ipc.getDashboardData).toHaveBeenCalledTimes(2);
  });
});

it('displays day change values', async () => {
  vi.mocked(ipc.getDashboardData).mockResolvedValue({
    ...mockDashboardData,
    dayChange: 150.50,
    dayChangePercent: 1.25,
  });
  
  render(<Dashboard />);
  
  await waitFor(() => {
    expect(screen.getByText(/\+€150\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.25%/)).toBeInTheDocument();
  });
});
```

### Verification

1. Add tests and run test suite

---

## [INFO] Inline Styles Recreated on Each Render

> Minor performance consideration

**File**: `src/components/views/Dashboard.tsx`  
**Category**: Performance  
**Severity**: Info  

### Description

Large inline style objects (lines 187-240, 260-314) are recreated on every render. For this component's complexity, this is unlikely to cause issues, but could be optimized if performance becomes a concern.

### Verification

Profile with React DevTools if needed.

---

## [INFO] No Accessibility Testing

> Consider adding a11y tests for screen reader users

**File**: `src/components/views/Dashboard.test.tsx`  
**Category**: Testing  
**Severity**: Info  

### Description

No accessibility tests exist for the Dashboard. Consider adding:
- ARIA labels for financial values
- Semantic landmarks
- Focus management for error retry

### Suggested Fix

Consider using `@testing-library/jest-dom` matchers for accessibility or `jest-axe` for automated a11y checks.

---

## Summary

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| Security | 0 | 0 | 0 | 0 | 0 |
| Correctness | 0 | 0 | 1 | 1 | 0 |
| Performance | 0 | 0 | 0 | 0 | 1 |
| Maintainability | 0 | 0 | 1 | 2 | 0 |
| Testing | 0 | 0 | 0 | 1 | 1 |
| **Total** | **0** | **0** | **2** | **4** | **2** |

**Verdict**: PASSED - No critical or high severity findings. Medium issues are code quality improvements that can be deferred.
