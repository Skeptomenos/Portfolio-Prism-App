# Identity Resolution Phase 6C: Integration

> **Goal:** Integrate Phase 6B components into HoldingsView, wire up state management, and connect to the backend API.
> **Status:** Ready for implementation
> **Estimated Effort:** ~2-3 hours
> **Prerequisites:** Phase 6A (backend) and Phase 6B (components) complete

---

## Overview

### What We're Building

Phase 6C integrates the resolution UI components into the existing `HoldingsView.tsx`:

| Task | Description |
|------|-------------|
| **6C.1** | Update IPC types for `getTrueHoldings` return type |
| **6C.2** | Add filter/sort/search state management to HoldingsView |
| **6C.3** | Integrate ResolutionHealthCard at top of view |
| **6C.4** | Integrate NeedsAttentionSection below health card |
| **6C.5** | Replace search bar with FilterBar component |
| **6C.6** | Add ResolutionStatusBadge to holdings list items |
| **6C.7** | Add resolution details to decomposition panel |

### Current State

**HoldingsView.tsx** currently:
- Fetches data via `getTrueHoldings()` (returns `any`)
- Has basic search filtering
- Shows holdings list with stock name, ticker, value
- Shows decomposition panel when a stock is selected

**After Phase 6C:**
- Typed response with `TrueHoldingsResponse`
- Full filter/sort/search with FilterBar
- Resolution health summary at top
- Needs attention section for problematic holdings
- Resolution badges on each holding
- Resolution details in decomposition panel

---

## Task 6C.1: Update IPC Types

**File:** `src/lib/ipc.ts`

**Changes:**
1. Import `TrueHoldingsResponse` type
2. Update `getTrueHoldings` return type

```typescript
// Line 8-12: Add TrueHoldingsResponse to imports
import type { 
  DashboardData, EngineHealth, Holding, AuthStatus, SessionCheck, 
  AuthResponse, LogoutResponse, PortfolioSyncResult, PositionsResponse,
  TauriCommands, TrueHoldingsResponse
} from '../types';

// Line 276: Update return type
export async function getTrueHoldings(): Promise<TrueHoldingsResponse> {
  try {
    return await deduplicatedCall('get_true_holdings', () => 
      callCommand('get_true_holdings', {})
    );
  } catch (error) {
    console.error('[IPC] get_true_holdings failed:', error);
    throw error;
  }
}
```

---

## Task 6C.2: Update TauriCommands Type

**File:** `src/types/index.ts`

**Changes:** Update the `get_true_holdings` command return type in `TauriCommands`:

```typescript
// Around line 254-257, change:
get_true_holdings: {
  args: Record<string, never>;
  returns: any;  // OLD
};

// To:
get_true_holdings: {
  args: Record<string, never>;
  returns: TrueHoldingsResponse;  // NEW
};
```

---

## Task 6C.3: Rewrite HoldingsView with Integration

**File:** `src/components/views/HoldingsView.tsx`

This is a significant rewrite. The new component will:

1. Import all Phase 6B components
2. Add state for filter, sort, search
3. Compute filtered/sorted holdings
4. Compute "needs attention" holdings
5. Render all components in proper layout

### Full Implementation

