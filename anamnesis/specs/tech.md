# Technical Spec (The "How")

> **Purpose:** Defines the technology stack, constraints, and architectural patterns for Portfolio Prism.
> **Also read:** `anamnesis/.context/tech-stack.md` for approved dependencies.

---

## 1. Technology Stack

### Shell Layer (Rust)
- **Framework:** Tauri v2
- **Purpose:** Native window management, OS integration, sidecar spawning
- **Key Plugins:** `tauri-plugin-shell`, `tauri-plugin-updater`

### Frontend Layer (TypeScript)
- **Framework:** React 18 + Vite
- **Purpose:** User interface, navigation, loading states
- **Communication:** Listens for `python-ready` event, redirects to sidecar URL

### Engine Layer (Python)
- **Framework:** Streamlit (dashboard) / FastAPI (future API)
- **Purpose:** Portfolio analytics, data processing, Trade Republic integration
- **Bundling:** PyInstaller for standalone binary

### Data Layer
- **Local:** SQLite in `~/Library/Application Support/PortfolioPrism/`
- **Cloud:** Supabase (community "Hive" for ISIN resolution)
- **Cache:** Local JSON/CSV for offline support

### Infrastructure
- **Proxy:** Cloudflare Workers (API key protection)
- **Updates:** GitHub Releases + `tauri-plugin-updater`
- **Auth:** `keyring` for OS Keychain, Supabase Auth for community features

---

## 2. Forbidden Technologies (Anti-Patterns)

| Technology | Reason |
|------------|--------|
| **Electron** | Bundles Chromium (~200MB+), violates "Browser Free" constraint |
| **Playwright** | ~300MB bundle size, replaced by community "Hive" pattern |
| **Embedded API Keys** | Security risk — all keys must be proxied via Cloudflare Worker |
| **Global State (Redux/MobX)** | Overkill for current scope — use React Context if needed |
| **Synchronous Python I/O** | Blocks Streamlit event loop — use `asyncio` for network calls |
| **Hardcoded Ports** | Port collisions — always use dynamic port binding (`port 0`) |

---

## 3. Critical Libraries (Mandatory)

| Domain | Library | Reason |
|--------|---------|--------|
| **Validation (Python)** | Pydantic | Schema enforcement for API responses, portfolio data |
| **Validation (TS)** | Zod | Input validation, type inference |
| **Credentials** | keyring | Secure storage in OS Keychain (not plain text) |
| **IPC** | serde_json | Rust↔Python communication via JSON stdout |
| **Process Management** | tauri-plugin-shell | Sidecar lifecycle, Dead Man's Switch |

---

## 4. Architecture Standards

### 4.1 Sidecar Pattern
- Tauri spawns Python binary as child process
- Python binds to `localhost:0` (random free port)
- Python prints `{"event": "server_started", "port": 12345}` to stdout
- Tauri parses stdout, redirects WebView to `http://localhost:<port>`
- Closing window sends `SIGTERM` to Python; Python monitors `stdin` for EOF (Dead Man's Switch)

### 4.2 Data Directory Migration
- **Old Path:** `./data/` (dev mode, relative)
- **New Path:** `~/Library/Application Support/PortfolioPrism/` (production)
- Python reads `PRISM_DATA_DIR` env var, set by Tauri at spawn time
- On first run, migrate data from old path if it exists

### 4.3 Offline-First Design
- All external API calls must be cached with TTL
- Core analytics must function with cached data only
- UI shows "Offline Mode" badge when disconnected
- Sync/enrich features disabled when offline

### 4.4 Error Boundaries
- Python: `sys.excepthook` captures crashes, sanitizes, sends to proxy
- Rust: `panic_hook` for native crashes
- All error reports strip PII (phone numbers, PINs, file paths with usernames)
