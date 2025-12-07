# Project Learnings & Constraints

This document tracks the specific constraints, patterns, and lessons learned *during the development of this project*.

**Rules for this file:**
1.  **Append Only:** Never delete existing learnings unless they are factually incorrect.
2.  **Telegraphic Style:** Be concise. (e.g., "AWS Lambda timeout is 15min" > "I discovered that AWS Lambda has a timeout...").
3.  **Specifics:** Focus on *this* project (API quirks, tech stack limits, user preferences). For general framework rules, refer to `anamnesis/directives/`.

---

## 1. Project Constraints (Invariants)

### 1.1 Bundle Size Critical
- Electron rejected: bundles Chromium (~200MB+)
- Playwright removed: browser engines add ~300MB
- Target: < 100MB total (Tauri shell + Python sidecar)

### 1.2 API Key Security
- Finnhub key MUST NOT be embedded in client
- All API calls route through Cloudflare Worker proxy
- Worker injects key server-side, rate-limits by IP

### 1.3 Local-First Architecture
- Core analytics must work offline
- Cloud features (Hive sync, updates) are optional enhancements
- Data lives in `~/Library/Application Support/PortfolioPrism/`

### 1.4 Sidecar Pattern
- Python runs as separate process, not embedded
- Communication via stdout JSON + localhost HTTP
- Tauri manages lifecycle (spawn, monitor, terminate)

### 1.5 macOS Primary
- Windows/Linux support deferred to post-MVP
- Test on macOS only for now
- App signing/notarization required for distribution

---

## 2. Patterns (The "How")

### 2.1 Port Discovery
- Python binds to `localhost:0` (kernel assigns free port)
- Python prints `{"event": "server_started", "port": 12345}` to stdout
- Tauri parses stdout, redirects WebView to that port

### 2.2 Dead Man's Switch
- Tauri keeps stdin pipe open to Python
- Python monitors stdin; EOF = parent died
- Python self-terminates on EOF (no zombie processes)

### 2.3 Data Directory Injection
- Python reads `PRISM_DATA_DIR` env var
- Tauri sets this to OS-appropriate path at spawn
- Enables same code to work in dev (`./data`) and prod (`~/Library/...`)

### 2.4 Community "Hive" Contribution
- New ISIN resolutions posted to Supabase async
- Master universe CSV auto-downloaded on launch
- User B benefits from User A's discovery

### 2.5 2FA State Machine
- Trade Republic login is async (human waits for phone)
- Use background thread for `pytr`, communicate via `Queue`
- Streamlit main thread polls for state changes

---

## 3. Anti-Patterns (What Failed / What to Avoid)

### 3.1 Hardcoded Ports
- **Problem:** Port 8501 conflicts if user has other Streamlit apps
- **Solution:** Always use dynamic port binding

### 3.2 Blocking I/O in Streamlit
- **Problem:** Network calls freeze UI
- **Solution:** Use `asyncio` + background threads for I/O

### 3.3 Relative Paths in Bundled App
- **Problem:** `./data` doesn't exist inside `.app` bundle
- **Solution:** Use env var injection for data directory

### 3.4 Trusting External Data
- **Problem:** API responses can be malformed, break pipeline
- **Solution:** Validate with Pydantic at boundary, fail fast

### 3.5 Silent Failures
- **Problem:** Errors swallowed, user doesn't know what's wrong
- **Solution:** Log all errors, show user-friendly messages, report to GitHub

### 3.6 Wrong Development Directory
- **Problem:** Root `src-tauri/` vs `tauri-app/src-tauri/` confusion
- **Solution:** Use `tauri-app/` exclusively for Tauri development. Root `src/` and `src-tauri/` are legacy React prototype (deferred to v2).

---

## 4. Technical Notes

### 4.1 PyInstaller Bundle Size
- Current binary: 62MB (Streamlit + pandas + numpy + pyarrow + altair)
- Adding POC deps will increase size; monitor carefully
- Target: < 100MB total

### 4.2 Streamlit Health Polling
- Don't redirect immediately after port handshake
- Poll `/_stcore/health` endpoint until 200 OK
- Streamlit needs ~1-2 seconds warmup time

### 4.3 Current Phase Status (2024-12-06)
- Phase 1 (Proto-Organism): ✅ Complete
- Phase 2 (Skeleton): ✅ Complete
- Phase 3 (Brain Transplant): ⏳ Pending
- Development Location: `tauri-app/`
