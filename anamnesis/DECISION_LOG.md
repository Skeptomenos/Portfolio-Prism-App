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

## [2024-12-19] Recharts (React) vs Plotly (Python)

- **Context:** Need to render high-performance, interactive charts (Sparklines, Portfolio History). Options: Render in Python (Plotly) and stream JSON, or render in React (Recharts).
- **Decision:** Use **Recharts** (React) fed by raw JSON data from Python.
- **Consequences:**
  - (+) **Performance:** Rendering happens on GPU/Client, not server-side image generation.
  - (+) **Interactivity:** Native tooltips and hover effects without roundtrip latency.
  - (+) **Styling:** CSS-in-JS styling matches the rest of the UI perfectly.
  - (-) **Python Role:** Python reduced to "Data API", losing some of its visualization power.
  - (-) **Duplication:** Logic for coloring/formatting moves to Frontend.
