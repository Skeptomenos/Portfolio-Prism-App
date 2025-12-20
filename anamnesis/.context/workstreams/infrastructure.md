# Infrastructure Workstream

> **Focus:** Project setup, CI/CD, Telemetry, and Build Pipelines.
> **See Plan:** `docs/MVP_IMPLEMENTATION_PLAN.md` - Phase 0 & 5.

---

## Active Tasks
- [ ] **TASK-611:** Add Pipeline Health Monitoring (Observability).

## Completed Tasks
### 1. Archive Legacy Code ✅
- [x] Move `src-tauri/python/portfolio_src/dashboard` to `reference_dashboard`.
- [x] Ensure old Streamlit app doesn't accidentally launch in production.

### 2. Scaffold React Environment ✅
- [x] Initialize Vite + React + TypeScript in `src/`.
- [x] Configure Tailwind CSS and ShadCN/UI.
- [x] Update Tauri configuration to serve the new React app.

### 3. Telemetry & Monitoring ✅
- [x] Verify PII Scrubber implementation in Rust.
- [x] Test Cloudflare Worker integration for crash reporting.

### 4. Build System Modernization ✅
- [x] **UV Migration:** Convert `requirements-build.txt` to `pyproject.toml` + `uv.lock`.
- [x] Update `build-python.sh` to use `uv run`.

### 5. Build Optimization (In Progress)
- [ ] **TASK-615:** Implement Incremental Builds (Remove --clean).
- [ ] **TASK-616:** Parallelize Spec Builds in `build-python.sh`.
- [ ] **TASK-617:** Implement Change Detection (Hash-based skip).

## Decisions Log
- **2024-12-15:** Prioritized UV migration (`TASK-503`) to ensure deterministic builds for CI/CD.
- **2024-12-12:** Pivoted from Streamlit to React. Infrastructure priority is now supporting the Vite build pipeline.
