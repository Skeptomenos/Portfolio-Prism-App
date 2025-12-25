# Decision Log

This document tracks significant architectural decisions (ADRs) for the project.

---

## [2024-12] Tauri v2 over Electron

- **Context:** Need desktop wrapper for Python/Streamlit app. Electron bundles Chromium (~200MB+), making total bundle size excessive.
- **Decision:** Use Tauri v2 with native WebKit (macOS) / WebView2 (Windows).
- **Consequences:**
  - (+) Bundle size reduced to ~10MB (shell only)
  - (+) Lower RAM usage (no separate browser process)
  - (+) Future mobile support via Tauri v2
  - (-) WebKit/Safari rendering quirks may differ from Chrome
  - (-) Smaller ecosystem than Electron

---

## [2024-12] Sidecar Pattern (Python as Child Process)

- **Context:** Rewriting analytics engine in Rust/TypeScript is prohibitive. Need to preserve existing Python/Streamlit codebase.
- **Decision:** Run Python as a sidecar process spawned by Tauri.
- **Consequences:**
  - (+) Zero rewrite of existing analytics code
  - (+) Clear process boundaries (crash isolation)
  - (-) Adds ~40-60MB for bundled Python runtime
  - (-) Startup time includes Python boot (~2-3 seconds)
  - (-) Requires IPC protocol (stdout JSON + localhost HTTP)

---

## [2024-12] Remove Playwright Dependency

- **Context:** Playwright was used to scrape ETF holdings from provider websites. Bundles browser engines (~300MB).
- **Decision:** Replace automated scraping with "Community Hive" + manual upload fallback.
- **Consequences:**
  - (+) Bundle size reduced by ~300MB
  - (+) More stable (no browser automation breakage)
  - (+) Community contributions benefit all users
  - (-) New/rare ETFs require manual user action
  - (-) Depends on community participation for data coverage

---

## [2024-12] Cloudflare Worker as API Proxy

- **Context:** Finnhub API key cannot be embedded in distributed client (will be extracted and abused).
- **Decision:** Route all API calls through Cloudflare Worker that injects the key server-side.
- **Consequences:**
  - (+) API key is never exposed to client
  - (+) Built-in rate limiting by IP
  - (+) Free tier sufficient for MVP (100k req/day)
  - (-) Adds network hop (minor latency)
  - (-) Worker code is additional maintenance surface

---

## [2024-12] Supabase for Community Database ("The Hive")

- **Context:** Need central database for crowdsourced ISIN→Ticker mappings and optional user auth.
- **Decision:** Use Supabase (Postgres + Auth + REST API).
- **Consequences:**
  - (+) Generous free tier (500MB storage, 50k MAU)
  - (+) Auto-generated REST API (no backend code needed)
  - (+) Built-in auth for future community features
  - (-) Vendor lock-in (Postgres is portable, but Supabase-specific features are not)
  - (-) Requires internet for community features (acceptable given local-first design)

---

## [2024-12] Dynamic Port Binding for Sidecar

- **Context:** Hardcoded port (8501) causes conflicts if user has other Streamlit apps running.
- **Decision:** Python binds to port 0 (kernel assigns free port), communicates port via stdout JSON.
- **Consequences:**
  - (+) No port collisions
  - (+) Multiple instances possible (though not supported in MVP)
  - (-) Slightly more complex startup handshake
  - (-) Requires stdout parsing in Tauri

---

## [2024-12] OS Keychain for Credential Storage

- **Context:** Trade Republic tokens must persist across sessions. Plain-text storage is insecure.
- **Decision:** Use `keyring` library to store credentials in macOS Keychain.
- **Consequences:**
  - (+) Secure storage with OS-level encryption
  - (+) User doesn't need to re-authenticate after app restart
  - (-) Cross-platform differences (Keychain vs. Windows Credential Manager)
  - (-) Additional dependency and potential permission prompts

---

## [2024-12] GitHub Releases for Auto-Updates

- **Context:** Need mechanism to distribute updates to users without app store.
- **Decision:** Use `tauri-plugin-updater` with GitHub Releases as update server.
- **Consequences:**
  - (+) Free hosting on GitHub
  - (+) Semantic versioning via release tags
  - (+) Users get update prompts in-app
  - (-) Requires GitHub release workflow in CI
  - (-) Code signing required for macOS (notarization)

---

## [2024-12-06] Streamlit UI for v1, React Deferred to v2

- **Context:** Both a React frontend (`src/components/`) and Streamlit sidecar design exist. Parallel development would create confusion and delay MVP.
- **Decision:** Use Streamlit sidecar for v1 MVP. Defer React frontend to v2.
- **Consequences:**
  - (+) Faster time to MVP (POC dashboard already works in Streamlit)
  - (+) Single UI codebase to maintain during MVP phase
  - (+) Avoids complex Python↔React API layer for now
  - (-) Streamlit UX is less polished than native React
  - (-) React components in `src/` remain unused until v2
  - (-) Will need migration effort when switching to React

