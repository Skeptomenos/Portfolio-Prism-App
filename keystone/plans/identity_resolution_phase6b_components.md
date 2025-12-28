# Identity Resolution Phase 6B: Frontend Components

> **Goal:** Create 5 isolated, testable React components for displaying resolution provenance in the X-Ray view.

---

## 1. Overview

### Scope

| Component | Purpose | File |
|-----------|---------|------|
| **TypeScript Types** | Type definitions for resolution data | `src/types/index.ts` |
| **ResolutionStatusBadge** | Visual indicator with tooltip | `src/components/common/ResolutionStatusBadge.tsx` |
| **ResolutionHealthCard** | Summary stats dashboard | `src/components/xray/ResolutionHealthCard.tsx` |
| **NeedsAttentionSection** | Collapsible list of problematic holdings | `src/components/xray/NeedsAttentionSection.tsx` |
| **FilterBar** | Filter/sort/search controls | `src/components/xray/FilterBar.tsx` |

### Dependencies

- **Icons:** `lucide-react` (already installed)
- **Styling:** CSS modules extending existing glassmorphic design
- **No new dependencies required**

### Estimated Effort: ~4 hours

---

## 2. Implementation Tasks

### Task 6B.1: Add TypeScript Types

**File:** `src/types/index.ts`

**Action:** Add at end of file (after line 322):

```typescript
// =============================================================================
// X-Ray Resolution Types (Phase 6)
// =============================================================================

export type ResolutionStatus = 'resolved' | 'unresolved' | 'skipped' | 'unknown';

export type ResolutionSource =
  | 'provider'
  | 'manual'
  | 'hive'
  | 'local_cache'
  | 'api_wikidata'
  | 'api_finnhub'
  | 'api_yfinance'
  | 'unknown';

export interface XRayHolding {
  stock: string;
  ticker: string;
  isin?: string | null;
  totalValue: number;
  sector?: string;
  geography?: string;
  sources: { etf: string; value: number; weight: number }[];
  resolutionStatus: ResolutionStatus;
  resolutionSource?: ResolutionSource;
  resolutionConfidence: number;
  resolutionDetail?: string;
}

export interface ResolutionSummary {
  total: number;
  resolved: number;
  unresolved: number;
  skipped: number;
  unknown: number;
  bySource: Record<string, number>;
  healthScore: number;
}

export interface TrueHoldingsResponse {
  holdings: XRayHolding[];
  summary: ResolutionSummary;
}
```

---

### Task 6B.2: Create ResolutionStatusBadge Component

**File:** `src/components/common/ResolutionStatusBadge.tsx`

