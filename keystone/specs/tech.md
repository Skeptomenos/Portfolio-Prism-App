# Technical Spec (The "How")

> **Purpose:** Defines the technology stack, constraints, and architectural patterns for Portfolio Prism.
> **Also read:** `keystone/.context/tech-stack.md` for approved dependencies.
> **See Strategy:** `keystone/strategy/architecture-overview.md` for the Master Architecture.

> ⚠️ **STRATEGIC PIVOT (Dec 2025):** This project has shifted from a Streamlit-based UI to a **React-based UI**. 
> - **Status of Streamlit:** Existing Python dashboard code (`src-tauri/python/portfolio_src/dashboard/`) is now **Reference Only** (Golden Master for calculations). 
> - **New Direction:** All new UI work happens in `src/` (React). The Python backend is being refactored into a **Headless Analytics Engine**.
> - **Reasoning:** To enable rapid feedback loops, instant startup, and a true native feel.

---

## 1. Technology Stack

### Shell Layer (Rust)
- **Framework:** Tauri v2
- **Purpose:** Native window management, OS integration, sidecar spawning, PII Scrubbing
- **Key Plugins:** `tauri-plugin-shell`, `tauri-plugin-updater`, `tauri-plugin-log`
- **Key Libraries:** `serde_json` for Rust↔Python communication

### Frontend Layer (TypeScript)
- **Framework:** React 18 + Vite
- **UI Library:** ShadCN/UI + Tailwind CSS (Apple-inspired minimalism)
- **State Management:** Zustand (App State), TanStack Query (Async Data)
- **Purpose:** The *only* user interface. Renders data from SQLite/Parquet.

### Engine Layer (Python)
- **Framework:** Headless Script (No server framework). Event loop listening to Stdin.
- **Purpose:** Portfolio analytics, Data ETL (Decompose -> Enrich -> Aggregate).
- **Bundling:** PyInstaller for standalone binary.
- **Concurrency:** `asyncio` for throttled I/O parallelization.

### Data Layer
- **Vault Location:** `~/Library/Application Support/PortfolioPrism/`
- **Transactional:** SQLite (User Settings, Portfolio State, Transaction Ledger).
- **Analytical:** Parquet (Calculated Analytics, Market Data Cache).
- **Cloud:** Supabase (Community "Hive" for ISIN resolution only).

### Infrastructure
- **Proxy:** Cloudflare Workers (GitHub Issue Reporting, API key protection).
- **Updates:** GitHub Releases + `tauri-plugin-updater`.
- **Auth:** `keyring` for OS Keychain (Broker credentials).

---

## 2. Forbidden Technologies (Anti-Patterns)
| Technology | Reason |
|------------|--------|
| **Electron** | Bundles Chromium (~200MB+), violates "Browser Free" constraint |
| **Streamlit (for Production UI)** | Deprecated. Blocks rapid feedback loop. Use React. |
| **Embedded API Keys** | Security risk — all keys must be proxied via Cloudflare Worker |
| **Global State (Redux)** | Overkill — use Zustand for simple, atomic state |
| **Synchronous Python I/O** | Blocks calculation throughput — use `asyncio` |
| **ORM (SQLAlchemy/Django)** | Overkill — use raw SQL/Pydantic or lightweight wrapper |

---

## 3. Critical Libraries (Mandatory)
| Domain | Library | Reason |
|--------|---------|--------|
| **Validation (Python)** | Pydantic / Pandera | Data Contracts between Engine and Vault |
| **Validation (TS)** | Zod | Input validation, type inference for IPC |
| **Credentials** | keyring | Secure storage in OS Keychain (not plain text) |
| **Math (Python)** | Pandas / NumPy | Vectorized financial calculations |
| **Testing (Python)** | Pytest + Syrupy | Snapshot testing for Data Contracts |
| **Testing (Rust)** | Insta | Snapshot testing for IPC responses |

---

## 4. Architecture Standards

### 4.1 The "Prism" Data Cycle
1.  **UI Command:** React sends IPC `invoke('sync_portfolio')` to Rust.
2.  **Engine Invocation:** Rust forwards command to Python via Stdin.
3.  **Engine Execution:**
    *   Python reads current state from **SQLite**.
    *   Python fetches updates (Throttled Async) and computes (Vectorized).
    *   Python writes results to **SQLite/Parquet**.
    *   Python prints success JSON to Stdout.
4.  **Reactive Update:** Rust detects success, emits `event('portfolio-updated')`.
5.  **UI Refresh:** React (TanStack Query) invalidates cache, reads fresh data from Vault.

### 4.2 State-at-Rest vs. State-in-Motion
*   **Storage (Rest):** Data must be stored in ACID-compliant SQLite or immutable Parquet. NEVER pickle or raw JSON for critical user data.
*   **Processing (Motion):** Data is loaded into Pandas DataFrames for calculation.
*   **Boundary:** The "Decomposer" service is responsible for the SQL -> DataFrame conversion.

### 4.3 Zero-Effort Telemetry
*   **Mechanism:** Rust acts as the central log aggregator.
*   **Scrubber:** All logs pass through a regex-based PII scrubber before storage.
*   **Standards:** See `keystone/specs/observability.md` for log level mapping and CLI orchestration standards.
*   **Reporting:** Critical crashes are automatically hashed, sanitized, and sent to the Cloudflare Worker Proxy (which posts to GitHub Issues) if the user opts in.

### 4.4 Data Directory Migration
**Old Path:** `./data/` (dev mode, relative)
**New Path:** `~/Library/Application Support/PortfolioPrism/` (production)
- Python reads `PRISM_DATA_DIR` env var, set by Rust.
- On startup, check for legacy data and migrate to the new SQLite/Parquet structure.
