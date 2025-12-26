# Pipeline Inspection Experience (Frontend Plan)

## 1. Objective

Replace the static charts in `XRayView.tsx` with a **Pipeline Operations Dashboard**.
This dashboard will read from the generated JSON/CSV artifacts (`pipeline_health.json`, `true_exposure.csv` etc.) to provide transparency into the "Black Box".

**New Component Location:** `src/components/views/xray/`

---

## 2. Component Specifications

### A. `PipelineStepper` (`src/components/views/xray/PipelineStepper.tsx`)

**Goal:** Visual timeline of the pipeline execution.

- **Props:**
  - `steps`: Array of `{ label: string, status: 'pending'|'active'|'success'|'error', detail: string }`.
  - `onStepClick`: Callback when a user clicks a step (updates the active "Tab" below).
- **Data Source:**
  - Reads `usePipelineProgress` hook for live status.
  - Reads `pipeline_health.json` for final historical counts.
- **Visuals:** Horizontal steps. Green check for success. Red X for failures.

### B. `ResolutionTable` (`src/components/views/xray/ResolutionTable.tsx`)

**Goal:** Show ETF Decomposition results (The "Input").

- **Data Source:** `pipeline_health.json["decomposition"]["per_etf"]`.
- **Columns:**
  - `ETF Name`: (e.g., "iShares Core S&P 500").
  - `Status`: Badge (✅ Resolved, ⚠️ Partial, ❌ Failed).
  - **`Source`**: Badge (Amundi Adapter, Cached CSV, Hive). **<-- CRITICAL NEW FIELD**
  - `Holdings`: Count (e.g., 503).
- **Interaction:** Clicking row expands to show "Source Confidence" or error details.

### C. `ActionQueue` (`src/components/views/xray/ActionQueue.tsx`)

**Goal:** Prioritized list of data quality issues.

- **Data Source:** `pipeline_health.json["failures"]` OR `unresolved_holdings.csv` (via IPC).
- **Logic:**
  1. Filter out known "Ignore" items (if any).
  2. Sort by `Weight` descending (fix the biggest holes first).
- **Columns:**
  - `Issue`: "Invalid ISIN" or "Adapter Failed".
  - `Affected Item`: Name of the ETF or Stock.
  - `Impact`: % of portfolio value.
  - `Action`: "Fix" button (opens Modal/Upload UI).

### D. `HiveLog` (`src/components/views/xray/HiveLog.tsx`)

**Goal:** Show Community vs API usage.

- **Data Source:** `pipeline_health.json["enrichment"]["hive_log"]`.
- **Visuals:**
  - **Summary Card:** "450 Assets from Hive / 12 Contributed".
  - **Contribution List:** "Shared `Nvidia Corp` with the community".
  - **Hit List:** "Found `Vanguard All-World` in Hive".

### E. `TrueExposureTable` (`src/components/views/xray/TrueExposureTable.tsx`)

**Goal:** The raw output explorer.

- **Data Source:** `true_exposure_report.csv` (Needs a CSV parsing hook).
- **Features:**
  - Virtualized list (for performance with 5000+ rows).
  - Text Search (Name, ISIN).
  - Sortable headers (Weight, Value, Sector).

---

## 3. Data Integration Strategy

### Hooks (`src/hooks/usePipelineDiagnostics.ts`)

We need a new hook to fetch the _diagnostic_ files, which are distinct from the _analytics_ data.

```typescript
export function usePipelineDiagnostics() {
  return useQuery({
    queryKey: ["pipelineDiagnostics"],
    queryFn: async () => {
      // Calls new IPC command `get_pipeline_diagnostics`
      // Returns contents of pipeline_health.json
    },
  });
}
```

### IPC Command (`src-tauri/src/lib.rs`)

- Need to expose a command `get_pipeline_health_report` that simply reads `data/outputs/pipeline_health.json` and returns it as a JSON object.

---

## 4. Execution Steps

1.  **Refactor Directory:** Create `src/components/views/xray/`.
2.  **Create Helper Hook:** `usePipelineDiagnostics`.
3.  **Build Components:**
    - `PipelineStepper.tsx`
    - `ResolutionTable.tsx`
    - `HiveLog.tsx`
    - `ActionQueue.tsx`
4.  **Assemble `XRayView.tsx`:**
    - Replace current View.
    - Add Tab state (`activeTab` = 'resolution' | 'actions' | 'hive' | 'output').
    - Render `PipelineStepper` at top.
    - Render generic `GlassCard` container for the active tab content.

---

## 5. Verification Plan

- **Mock Mode:** Create a `mock_pipeline_health.json` with fake "Hive Contributions" and check if `HiveLog` renders them.
- **Error State:** Corrupt the JSON and ensure the UI handles it gracefully (Empty state).
- **Interactive:** Verify clicking "Step 2" in Stepper switches the Tab to "ResolutionTable".
