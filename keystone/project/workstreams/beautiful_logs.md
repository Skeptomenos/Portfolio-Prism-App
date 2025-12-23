# Workstream: beautiful-logs

> **Feature Plan:** `keystone/plans/BEAUTIFUL_LOGS_FEATURE.md`
> **Owner:** Sisyphus
> **Status:** Done
> **Last Heartbeat:** 2025-12-22

---

## 🎯 Objective
Transform the developer experience (DX) by overhauling the terminal output for build and runtime processes. Replace messy logs with structured, visually pleasing, and technically accurate output using a unified CLI orchestrator.

## 🚨 Critical Constraints
- [x] Must not break existing build pipeline
- [x] Must be cross-platform compatible (macOS/Linux/Windows)
- [x] Zero runtime overhead for production builds

---

## 📋 Tasks (Source of Truth)

- [x] **TASK-LOG-001:** Create `scripts/prism.py` Orchestrator with `rich` UI.
    - **Status:** Done
    - **Workstream:** beautiful-logs

- [x] **TASK-LOG-002:** Implement Rust-Python Log Bridge (Level Mapping).
    - **Status:** Done
    - **Workstream:** beautiful-logs

- [x] **TASK-LOG-003:** Suppress Noisy 3rd Party Libraries (yfinance, httpx).
    - **Status:** Done
    - **Workstream:** beautiful-logs

- [x] **TASK-LOG-004:** Implement Live Build Progress Bars (Milestone Mapping).
    - **Status:** Done
    - **Workstream:** beautiful-logs

- [x] **TASK-LOG-005:** Add System Prerequisite Check.
    - **Status:** Done
    - **Workstream:** beautiful-logs

- [x] **TASK-LOG-006:** Cleanup Legacy Shell Scripts.
    - **Status:** Done
    - **Workstream:** beautiful-logs

- [x] **TASK-LOG-008:** Codify Logging Standards in `keystone/standards/python.md`.
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Add "The Law" for logging (logger setup, exc_info, context).

- [x] **TASK-LOG-009:** Implement `PrismFormatter` (The Face).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Create native Python formatter with `PRISM ↳` prefix and ANSI colors.

- [x] **TASK-LOG-010:** Global Interception (Uvicorn & Stdout).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Route Uvicorn logs and raw `sys.stdout/stderr` through the `PrismFormatter`.

- [x] **TASK-LOG-011:** Rust Handshake Refinement.
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Simplify Rust bridge to pass through `PRISM ↳` prefixed lines raw.

- [x] **TASK-LOG-007:** Enhance GitHub Feedback Issues with rich metadata and structured formatting.
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:**
      - Better title: Use first ~50 chars of message (e.g., `[BUG] Login fails after 2FA timeout...`)
      - Richer metadata: App version, platform, environment (Tauri/browser), current view, anonymized stats
      - Better labels: `functional` → `bug`, `feature` → `enhancement`, `ui_ux` → `ui/ux`
      - Structured body: Markdown table for context, separate sections for Description/Context/System Info
    - **Files:**
      - `src/lib/api/feedback.ts` - Collect richer metadata
      - `infrastructure/cloudflare/worker.js` - Format issue title & body
      - `src/components/feedback/FeedbackDialog.tsx` - Pass environment context

- [x] **TASK-SENTINEL-001:** Update `system_logs` schema (Foundation).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Add `component`, `category`, `error_hash`, `reported_at` columns.

- [x] **TASK-SENTINEL-002:** Enhance `SQLiteLogHandler` (Foundation).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Implement `categorize_error()` and populate new columns.

- [x] **TASK-SENTINEL-003:** Wire up Global Error Hooks (Foundation).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** `sys.excepthook`, `window.onerror`, IPC error handling.

- [x] **TASK-SENTINEL-004:** Create `prism_utils/sentinel.py` (Sentinel).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Implement `audit_previous_session()` to query unprocessed errors.

- [x] **TASK-SENTINEL-005:** Implement Reporting Logic (Sentinel).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Batch formatting, rate limiting, integration with `telemetry.py`.

