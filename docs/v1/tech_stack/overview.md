# Tech Stack

> **Classification: Superseded — V1 only.** Archived 2026-09-07.
> Read when: Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2.
> Current authority: [project index](../../../index.md) and [V2 runtime contracts](../../../v2/README.md). Original requirements, commands, status and paths below are historical; they do not govern V2.

> V1 historical context, labeled 2026-09-06. The [project index](../../../index.md) routes to the current V2 plan and runtime documentation. Instructions and status below describe the earlier implementation; they do not govern V2.

> **Purpose:** Approved tools and libraries for this project. Check here before adding dependencies.
> **Rule:** If not listed here, ask before adding. Document reason when adding new tools.

---

## Languages

- **Rust:** 1.70+ — Tauri shell, native OS integration, sidecar management
- **TypeScript:** 5.0+ — Frontend UI, React components
- **Python:** 3.11+ — Analytics engine, Streamlit dashboard, data processing

## Frameworks

- **Tauri v2:** Native desktop shell, WebView wrapper, plugin system
- **React 18:** Frontend UI framework
- **Vite:** Build tool, dev server, HMR
- **Streamlit:** Python-based dashboard UI (sidecar)

## Libraries

### Rust/Tauri
- **tauri-plugin-shell:** Sidecar process management
- **tauri-plugin-updater:** Auto-update from GitHub Releases
- **serde/serde_json:** JSON parsing for Python↔Rust IPC

### TypeScript/React
- **React Router:** Navigation (if needed)
- **TailwindCSS:** Utility-first styling (if adopted)

### Python
- **pandas:** Data manipulation, portfolio analysis
- **streamlit:** Dashboard UI
- **pytr:** Trade Republic API integration
- **keyring:** Secure credential storage (OS Keychain)
- **pydantic:** Data validation, schema enforcement
- **PyInstaller:** Python binary bundling

## Infrastructure

- **Cloudflare Workers:** API proxy (Finnhub key protection, rate limiting)
- **Supabase:** Community database ("The Hive"), user auth
- **GitHub Releases:** App distribution, auto-update server
- **SQLite:** Local data persistence

## Development Tools

- **npm:** Package management (frontend)
- **Cargo:** Rust package management
- **Poetry/pip:** Python package management
- **ESLint:** TypeScript linting
- **Ruff:** Python linting
- **Clippy:** Rust linting

---

## Adding New Dependencies

Before adding a new dependency, verify:

1. **Is it maintained?** — Last commit < 6 months ago
2. **Is it widely used?** — Reasonable GitHub stars/downloads
3. **Is it necessary?** — Can we achieve this with existing tools?
4. **Bundle size impact?** — Critical for desktop app distribution

When adding, document:
- What it's for
- Why this one over alternatives
- Date added
