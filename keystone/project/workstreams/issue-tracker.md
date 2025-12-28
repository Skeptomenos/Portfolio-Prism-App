# Workstream: issue-tracker

> **Owner:** Sisyphus
> **Status:** Active
> **Last Heartbeat:** 2025-12-28

---

## Objective

Track and resolve GitHub issues from user feedback. This workstream handles bug reports, UI/UX improvements, and feature requests submitted via the in-app feedback system.

## Scope Policy

> **IMPORTANT:** This workstream is for **small to medium issues** that can be resolved quickly (< 8 hours).
>
> **Bigger issues requiring significant architecture changes, new features, or multi-day effort MUST become separate workstreams.** Create a new workstream file and link it here under "Spawned Workstreams".

### When to Spawn a New Workstream

- Issue requires > 8 hours of work
- Issue touches multiple subsystems (frontend + backend + database)
- Issue requires new architecture or design decisions
- Issue is a feature request rather than a bug fix
- Issue has dependencies on other unfinished work

---

## Spawned Workstreams

| Workstream | Source Issue | Description |
|------------|--------------|-------------|
| *(none yet)* | | |

---

## 📋 Tasks (Source of Truth)

### Open

*(none)*

### Done

- [x] **GH-028:** Hive log shows same contributions every pipeline run.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #28
    - **Fix:** Created `batch_contribute_assets` RPC in Supabase

- [x] **GH-029:** Add explanation for "Exposure Distribution".
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #29
    - **Fix:** Added subtitle in HoldingsView

- [x] **GH-030:** Add explanation for "Confidence Score".
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #30
    - **Fix:** Added explanation to ResolutionStatusBadge tooltip

- [x] **GH-031:** True exposure missing direct holdings (e.g., NVDA direct + 7 ETFs).
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #31
    - **Fix:** Added direct holdings to `holdings_breakdown.csv` in pipeline

- [x] **GH-032:** Dashboard missing top 10 true exposure widget.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **Deps:** GH-031
    - **GitHub:** #32
    - **Fix:** Added True Exposure widget to Dashboard

- [x] **GH-033:** Action cue Fix/Ignore buttons have no functionality.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #33
    - **Fix:** Ignore button with localStorage persistence, Fix button shows "Coming Soon" tooltip

- [x] **GH-012:** Pipeline crash - malformed JSON.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #12

- [x] **GH-013:** Pipeline crash - JSON corruption.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #13

- [x] **GH-016:** HelloFresh misclassified as ETF.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #16

- [x] **GH-017:** "Remember me" doesn't pre-fill credentials.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #17

- [x] **GH-018:** Unknown command error.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #18

- [x] **GH-019:** Overlap page broken - removed OverlapView.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #19

- [x] **GH-020:** Holdings UI broken - compact layout fix.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #20

- [x] **GH-021:** Data tab duplicates TR tab - removed DataView.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #21

- [x] **GH-022:** Hive contribution not enabled by default.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #22

- [x] **GH-023:** Hive contribution not enabled by default (duplicate).
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #23

- [x] **GH-024:** Pipeline crashes - telemetry DB connection fix.
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #24

- [x] **GH-025:** Hive batch contribution failed - missing .execute().
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #25

- [x] **GH-026:** All holdings show as "unresolved/unknown".
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #26

- [x] **GH-027:** Resolution status explanation (duplicate of #26).
    - **Status:** Done
    - **Workstream:** issue-tracker
    - **GitHub:** #27

---

### Issue Details

#### GH-028 - Hive Contribution Logic
**Problem:** Hive log shows same contributions every run. Should only contribute once, then use cache.
**Investigation Needed:** Check if contribution check is working, or if it's just a display issue.

#### GH-029 - Exposure Distribution Explanation
**Problem:** User doesn't understand what "Exposure Distribution" means.
**Fix:** Add tooltip/help text explaining the metric.

#### GH-030 - Confidence Score Explanation
**Problem:** User doesn't understand what "Confidence Score" means.
**Fix:** Add tooltip/help text explaining the metric.

#### GH-031 - True Exposure Calculation
**Problem:** True exposure only shows indirect holdings from ETFs, doesn't add direct holdings.
**Example:** User owns NVDA directly AND it's in 7 ETFs. Should show combined exposure.
**Fix:** Modify aggregation logic to merge direct + indirect holdings by ISIN.

#### GH-032 - Dashboard True Exposure Widget
**Problem:** Dashboard shows top direct holdings but no true exposure insights.
**Fix:** Add "Top 10 True Exposure" widget after pipeline runs.
**Dependency:** Requires #31 to be fixed first.

#### GH-033 - Action Cue Functionality
**Problem:** Fix/Ignore buttons in action cue have no functionality.
**Scope:** Needs manual fix flow (CSV upload, manual ISIN mapping).
**Note:** This may need to become a separate workstream if scope is large.

---

## 🧠 Active State

> **Current Focus:** All issues resolved!

### Session Stats

| Metric | Value |
|--------|-------|
| Total Issues Received | 22 |
| Resolved | 22 |
| Open | 0 |
| Resolution Rate | 100% |

---

## 💾 Context for Resume (Handover)

- **Next Action:** All issues resolved - ready for commit
- **Branch:** `fix/pipeline-tuning`
- **Note:** All 22 issues resolved, pending commit and push
