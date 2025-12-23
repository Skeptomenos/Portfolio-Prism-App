# Project Echo: Autonomous Feedback Loop Strategy

**Status:** Completed
**Objective:** Create a frictionless development and testing environment by enabling browser-based execution and automated, privacy-first GitHub issue reporting.

---

## 🎯 The Vision
"Project Echo" transforms Portfolio Prism from a standard desktop app into a self-documenting ecosystem. 
1. **Echo-Bridge**: Developers test the real UI and real logic in a standard browser (`localhost`) with full inspector tools.
2. **Echo-Reporter**: The app automatically detects, scrubs, and reports its own bugs to GitHub, allowing the AI developer to pull and fix issues without manual user intervention.

---

## 🏗️ Technical Architecture

### 1. Echo-Bridge (Unified Sidecar)
To ensure 100% logic parity and bypass the Tauri `invoke` requirement:
*   **Unified Entry**: `prism_headless.py` supports a `--http` flag.
*   **Dev Server**: When started with `--http`, it launches a FastAPI server on `localhost:5000` that calls the same `dispatch()` function used by the stdin/stdout loop.
*   **Hybrid IPC**: The frontend `lib/ipc.ts` will detect the environment:
    *   `isTauri()` -> Use `window.__TAURI__.invoke`
    *   `isBrowser()` -> Use `fetch("http://localhost:5000/command")`
*   **Benefit**: Zero "logic drift" between browser and desktop; 10x faster UI iteration.

### 2. Echo-Sentinel (The Black Box Recorder)
A deep telemetry system that monitors every heartbeat of the system:
*   **SQLite Persistence**: All logs (INFO, WARN, ERROR) from both Python and React are written to a `system_logs` table in the local SQLite database.
*   **Session Tracking**: Each app launch generates a unique `session_id`.
*   **Deferred Audit**: 5 seconds after startup, a background service (Sentinel) audits the logs from the *previous* session.
*   **Trigger Logic**: If the Sentinel finds `ERROR` or `WARNING` entries in the previous session:
    *   It bundles the error with the preceding 10 `INFO` lines for context.
    *   It applies the `Scrubber` to anonymize PII and financial values.
    *   It generates a Markdown report for GitHub.
*   **Reporting Flow**:
    *   **Default (Auto-Send)**: Reports are sent silently to the relay.
    *   **Opt-Out (Review Mode)**: Users can toggle "Auto-Report" off. If off, the app displays the scrubbed Markdown for manual review before sending.
*   **Relay (Cloudflare Worker)**:
    *   **Deduplication Algorithm**: SHA-256 hashing of stack traces to prevent duplicate GitHub issues.
    *   **GitHub Integration**: Uses a GitHub App token to create/update issues with the label `echo-report`.

---

## 🚀 Implementation Roadmap

### Phase 1: The Echo-Bridge (High Priority) ✅
1.  Add `fastapi` and `uvicorn` support to `prism_headless.py`.
2.  Implement `--http` CLI flag to switch from stdin loop to HTTP server.
3.  Update `src/lib/ipc.ts` to support the `fetch` fallback.
4.  Add `npm run dev:browser` to `package.json`.

### Phase 2: The Echo-Sentinel (Medium Priority)
1.  **Schema**: Add `system_logs` table to `schema.sql`.
2.  **Backend Logger**: Implement a SQLite logging handler in Python.
3.  **Frontend Logger**: Create a `LogService` in React that writes to SQLite via IPC.
4.  **Sentinel Hook**: Implement `useEchoSentinel` for startup audit and reporting.
5.  **Scrubber**: Refine the `Scrubber` class to anonymize `PipelineError` and log objects.

### Phase 3: UI Integration (Low Priority) ✅
1.  Add "Echo Status" (Connection to local proxy) in the System Status component.
2.  Add "Auto-Report" toggle in Health/Settings.
3.  Implement the "Review & Send" modal in the global Error Boundary.

---

## 🔒 Security & Privacy Protocol
*   **Zero-Knowledge Reporting**: No raw ISINs, account IDs, or currency values must ever leave the local machine.
*   **User Consent**: Automated reporting must be opt-in via Settings, or require a "Confirm & Send" click in the UI.
*   **Token Safety**: GitHub tokens must live in the Cloudflare Worker environment, never in the client code.

---

## 💡 Context for Next Session
The analytics pipeline is currently stable with 44/44 tests passing. Ticker resolution, metadata enrichment, and ETF decomposition are all integrated with the Supabase Hive. The next session should focus on **Phase 1** of this document to unblock faster UI testing.
