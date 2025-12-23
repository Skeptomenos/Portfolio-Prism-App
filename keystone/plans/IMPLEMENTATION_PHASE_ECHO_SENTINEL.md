# Implementation Plan: Echo-Sentinel (Auto-Feedback System)

> **Status:** Draft
> **Owner:** Sisyphus
> **Workstream:** beautiful-logs
> **Related Strategy:** `keystone/plans/PROJECT_ECHO_STRATEGY.md`

## 🎯 Objective
Implement a crash-safe, privacy-first automated error reporting system that captures logs locally (SQLite) and reports them to GitHub on the next app launch. This ensures no errors are lost due to crashes while respecting user privacy and preventing network spam.

---

## 🏗️ Architecture

### Data Flow
1. **Capture:** `logger.error()` / `window.onerror` → `SQLiteLogHandler` → `system_logs` table (local).
2. **Persist:** Logs stored with `processed=0`, `component`, `category`, and `error_hash`.
3. **Audit:** On next startup (5s delay), `Echo-Sentinel` queries unprocessed ERROR logs.
4. **Batch:** Logs are grouped by `component` + `category` and deduped by `error_hash`.
5. **Check:** User preference checked (Auto / Review / Off).
6. **Report:** Batches sent to Cloudflare Worker → GitHub Issues.
7. **Mark:** Logs marked `processed=1` with `reported_at` timestamp.

### Schema Enhancements
New columns for `system_logs`:
- `component`: `shell` | `ui` | `pipeline` | `data` | `integrations` | `build`
- `category`: `crash` | `api_error` | `data_corruption` | `scraper_failed` | `adapter_missing`
- `error_hash`: MD5 of stack trace or error message (for dedup)
- `reported_at`: Timestamp of successful report

---

## 📋 Phased Implementation

### Phase 1: Foundation (Schema & Logger)
**Goal:** Capture rich error data locally.

- [ ] **TASK-SENTINEL-001:** Update `system_logs` schema.
    - Add `component`, `category`, `error_hash`, `reported_at` columns.
    - Migration script for existing DB.
- [ ] **TASK-SENTINEL-002:** Enhance `SQLiteLogHandler`.
    - Implement `categorize_error()` helper.
    - Populate new columns during logging.
- [ ] **TASK-SENTINEL-003:** Wire up Global Error Hooks.
    - Python: `sys.excepthook` → Logger.
    - React: `window.onerror` / `unhandledrejection` → IPC → Logger.
    - IPC: Catch backend failures → Logger.

### Phase 2: The Sentinel (Startup Auditor)
**Goal:** Process and report logs from previous sessions.

- [ ] **TASK-SENTINEL-004:** Create `prism_utils/sentinel.py`.
    - Implement `audit_previous_session()`.
    - Query unprocessed errors.
    - Group by component/category.
- [ ] **TASK-SENTINEL-005:** Implement Reporting Logic.
    - Integrate with `telemetry.py`.
    - Batch formatting (Markdown table of errors).
    - Rate limiting checks.
- [ ] **TASK-SENTINEL-006:** Startup Integration.
    - Call Sentinel in `prism_headless.py` (async, 5s delay).
    - Ensure non-blocking execution.

### Phase 3: Cloudflare & Deduplication
**Goal:** Prevent duplicate GitHub issues.

- [ ] **TASK-SENTINEL-007:** Add `/report` endpoint to Worker.
    - Separate from user `/feedback`.
    - Accept batch reports.
- [ ] **TASK-SENTINEL-008:** Implement Deduplication.
    - Search existing open issues by `error_hash`.
    - If found: Add comment (update count).
    - If new: Create issue.

### Phase 4: User Control & UI
**Goal:** Give users visibility and control.

- [ ] **TASK-SENTINEL-009:** Telemetry Settings.
    - Add `telemetry_mode`: `auto` | `review` | `off`.
    - Sync setting between UI and Python.
- [ ] **TASK-SENTINEL-010:** Health Dashboard UI.
    - Show "Recent Reports" list.
    - Show "Pending Reviews" queue.
    - "Send Now" / "Dismiss" actions.

---

## 🧠 Technical Decisions

### Why SQLite Buffer?
- **Crash Safety:** Network calls fail during crashes; SQLite is reliable.
- **Performance:** Zero network overhead during runtime.
- **Privacy:** Allows "Review before send" workflow.

### Why Cloudflare Dedup?
- **Client-side dedup** only knows about *local* history.
- **Server-side dedup** prevents 1000 users from reporting the same bug 1000 times.

### Error Hashing
- Hash: `MD5(ErrorType + StackTrace[Top 3 Frames])`
- Ignores: Line numbers (if possible), variable memory addresses.
