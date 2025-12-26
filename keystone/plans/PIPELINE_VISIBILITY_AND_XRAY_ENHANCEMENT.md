# Pipeline Operations & Data Visibility Plan

## 1. Executive Summary

We will transform the **X-Ray Tab** into a **Pipeline Operations Center**.
Instead of showing generic, often incorrect summary charts ("Sector Allocation"), this view will become the "Debug Console" for the user's portfolio data. It will answer:

1. "What exactly did the pipeline do?"
2. "Which ETFs were successfully looked-through?"
3. "What is missing or broken?"
4. "How do I fix the missing data?"

> **Note on Architecture:** We will continue to use the JSON/CSV output artifacts (`pipeline_health.json`, `unresolved_holdings.csv`) as the data source for this view. These files act as the "Flight Recorder" for the most recent pipeline run, providing a detailed snapshot that is perfect for this type of inspection without polluting the main database with transient debug data.

---

## 2. The New "Glass Box" UI Structure

The X-Ray view will be rebuilt with a "Pipeline-First" layout.

### Zone 1: The Pipeline Timeline (Refined)

A visual stepper that maps the journey of the data.

- **Visual:** Horizontal steps with clear status indicators (Success, Warning, Error) and counts.
- **Status Detail:**
  - **Step 1: Load:** "Loaded 12 Positions"
  - **Step 2: Decompose:** "Decomposed 4/5 ETFs (1 Failed)"
    - _Interaction:_ Click to filter the main view to "ETF Resolution".
  - **Step 3: Enrich:** "Enriched 450 Holdings (98% Coverage)"
    - _Interaction:_ Click to filter the main view to "Enrichment Status".
  - **Step 4: Aggregate:** "Computed Trust Score"

### Zone 2: The Operations Desk (Tabbed Interface)

This replaces the old charts. This is where the work happens.

#### 📁 Tab A: Holdings Resolution (The "Input" View)

**Goal:** Show exactly how we broke down the user's portfolio.

- **Table Logic:**
  - **Parent Asset:** ETF Name / Ticker.
  - **Status:** ✅ Resolved / ⚠️ Partial / ❌ Failed.
  - **Source:** "Amundi Adapter" / "State Street Adapter" / "Cached".
  - **Holdings Count:** "456 positions found".
- **Drill-Down:** Clicking an ETF expands to show its top 10 underlying holdings (proof of life).

#### 🚨 Tab B: Action Queue (Unresolved Items)

**Goal:** The "To-Do List" for data quality.

- **Priority List:** Sorted by `% of Portfolio Value`.
- **Columns:**
  - **Item:** Name / ISIN.
  - **Issue:** "No Ticker found" / "Invalid ISIN" / "Adapter Failed".
  - **Impact:** "Affected 4.2% of portfolio".
  - **Action:**
    - Button: "Upload Holdings CSV" (If we have the UI for it).
    - Button: "Map Manually" (Placeholder or link to Mapping UI).
    - Button: "Contribute to Hive" (If applicable).

#### 🐝 Tab C: Hive & Enrichment Log

**Goal:** Show the "Community Power".

- **Stats:** "405 assets enriched via Hive", "12 new assets contributed".
- **List:**
  - **Contributed:** Items sent to the Hive during this run.
  - **Leeched:** Items pulled from Hive.
- **Purpose:** Build trust that the "Community" aspect is real and working.

#### 🔍 Tab D: True Exposure Explorer (The "Output" View)

**Goal:** Full raw data access.

- **Datagrid:** A virtualized table of the final `true_exposure.csv`.
- **Searchable:** Filter by Sector, Country, Name.
- **Columns:** Asset, Weight, Value, Sector, Region.

---

## 3. Backend Enhancements Required (`pipeline.py`)

To support "Tab C" (Hive Log) and "Tab A" (Detailed Source info), we need to update the pipeline to log more metadata.

- [ ] **Enhance `PipelineMonitor`:**
  - Track _lists_ of ISINs for `hive_hits` and `hive_misses`, not just counts.
  - Track "New Contributions" (items that were unknown and now created/queued for Hive).
- [ ] **Enhance `DecompositionSummary`:**
  - Include the _Source_ of the decomposition (e.g., "ishares_adapter", "cached_csv") in the `pipeline_health.json`.

---

## 4. Implementation Steps

1.  **Backend Upgrade (`python/core/pipeline.py`):**

    - Modify `PipelineMonitor` to store sets of ISINs for hits/misses.
    - Update `_build_summary` to include this granular data in `pipeline_health.json`.

2.  **Frontend Components (`src/components/views/xray/`):**

    - `PipelineStepper.tsx`: The status bar.
    - `ResolutionTable.tsx`: The ETF breakdown.
    - `ActionQueue.tsx`: The priority list of fixes.
    - `HiveLog.tsx`: The community stats.
    - `TrueExposureTable.tsx`: The raw data viewer.

3.  **Integration (`XRayView.tsx`):**
    - Remove old charts.
    - Implement the Tabbed container.
    - Wire up the new components to the `experiments` outputs.

## 5. Verification

- **User Flow:** Run analysis -> See Stepper move -> See "1 ETF Failed" -> Click "Action Queue" -> See the specific ETF and error reason.
- **Data health:** Verify the "Hive Log" accurately reflects items looked up in the DB vs fetched from APIs.