```tsx
import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import GlassCard from '../GlassCard';
import { getTrueHoldings } from '../../lib/ipc';
import { 
  ResolutionHealthCard, 
  NeedsAttentionSection, 
  FilterBar,
  type FilterType,
  type SortType 
} from './xray';
import ResolutionStatusBadge from '../common/ResolutionStatusBadge';
import type { XRayHolding, ResolutionSummary, TrueHoldingsResponse } from '../../types';

const EMPTY_SUMMARY: ResolutionSummary = {
  total: 0,
  resolved: 0,
  unresolved: 0,
  skipped: 0,
  unknown: 0,
  bySource: {},
  healthScore: 0,
};

export default function HoldingsView() {
  const [holdings, setHoldings] = useState<XRayHolding[]>([]);
  const [summary, setSummary] = useState<ResolutionSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<XRayHolding | null>(null);

  // Filter/Sort/Search state
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('value');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res: TrueHoldingsResponse = await getTrueHoldings();
      setHoldings(res.holdings || []);
      setSummary(res.summary || EMPTY_SUMMARY);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load true holdings', err);
      setError(err.message || 'Failed to load holdings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute filtered and sorted holdings
  const filteredHoldings = useMemo(() => {
    let result = [...holdings];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (h) =>
          h.stock.toLowerCase().includes(query) ||
          h.ticker.toLowerCase().includes(query) ||
          (h.isin && h.isin.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    switch (filter) {
      case 'resolved':
        result = result.filter((h) => h.resolutionStatus === 'resolved');
        break;
      case 'unresolved':
        result = result.filter((h) => h.resolutionStatus === 'unresolved');
        break;
      case 'low-confidence':
        result = result.filter(
          (h) => h.resolutionStatus === 'resolved' && h.resolutionConfidence < 0.8
        );
        break;
    }

    // Apply sort
    switch (sort) {
      case 'value':
        result.sort((a, b) => b.totalValue - a.totalValue);
        break;
      case 'confidence':
        result.sort((a, b) => a.resolutionConfidence - b.resolutionConfidence);
        break;
      case 'name':
        result.sort((a, b) => a.stock.localeCompare(b.stock));
        break;
    }

    return result;
  }, [holdings, searchQuery, filter, sort]);

  // Compute holdings that need attention (unresolved or low confidence)
  const needsAttentionHoldings = useMemo(() => {
    return holdings
      .filter(
        (h) =>
          h.resolutionStatus === 'unresolved' ||
          (h.resolutionStatus === 'resolved' && h.resolutionConfidence < 0.8)
      )
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [holdings]);

  // Handle clicking a holding in NeedsAttentionSection
  const handleAttentionClick = (holding: XRayHolding) => {
    setSelectedStock(holding);
    // Clear filters to ensure the holding is visible
    setFilter('all');
    setSearchQuery('');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Error Loading Data</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
        <button 
          onClick={loadData}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No Holdings Data</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Run the deep analysis in the Health tab to generate your true holdings breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
          True Holdings Explorer
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          See exactly how you own each stock across your portfolio
        </p>
      </div>

      {/* Resolution Health Card */}
      <ResolutionHealthCard summary={summary} />

      {/* Needs Attention Section */}
      <NeedsAttentionSection 
        holdings={needsAttentionHoldings} 
        onHoldingClick={handleAttentionClick}
      />

      {/* Filter Bar */}
      <FilterBar
        filter={filter}
        sort={sort}
        searchQuery={searchQuery}
        onFilterChange={setFilter}
        onSortChange={setSort}
        onSearchChange={setSearchQuery}
        totalCount={holdings.length}
        filteredCount={filteredHoldings.length}
      />

      {/* Holdings List + Decomposition Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Holdings List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '600px', overflowY: 'auto' }}>
          {filteredHoldings.map((holding, index) => (
            <GlassCard
              key={holding.isin || `${holding.stock}-${index}`}
              onClick={() => setSelectedStock(holding)}
              style={{
                padding: '20px',
                cursor: 'pointer',
                border:
                  selectedStock?.ticker === holding.ticker
                    ? '1px solid rgba(59, 130, 246, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: '600' }}>{holding.stock}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    {holding.ticker}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ResolutionStatusBadge
                    status={holding.resolutionStatus}
                    source={holding.resolutionSource}
                    confidence={holding.resolutionConfidence}
                    originalTicker={holding.ticker}
                    resolvedIsin={holding.isin || undefined}
                    compact
                  />
                  <div className="metric-value" style={{ fontSize: '18px', color: 'var(--accent-blue)' }}>
                    €{holding.totalValue.toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Across {holding.sources.length} source{holding.sources.length > 1 ? 's' : ''}
              </div>
            </GlassCard>
          ))}

          {filteredHoldings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
              No holdings match your filters
            </div>
          )}
        </div>

        {/* Decomposition Panel */}
        {selectedStock ? (
          <GlassCard style={{ padding: '24px', height: 'fit-content', position: 'sticky', top: '0' }}>
            {/* Header with Resolution Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{selectedStock.stock}</h3>
                <div style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {selectedStock.ticker}
                </div>
              </div>
              <ResolutionStatusBadge
                status={selectedStock.resolutionStatus}
                source={selectedStock.resolutionSource}
                confidence={selectedStock.resolutionConfidence}
                originalTicker={selectedStock.ticker}
                resolvedIsin={selectedStock.isin || undefined}
              />
            </div>

            {/* Total Value */}
            <div
              className="metric-value"
              style={{
                fontSize: '32px',
                color: 'var(--accent-emerald)',
                marginBottom: '24px',
              }}
            >
              €{selectedStock.totalValue.toLocaleString()}
            </div>

            {/* Resolution Details */}
            {selectedStock.isin && (
              <div style={{ 
                marginBottom: '24px', 
                padding: '12px', 
                background: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  Resolution Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>ISIN: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                      {selectedStock.isin}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>Confidence: </span>
                    <span style={{ fontWeight: 600 }}>
                      {Math.round(selectedStock.resolutionConfidence * 100)}%
                    </span>
                  </div>
                  {selectedStock.resolutionSource && (
                    <div>
                      <span style={{ color: 'var(--text-tertiary)' }}>Source: </span>
                      <span>{selectedStock.resolutionSource}</span>
                    </div>
                  )}
                  {selectedStock.resolutionDetail && (
                    <div>
                      <span style={{ color: 'var(--text-tertiary)' }}>Detail: </span>
                      <span>{selectedStock.resolutionDetail}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Breakdown by Source */}
            <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Breakdown by Source
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedStock.sources.map((source) => (
                <div
                  key={source.etf}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>{source.etf}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {(source.weight * 100).toFixed(2)}% weight
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-cyan)',
                    }}
                  >
                    €{source.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Visual Flow */}
            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                <TrendingUp size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Exposure Flow
              </div>
              {selectedStock.sources.map((source) => (
                <div key={source.etf} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--accent-blue)',
                      fontWeight: '600',
                      width: '80px',
                    }}
                  >
                    {source.etf}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: '4px',
                      background: `linear-gradient(90deg, var(--accent-blue) 0%, var(--accent-cyan) 100%)`,
                      borderRadius: '2px',
                      margin: '0 12px',
                      width: `${(source.value / selectedStock.totalValue) * 100}%`,
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {((source.value / selectedStock.totalValue) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : (
          <GlassCard
            style={{
              padding: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '300px',
            }}
          >
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <AlertCircle size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px' }}>Select a stock to see its decomposition</p>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
```