---

## [2024-12-06] Development Location: tauri-app/ Directory

- **Context:** Project has two potential Tauri locations: root `src-tauri/` and `tauri-app/src-tauri/`. The `tauri-app/` version has working PyInstaller integration.
- **Decision:** Use `tauri-app/` as the canonical development location.
- **Consequences:**
  - (+) Existing PyInstaller setup and 62MB binary already working
  - (+) Clear separation from root-level React prototype
  - (-) Root `src-tauri/` and `src/` become legacy/unused for v1

---

## [2024-12-07] TR Login as Tab 8 (Option A)

- **Context:** Trade Republic login UI exists as a Streamlit multipage page (`pages/tr_login.py`). Streamlit multipage relies on folder structure detection which may not work reliably in PyInstaller frozen apps.
- **Decision:** Integrate TR Login as Tab 8 in the main `app.py` instead of using Streamlit multipage.
- **Consequences:**
  - (+) Guaranteed to work in PyInstaller frozen binary
  - (+) Simpler architecture — single entry point
  - (+) User sees all features in one tabbed interface
  - (-) Slightly longer tab bar (8 tabs)
  - (-) TR Login visible even when not needed (minor UX concern)

---

## [2024-12-07] CSP Disabled for Streamlit WebView

- **Context:** Streamlit UI runs on localhost and is loaded in Tauri's WebView. Streamlit dynamically loads JavaScript, CSS, and WebSocket connections that would be blocked by a strict Content Security Policy.
- **Decision:** Set `"csp": null` in `tauri.conf.json` to disable CSP enforcement.
- **Consequences:**
  - (+) Allows Streamlit to load all required resources (JS, CSS, WebSocket)
  - (+) No runtime errors from CSP violations
  - (+) Simplifies development (no need to whitelist every Streamlit resource)
  - (-) Reduced security — XSS attacks could execute arbitrary scripts
  - (-) Not recommended for apps that load untrusted content
  - **Mitigation:** Acceptable for local-only app where all content is from trusted localhost Streamlit server. Revisit if app ever loads external content.

---

## [2024-12-07] Repository Flattened to Standard Tauri Layout

- **Context:** Originally had nested `tauri-app/` directory containing the Tauri project. This caused path confusion in documentation and scripts.
- **Decision:** Flatten repository so Tauri project is at root (`src-tauri/`, `src/`, `package.json` at root).
- **Consequences:**
  - (+) Standard Tauri layout — easier for contributors to understand
  - (+) Simpler paths in documentation
  - (+) `npm run tauri dev` works from repo root
  - (-) Required updating all documentation paths
  - (-) React prototype moved to `legacy/react-prototype/`

---

## [2024-12-08] TR Daemon Subprocess Architecture

- **Context:** pytr library creates `asyncio.Lock()` at import time, causing `RuntimeError: There is no current event loop` in Streamlit's ScriptRunner thread within PyInstaller bundle.
- **Decision:** Isolate pytr in a long-running subprocess daemon (`tr_daemon.py`) with its own asyncio event loop. Communication via JSON-RPC over stdin/stdout.
- **Consequences:**
  - (+) pytr imports safely in isolated process
  - (+) Session state persists across Streamlit reruns
  - (+) Architecture-ready for React/Rust migration (Rust spawns same daemon)
  - (+) Clean separation of concerns (UI ↔ TR API)
  - (-) Additional complexity (subprocess management, IPC protocol)
  - (-) Requires separate binary for frozen mode (see next decision)

---

## [2024-12-08] TR Daemon as Separate PyInstaller Binary (Planned)

- **Context:** In PyInstaller frozen bundle, `sys.executable` points to the main bundle binary, not a Python interpreter. Cannot spawn `tr_daemon.py` as subprocess using `[sys.executable, script.py]`.
- **Decision:** Build `tr_daemon.py` as a separate PyInstaller binary (`tr-daemon`) registered as Tauri sidecar.
- **Consequences:**
  - (+) Works in frozen mode — spawn `tr-daemon` binary directly
  - (+) Same approach for Rust migration — Rust spawns same binary
  - (+) Smaller daemon binary (~10-15MB) excludes Streamlit/pandas
  - (-) Two binaries to build and maintain
  - (-) Total bundle size increases by ~10-15MB
- **Status:** Plan documented in `docs/PLAN_TR_DAEMON_BINARY.md`, implementation pending

---

## [2024-12-08] pytr v0.4.2 Method Name Typo Compatibility

- **Context:** pytr v0.4.2 (PyPI) has typo: `inititate_weblogin` instead of `initiate_weblogin`. GitHub master has correct spelling.
- **Decision:** Add compatibility layer checking for both method names.
- **Consequences:**
  - (+) Works with current PyPI version
  - (+) Will work when pytr is updated with correct spelling
  - (-) Slightly more complex code

