# PRD: Phase 3 - Quality Propagation

> **Project:** Pipeline Hardening - Phase 3  
> **Goal:** Make data quality visible to users in the UI  
> **Duration:** 2-3 days  
> **Dependencies:** Phase 1 (Contracts) ✅, Phase 2 (Validation Gates) ✅

---

## Executive Summary

Phase 2 added `data_quality` to `pipeline_health.json`, but users can't see it yet. This phase surfaces quality scores, issues, and fix hints in the Health tab UI, enabling users to understand and act on data quality problems.

---

## Current State

### Backend (COMPLETE)
- `pipeline_health.json` includes `data_quality` section after successful pipeline run
- Structure:
```json
{
  "data_quality": {
    "quality_score": 0.85,
    "is_trustworthy": false,
    "total_issues": 5,
    "issues": [
      {
        "severity": "high",
        "category": "weight",
        "code": "WEIGHT_SUM_LOW",
        "message": "Weight sum is 85.2%, below expected ~100%",
        "fix_hint": "Holdings data may be incomplete",
        "item": "IE00B4L5Y983",
        "phase": "ETF_DECOMPOSITION"
      }
    ]
  }
}
```

### Frontend (NEEDS WORK)
- `HealthView.tsx` displays:
  - Telemetry settings
  - Hive contribution toggle
  - Status cards (Last Run, Hive Hit Rate, Telemetry, Active Errors)
  - Active Issues (from `failures` array)
  - ETF Decomposition Status table
- **Missing:** Data Quality section

### TypeScript Interface (NEEDS UPDATE)
Current `HealthData` interface in `HealthView.tsx` (lines 8-37) lacks `data_quality` field.

---

## Deliverables

### 1. Update TypeScript Interface

Add to `HealthData` interface in `HealthView.tsx`:

```typescript
interface DataQualityIssue {
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    code: string;
    message: string;
    fix_hint: string;
    item: string;
    phase: string;
    timestamp?: string;
    expected?: string;
    actual?: string;
}

interface DataQuality {
    quality_score: number;
    is_trustworthy: boolean;
    total_issues: number;
    issues: DataQualityIssue[];
}

interface HealthData {
    // ... existing fields ...
    data_quality?: DataQuality;  // NEW - optional for backward compatibility
}
```

### 2. Add Data Quality Card to Status Grid

Insert a new `StatusCard` showing quality score:

```tsx
<StatusCard 
    label="Data Quality" 
    value={health?.data_quality ? `${Math.round(health.data_quality.quality_score * 100)}%` : 'N/A'} 
    icon={health?.data_quality?.is_trustworthy ? CheckCircle : AlertCircle}
    color={health?.data_quality?.is_trustworthy ? "green" : health?.data_quality?.quality_score > 0.7 ? "orange" : "red"}
/>
```

### 3. Add Data Quality Section

New section between "Active Issues" and "ETF Decomposition Status":

**Design Requirements:**
- Header: "Data Quality" with score badge (e.g., "87%")
- Trustworthiness indicator: Green checkmark if `is_trustworthy`, orange warning if not
- User message: Clear, actionable text based on score
- Issue list: Grouped by severity (critical first, then high, medium, low)
- Each issue shows:
  - Severity badge (color-coded)
  - Code + Message
  - Affected item (ISIN or "portfolio")
  - Fix hint (actionable button style)
  - Phase where detected