---

## Verification Checklist

### Code Changes

- [ ] `src/types/index.ts`: Update `get_true_holdings` return type in TauriCommands
- [ ] `src/lib/ipc.ts`: Import `TrueHoldingsResponse`, update `getTrueHoldings` return type
- [ ] `src/components/views/HoldingsView.tsx`: Full rewrite with integration

### Functional Verification

- [ ] Health card displays correct stats from backend
- [ ] Needs attention section shows unresolved/low-confidence holdings
- [ ] Filter buttons work (All/Resolved/Unresolved/Low Confidence)
- [ ] Sort dropdown works (Value/Confidence/Name)
- [ ] Search filters by stock name, ticker, and ISIN
- [ ] Resolution badges appear on each holding
- [ ] Clicking "needs attention" item selects it and clears filters
- [ ] Decomposition panel shows resolution details
- [ ] Results count updates correctly

### Build Verification

- [ ] `npm run build` succeeds without TypeScript errors
- [ ] No console errors in browser

---

## Commit Message

```
feat: integrate resolution UI into HoldingsView (Phase 6C)

- Update IPC types for TrueHoldingsResponse
- Add filter/sort/search state management
- Integrate ResolutionHealthCard with backend summary
- Integrate NeedsAttentionSection for problematic holdings
- Replace search bar with FilterBar component
- Add ResolutionStatusBadge to holdings list items
- Add resolution details to decomposition panel

Part of Identity Resolution Phase 6 (UI Integration)
```

---

## Estimated Effort

| Task | Description | Time |
|------|-------------|------|
| 6C.1 | Update IPC types | 10 min |
| 6C.2 | Update TauriCommands type | 5 min |
| 6C.3 | Rewrite HoldingsView | 60 min |
| Verify | Build and functional testing | 30 min |
| **Total** | | **~2 hours** |

---

## Known Limitations

1. **No debouncing on search** - For large holdings lists (1000+), consider adding `useDeferredValue` in a future iteration
2. **No virtualization** - If performance becomes an issue with many holdings, consider `react-window`
3. **Tooltip positioning** - May overflow viewport near edges (documented in 6B review)

---

## Next Steps After 6C

1. **Visual testing** - Verify all components render correctly with real data
2. **Edge cases** - Test with empty data, all resolved, all unresolved
3. **Phase 6D (optional)** - Add manual resolution actions (upload CSV, ignore list)