```tsx
import { ShieldCheck, CheckCircle, AlertCircle, MinusCircle, Circle } from 'lucide-react';
import type { ResolutionStatus, ResolutionSource } from '../../types';
import './ResolutionStatusBadge.css';

interface ResolutionStatusBadgeProps {
  status: ResolutionStatus;
  source?: ResolutionSource;
  confidence: number;
  originalTicker?: string;
  resolvedIsin?: string;
  compact?: boolean;
}

type ConfidenceLevel = 'verified' | 'high' | 'medium' | 'unresolved' | 'skipped';

function getConfidenceLevel(
  confidence: number,
  source?: string,
  status?: string
): ConfidenceLevel {
  if (status === 'skipped') return 'skipped';
  if (status === 'unresolved' || confidence < 0.50) return 'unresolved';
  if (source === 'provider' || source === 'manual' || confidence === 1.0) return 'verified';
  if (confidence >= 0.80) return 'high';
  return 'medium';
}

const levelConfig: Record<ConfidenceLevel, {
  icon: typeof ShieldCheck;
  color: string;
  bgColor: string;
  label: string;
}> = {
  verified: {
    icon: ShieldCheck,
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    label: 'Verified',
  },
  high: {
    icon: CheckCircle,
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    label: 'High',
  },
  medium: {
    icon: Circle,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'Medium',
  },
  unresolved: {
    icon: AlertCircle,
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    label: 'Unresolved',
  },
  skipped: {
    icon: MinusCircle,
    color: '#64748b',
    bgColor: 'rgba(100, 116, 139, 0.15)',
    label: 'Skipped',
  },
};

const sourceLabels: Record<string, string> = {
  provider: 'Trade Republic',
  manual: 'Manual',
  hive: 'Community Hive',
  local_cache: 'Local Cache',
  api_wikidata: 'Wikidata',
  api_finnhub: 'Finnhub',
  api_yfinance: 'Yahoo Finance',
  unknown: 'Unknown',
};

export default function ResolutionStatusBadge({
  status,
  source,
  confidence,
  originalTicker,
  resolvedIsin,
  compact = false,
}: ResolutionStatusBadgeProps) {
  const level = getConfidenceLevel(confidence, source, status);
  const config = levelConfig[level];
  const Icon = config.icon;

  const confidencePercent = Math.round(confidence * 100);
  const sourceLabel = sourceLabels[source || 'unknown'] || source || 'Unknown';

  return (
    <div className="resolution-badge-wrapper">
      <div
        className={`resolution-badge ${compact ? 'compact' : ''}`}
        style={{
          backgroundColor: config.bgColor,
          color: config.color,
        }}
      >
        <Icon size={compact ? 14 : 12} />
        {!compact && <span>{config.label}</span>}
      </div>

      <div className="resolution-tooltip">
        <div className="tooltip-header">
          <Icon size={16} style={{ color: config.color }} />
          <span style={{ color: config.color, fontWeight: 600 }}>{config.label}</span>
        </div>

        <div className="tooltip-divider" />

        <div className="tooltip-row">
          <span className="tooltip-label">Source</span>
          <span className="tooltip-value">{sourceLabel}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Confidence</span>
          <span className="tooltip-value">{confidencePercent}%</span>
        </div>

        {originalTicker && (
          <>
            <div className="tooltip-divider" />
            <div className="tooltip-row">
              <span className="tooltip-label">Original</span>
              <span className="tooltip-value mono">{originalTicker}</span>
            </div>
          </>
        )}

        {resolvedIsin && (
          <div className="tooltip-row">
            <span className="tooltip-label">ISIN</span>
            <span className="tooltip-value mono">{resolvedIsin}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**File:** `src/components/common/ResolutionStatusBadge.css`

```css
.resolution-badge-wrapper {
  position: relative;
  display: inline-block;
}

.resolution-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  cursor: default;
  transition: transform 0.15s ease;
}

.resolution-badge.compact {
  padding: 4px 6px;
}

.resolution-badge:hover {
  transform: scale(1.05);
}

.resolution-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  opacity: 0;
  pointer-events: none;
  z-index: 1000;

  min-width: 200px;
  padding: 14px;
  background: rgba(15, 20, 32, 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

  transition: opacity 0.2s ease, transform 0.2s ease;
}

.resolution-badge-wrapper:hover .resolution-tooltip {
  opacity: 1;
  transform: translateX(-50%) scale(1);
  pointer-events: auto;
}

.resolution-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: rgba(15, 20, 32, 0.98);
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.tooltip-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 10px 0;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.tooltip-row:last-child {
  margin-bottom: 0;
}

