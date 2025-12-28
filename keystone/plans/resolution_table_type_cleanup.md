# ResolutionTable Type Cleanup Plan

> **Goal:** Remove dead `etf_stats` legacy code and fix 5 TypeScript errors in ResolutionTable.tsx
> **Status:** Ready for implementation
> **Estimated Effort:** 30 minutes
> **Risk:** Low - removing dead code path

---

## Background

The frontend has a fallback for legacy `etf_stats` data:
```typescript
const etfRows = report?.decomposition?.per_etf || report?.etf_stats || [];
```

However, the new pipeline (`pipeline.py`) only produces `decomposition.per_etf`. The `etf_stats` field is:
- Still defined in `PipelineHealthReport` type
- Never produced by the current backend
- Causing 5 TypeScript errors due to type union mismatch

## Root Cause

The type union creates:
```typescript
etfRows: ETFResolutionDetail[] | Array<{ ticker, holdings_count, weight_sum, status }> | []
```

TypeScript correctly errors when accessing `isin`, `name`, `source` which don't exist on the legacy type.

---

## Tasks

### Task 1: Update ETFResolutionDetail type

**File:** `src/hooks/usePipelineDiagnostics.ts`

**Current (lines 15-21):**
```typescript
export interface ETFResolutionDetail {
  isin: string;
  name: string;
  holdings_count: number;
  status: 'success' | 'partial' | 'failed';
  source?: string;
}
```

**Change to:**
```typescript
export interface ETFResolutionDetail {
  isin: string;
  name: string;
  holdings_count: number;
  weight_sum?: number;
  status: 'success' | 'partial' | 'failed';
  source?: string;
}
```

**Rationale:** The backend includes `weight_sum` in `per_etf` (see pipeline.py line 542). Adding it to the type allows proper access without `as any`.

---

### Task 2: Remove etf_stats from PipelineHealthReport

**File:** `src/hooks/usePipelineDiagnostics.ts`

**Current (lines 62-82):**
```typescript
export interface PipelineHealthReport {
  timestamp: string;
  metrics: {
    direct_holdings: number;
    etf_positions: number;
    etfs_processed: number;
    tier1_resolved: number;
    tier1_failed: number;
  };
  performance: PerformanceMetrics;
  etf_stats: Array<{           // <-- REMOVE THIS
    ticker: string;
    holdings_count: number;
    weight_sum: number;
    status: string;
  }>;
  failures: PipelineFailure[];
  decomposition?: DecompositionSummary;
  enrichment?: EnrichmentInfo;
}
```

**Change to:**
```typescript
export interface PipelineHealthReport {
  timestamp: string;
  metrics: {
    direct_holdings: number;
    etf_positions: number;
    etfs_processed: number;
    tier1_resolved: number;
    tier1_failed: number;
  };
  performance: PerformanceMetrics;
  failures: PipelineFailure[];
  decomposition?: DecompositionSummary;
  enrichment?: EnrichmentInfo;
}
```

---

### Task 3: Update ResolutionTable.tsx

**File:** `src/components/views/xray/ResolutionTable.tsx`

#### 3a: Remove legacy fallback (line 63)

**Current:**
```typescript
const etfRows = report?.decomposition?.per_etf || report?.etf_stats || [];
```

**Change to:**
```typescript
const etfRows = report?.decomposition?.per_etf || [];
```

#### 3b: Remove `as any` casts and use proper types

**Current (lines 87-101):**
```typescript
{etfRows.map((etf, idx) => (
  <tr key={etf.isin || (etf as any).ticker || idx}>
    <td className="etf-name-cell">
      <div className="etf-name" style={{ fontSize: '14px', fontWeight: 500 }}>
        {etf.name || (etf as any).ticker || 'Unknown'}
      </div>
      {etf.isin && <div className="etf-ticker" style={{ fontSize: '11px', opacity: 0.7 }}>{etf.isin}</div>}
    </td>
    <td>
      <StatusBadge status={etf.status} />
    </td>
    <td>
      <SourceBadge source={etf.source} />
    </td>
    <td className="numeric-cell">{etf.holdings_count.toLocaleString()}</td>
    <td className="numeric-cell">{(etf as any).weight_sum?.toFixed(1) || '0.0'}%</td>
  </tr>
))}
```

**Change to:**
```typescript
{etfRows.map((etf, idx) => (
  <tr key={etf.isin || idx}>
    <td className="etf-name-cell">
      <div className="etf-name" style={{ fontSize: '14px', fontWeight: 500 }}>
        {etf.name || 'Unknown'}
      </div>
      <div className="etf-ticker" style={{ fontSize: '11px', opacity: 0.7 }}>{etf.isin}</div>
    </td>
    <td>
      <StatusBadge status={etf.status} />
    </td>
    <td>
      <SourceBadge source={etf.source} />
    </td>
    <td className="numeric-cell">{etf.holdings_count.toLocaleString()}</td>
    <td className="numeric-cell">{etf.weight_sum?.toFixed(1) ?? '0.0'}%</td>
  </tr>
))}
```

**Changes:**
- Remove `(etf as any).ticker` fallbacks - not needed
- Remove conditional `{etf.isin && ...}` - isin is always present
- Replace `(etf as any).weight_sum` with `etf.weight_sum` (now in type)
- Use nullish coalescing `??` instead of `||` for numeric fallback

---

## Verification

1. Run `npx tsc --noEmit` - should have 0 errors in ResolutionTable.tsx
2. Run `npm run build` - should succeed
3. Visual check: X-Ray Operations view should display ETF table correctly

---

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/usePipelineDiagnostics.ts` | Add `weight_sum` to ETFResolutionDetail, remove `etf_stats` from PipelineHealthReport |
| `src/components/views/xray/ResolutionTable.tsx` | Remove legacy fallback, remove `as any` casts |

---

## Commit Message

```
fix: remove dead etf_stats legacy code and fix TypeScript errors

- Add weight_sum to ETFResolutionDetail type (matches backend)
- Remove etf_stats from PipelineHealthReport (dead code)
- Remove legacy fallback in ResolutionTable
- Remove as any casts, use proper typed access

Fixes 5 TypeScript errors in ResolutionTable.tsx
```