---

- **Affected Packages:** pandas, numpy, pyarrow, pydantic, keyring, pytr

---

## [2025-12-22] Tailwind v3 Alignment

- **Context:** Accidental installation of Tailwind v4 caused build failures due to configuration mismatch.
- **Decision:** Downgrade to Tailwind v3.4.17 to match existing PostCSS configuration and ensure build stability.
- **Consequences:**
  - (+) Restored build stability immediately.
  - (+) Matches standard ecosystem as of late 2025.
  - (-) Deferred v4 migration until a dedicated architectural window is opened.

---

## [2025-12-22] Global Feedback Modal Architecture

- **Context:** Feedback dialog was trapped inside the Sidebar's stacking context, causing layout clipping.
- **Decision:** Lift feedback state to global store and move component to the root `App.tsx`.
- **Consequences:**
  - (+) Dialog now overlays the entire screen correctly.
  - (+) Enabled context injection (automatic view detection in reports).
  - (+) Decoupled trigger from presentation.

---

## [2025-12-22] Echo-Sentinel: Passive Error Reporting

- **Context:** Need zero-effort crash reporting without compromising user privacy. Manual bug reports are incomplete.
- **Decision:** Implement "Echo-Sentinel" - a passive observability system that captures errors locally, batches on next startup, and reports deduplicated issues to GitHub via Cloudflare Worker.
- **Consequences:**
  - (+) Errors captured automatically with rich metadata (component, category, stack trace).
  - (+) Deduplication via stable `error_hash` prevents duplicate GitHub issues.
  - (+) Privacy-first: PII scrubbed, user controls telemetry mode (auto/review/off).
  - (+) Non-blocking: Sentinel runs async on startup with 5s delay.
  - (-) Requires Cloudflare Worker secrets (`GITHUB_TOKEN`, `GITHUB_REPO`) for live reporting.
  - (-) Adds ~200 lines of Python code across sentinel.py, telemetry.py, logging_config.py.

---

## [2025-12-22] Error Hash in Hidden HTML Comment

- **Context:** Need to deduplicate GitHub issues across users without exposing internal hashes in visible issue content.
- **Decision:** Embed `error_hash` in an HTML comment at the end of issue body: `<!-- error_hash: abc123 -->`.
- **Consequences:**
  - (+) Invisible to users viewing the issue.
  - (+) Searchable by GitHub's API for deduplication.
  - (+) Stable across issue edits (comment preserved).
  - (-) Relies on GitHub's search indexing HTML comments (tested, works).

---

## [2025-12-23] Database Connection as Context Manager

- **Context:** Query helper functions (`get_portfolio`, `get_positions`, etc.) were leaking SQLite connections in the long-running Python sidecar.
- **Decision:** Convert `get_connection()` to a `@contextmanager` that auto-closes, requiring all callers to use `with get_connection() as conn:`.
- **Consequences:**
  - (+) Connections automatically closed after each operation.
  - (+) No resource leaks in long-running sidecar process.
  - (+) Consistent pattern across all database operations.
  - (-) Breaking API change - all existing callers must be updated.
  - (-) Requires grep of entire codebase to find all call sites.

---

## [2025-12-25] Hive Extension: Dual-Path ISIN Resolution

- **Context:** X-Ray pipeline broken because ETF holdings have tickers but no ISINs. Enricher needs ISINs for sector/geography lookup. Deprecated `asset_universe.csv` was only resolution source.
- **Decision:** Implement dual-path resolution with `USE_LEGACY_CSV` feature flag. New path: LocalCache (SQLite) → HiveClient (Supabase RPC) → API fallbacks.
- **Consequences:**
  - (+) Safe rollback via feature flag (default: legacy CSV path).
  - (+) Offline-capable via LocalCache SQLite.
  - (+) Community-powered via Hive crowdsourced data.
  - (+) 970x performance improvement by skipping network calls for tier2 holdings.
  - (-) Adds complexity (two resolution paths until Phase 5 cleanup).
  - (-) Requires Supabase RPC functions with `SECURITY DEFINER` to bypass RLS.

---

## [2025-12-25] Tiered ISIN Resolution (Performance Optimization)

- **Context:** Initial Hive path made network calls for every holding, causing 97s decomposition time per ETF.
- **Decision:** Skip Hive network calls for tier2 holdings (weight ≤ 0.5%). Only check local cache for minor holdings.
- **Consequences:**
  - (+) Decomposition reduced from 97s to 0.1s per ETF.
  - (+) API rate limits preserved for significant holdings.
  - (-) Tier2 holdings may remain unresolved if not in local cache.
  - **Mitigation:** Tier2 holdings are <0.5% weight each, minimal impact on X-Ray accuracy.