- [x] **TASK-SENTINEL-006:** Startup Integration (Sentinel).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Async startup call in `prism_headless.py`.

- [x] **TASK-SENTINEL-007:** Add `/report` endpoint to Worker (Cloudflare).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Separate endpoint for batch reports.

- [x] **TASK-SENTINEL-008:** Implement Deduplication (Cloudflare).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Server-side deduplication using `error_hash`.

- [x] **TASK-SENTINEL-009:** Telemetry Settings (UI).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** `telemetry_mode` setting (auto/review/off).

- [x] **TASK-SENTINEL-010:** Health Dashboard UI (UI).
    - **Status:** Done
    - **Workstream:** beautiful-logs
    - **Scope:** Recent reports list, pending review queue.

---

## 🧠 Active State (Session Log)
> **Current Focus:** Workstream complete. All tasks done.

### Iteration Log
- **2025-12-22:** E2E tested Echo-Sentinel (all 4 phases). Fixed `ErrorBoundary.tsx` to use `telemetryMode` instead of deprecated `autoReportErrors`. Created architecture doc `keystone/architecture/ECHO_SENTINEL_ARCHITECTURE.md`.
- **2025-12-22:** Completed Phase 4 of Echo-Sentinel. Implemented Telemetry settings UI in Health dashboard, added `telemetry_mode` to global store, and created views for recent reports and pending reviews.
- **2025-12-22:** Completed Phase 3 of Echo-Sentinel. Enhanced Cloudflare Worker with `/report` endpoint and server-side deduplication using `error_hash`. Updated `telemetry.py` and `sentinel.py` to support deduplicated reporting.
- **2025-12-22:** Completed Phase 2 of Echo-Sentinel. Implemented `sentinel.py` for session auditing, integrated with `telemetry.py`, and updated `prism_headless.py` to run the auditor on startup in both HTTP and stdin modes.
- **2025-12-22:** Completed Phase 1 of Echo-Sentinel. Updated schema, enhanced SQLite logger with auto-categorization and hashing, and wired up global error hooks for Python and React.
- **2025-12-22:** Reopened workstream for feedback enhancement. Feedback dialog now works end-to-end (creates GitHub issues via Cloudflare Worker).
- **2025-12-20:** Finalized "Ultimate Overhaul". Implemented nested progress bars, live log streaming, and aggressive noise filtering.
- **2025-12-20:** Created `keystone/specs/observability.md` to document logging standards.

### Artifacts Produced
- [x] `scripts/prism.py`
- [x] `keystone/plans/BEAUTIFUL_LOGS_FEATURE.md`
- [x] `keystone/specs/observability.md`
- [x] `keystone/architecture/ECHO_SENTINEL_ARCHITECTURE.md`

### Parked Items / Ideas
- [ ] Add "Watch Mode" for Python files (auto-rebuild sidecar on change) - *Low priority*

---

## 💾 Context for Resume (Handover)
- **Next Action:** Implement TASK-LOG-007 (GitHub feedback enhancement).
- **State:** Echo-Sentinel fully implemented and tested. Cloudflare Worker needs `GITHUB_TOKEN` and `GITHUB_REPO` secrets configured for live reporting.

### Current GitHub Issue Format (Before)
```
Title: [FUNCTIONAL] User Feedback
Body:
## Feedback
test

## Metadata
{
  "source": "user_dialog",
  "view": "trade-republic",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2025-12-22T16:30:10.259Z",
  "version": "dev"
}
```

### Target GitHub Issue Format (After)
```
Title: [BUG] Login fails after 2FA timeout - user cannot retry...

Body:
## Description
Login fails after 2FA timeout. User cannot retry without restarting the app.

## Context
| Field | Value |
|-------|-------|
| View | Trade Republic |
| Version | 0.1.0 |
| Platform | macOS 14.2 |
| Environment | Tauri |

## System Info
- Positions: 12
- TR Connected: Yes
- Last Sync: 2 hours ago

---
*Submitted via Portfolio Prism Feedback*
```
