# Alignment Plan: Frontend Mapping Refinement

## 1. Problem

The "ETF Resolution" table is appearing empty because it looks for the `etf_stats` key at the root of the health report. The upgraded backend now nests this under `decomposition.per_etf`.

## 2. Proposed Changes

### A. `ResolutionTable.tsx`

- **Update Mapping:**
  ```tsx
  const etfRows = report?.decomposition?.per_etf || report?.etf_stats || [];
  ```
- **Update Field Names:** The new `per_etf` structure uses `isin` and `name` instead of just `ticker`. Ensure both are handled.

### B. `ActionQueue.tsx`

- **Update Mapping:** Ensure it handles the `failures` array which now has `issue` instead of `error_type` in some places. (Checking `pipeline.py` confirms `issue` is used).

### C. `usePipelineDiagnostics.ts`

- **Refine Types:** Ensure the interface strictly matches the `health_data` dict observed in `pipeline.py`.

## 3. Verification Plan

### Manual Verification

1. Run "Deep Analysis" from the X-Ray tab.
2. Confirm the **ETF Resolution** tab now shows the list of ETFs with their ISINs and Names.
3. Confirm the **Action Queue** correctly displays the "Adapter returned empty holdings" errors seen in previous logs.
4. Confirm **Hive Log** correctly shows the "Hit Rate" and "API Calls" count matching the stepper.