**Visual Hierarchy:**
```
┌─────────────────────────────────────────────────────────────┐
│ Data Quality                                    Score: 87%  │
│ ─────────────────────────────────────────────────────────── │
│ ⚠️ Data quality: 87% - 2 issue(s) may affect accuracy       │
│                                                             │
│ ┌─ HIGH ─────────────────────────────────────────────────┐  │
│ │ WEIGHT_SUM_LOW: Weight sum is 85.2%, below expected    │  │
│ │ Item: IE00B4L5Y983 • Phase: ETF_DECOMPOSITION          │  │
│ │ [Fix: Holdings data may be incomplete]                 │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ MEDIUM ───────────────────────────────────────────────┐  │
│ │ LOW_SECTOR_COVERAGE: Only 45% of holdings have sector  │  │
│ │ Item: IE00B4L5Y983 • Phase: ENRICHMENT                 │  │
│ │ [Fix: Sector breakdown will be incomplete]             │  │
│ └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4. Color Scheme for Severity

| Severity | Background | Border | Text |
|----------|------------|--------|------|
| critical | `rgba(239, 68, 68, 0.1)` | `#ef4444` | `#ef4444` |
| high | `rgba(245, 158, 11, 0.1)` | `#f59e0b` | `#f59e0b` |
| medium | `rgba(59, 130, 246, 0.1)` | `#3b82f6` | `#3b82f6` |
| low | `rgba(156, 163, 175, 0.1)` | `#9ca3af` | `#9ca3af` |

### 5. Empty State

When `data_quality` is undefined or has no issues:

```tsx
{(!health?.data_quality || health.data_quality.total_issues === 0) && (
    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
        <CheckCircle size={48} style={{ color: '#10b981', marginBottom: '16px' }} />
        <p>No data quality issues detected</p>
    </div>
)}
```

---

## Implementation Tasks

### US-001: Add DataQuality TypeScript interfaces
**File:** `src/components/views/HealthView.tsx`
**Lines:** 8-37 (extend HealthData interface)
**Acceptance:** TypeScript compiles without errors

### US-002: Add Data Quality status card
**File:** `src/components/views/HealthView.tsx`
**Lines:** ~320-346 (Status Cards grid)
**Acceptance:** Fifth card shows quality score with appropriate color

### US-003: Create QualityIssueCard component
**File:** `src/components/views/HealthView.tsx` (inline) or new file
**Acceptance:** Renders single issue with severity badge, message, item, phase, fix hint

### US-004: Create DataQualitySection component
**File:** `src/components/views/HealthView.tsx`
**Acceptance:** Section with header, score badge, user message, issue list

### US-005: Integrate DataQualitySection into HealthView
**File:** `src/components/views/HealthView.tsx`
**Lines:** Insert after "Active Issues" section (~line 384)
**Acceptance:** Section renders when `data_quality` exists

### US-006: Handle empty/missing data_quality gracefully
**File:** `src/components/views/HealthView.tsx`
**Acceptance:** No crash when `data_quality` is undefined; shows "N/A" or empty state

### US-007: Add severity color helper function
**File:** `src/components/views/HealthView.tsx`
**Acceptance:** `getSeverityColor(severity)` returns correct color scheme

### US-008: Test with mock data
**Acceptance:** UI renders correctly with sample `data_quality` object

---

## Out of Scope (Phase 4+)

- SSE broadcast of quality updates (Phase 4)
- Per-record quality columns in CSV (Phase 4)
- Telemetry reporting of quality issues (Phase 4)
- Clicking fix hints to take action (future)

---

## Acceptance Criteria

- [ ] `HealthData` interface includes `data_quality` field
- [ ] Status card grid shows Data Quality score
- [ ] Data Quality section renders issues grouped by severity
- [ ] Each issue shows severity, code, message, item, phase, fix hint
- [ ] Colors match severity (critical=red, high=orange, medium=blue, low=gray)
- [ ] Empty state shown when no issues
- [ ] No TypeScript errors
- [ ] No runtime crashes when `data_quality` is undefined

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/views/HealthView.tsx` | Add interfaces, status card, quality section |

---

## Testing

1. Run `npm run tauri dev`
2. Navigate to Health tab
3. Verify Data Quality card shows "N/A" (no recent pipeline run with contracts)
4. Run pipeline (if possible) or mock `data_quality` in response
5. Verify issues render with correct styling

---

## Notes

- The `data_quality` field is optional for backward compatibility with old health reports
- Phase 2 already writes `data_quality` to `pipeline_health.json` - this phase just displays it
- Login issues are blocking live testing; may need to mock data for development
