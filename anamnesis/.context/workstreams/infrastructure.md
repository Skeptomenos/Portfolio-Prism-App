# Infrastructure Workstream

> **Focus:** Project setup, CI/CD, Telemetry, and Build Pipelines.
> **See Plan:** `docs/MVP_IMPLEMENTATION_PLAN.md` - Phase 0 & 5.

---

## Active Tasks

### 1. Archive Legacy Code
- [ ] Move `src-tauri/python/portfolio_src/dashboard` to `reference_dashboard`.
- [ ] Ensure old Streamlit app doesn't accidentally launch in production.

### 2. Scaffold React Environment
- [ ] Initialize Vite + React + TypeScript in `src/`.
- [ ] Configure Tailwind CSS and ShadCN/UI.
- [ ] Update Tauri configuration to serve the new React app.

### 3. Telemetry & Monitoring
- [ ] Verify PII Scrubber implementation in Rust.
- [ ] Test Cloudflare Worker integration for crash reporting.

### 4. Build System Modernization
- [ ] **UV Migration:** Convert `requirements-build.txt` to `pyproject.toml` + `uv.lock`.
- [ ] Update `build-python.sh` to use `uv run`.

## Decisions Log
- **2024-12-15:** Prioritized UV migration (`TASK-503`) to ensure deterministic builds for CI/CD.
- **2024-12-12:** Pivoted from Streamlit to React. Infrastructure priority is now supporting the Vite build pipeline.
