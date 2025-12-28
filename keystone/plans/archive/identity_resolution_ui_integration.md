# Identity Resolution Phase 6: X-Ray UI Integration

> **Goal:** Transform the X-Ray view into a beautiful, data-rich experience that builds user trust, surfaces resolution quality, and enables issue identification.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 6A: Backend Data Exposure](#2-phase-6a-backend-data-exposure)
3. [Phase 6B: UI Components](#3-phase-6b-ui-components)
4. [Phase 6C: Integration](#4-phase-6c-integration)
5. [Design System](#5-design-system)
6. [Edge Cases & Error Handling](#6-edge-cases--error-handling)
7. [Testing Strategy](#7-testing-strategy)
8. [Workstream Task Mapping](#8-workstream-task-mapping)

---

## 1. Executive Summary

### Scope
- **Target View:** `HoldingsView.tsx` (X-Ray / True Holdings Explorer)
- **Excluded:** `PortfolioTable.tsx` (positions have ISINs from Trade Republic)
- **Excluded:** Streamlit Dashboard (deprecated)

### Sub-Phases

| Phase | Scope | Deliverable | Effort |
|-------|-------|-------------|--------|
| **6A** | Backend only | Resolution data in CSV + JSON response | 0.5 day |
| **6B** | Components only | 4 isolated, testable React components | 1 day |
| **6C** | Integration | Full HoldingsView update | 0.5 day |

### Dependencies
- **Requires:** Phase 4 complete (provenance columns exist in DataFrame)
- **Icons:** `lucide-react` (already installed)
- **Tooltips:** Custom CSS (no external library)
- **Styling:** Extend existing glassmorphic design system

---

## 2. Phase 6A: Backend Data Exposure

### 2.1 Objective

Ensure resolution provenance data flows from the DataFrame through the CSV to the JSON API response.

### 2.2 Current State

```
DataFrame (has resolution_source, resolution_confidence, resolution_status)
    ↓
aggregation/__init__.py → cols_to_keep does NOT include resolution fields
    ↓
holdings_breakdown.csv → MISSING resolution columns
    ↓
handle_get_true_holdings → Cannot return what doesn't exist
```

### 2.3 Target State

```
DataFrame (has resolution_source, resolution_confidence, resolution_status)
    ↓
aggregation/__init__.py → cols_to_keep INCLUDES resolution fields
    ↓
holdings_breakdown.csv → HAS resolution columns
    ↓
handle_get_true_holdings → Returns resolution data + summary stats
```

---

### 2.4 Task 6A.1: Preserve Original Input

**File:** `src-tauri/python/portfolio_src/core/aggregation/enrichment.py`

**Problem:** After normalization, we lose what the provider originally sent. Users need to see "Input: NVDA US → Resolved: US67066G1040".

**Action:** Before calling normalizers, store original values:

```python
# In enrich_etf_holdings(), before normalization:
if "ticker" in holdings.columns:
    holdings["original_ticker"] = holdings["ticker"].copy()
if "name" in holdings.columns:
    holdings["original_name"] = holdings["name"].copy()
```

**Location:** Add after line ~80 (before `_resolve_holdings` call)

---

### 2.5 Task 6A.2: Update Aggregation Pipeline

**File:** `src-tauri/python/portfolio_src/core/aggregation/__init__.py`

**Action:** Update `cols_to_keep` (line ~154):

```python
cols_to_keep = [
    "parent_isin",
    "parent_name",
    "source",
    "isin",
    "name",
    "asset_class",
    "sector",
    "geography",
    "weight_percentage",
    "indirect",
    # Resolution provenance (Phase 6)
    "resolution_status",
    "resolution_source", 
    "resolution_confidence",
    "original_ticker",
    "original_name",
]
```

**Edge Case:** Direct holdings don't have resolution fields. Add defaults:

```python
# After line ~147 (direct_rows setup):
direct_rows["resolution_status"] = "resolved"
direct_rows["resolution_source"] = "provider"
direct_rows["resolution_confidence"] = 1.0
direct_rows["original_ticker"] = direct_rows.get("ticker", "")
direct_rows["original_name"] = direct_rows.get("name", "")
```

---

### 2.6 Task 6A.3: Update Response Handler

**File:** `src-tauri/python/portfolio_src/headless/handlers/holdings.py`

**Action:** Modify `handle_get_true_holdings` (line ~82):

```python
def handle_get_true_holdings(cmd_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    from portfolio_src.config import HOLDINGS_BREAKDOWN_PATH
    import pandas as pd

    if not os.path.exists(HOLDINGS_BREAKDOWN_PATH):
        return success_response(cmd_id, {
            "holdings": [],
            "summary": _empty_summary()
        })

    try:
        df = pd.read_csv(HOLDINGS_BREAKDOWN_PATH)

        if df.empty:
            return success_response(cmd_id, {
                "holdings": [],
                "summary": _empty_summary()
            })

        # Group by child security, aggregate resolution (take max confidence)
        grouped = df.groupby(["child_isin", "child_name"], as_index=False).agg({
            "value_eur": "sum",
            "sector": "first",
            "geography": "first",
            # Resolution: take the row with highest confidence
            "resolution_status": "first",
            "resolution_source": "first",
            "resolution_confidence": "max",
            "original_ticker": "first",
            "original_name": "first",
        })

        holdings = []
        for _, row in grouped.iterrows():
            child_isin = str(row["child_isin"])

            sources = [
                {
                    "etf": str(s_row["parent_isin"]),
                    "value": round(float(s_row["value_eur"]), 2),
                    "weight": round(float(s_row["weight_percent"]) / 100.0, 4),
                }
                for _, s_row in df[df["child_isin"] == child_isin].iterrows()
            ]

            holdings.append({
                "stock": str(row["child_name"]),
                "ticker": child_isin,  # Using ISIN as ticker for now
                "isin": child_isin if child_isin != "nan" else None,
                "totalValue": round(float(row["value_eur"]), 2),
                "sector": _safe_str(row.get("sector")),
                "geography": _safe_str(row.get("geography")),
                "sources": sources,
                # Resolution provenance
                "resolutionStatus": _safe_str(row.get("resolution_status", "unknown")),
                "resolutionSource": _safe_str(row.get("resolution_source", "unknown")),
                "resolutionConfidence": float(row.get("resolution_confidence", 0.0)),
                "originalTicker": _safe_str(row.get("original_ticker")),
                "originalName": _safe_str(row.get("original_name")),
            })

        holdings.sort(key=lambda x: x["totalValue"], reverse=True)

        # Calculate summary statistics
        summary = _calculate_summary(holdings)

        logger.debug(f"Returning {len(holdings)} true holdings with resolution data")
        return success_response(cmd_id, {
            "holdings": holdings,
            "summary": summary
        })
    except Exception as e:
        logger.error(f"Failed to get true holdings: {e}", exc_info=True)
        return error_response(cmd_id, "HOLDINGS_ERROR", str(e))


def _safe_str(val) -> str:
    """Convert value to string, handling None/NaN."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return str(val)


def _empty_summary() -> dict:
    """Return empty summary structure."""
    return {
        "total": 0,
        "resolved": 0,
        "unresolved": 0,
        "skipped": 0,
        "bySource": {},
        "healthScore": 1.0
    }


def _calculate_summary(holdings: list) -> dict:
    """Calculate resolution summary statistics."""
    total = len(holdings)
    if total == 0:
        return _empty_summary()

    resolved = sum(1 for h in holdings if h["resolutionStatus"] == "resolved")
    unresolved = sum(1 for h in holdings if h["resolutionStatus"] == "unresolved")
    skipped = sum(1 for h in holdings if h["resolutionStatus"] == "skipped")

    # Count by source
    by_source: dict[str, int] = {}
    for h in holdings:
        source = h["resolutionSource"] or "unknown"
        by_source[source] = by_source.get(source, 0) + 1

    health_score = resolved / total if total > 0 else 1.0

    return {
        "total": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "skipped": skipped,
        "bySource": by_source,
        "healthScore": round(health_score, 3)
    }
```

---

### 2.7 Task 6A.4: Handle Legacy CSV (Backward Compatibility)

**Problem:** If user runs Phase 6 code against a CSV generated before Phase 6, columns will be missing.

**Solution:** Add fallback defaults when reading CSV:

```python
# After reading CSV, ensure columns exist:
resolution_cols = {
    "resolution_status": "unknown",
    "resolution_source": "unknown", 
    "resolution_confidence": 0.0,
    "original_ticker": "",
    "original_name": "",
}
for col, default in resolution_cols.items():
    if col not in df.columns:
        df[col] = default
```

---

### 2.8 Phase 6A Verification

**Manual Test:**
1. Run pipeline: `npm run tauri dev` → Health tab → Run Analysis
2. Check CSV: `cat ~/Library/Application\ Support/com.skeptomenos.portfolioprism/holdings_breakdown.csv | head -5`
3. Verify columns: `resolution_status`, `resolution_source`, `resolution_confidence`, `original_ticker`, `original_name`
4. Check API response: Open X-Ray tab, check browser DevTools Network tab for `get_true_holdings` response

**Success Criteria:**
- [ ] CSV contains all 5 new columns
- [ ] JSON response includes `resolutionStatus`, `resolutionSource`, `resolutionConfidence` per holding
- [ ] JSON response includes `summary` object with stats
- [ ] Legacy CSV (without new columns) doesn't crash

---

## 3. Phase 6B: UI Components

### 3.1 Objective

Create 4 isolated, testable React components that can be developed and verified independently.

### 3.2 Technology Decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| **Icons** | `lucide-react` | Already installed, used throughout app |
| **Tooltips** | Custom CSS | No Radix installed; keep bundle small |
| **Styling** | CSS modules + CSS variables | Match existing glassmorphic system |
| **Animations** | CSS transitions | Keep it snappy, no heavy libraries |

---

### 3.3 Task 6B.1: TypeScript Types

**File:** `src/types/index.ts`

**Add at end of file:**

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
  // Resolution provenance
  resolutionStatus: ResolutionStatus;
  resolutionSource?: ResolutionSource;
  resolutionConfidence: number;
  originalTicker?: string;
  originalName?: string;
}

export interface ResolutionSummary {
  total: number;
  resolved: number;
  unresolved: number;
  skipped: number;
  bySource: Record<string, number>;
  healthScore: number;
}

export interface TrueHoldingsResponse {
  holdings: XRayHolding[];
  summary: ResolutionSummary;
}
```

---

### 3.4 Task 6B.2: ResolutionStatusBadge Component

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
  originalName?: string;
  resolvedIsin?: string;
  resolvedName?: string;
  compact?: boolean;  // For list view (icon only)
}

type ConfidenceLevel = 'verified' | 'high' | 'medium' | 'low' | 'unresolved' | 'skipped';

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
    label: 'High Confidence',
  },
  medium: {
    icon: Circle,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'Medium Confidence',
  },
  low: {
    icon: AlertCircle,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'Low Confidence',
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
  manual: 'Manual Override',
  hive: 'Community Hive',
  local_cache: 'Local Cache',
  api_wikidata: 'Wikidata',
  api_finnhub: 'Finnhub API',
  api_yfinance: 'Yahoo Finance',
  unknown: 'Unknown',
};

export default function ResolutionStatusBadge({
  status,
  source,
  confidence,
  originalTicker,
  originalName,
  resolvedIsin,
  resolvedName,
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
        aria-label={`${config.label}: ${confidencePercent}% confidence via ${sourceLabel}`}
      >
        <Icon size={compact ? 14 : 12} />
        {!compact && <span>{config.label}</span>}
      </div>

      {/* Tooltip */}
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

        {(originalTicker || originalName) && (
          <>
            <div className="tooltip-divider" />
            <div className="tooltip-section-title">Original Input</div>
            {originalTicker && (
              <div className="tooltip-row">
                <span className="tooltip-label">Ticker</span>
                <span className="tooltip-value mono">{originalTicker}</span>
              </div>
            )}
            {originalName && (
              <div className="tooltip-row">
                <span className="tooltip-label">Name</span>
                <span className="tooltip-value">{originalName}</span>
              </div>
            )}
          </>
        )}

        {resolvedIsin && (
          <>
            <div className="tooltip-divider" />
            <div className="tooltip-section-title">Resolved To</div>
            <div className="tooltip-row">
              <span className="tooltip-label">ISIN</span>
              <span className="tooltip-value mono">{resolvedIsin}</span>
            </div>
            {resolvedName && (
              <div className="tooltip-row">
                <span className="tooltip-label">Name</span>
                <span className="tooltip-value">{resolvedName}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

**File:** `src/components/common/ResolutionStatusBadge.css`

```css
/* ResolutionStatusBadge.css */

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

/* Tooltip */
.resolution-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  opacity: 0;
  pointer-events: none;
  z-index: 1000;
  
  min-width: 240px;
  padding: 16px;
  background: rgba(15, 20, 32, 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.resolution-badge-wrapper:hover .resolution-tooltip {
  opacity: 1;
  transform: translateX(-50%) scale(1);
  pointer-events: auto;
}

/* Tooltip arrow */
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
  margin-bottom: 12px;
}

.tooltip-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 12px 0;
}

.tooltip-section-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
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
  color: var(--text-tertiary);
}

.tooltip-value {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
}

.tooltip-value.mono {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-cyan);
}
```

---

### 3.5 Task 6B.3: ResolutionHealthCard Component

**File:** `src/components/xray/ResolutionHealthCard.tsx`

```tsx
import { Activity, CheckCircle, AlertCircle, MinusCircle } from 'lucide-react';
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
  unresolved: '#ef4444',
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
  
  // Sort sources by count descending
  const sortedSources = Object.entries(summary.bySource)
    .sort(([, a], [, b]) => b - a);

  const maxSourceCount = Math.max(...Object.values(summary.bySource), 1);

  return (
    <GlassCard className="resolution-health-card">
      <div className="health-header">
        <Activity size={20} className="health-icon" />
        <h3>Resolution Health</h3>
      </div>

      <div className="health-stats">
        {/* Health Score */}
        <div className="stat-card primary">
          <div className="stat-value">{healthPercent}%</div>
          <div className="stat-label">Resolved</div>
          <div className="stat-bar">
            <div 
              className="stat-bar-fill" 
              style={{ width: `${healthPercent}%` }}
            />
          </div>
        </div>

        {/* Counts */}
        <div className="stat-card">
          <div className="stat-value">{summary.total.toLocaleString()}</div>
          <div className="stat-label">Total Holdings</div>
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
      </div>

      {/* Source Breakdown */}
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
                    backgroundColor: sourceColors[source] || '#64748b'
                  }}
                />
              </div>
              <div className="source-count">{count}</div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
```

**File:** `src/components/xray/ResolutionHealthCard.css`

```css
/* ResolutionHealthCard.css */

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
  color: var(--text-primary);
}

.health-icon {
  color: var(--accent-blue);
}

/* Stats Grid */
.health-stats {
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
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
}

.stat-card.primary {
  align-items: flex-start;
}

.stat-card svg {
  margin-bottom: 8px;
  opacity: 0.7;
}

.stat-card.success svg { color: #10b981; }
.stat-card.error svg { color: #ef4444; }
.stat-card.muted svg { color: #64748b; }

.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.stat-card.primary .stat-value {
  font-size: 32px;
  color: var(--accent-emerald);
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

/* Health Bar */
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
  background: linear-gradient(90deg, var(--accent-emerald), var(--accent-cyan));
  border-radius: 3px;
  transition: width 0.5s ease;
}

/* Source Breakdown */
.source-breakdown {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 20px;
}

.source-breakdown h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 16px;
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
  color: var(--text-secondary);
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
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  text-align: right;
}
```

---

### 3.6 Task 6B.4: NeedsAttentionSection Component

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
  onHoldingClick 
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
        <button className="expand-btn">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      <p className="attention-description">
        These holdings could not be fully resolved. They may affect accuracy of your portfolio analysis.
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
              <div className="attention-item-detail">
                {holding.originalTicker && (
                  <span className="original-input">Input: {holding.originalTicker}</span>
                )}
              </div>
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
/* NeedsAttentionSection.css */

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
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
}

.attention-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
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
  color: var(--text-primary);
}

.attention-item-detail {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.original-input {
  font-family: var(--font-mono);
}

.attention-item-value {
  font-size: 14px;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
}

.show-more-btn {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.show-more-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
```

---

### 3.7 Task 6B.5: FilterBar Component

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
        {/* Search */}
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

        {/* Filter Buttons */}
        <div className="filter-group">
          <Filter size={16} className="filter-group-icon" />
          {(['all', 'resolved', 'unresolved', 'low-confidence'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => onFilterChange(f)}
            >
              {f === 'all' ? 'All' : 
               f === 'resolved' ? 'Resolved' :
               f === 'unresolved' ? 'Unresolved' : 'Low Confidence'}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
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

      {/* Results Count */}
      <div className="results-count">
        Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} holdings
      </div>
    </GlassCard>
  );
}
```

**File:** `src/components/xray/FilterBar.css`

```css
/* FilterBar.css */

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

/* Search */
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
  color: var(--text-tertiary);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

/* Filter Buttons */
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group-icon {
  color: var(--text-tertiary);
}

.filter-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: var(--text-secondary);
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

/* Sort */
.sort-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-icon {
  color: var(--text-tertiary);
}

.sort-select {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.sort-select:focus {
  border-color: rgba(59, 130, 246, 0.3);
}

/* Results Count */
.results-count {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}
```

---

### 3.8 Phase 6B Verification

**Component Testing (Manual):**

Create a test page or Storybook-like setup:

```tsx
// src/components/xray/__tests__/ComponentPreview.tsx (temporary)
import ResolutionStatusBadge from '../../common/ResolutionStatusBadge';
import ResolutionHealthCard from '../ResolutionHealthCard';
import NeedsAttentionSection from '../NeedsAttentionSection';
import FilterBar from '../FilterBar';

// Mock data for testing
const mockSummary = {
  total: 847,
  resolved: 796,
  unresolved: 51,
  skipped: 12,
  bySource: {
    provider: 525,
    hive: 152,
    api_finnhub: 68,
    api_wikidata: 51,
  },
  healthScore: 0.94,
};

const mockUnresolvedHoldings = [
  {
    stock: 'Unknown Corp',
    ticker: 'UNKN',
    totalValue: 1200,
    resolutionStatus: 'unresolved' as const,
    resolutionConfidence: 0,
    originalTicker: 'UNKN US',
    sources: [],
  },
];

export default function ComponentPreview() {
  return (
    <div style={{ padding: 40, maxWidth: 1200 }}>
      <h2>ResolutionStatusBadge</h2>
      <div style={{ display: 'flex', gap: 16, marginBottom: 40 }}>
        <ResolutionStatusBadge status="resolved" source="provider" confidence={1.0} />
        <ResolutionStatusBadge status="resolved" source="hive" confidence={0.9} />
        <ResolutionStatusBadge status="resolved" source="api_finnhub" confidence={0.75} />
        <ResolutionStatusBadge status="unresolved" confidence={0} />
        <ResolutionStatusBadge status="skipped" confidence={0} />
      </div>

      <h2>ResolutionHealthCard</h2>
      <ResolutionHealthCard summary={mockSummary} />

      <h2>NeedsAttentionSection</h2>
      <NeedsAttentionSection 
        holdings={mockUnresolvedHoldings} 
        onHoldingClick={() => {}} 
      />

      <h2>FilterBar</h2>
      <FilterBar
        filter="all"
        sort="value"
        searchQuery=""
        onFilterChange={() => {}}
        onSortChange={() => {}}
        onSearchChange={() => {}}
        totalCount={847}
        filteredCount={847}
      />
    </div>
  );
}
```

**Success Criteria:**
- [ ] All 4 components render without errors
- [ ] Badge tooltip appears on hover
- [ ] Health card shows correct percentages
- [ ] Attention section expands/collapses
- [ ] Filter buttons toggle active state
- [ ] Styling matches glassmorphic design system

---

## 4. Phase 6C: Integration

### 4.1 Objective

Wire all components together in `HoldingsView.tsx`.

### 4.2 Task 6C.1: Update IPC Types

**File:** `src/lib/ipc.ts`

**Find and update `getTrueHoldings`:**

```typescript
import type { TrueHoldingsResponse } from '../types';

export async function getTrueHoldings(): Promise<TrueHoldingsResponse> {
  return invoke('get_true_holdings', {});
}
```

---

### 4.3 Task 6C.2: Update HoldingsView

**File:** `src/components/views/HoldingsView.tsx`

**Full replacement:**

```tsx
import { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import GlassCard from '../GlassCard';
import ResolutionStatusBadge from '../common/ResolutionStatusBadge';
import ResolutionHealthCard from '../xray/ResolutionHealthCard';
import NeedsAttentionSection from '../xray/NeedsAttentionSection';
import FilterBar, { FilterType, SortType } from '../xray/FilterBar';
import { getTrueHoldings } from '../../lib/ipc';
import type { XRayHolding, ResolutionSummary } from '../../types';

const EMPTY_SUMMARY: ResolutionSummary = {
  total: 0,
  resolved: 0,
  unresolved: 0,
  skipped: 0,
  bySource: {},
  healthScore: 1.0,
};

export default function HoldingsView() {
  const [holdings, setHoldings] = useState<XRayHolding[]>([]);
  const [summary, setSummary] = useState<ResolutionSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<XRayHolding | null>(null);

  // Filter & Sort State
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('value');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await getTrueHoldings();
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

  // Filter & Sort Logic
  const filteredHoldings = useMemo(() => {
    let result = holdings;

    // Apply filter
    switch (filter) {
      case 'resolved':
        result = result.filter(h => h.resolutionStatus === 'resolved');
        break;
      case 'unresolved':
        result = result.filter(h => h.resolutionStatus === 'unresolved');
        break;
      case 'low-confidence':
        result = result.filter(h => h.resolutionConfidence < 0.80 && h.resolutionStatus !== 'skipped');
        break;
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(h =>
        h.stock.toLowerCase().includes(query) ||
        h.ticker.toLowerCase().includes(query) ||
        (h.originalTicker?.toLowerCase().includes(query))
      );
    }

    // Apply sort
    switch (sort) {
      case 'value':
        result = [...result].sort((a, b) => b.totalValue - a.totalValue);
        break;
      case 'confidence':
        result = [...result].sort((a, b) => a.resolutionConfidence - b.resolutionConfidence);
        break;
      case 'name':
        result = [...result].sort((a, b) => a.stock.localeCompare(b.stock));
        break;
    }

    return result;
  }, [holdings, filter, sort, searchQuery]);

  // Holdings that need attention (unresolved or low confidence)
  const attentionHoldings = useMemo(() => {
    return holdings.filter(h => 
      h.resolutionStatus === 'unresolved' || 
      (h.resolutionConfidence < 0.70 && h.resolutionStatus !== 'skipped')
    );
  }, [holdings]);

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
        <button onClick={loadData} className="px-6 py-2 bg-blue-600 text-white rounded-lg">
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
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
          True Holdings Explorer
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          See exactly how you own each stock across your portfolio
        </p>
      </div>

      {/* Resolution Health Summary */}
      <ResolutionHealthCard summary={summary} />

      {/* Needs Attention Section */}
      <NeedsAttentionSection 
        holdings={attentionHoldings}
        onHoldingClick={setSelectedStock}
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

      {/* Holdings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Holdings List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredHoldings.map((holding) => (
            <GlassCard
              key={holding.ticker}
              onClick={() => setSelectedStock(holding)}
              style={{
                padding: '20px',
                cursor: 'pointer',
                border: selectedStock?.ticker === holding.ticker
                  ? '1px solid rgba(59, 130, 246, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px', fontWeight: '600' }}>{holding.stock}</span>
                    <ResolutionStatusBadge
                      status={holding.resolutionStatus}
                      source={holding.resolutionSource}
                      confidence={holding.resolutionConfidence}
                      originalTicker={holding.originalTicker}
                      originalName={holding.originalName}
                      resolvedIsin={holding.isin || undefined}
                      resolvedName={holding.stock}
                      compact
                    />
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    {holding.ticker}
                  </div>
                </div>
                <div className="metric-value" style={{ fontSize: '18px', color: 'var(--accent-blue)' }}>
                  €{holding.totalValue.toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Across {holding.sources.length} source{holding.sources.length > 1 ? 's' : ''}
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Detail Panel */}
        {selectedStock ? (
          <GlassCard style={{ padding: '24px', height: 'fit-content', position: 'sticky', top: '0' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{selectedStock.stock}</h3>
                <ResolutionStatusBadge
                  status={selectedStock.resolutionStatus}
                  source={selectedStock.resolutionSource}
                  confidence={selectedStock.resolutionConfidence}
                  originalTicker={selectedStock.originalTicker}
                  originalName={selectedStock.originalName}
                  resolvedIsin={selectedStock.isin || undefined}
                  resolvedName={selectedStock.stock}
                />
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                {selectedStock.isin || selectedStock.ticker}
              </div>
            </div>

            <div className="metric-value" style={{ fontSize: '32px', color: 'var(--accent-emerald)', marginBottom: '24px' }}>
              €{selectedStock.totalValue.toLocaleString()}
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Breakdown by Source
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedStock.sources.map((source: any) => (
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
                  <div style={{ fontSize: '16px', fontWeight: '600', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                    €{source.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Exposure Flow */}
            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                <TrendingUp size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Exposure Flow
              </div>
              {selectedStock.sources.map((source: any) => (
                <div key={source.etf} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--accent-blue)', fontWeight: '600', width: '80px' }}>
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
          <GlassCard style={{ padding: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <Search size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
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

### 4.4 Phase 6C Verification

**End-to-End Test:**
1. Run pipeline to generate fresh data
2. Navigate to X-Ray tab
3. Verify:
   - [ ] Health card shows correct stats
   - [ ] Attention section appears if unresolved > 0
   - [ ] Filter buttons work
   - [ ] Sort dropdown works
   - [ ] Search filters holdings
   - [ ] Badge appears on each holding card
   - [ ] Tooltip shows on badge hover
   - [ ] Detail panel shows resolution info

---

## 5. Design System

### 5.1 Colors (from styles.css)

| Variable | Value | Usage |
|----------|-------|-------|
| `--accent-emerald` | `#10b981` | Verified, Success |
| `--accent-blue` | `#3b82f6` | High Confidence |
| `--accent-cyan` | `#06b6d4` | Values, Links |
| `--accent-red` | `#ef4444` | Unresolved, Errors |
| `--text-tertiary` | `#64748b` | Skipped, Muted |

### 5.2 Typography

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Card Title | 16px | 600 | Primary |
| Stat Value | 24-32px | 700 | Mono |
| Badge Label | 11px | 500 | Primary |
| Tooltip Text | 12px | 400/500 | Primary |

### 5.3 Spacing

| Element | Padding | Gap |
|---------|---------|-----|
| Card | 20-24px | - |
| Badge | 4px 10px | 6px |
| Tooltip | 16px | 8px |
| Stats Grid | - | 16px |

---

## 6. Edge Cases & Error Handling

### 6.1 Missing Data

| Scenario | Handling |
|----------|----------|
| `resolutionConfidence` is null | Default to 0 |
| `resolutionSource` is null | Display "Unknown" |
| `resolutionStatus` is null | Default to "unknown" |
| `summary` is missing | Use `EMPTY_SUMMARY` constant |
| Legacy CSV (no resolution cols) | Backend adds defaults |

### 6.2 UI Edge Cases

| Scenario | Handling |
|----------|----------|
| 0 holdings | Show empty state message |
| 0 unresolved | Hide NeedsAttentionSection |
| 1000+ holdings | Virtual scrolling (future) |
| Long stock names | Truncate with ellipsis |
| Tooltip off-screen | CSS handles positioning |

### 6.3 Error States

| Scenario | Handling |
|----------|----------|
| API error | Show error message + retry button |
| Loading | Show spinner |
| Partial data | Render what's available |

---

## 7. Testing Strategy

### 7.1 Unit Tests (Phase 6B)

**File:** `src/components/common/__tests__/ResolutionStatusBadge.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import ResolutionStatusBadge from '../ResolutionStatusBadge';

describe('ResolutionStatusBadge', () => {
  it('renders verified badge for provider source', () => {
    render(<ResolutionStatusBadge status="resolved" source="provider" confidence={1.0} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders high confidence for >= 0.80', () => {
    render(<ResolutionStatusBadge status="resolved" source="hive" confidence={0.90} />);
    expect(screen.getByText('High Confidence')).toBeInTheDocument();
  });

  it('renders medium confidence for 0.50-0.79', () => {
    render(<ResolutionStatusBadge status="resolved" source="api_finnhub" confidence={0.75} />);
    expect(screen.getByText('Medium Confidence')).toBeInTheDocument();
  });

  it('renders unresolved for status unresolved', () => {
    render(<ResolutionStatusBadge status="unresolved" confidence={0} />);
    expect(screen.getByText('Unresolved')).toBeInTheDocument();
  });

  it('renders skipped for status skipped', () => {
    render(<ResolutionStatusBadge status="skipped" confidence={0} />);
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });
});
```

### 7.2 Integration Tests (Phase 6C)

**File:** `src/components/views/__tests__/HoldingsView.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HoldingsView from '../HoldingsView';
import { getTrueHoldings } from '../../../lib/ipc';

jest.mock('../../../lib/ipc');

const mockResponse = {
  holdings: [
    { stock: 'Apple', ticker: 'AAPL', totalValue: 1000, resolutionStatus: 'resolved', resolutionConfidence: 1.0, resolutionSource: 'provider', sources: [] },
    { stock: 'Unknown', ticker: 'UNK', totalValue: 500, resolutionStatus: 'unresolved', resolutionConfidence: 0, sources: [] },
  ],
  summary: { total: 2, resolved: 1, unresolved: 1, skipped: 0, bySource: { provider: 1 }, healthScore: 0.5 },
};

describe('HoldingsView', () => {
  beforeEach(() => {
    (getTrueHoldings as jest.Mock).mockResolvedValue(mockResponse);
  });

  it('renders health card with correct stats', async () => {
    render(<HoldingsView />);
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('Resolved')).toBeInTheDocument();
    });
  });

  it('shows needs attention section when unresolved > 0', async () => {
    render(<HoldingsView />);
    await waitFor(() => {
      expect(screen.getByText(/Holdings Need Attention/)).toBeInTheDocument();
    });
  });

  it('filters to unresolved when filter clicked', async () => {
    render(<HoldingsView />);
    await waitFor(() => screen.getByText('Apple'));
    
    await userEvent.click(screen.getByText('Unresolved'));
    
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
```

### 7.3 Manual QA Checklist

- [ ] Health card displays correct percentages
- [ ] Source breakdown bars are proportional
- [ ] Attention section shows only problematic holdings
- [ ] Clicking attention item selects it in main list
- [ ] Filter "All" shows all holdings
- [ ] Filter "Resolved" hides unresolved
- [ ] Filter "Unresolved" shows only unresolved
- [ ] Filter "Low Confidence" shows < 80%
- [ ] Sort by Value orders descending
- [ ] Sort by Confidence orders ascending (worst first)
- [ ] Sort by Name orders alphabetically
- [ ] Search filters by name, ticker, original ticker
- [ ] Badge tooltip appears on hover
- [ ] Tooltip shows correct source label
- [ ] Tooltip shows original input vs resolved
- [ ] Detail panel shows resolution badge
- [ ] Responsive on smaller screens

---

## 8. Workstream Task Mapping

| Workstream Task | Plan Section | Phase |
|-----------------|--------------|-------|
| IR-606 | 2.4, 2.5, 2.6, 2.7 | 6A |
| IR-601 | 3.3 | 6B |
| IR-602 | 3.4 | 6B |
| IR-607 | 3.5 | 6B |
| IR-608 | 3.6 | 6B |
| IR-609 | 3.7 | 6B |
| IR-604 | 4.2, 4.3 | 6C |

---

## 9. Execution Summary

| Phase | Tasks | Effort | Deliverable |
|-------|-------|--------|-------------|
| **6A** | 6A.1-6A.4 | 0.5 day | Resolution data in API response |
| **6B** | 6B.1-6B.5 | 1 day | 4 isolated React components |
| **6C** | 6C.1-6C.2 | 0.5 day | Full HoldingsView integration |

**Total:** ~2 days

**Dependencies:**
- 6B can start in parallel with 6A (use mock data)
- 6C requires both 6A and 6B complete
