# Pipeline Transparency - Phase 4: UI Enhancements

> **Parent Plan:** `keystone/plans/PIPELINE_TRANSPARENCY_PLAN.md`
> **Workstream:** `frontend`
> **Created:** 2025-12-25
> **Status:** Blocked (waiting for Phase 3)
> **Delegate To:** `frontend-ui-ux-engineer`

---

## Overview

This phase creates the visual components that display pipeline summary data to users. It depends on Phase 3 (Summary Event) being complete, which provides the `pipeline_summary` SSE event with rich data.

**Prerequisites:**
- XRAY-014 complete (usePipelineProgress hook handles summary event)
- `PipelineSummaryEvent` TypeScript interface defined
- Backend emitting summary events

---

## Design Philosophy

### Visual Hierarchy
1. **Progress Card** (existing) - Real-time progress during execution
2. **Summary Card** (new) - Detailed breakdown after completion
3. **Unresolved List** (new) - Actionable items for user attention

### Design Tokens (from existing codebase)
```css
--accent-blue: #3b82f6
--accent-cyan: #22d3ee
--accent-emerald: #10b981
--accent-red: #ef4444
--text-primary: rgba(255, 255, 255, 0.95)
--text-secondary: rgba(255, 255, 255, 0.7)
--text-tertiary: rgba(255, 255, 255, 0.5)
```

### Animation Principles
- Subtle fade-in for new content (300ms)
- Smooth transitions for collapsible sections
- No jarring movements

---

## Component Specifications

### XRAY-016: PipelineSummaryCard Component

**File:** `src/components/common/PipelineSummaryCard.tsx`

**Props Interface:**
```typescript
interface PipelineSummaryCardProps {
  summary: PipelineSummaryData | null;
  isVisible: boolean;
  onDismiss?: () => void;
}

interface PipelineSummaryData {
  holdings: {
    stocks: number;
    etfs: number;
    total_value: number;
  };
  decomposition: {
    etfs_processed: number;
    etfs_failed: number;
    total_underlying: number;
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
    phases: Record<string, number>;
  };
  unresolved: UnresolvedItem[];
}

interface UnresolvedItem {
  ticker: string;
  name: string;
  weight: number;
  parent_etf: string;
  reason: string;
}
```

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Summary                                    [Collapse Button] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ MetricCard  │  │ MetricCard  │  │ MetricCard  │         │
│  │ Holdings    │  │ ETFs        │  │ Resolution  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Resolution Sources (horizontal bar or list)                │
│                                                             │
│  Unresolved ISINs (collapsible, if any)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Appears with fade-in animation when `isVisible` becomes true
- Collapsible via header button (persists state in localStorage)
- Shows skeleton while summary is null but isVisible is true

**Styling Requirements:**
- Match existing `PipelineProgressCard` glass morphism style
- Use `GlassCard` wrapper component
- Responsive: stack metric cards vertically on mobile

---

### XRAY-017: Resolution Success Rate Badge

**File:** Inline within `PipelineSummaryCard.tsx`

**Visual Design:**
```
┌─────────────────┐
│   91.5%         │  <- Large number, gradient text (blue→cyan)
│  1234/1349      │  <- Smaller, secondary text
│  resolved       │  <- Label, tertiary text
└─────────────────┘
```

**Color Logic:**
| Rate | Color | Icon |
|------|-------|------|
| ≥ 95% | `--accent-emerald` | ✓ checkmark |
| 80-94% | `--accent-cyan` | ◐ partial |
| < 80% | `--accent-red` | ⚠ warning |

**Implementation Notes:**
- Use CSS `background-clip: text` for gradient numbers
- Animate number counting up on first render (optional, low priority)

---

### XRAY-018: Collapsible Unresolved ISINs List

**File:** `src/components/common/UnresolvedIsinsList.tsx`

**Props Interface:**
```typescript
interface UnresolvedIsinsListProps {
  items: UnresolvedItem[];           // Only Tier 1 failures (NOT tier2_skipped)
  totalCount: number;                // Actual total before truncation
  isTruncated: boolean;              // True if backend truncated the list
  skippedTier2Count: number;         // Separate count for informational display
  maxVisible?: number;               // Default: 5 (collapsed state)
}
```

