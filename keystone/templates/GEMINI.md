@AGENTS.md
# Portfolio Prism

> **Root File:** Auto-loaded by AI CLI tools. Keep concise (<80 lines).

## Overview

Privacy-first, high-performance desktop portfolio analyzer using the Tauri + Python Sidecar pattern. Wraps an existing Python/Streamlit analytics engine in a native macOS container. "Battery Included, Browser Free" — no bundled Chromium.

## Tech Stack

- **Shell:** Tauri v2 (Rust) — Native window, OS integration
- **Frontend:** TypeScript + Vite (loading screen) → Streamlit (main UI)
- **Engine:** Python (Streamlit sidecar) — Analytics, data processing
- **Database:** SQLite (local), Supabase (community "Hive")
- **Proxy:** Cloudflare Workers (API key protection)

## Structure

```
.                            # Standard Tauri project layout
├── src/                     # Frontend (loading screen, TypeScript)
├── src-tauri/               # Rust shell + Python sidecar
│   ├── python/              # Python source
│   │   ├── portfolio_src/   # Business logic (from POC)
│   │   ├── prism_boot.py    # Entry point
│   │   └── prism.spec       # PyInstaller spec
│   └── src/lib.rs           # Sidecar spawning
├── infrastructure/          # Cloudflare Worker
├── docs/                    # Architecture & design docs
├── keystone/               # AI developer framework
├── legacy/react-prototype/  # React UI for v2 (preserved)
└── POC/                     # Original Python engine (gitignored)
```

---

## Protocol

### Golden Rules

1. **State:** Read `keystone/.context/mission.md` at session start
2. **Specs:** Complex tasks (>1hr) require `keystone/specs/`. No code without spec.
3. **Consensus:** Present plan, WAIT for approval before coding
4. **Epilogue:** MANDATORY after feature/design completion.

> **ESCAPE HATCH:** Simple questions or read-only tasks → skip protocol, act immediately.

### When to Read

| Task | File |
|------|------|
| Session start | `keystone/.context/mission.md` |
| New feature, refactor | `keystone/directives/THINKING.md` |
| Implementation | `keystone/directives/EXECUTION.md` |
| Code review | `keystone/standards/INDEX.md` |
| Python code | `keystone/standards/global.md` + `python.md` |
| Rust/Tauri code | `keystone/standards/global.md` + `rust.md` |
| Project constraints | `keystone/PROJECT_LEARNINGS.md` |

### Python Commands
- **Always use `python3`** instead of `python` in all commands, scripts, and tool invocations.

---

## Commands

```bash
# Development
npm run tauri dev

# Build
npm run tauri build

# Rebuild Python binary
cd src-tauri/python && source venv-build/bin/activate && pyinstaller prism.spec
cp dist/prism ../binaries/prism-aarch64-apple-darwin
```

## Constraints

- No bundled Chromium (Tauri uses system WebKit)
- API keys MUST be proxied via Cloudflare Worker — never in client
- Local-first, cloud-optional philosophy
- Data stored in `~/Library/Application Support/PortfolioPrism/` (macOS)

## Current State (Phase 4 In Progress)

- ✅ Phase 1-3: Tauri shell + Python sidecar + POC dashboard transplanted
- ⏳ Phase 4: Auth & Hive (~70%) — see `docs/phase4_issues.md`
- ⏳ Phase 5: Polish (pending)

## State Files

| File | Purpose |
|------|---------|
| `keystone/.context/mission.md` | Living objective |
| `keystone/.context/backlog.md` | Deferred ideas |
| `keystone/specs/tasks.md` | Execution plan |
