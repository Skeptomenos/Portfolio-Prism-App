# Portfolio Prism

> **Root File:** Auto-loaded by AI CLI tools. Keep concise (<80 lines).

## Overview

Privacy-first, high-performance desktop portfolio analyzer using the Tauri + Python Sidecar pattern. Wraps an existing Python/Streamlit analytics engine in a native macOS container. "Battery Included, Browser Free" — no bundled Chromium.

## Tech Stack

- **Shell:** Tauri v2 (Rust) — Native window, OS integration
- **Frontend:** TypeScript + React + Vite (main UI)
- **Engine:** Python (Headless sidecar) — Analytics, data processing
- **Database:** SQLite (local), Supabase (community "Hive")
- **Proxy:** Cloudflare Workers (API key protection)

## Structure

```
.                            # Standard Tauri project layout
├── src/                     # Frontend (TypeScript + React)
├── src-tauri/               # Rust shell + Python sidecar
│   ├── python/              # Python source
│   │   ├── portfolio_src/   # Business logic
│   │   ├── prism_headless.py # Entry point
│   │   └── prism_headless.spec # PyInstaller spec
│   └── src/lib.rs           # Sidecar spawning
├── infrastructure/          # Cloudflare Worker
├── docs/                    # Architecture & design docs
└── keystone/               # AI developer framework
```

---

## Protocol

### Golden Rules

1. **Wizard:** Use `INITIATOR.md` for setup and updates.
2. **Smart Merging:** Directives (`THINKING.md`, `EXECUTION.md`) are single files that merge framework logic with your custom rules. Read the whole file; custom rules are usually at the bottom.
3. **State:** Read `keystone/project/mission.md` + `registry.md` at session start.
4. **Consensus:** Present plan, WAIT for approval before coding.
5. **Epilogue:** MANDATORY after task completion. Call `skills_keystone_board` and update `CHANGELOG.md`.
6. **NO COMMIT WITHOUT CHANGELOG (Append to top, never overwrite):** ⚠️ CRITICAL ⚠️
7. **NO IMPLEMENTATION WITHOUT APPROVAL:** ⚠️ CRITICAL ⚠️
   - Planning, reading, and research: ALWAYS allowed.
   - Writing, editing, or deleting files: REQUIRES explicit user approval.
   - You MUST present your plan and ask "Ready to proceed?" or similar.
   - WAIT for user to say "go", "proceed", "do it", "yes", or clear equivalent.
   - **HANDSHAKE RULE:** You CANNOT plan and implement in the same response.

> **ESCAPE HATCH:** Simple questions or read-only tasks → skip protocol, act immediately.

### When to Read

| Task | File |
|------|------|
| Session start | `keystone/project/mission.md` + `registry.md` |
| New feature, refactor | `keystone/directives/THINKING.md` |
| Complex bug | `keystone/directives/THINKING.md` (T1-RCA) |
| Implementation | `keystone/directives/EXECUTION.md` |
| Code review | `keystone/standards/INDEX.md` |
| Project constraints | `keystone/PROJECT_LEARNINGS.md` |

---

## Task Management

### Task Selection Rules

1. **Dependency Check:** Never start a task if its dependencies aren't `Done` or `Archive`.
2. **Status Flow:** Backlog → Open → In Progress → Done → Archive.
3. **Board Sync:** Regenerate `board.md` at session start, end, and on user command.

### User Commands

| Command | Action |
|---------|--------|
| "Generate board" | Regenerate board from tasks |
| "Next task" | Find and start next Open task |
| "Switch to [workstream]" | Change active workstream |
| "Archive done tasks" | Move Done tasks to Archive |

### When to Read (Task-Related)

| Task | File |
|------|------|
| Task selection | `keystone/project/tasks.md` (check dependencies) |
| Progress overview | `keystone/project/board.md` |
| Workstream context | `keystone/project/workstreams/[name].md` |

---

## Commands

```bash
# Development: npm run tauri dev    Build: npm run tauri build
```

## Constraints

- No bundled Chromium (Tauri uses system WebKit)
- API keys MUST be proxied via Cloudflare Worker — never in client
- Local-first, cloud-optional philosophy
- Data stored in `~/Library/Application Support/PortfolioPrism/` (macOS)

## State Files

`keystone/project/active_state.md` (current) | `keystone/project/handover.md` (previous) | `keystone/project/tasks.md` (plan) | `keystone/project/board.md` (progress)