**IMPORTANT: Tier 2 Filtering**
- The `items` array contains ONLY actionable failures (Tier 1)
- Tier 2 skips are NOT shown in this list (they're performance optimizations, not errors)
- `skippedTier2Count` is displayed separately as informational text, not as action items

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ 45 Failed Resolutions                        [Show All ▼] │
│   (70 low-priority items skipped for performance)           │
├─────────────────────────────────────────────────────────────┤
│ ABNB    Airbnb Inc           0.8%   MSCI World   API Failed │
│ PLTR    Palantir Tech        0.6%   S&P 500      API Failed │
│ COIN    Coinbase Global      0.4%   NASDAQ 100   No Ticker  │
│ ... 42 more                                                 │
└─────────────────────────────────────────────────────────────┘

[Expanded State - Truncated]
┌─────────────────────────────────────────────────────────────┐
│ ⚠ 45 Failed Resolutions (showing 45 of 423)    [Show Less] │
├─────────────────────────────────────────────────────────────┤
│ (list of up to 100 items)                                  │
│ Max height: 300px with overflow-y: auto                    │
│                                                             │
│ ℹ 378 additional failures not shown                        │
└─────────────────────────────────────────────────────────────┘
```

**Columns:**
| Column | Width | Content |
|--------|-------|---------|
| Ticker | 60px | Bold, monospace |
| Name | flex | Truncate with ellipsis |
| Weight | 50px | Right-aligned, % |
| Parent ETF | 100px | Truncate |
| Reason | 80px | Badge style |

**Reason Badge Colors (Tier 1 failures only):**
| Reason | Color | Label |
|--------|-------|-------|
| `api_all_failed` | Red | API Failed |
| `no_ticker` | Orange | No Ticker |
| `invalid_isin` | Red | Invalid |

**Note:** `tier2_skipped` is NOT a badge - these items are excluded from the list entirely.

**Behavior:**
- Hidden entirely if `items.length === 0` (even if skippedTier2Count > 0)
- Header shows "Failed Resolutions" (not "Unresolved" - clearer language)
- Subheader shows skipped count as informational text (gray, smaller)
- If `isTruncated`, show "showing X of Y" in header and footer note
- Smooth height transition on expand/collapse
- Keyboard accessible (Enter/Space to toggle)
- Max 100 items rendered (backend truncates, no virtualization needed)

---

### XRAY-019: Phase Timing Breakdown Display

**File:** Inline within `PipelineSummaryCard.tsx`

**Visual Design:**
```
Pipeline completed in 12.4s

Loading      ████░░░░░░░░░░░░░░░░  0.2s (2%)
Decompose    ████████████████░░░░  8.1s (65%)
Enrich       ██████░░░░░░░░░░░░░░  2.8s (23%)
Aggregate    ███░░░░░░░░░░░░░░░░░  1.3s (10%)
```

**Implementation:**
- Horizontal stacked bar showing relative phase durations
- Hover/tap reveals exact timing for each phase
- Use phase colors from existing `PipelineProgressCard`

**Phase Colors (from existing CSS):**
| Phase | Color |
|-------|-------|
| Loading | `--accent-blue` |
| Decomposition | `--accent-cyan` |
| Enrichment | `--accent-emerald` |
| Aggregation | `--accent-purple` (#a855f7) |

---

### XRAY-020: Integration into XRayView

**File:** `src/components/views/XRayView.tsx`

**Changes Required:**

1. Import new components:
```typescript
import { PipelineSummaryCard } from '../common/PipelineSummaryCard';
```

2. Get summary from hook:
```typescript
const { progress, message, phase, isConnected, summary } = usePipelineProgress();
```

3. Render summary card below progress card:
```tsx
{/* Progress Card - existing */}
<PipelineProgressCard ... />

{/* Summary Card - new */}
{summary && (
  <PipelineSummaryCard 
    summary={summary}
    isVisible={!isAnalyzing && progress === 100}
  />
)}
```

4. Layout considerations:
- Summary card appears below progress card
- Smooth transition when progress completes
- Both cards use same width/padding

---

## File Structure

```
src/components/common/
├── PipelineProgressCard.tsx      # Existing - no changes
├── PipelineProgressCard.css      # Existing - no changes
├── PipelineSummaryCard.tsx       # NEW
├── PipelineSummaryCard.css       # NEW
└── UnresolvedIsinsList.tsx       # NEW (or inline)
```

---

## Accessibility Requirements

- All interactive elements keyboard accessible
- ARIA labels for icon-only buttons
- Color is not the only indicator (use icons + text)
- Sufficient contrast ratios (existing design system handles this)
- Screen reader announces summary when it appears

---

## Responsive Breakpoints

| Breakpoint | Layout Change |
|------------|---------------|
| > 768px | 3 metric cards in row, full timing bar |
| 480-768px | 2 metric cards per row, stacked timing |
| < 480px | 1 metric card per row, simplified timing |

---

## Testing Checklist

- [ ] Summary card appears after pipeline completes
- [ ] Collapse/expand persists across page refresh
- [ ] Unresolved list shows correct count
- [ ] Unresolved list expands/collapses smoothly
- [ ] Resolution badge shows correct color for rate
- [ ] Timing breakdown percentages sum to 100%
- [ ] Mobile layout renders correctly
- [ ] Keyboard navigation works
- [ ] No layout shift when summary appears

---

## Delegation Instructions

When delegating to `frontend-ui-ux-engineer`:

```
TASK: Implement PipelineSummaryCard and related UI components

EXPECTED OUTCOME:
- PipelineSummaryCard.tsx with glass morphism styling
- UnresolvedIsinsList.tsx with collapsible behavior
- Resolution badge with color-coded success rate
- Phase timing horizontal bar chart
- All components responsive and accessible

REQUIRED SKILLS: React, CSS, Tailwind (v3), TypeScript

REQUIRED TOOLS: Read, Write, Edit, Glob

MUST DO:
- Follow existing design patterns from PipelineProgressCard.tsx
- Use design tokens from styles.css (--accent-*, --text-*)
- Match glass morphism style of existing cards
- Implement smooth animations (300ms transitions)
- Make all interactive elements keyboard accessible
- Test at 480px, 768px, and 1200px widths

MUST NOT DO:
- Do not modify PipelineProgressCard.tsx
- Do not add new npm dependencies
- Do not use inline styles (use CSS modules or Tailwind)
- Do not break existing XRayView functionality

CONTEXT:
- See keystone/plans/PIPELINE_TRANSPARENCY_PHASE4_UI.md for full specs
- Reference src/components/common/PipelineProgressCard.tsx for styling
- TypeScript interfaces are defined in this plan
- Summary data comes from usePipelineProgress hook (XRAY-015)
```

---

## Success Criteria

1. **Visual Consistency** - New components match existing design language
2. **Smooth Transitions** - No jarring layout shifts or flickers
3. **Responsive** - Works on mobile through desktop
4. **Accessible** - Keyboard navigable, screen reader friendly
5. **Performant** - No unnecessary re-renders, smooth animations
