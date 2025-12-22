# Implementation Phase: Project Echo

**Status:** Ready for Execution
**Date:** 2025-12-20
**Objective:** Enable frictionless browser-based testing and automated, privacy-first GitHub issue reporting.

---

## 🎯 Key Objectives

### 1. Echo-Bridge (Unified Sidecar)
*   **Goal**: Enable the React frontend to run in a standard browser while talking to the real Python engine.
*   **Implementation**:
    *   Add `fastapi` and `uvicorn` support to `prism_headless.py`.
    *   Implement `--http` CLI flag to launch a local web server on port 5000.
    *   Update `src/lib/ipc.ts` to detect environment and use `fetch` as fallback for `invoke`.

### 2. Echo-Reporter (The Redacted Reporter)
*   **Goal**: Automatically report pipeline failures to GitHub without leaking PII.
*   **Implementation**:
    *   Create `portfolio_src/core/reporter.py` with PII scrubbing logic.
    *   Hash ISINs and remove financial values before reporting.
    *   Update Cloudflare Worker to relay reports to GitHub Issues with deduplication.

### 3. Parallelization (Extreme Performance)
*   **Goal**: Further reduce pipeline execution time.
*   **Implementation**:
    *   Implement Async I/O for ETF adapters to fetch holdings in parallel.
    *   Optimize `HiveClient` batch operations for maximum throughput.

---

## 🔧 Implementation Tasks

| Task | Priority | Component | Est. Effort |
| :--- | :--- | :--- | :--- |
| Implement Echo-Bridge (FastAPI Sidecar) | High | `prism_headless.py` | 4 hours |
| Update IPC Layer (Hybrid Fetch/Invoke) | High | `src/lib/ipc.ts` | 2 hours |
| Implement Redacted Reporter (PII Scrubbing) | Medium | `reporter.py` | 4 hours |
| Update Cloudflare Worker (GitHub Relay) | Medium | `worker.js` | 4 hours |
| Implement Async I/O for Adapters | Medium | `adapters/*` | 6 hours |

---

## ✅ Success Criteria

*   **DX**: Developer can run `npm run dev:browser` and test the full app in Chrome.
*   **Observability**: New errors in the pipeline automatically appear as GitHub Issues.
*   **Performance**: Pipeline execution time < 3s for standard portfolios.
