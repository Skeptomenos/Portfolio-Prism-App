# Portfolio Prism

A privacy-first desktop portfolio analyzer that runs entirely on your machine. Built with **Tauri + Python Sidecar** architecture — no bundled Chromium, no cloud dependencies for core functionality.

> **"Battery Included, Browser Free"**

## Features

- **Local-First Analysis** — Your portfolio data never leaves your machine
- **Trade Republic Integration** — 2FA login to sync your portfolio automatically
- **Community ISIN Resolution** — Crowdsourced ticker mappings via "The Hive"
- **Offline Mode** — Full functionality with cached data when disconnected
- **Native Performance** — Tauri uses system WebKit (~10MB shell vs 300MB+ Electron)

## Screenshots

_Coming soon_

---

## Quick Start

### Prerequisites

| Requirement | Version       | Purpose          |
| ----------- | ------------- | ---------------- |
| Node.js     | 18+           | Frontend build   |
| Rust        | Latest stable | Tauri shell      |
| Python      | 3.9+          | Analytics engine |
| PyInstaller | 6.0+          | Bundle Python    |

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/portfolio-prism.git
cd portfolio-prism

# Install Node dependencies
npm install

# Set up Python environment
cd src-tauri/python
python3 -m venv venv-build
source venv-build/bin/activate  # On Windows: venv-build\Scripts\activate
pip install -r requirements-build.txt

# Build the Python sidecar binary
pyinstaller prism.spec
mkdir -p ../binaries
cp dist/prism ../binaries/prism-aarch64-apple-darwin  # Adjust for your platform

# Return to project root
cd ../..
```

### Development

```bash
# Run in development mode (hot reload for frontend)
npm run tauri dev
```

### Production Build

```bash
# Build the distributable .app / .dmg
npm run tauri build
```

The bundle will be in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
.
├── src/                         # Frontend (TypeScript/Vite)
│   ├── main.ts                  # Loading screen logic
│   └── styles.css               # Loading screen styles
│
├── src-tauri/                   # Tauri application
│   ├── src/                     # Rust source
│   │   ├── lib.rs               # Sidecar spawning, IPC
│   │   └── main.rs              # Entry point
│   ├── python/                  # Python sidecar
│   │   ├── portfolio_src/       # Business logic
│   │   │   ├── adapters/        # ETF provider adapters
│   │   │   ├── core/            # Analysis engine
│   │   │   ├── dashboard/       # Streamlit UI
│   │   │   ├── data/            # Data layer
│   │   │   └── models/          # Data models
│   │   ├── prism_boot.py        # Sidecar entry point
│   │   ├── prism.spec           # PyInstaller configuration
│   │   └── requirements-build.txt
│   ├── binaries/                # Built Python binary (gitignored)
│   ├── icons/                   # Application icons
│   └── tauri.conf.json          # Tauri configuration
│
├── infrastructure/              # Backend services
│   └── cloudflare/              # API proxy worker
│       ├── worker.js            # Cloudflare Worker
│       └── wrangler.toml        # Worker configuration
│
├── docs/                        # Documentation
│   ├── architecture_strategy.md
│   ├── phase4_issues.md         # Current blockers
│   └── ...
│
├── anamnesis/                   # AI developer framework
│   ├── .context/                # Project state
│   ├── specs/                   # Specifications
│   └── standards/               # Code standards
│
├── legacy/                      # Preserved for future
│   └── react-prototype/         # React UI (for v2)
│
└── POC/                         # Original Python app (gitignored)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Shell (Rust)                   │
│                      ~10MB native                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐         ┌─────────────────────┐   │
│  │   React UI      │         │   Python Sidecar    │   │
│  │ (Vite + TSX)    │         │    (Headless)       │   │
│  │                 │  IPC    │                     │   │
│  │   Dashboard     │◄───────►│  Analytics Engine   │   │
│  │  Components     │         │   & Data Manager    │   │
│  └─────────────────┘         └─────────────────────┘   │
│                                       │                 │
└───────────────────────────────────────│─────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
              │  SQLite   │      │ Cloudflare  │     │  Supabase   │
              │  (local)  │      │   Worker    │     │  (Hive)     │
              │           │      │ (API proxy) │     │             │
              │ Portfolio │      │  Finnhub    │     │ Community   │
              │   Data    │      │  API keys   │     │   ISINs     │
              └───────────┘      └─────────────┘     └─────────────┘
```

### Key Design Decisions

| Decision                | Rationale                                               |
| ----------------------- | ------------------------------------------------------- |
| **Tauri over Electron** | 10MB vs 300MB+, uses system WebKit                      |
| **Python Sidecar**      | Preserves analytics engine power, zero rewrite of logic |
| **React UI**            | Native-feeling performance and rich interactivity       |
| **Cloudflare Proxy**    | API keys never embedded in client                       |
| **Local-First**         | Core functionality works offline                        |

---

## Configuration

### Environment Variables

| Variable            | Required | Description                                                               |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| `PRISM_DATA_DIR`    | No       | Data directory (default: `~/Library/Application Support/PortfolioPrism/`) |
| `PROXY_URL`         | No       | Cloudflare Worker URL (default: built-in)                                 |
| `SUPABASE_URL`      | No       | Supabase project URL (for Hive sync)                                      |
| `SUPABASE_ANON_KEY` | No       | Supabase anonymous key                                                    |

---

## Current Status

| Phase   | Status            | Description                              |
| ------- | ----------------- | ---------------------------------------- |
| Phase 1 | Complete          | Tauri ↔ Python IPC                       |
| Phase 2 | Complete          | Headless Engine & PyInstaller            |
| Phase 3 | Complete          | React Shell & State                      |
| Phase 4 | Complete          | Feature Parity (Dashboard, Charts, Auth) |
| Phase 5 | **Release Ready** | CI/CD, Polish, PII Scrubbing             |

---

## Contributing

This is currently a private project. Contribution guidelines will be added if/when the project is open-sourced.

### For AI Developers

This project uses the **Anamnesis** framework for AI-assisted development:

1. Read `AGENTS.md` at session start
2. Check `anamnesis/.context/mission.md` for current state
3. Follow protocols in `anamnesis/directives/`
4. Adhere to standards in `anamnesis/standards/`

---

## Tech Stack

| Layer     | Technology                                  |
| --------- | ------------------------------------------- |
| Shell     | Tauri v2 (Rust)                             |
| Frontend  | TypeScript, React, Vite, Tailwind, Recharts |
| Engine    | Python 3.12 (Headless)                      |
| Analytics | pandas, numpy, yfinance                     |
| Auth      | pytr, keyring                               |
| Database  | SQLite (local), Supabase (cloud)            |
| Build     | uv, PyInstaller, npm                        |

---

## License

**Private** — All rights reserved.

---

## Acknowledgments

- [Tauri](https://tauri.app/) — Desktop app framework
- [Streamlit](https://streamlit.io/) — Python UI framework
- [pytr](https://github.com/pytr-org/pytr) — Trade Republic API
