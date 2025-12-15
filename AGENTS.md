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
├── anamnesis/               # AI developer framework
├── legacy/react-prototype/  # React UI for v2 (preserved)
└── POC/                     # Original Python engine (gitignored)
```

---

## Protocol

### Golden Rules

1. **State:** Read `anamnesis/.context/mission.md` at session start
2. **Specs:** Complex tasks (>1hr) require `anamnesis/specs/`. No code without spec.
3. **Consensus:** Present plan, WAIT for approval before coding
4. **Epilogue:** MANDATORY after feature/design completion.
5. **NO IMPLEMENTATION WITHOUT APPROVAL:** ⚠️ CRITICAL ⚠️
   - Planning, reading, and research: ALWAYS allowed
   - Writing, editing, or deleting files: REQUIRES explicit user approval
   - You MUST present your plan and ask "Ready to proceed?" or similar
   - WAIT for user to say "go", "proceed", "do it", "yes", or clear equivalent
   - Do NOT interpret your own confidence or plan completeness as approval
   - **HANDSHAKE RULE:** You CANNOT plan and implement in the same response.
     If you just finished planning → STOP. Do not continue to implementation.

> **Models prone to eager execution:** This means YOU. Plan. Present. Ask. Wait.

> **ESCAPE HATCH:** Simple questions or read-only tasks → skip protocol, act immediately.

### When to Read

| Task | File |
|------|------|
| Session start | `anamnesis/.context/mission.md` |
| New feature, refactor | `anamnesis/directives/THINKING.md` |
| Implementation | `anamnesis/directives/EXECUTION.md` |
| Code review | `anamnesis/standards/INDEX.md` |
| Python code | `anamnesis/standards/global.md` + `python.md` |
| Rust/Tauri code | `anamnesis/standards/global.md` + `rust.md` |
| Project constraints | `anamnesis/PROJECT_LEARNINGS.md` |

---

## Task Management

> **Task Awareness:** AI must check dependencies and status before selecting tasks.

### Task Selection Rules

1. **Dependency Check:** Never start a task if its dependencies aren't `Done` or `Archive`
2. **Status Flow:** Backlog → Open → In Progress → Done → Archive
3. **Blocked Handling:** Mark tasks as `Blocked` if dependencies are unmet
4. **Board Sync:** Regenerate `board.md` at session start, end, and on user command

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
| Task selection | `anamnesis/specs/tasks.md` (check dependencies) |
| Progress overview | `anamnesis/.context/board.md` |
| Workstream context | `anamnesis/.context/workstreams/[name].md` |

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
| `anamnesis/.context/mission.md` | Living objective |
| `anamnesis/.context/backlog.md` | Deferred ideas |
| `anamnesis/.context/board.md` | Kanban board (progress overview) |
| `anamnesis/specs/tasks.md` | Execution plan |