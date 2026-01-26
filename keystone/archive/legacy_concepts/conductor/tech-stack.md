# Technology Stack

## Frontend (Desktop UI)
- **Framework:** React 18+ (TypeScript)
- **Build Tool:** Vite
- **Styling:** CSS-in-JS/Modules (Glassmorphism & Professional Minimalist)
- **State Management:** Zustand (Client state) & TanStack Query (Data fetching/sync)
- **Components:** Lucide React (Icons), Recharts (Data visualization), Framer Motion (Animations)

## Application Shell & Integration
- **Framework:** Tauri v2 (Rust)
- **IPC:** Secure Inter-Process Communication between Rust shell and Python sidecar
- **Packaging:** PyInstaller (for Python sidecar bundling)

## Analytics Engine (Sidecar)
- **Language:** Python 3.9+
- **Purpose:** Heavy data processing, portfolio analytics, and Trade Republic integration logic.

## Data & Persistence
- **Local Database:** SQLite (via Tauri or Python sidecar)
- **Community Layer:** "The Hive" (via Cloudflare Workers / Supabase)
    - **ISIN Resolution:** Ticker and metadata mapping.
    - **Provider Composition:** Community-contributed holding breakdowns for ETFs and Managed Funds.

## Observability & Maintenance
- **Bug Echo:** Built-in error logging system with automated PII scrubbing and direct upload to GitHub Issues for transparent reporting.