.tooltip-label {
  font-size: 12px;
  color: var(--text-tertiary, #64748b);
}

.tooltip-value {
  font-size: 12px;
  color: var(--text-primary, #f1f5f9);
  font-weight: 500;
}

.tooltip-value.mono {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--accent-cyan, #06b6d4);
}
```

---

### Task 6B.3: Create ResolutionHealthCard Component

**File:** `src/components/xray/ResolutionHealthCard.tsx`

```tsx
import { Activity, CheckCircle, AlertCircle, MinusCircle, HelpCircle } from 'lucide-react';
import GlassCard from '../GlassCard';
import type { ResolutionSummary } from '../../types';
import './ResolutionHealthCard.css';

interface ResolutionHealthCardProps {
  summary: ResolutionSummary;
}

const sourceColors: Record<string, string> = {
  provider: '#10b981',
  manual: '#10b981',
  hive: '#f59e0b',
  local_cache: '#8b5cf6',
  api_wikidata: '#3b82f6',
  api_finnhub: '#3b82f6',
  api_yfinance: '#06b6d4',
  unknown: '#64748b',
};

const sourceLabels: Record<string, string> = {
  provider: 'Provider',
  manual: 'Manual',
  hive: 'Hive',
  local_cache: 'Cache',
  api_wikidata: 'Wikidata',
  api_finnhub: 'Finnhub',
  api_yfinance: 'yFinance',
  unknown: 'Unknown',
};

export default function ResolutionHealthCard({ summary }: ResolutionHealthCardProps) {
  const healthPercent = Math.round(summary.healthScore * 100);

  const sortedSources = Object.entries(summary.bySource)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  const maxSourceCount = Math.max(...Object.values(summary.bySource), 1);

  return (
    <GlassCard className="resolution-health-card">
      <div className="health-header">
        <Activity size={20} className="health-icon" />
        <h3>Resolution Health</h3>
      </div>

      <div className="health-stats">
        <div className="stat-card primary">
          <div className="stat-value">{healthPercent}%</div>
          <div className="stat-label">Health Score</div>
          <div className="stat-bar">
            <div
              className="stat-bar-fill"
              style={{ width: `${healthPercent}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{summary.total.toLocaleString()}</div>
          <div className="stat-label">Total</div>
        </div>

        <div className="stat-card success">
          <CheckCircle size={16} />
          <div className="stat-value">{summary.resolved.toLocaleString()}</div>
          <div className="stat-label">Resolved</div>
        </div>

        <div className="stat-card error">
          <AlertCircle size={16} />
          <div className="stat-value">{summary.unresolved}</div>
          <div className="stat-label">Unresolved</div>
        </div>

        <div className="stat-card muted">
          <MinusCircle size={16} />
          <div className="stat-value">{summary.skipped}</div>
          <div className="stat-label">Skipped</div>
        </div>

        {summary.unknown > 0 && (
          <div className="stat-card muted">
            <HelpCircle size={16} />
            <div className="stat-value">{summary.unknown}</div>
            <div className="stat-label">Unknown</div>
          </div>
        )}
      </div>

      {sortedSources.length > 0 && (
        <div className="source-breakdown">
          <h4>Source Breakdown</h4>
          <div className="source-bars">
            {sortedSources.map(([source, count]) => (
              <div key={source} className="source-row">
                <div className="source-label">
                  {sourceLabels[source] || source}
                </div>
                <div className="source-bar-wrapper">
                  <div
                    className="source-bar"
                    style={{
                      width: `${(count / maxSourceCount) * 100}%`,
                      backgroundColor: sourceColors[source] || '#64748b',
                    }}
                  />
                </div>
                <div className="source-count">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
```

**File:** `src/components/xray/ResolutionHealthCard.css`

```css
.resolution-health-card {
  padding: 24px;
  margin-bottom: 24px;
}

.health-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.health-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
  margin: 0;
}

.health-icon {
  color: var(--accent-blue, #3b82f6);
}

.health-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  min-width: 80px;
}

.stat-card.primary {
  flex: 1;
  min-width: 160px;
  align-items: flex-start;
}

.stat-card svg {
  margin-bottom: 8px;
  opacity: 0.7;
}

.stat-card.success svg {
  color: #10b981;
}
.stat-card.error svg {
  color: #ef4444;
}
.stat-card.muted svg {
  color: #64748b;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: var(--text-primary, #f1f5f9);
}

.stat-card.primary .stat-value {
  font-size: 32px;
  color: var(--accent-emerald, #10b981);
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary, #64748b);
  margin-top: 4px;
}

.stat-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  margin-top: 12px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-emerald, #10b981), var(--accent-cyan, #06b6d4));
  border-radius: 3px;
  transition: width 0.5s ease;
}

.source-breakdown {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 20px;
}

.source-breakdown h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #94a3b8);
  margin: 0 0 16px 0;
}

.source-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-row {
  display: grid;
  grid-template-columns: 80px 1fr 40px;
  align-items: center;
  gap: 12px;
}

.source-label {
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
}

.source-bar-wrapper {
  height: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
}

.source-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.source-count {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text-tertiary, #64748b);
  text-align: right;
}
```

---

### Task 6B.4: Create NeedsAttentionSection Component

**File:** `src/components/xray/NeedsAttentionSection.tsx`

```tsx
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import GlassCard from '../GlassCard';
import ResolutionStatusBadge from '../common/ResolutionStatusBadge';
import type { XRayHolding } from '../../types';
import './NeedsAttentionSection.css';

interface NeedsAttentionSectionProps {
  holdings: XRayHolding[];
  onHoldingClick: (holding: XRayHolding) => void;
}

export default function NeedsAttentionSection({
  holdings,
  onHoldingClick,
}: NeedsAttentionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (holdings.length === 0) return null;

  const displayHoldings = isExpanded ? holdings : holdings.slice(0, 5);

  return (
    <GlassCard className="needs-attention-section">
      <div
        className="attention-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="attention-title">
          <AlertTriangle size={18} className="attention-icon" />
          <span>{holdings.length} Holdings Need Attention</span>
        </div>
        <button className="expand-btn" type="button">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      <p className="attention-description">
        These holdings could not be fully resolved and may affect analysis accuracy.
      </p>

      <div className="attention-list">
        {displayHoldings.map((holding) => (
          <div
            key={holding.ticker}
            className="attention-item"
            onClick={() => onHoldingClick(holding)}
          >
            <div className="attention-item-info">
              <div className="attention-item-name">{holding.stock}</div>
              {holding.ticker && (
                <div className="attention-item-ticker">{holding.ticker}</div>
              )}
            </div>
            <div className="attention-item-value">
              €{holding.totalValue.toLocaleString()}
            </div>
            <ResolutionStatusBadge
              status={holding.resolutionStatus}
              source={holding.resolutionSource}
              confidence={holding.resolutionConfidence}
              compact
            />
          </div>
        ))}
      </div>

      {holdings.length > 5 && !isExpanded && (
        <button
          className="show-more-btn"
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          Show {holdings.length - 5} more
        </button>
      )}
    </GlassCard>
  );
}
```

**File:** `src/components/xray/NeedsAttentionSection.css`

```css
.needs-attention-section {
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.05);
}

.attention-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  margin-bottom: 12px;
}

.attention-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #ef4444;
}

.attention-icon {
  color: #ef4444;
}

.expand-btn {
  background: none;
  border: none;
  color: var(--text-tertiary, #64748b);
  cursor: pointer;
  padding: 4px;
}

.attention-description {
  font-size: 13px;
  color: var(--text-secondary, #94a3b8);
  margin: 0 0 16px 0;
}

.attention-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attention-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.attention-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.attention-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #f1f5f9);
}

.attention-item-ticker {
  font-size: 11px;
  color: var(--text-tertiary, #64748b);
  font-family: var(--font-mono, monospace);
  margin-top: 2px;
}

.attention-item-value {
  font-size: 14px;
  font-family: var(--font-mono, monospace);
  color: var(--accent-cyan, #06b6d4);
}

.show-more-btn {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.show-more-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
```

---

### Task 6B.5: Create FilterBar Component

**File:** `src/components/xray/FilterBar.tsx`

```tsx
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import GlassCard from '../GlassCard';
import './FilterBar.css';

export type FilterType = 'all' | 'resolved' | 'unresolved' | 'low-confidence';
export type SortType = 'value' | 'confidence' | 'name';

interface FilterBarProps {
  filter: FilterType;
  sort: SortType;
  searchQuery: string;
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  onSearchChange: (query: string) => void;
  totalCount: number;
  filteredCount: number;
}

const filterLabels: Record<FilterType, string> = {
  all: 'All',
  resolved: 'Resolved',
  unresolved: 'Unresolved',
  'low-confidence': 'Low Confidence',
};

export default function FilterBar({
  filter,
  sort,
  searchQuery,
  onFilterChange,
  onSortChange,
  onSearchChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  return (
    <GlassCard className="filter-bar">
      <div className="filter-bar-row">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search holdings..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <Filter size={16} className="filter-group-icon" />
          {(['all', 'resolved', 'unresolved', 'low-confidence'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => onFilterChange(f)}
              type="button"
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        <div className="sort-group">
          <ArrowUpDown size={16} className="sort-icon" />
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortType)}
            className="sort-select"
          >
            <option value="value">Sort by Value</option>
            <option value="confidence">Sort by Confidence</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      <div className="results-count">
        Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} holdings
      </div>
    </GlassCard>
  );
}
```

**File:** `src/components/xray/FilterBar.css`

```css
.filter-bar {
  padding: 16px 20px;
  margin-bottom: 24px;
}

.filter-bar-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.search-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.search-icon {
  color: var(--text-tertiary, #64748b);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary, #f1f5f9);
  font-size: 14px;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--text-tertiary, #64748b);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group-icon {
  color: var(--text-tertiary, #64748b);
}

.filter-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: var(--text-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.filter-btn.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.sort-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-icon {
  color: var(--text-tertiary, #64748b);
}

.sort-select {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: var(--text-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.sort-select:focus {
  border-color: rgba(59, 130, 246, 0.3);
}

.results-count {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-tertiary, #64748b);
}
```

---

## 3. Directory Structure

After implementation, the new files will be:

```
src/
├── components/
│   ├── common/
│   │   ├── ResolutionStatusBadge.tsx    (NEW)
│   │   └── ResolutionStatusBadge.css    (NEW)
│   └── xray/
│       ├── ResolutionHealthCard.tsx     (NEW)
│       ├── ResolutionHealthCard.css     (NEW)
│       ├── NeedsAttentionSection.tsx    (NEW)
│       ├── NeedsAttentionSection.css    (NEW)
│       ├── FilterBar.tsx                (NEW)
│       └── FilterBar.css                (NEW)
└── types/
    └── index.ts                         (MODIFIED - add types)
```

---

## 4. Verification Checklist

### Code Changes

- [ ] `src/types/index.ts`: Added `ResolutionStatus`, `ResolutionSource`, `XRayHolding`, `ResolutionSummary`, `TrueHoldingsResponse` types
- [ ] `src/components/common/ResolutionStatusBadge.tsx` + `.css`: Created
- [ ] `src/components/xray/ResolutionHealthCard.tsx` + `.css`: Created
- [ ] `src/components/xray/NeedsAttentionSection.tsx` + `.css`: Created
- [ ] `src/components/xray/FilterBar.tsx` + `.css`: Created
- [ ] `src/components/xray/` directory exists

### Visual Verification

- [ ] Badge renders with correct colors for each status
- [ ] Badge tooltip appears on hover
- [ ] Health card shows stats with progress bar
- [ ] Source breakdown bars are proportional
- [ ] Attention section expands/collapses
- [ ] Filter buttons toggle active state
- [ ] Sort dropdown works
- [ ] Search input accepts text

### Build Verification

- [ ] `npm run build` succeeds without TypeScript errors
- [ ] No console errors in browser

---

## 5. Commit Message

```
feat: add resolution UI components (Phase 6B)

- Add TypeScript types: XRayHolding, ResolutionSummary, TrueHoldingsResponse
- Create ResolutionStatusBadge with tooltip showing source/confidence
- Create ResolutionHealthCard with stats and source breakdown
- Create NeedsAttentionSection for unresolved/low-confidence holdings
- Create FilterBar with filter/sort/search controls

Part of Identity Resolution Phase 6 (UI Integration)
```

---

## 6. Estimated Effort

| Task | Description | Time |
|------|-------------|------|
| 6B.1 | Add TypeScript types | 10 min |
| 6B.2 | Create ResolutionStatusBadge | 45 min |
| 6B.3 | Create ResolutionHealthCard | 45 min |
| 6B.4 | Create NeedsAttentionSection | 30 min |
| 6B.5 | Create FilterBar | 30 min |
| Verify | Build and visual check | 20 min |
| **Total** | | **~3 hours** |
