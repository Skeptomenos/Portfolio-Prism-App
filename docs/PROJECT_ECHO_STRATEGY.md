# Project Echo: Autonomous Feedback Loop Strategy

**Status:** Approved for Implementation
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

### 2. Echo-Reporter (The Redacted Reporter)
A telemetry system designed for privacy-first financial apps:
*   **PII Scrubber**: Integrates `verify_pii_scrubbing.py` logic.
    *   ISINs are hashed (e.g., `US0378331005` -> `[ASSET_HASH_82a1]`).
    *   Quantities and Market Values are removed.
    *   Error messages and stack traces are preserved.
*   **Reporting Flow**:
    *   **Default (Auto-Send)**: Errors are automatically scrubbed and sent to the relay.
    *   **Opt-Out (Review Mode)**: Users can toggle "Auto-Report" off in Health/Settings. If off, the app displays the scrubbed JSON for manual review before the user clicks "Send".
*   **Relay (Cloudflare Worker)**:
    *   **Deduplication Algorithm**:
        1.  Extract `stack_trace` and `error_type`.
        2.  Generate a SHA-256 hash of the normalized stack trace (removing line numbers/paths if possible, or just the whole string).
        3.  Search GitHub Issues using `label:echo-report` and the hash in the body.
        4.  If a match exists: Increment a "Frequency" counter in the issue body and add a comment with the latest timestamp.
        5.  If no match: Create a new issue with the hash embedded in a hidden HTML comment `<!-- hash: <SHA> -->`.
    *   **GitHub Integration**: Uses a GitHub App token to create/update issues with the label `echo-report`.

---

## 🚀 Implementation Roadmap

### Phase 1: The Echo-Bridge (High Priority)
1.  Add `fastapi` and `uvicorn` support to `prism_headless.py`.
2.  Implement `--http` CLI flag to switch from stdin loop to HTTP server.
3.  Update `src/lib/ipc.ts` to support the `fetch` fallback.
4.  Add `npm run dev:browser` to `package.json`.

### Phase 2: The Redacted Reporter (Medium Priority)
1.  Create `portfolio_src/core/reporter.py`.
2.  Implement the `Scrubber` class to anonymize `PipelineError` objects.
3.  Update the Cloudflare Worker (`infrastructure/cloudflare/worker.js`) with deduplication logic.
4.  Implement the "Auto-Report" toggle in `useAppStore` and UI.
5.  Add the "Review & Send" modal to the global Error Boundary.

### Phase 3: UI Integration (Low Priority)
1.  Add a "Dev Mode" toggle in Settings.
2.  Display "Echo Status" (Connection to local proxy) in the System Status component.

---

## 🔒 Security & Privacy Protocol
*   **Zero-Knowledge Reporting**: No raw ISINs, account IDs, or currency values must ever leave the local machine.
*   **User Consent**: Automated reporting must be opt-in via Settings, or require a "Confirm & Send" click in the UI.
*   **Token Safety**: GitHub tokens must live in the Cloudflare Worker environment, never in the client code.

---

## 💡 Context for Next Session
The analytics pipeline is currently stable with 44/44 tests passing. Ticker resolution, metadata enrichment, and ETF decomposition are all integrated with the Supabase Hive. The next session should focus on **Phase 1** of this document to unblock faster UI testing.
