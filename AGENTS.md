# Portfolio Prism

> **Root File:** Auto-loaded by AI CLI tools. Keep concise.

## Overview

Privacy-first desktop portfolio analyzer using Tauri + Python Sidecar. Native macOS with React UI and headless Python analytics. "Battery Included, Browser Free" — no bundled Chromium.

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Shell      | Tauri v2 (Rust)                     |
| Frontend   | TypeScript + React + Vite           |
| Engine     | Python (Headless sidecar)           |
| Database   | SQLite (local), Supabase (Hive)     |
| Proxy      | Cloudflare Workers (API protection) |

## Structure

```
src/                    # Frontend (TypeScript + React)
src-tauri/              # Rust shell + Python sidecar
├── python/             # Python source (portfolio_src/)
└── src/lib.rs          # Sidecar spawning
infrastructure/         # Cloudflare Worker
keystone/               # AI developer framework
rules/                  # Code standards (see Rule Activation)
```

## Commands

```bash
npm run tauri dev       # Development (hot reload)
npm run tauri build     # Production build
```

## Constraints

- No bundled Chromium (Tauri uses system WebKit)
- API keys MUST proxy via Cloudflare Worker — never in client
- Local-first, cloud-optional philosophy
- Data: `~/Library/Application Support/PortfolioPrism/`

---

## Rule Activation

**Apply these rules based on task type:**

| Task                  | Required Rules                                         |
| --------------------- | ------------------------------------------------------ |
| All code changes      | `rules/testing.md`, `rules/documentation.md`           |
| TypeScript / React    | `rules/rules_ts.md`, `rules/architecture.md`           |
| Python sidecar        | `rules/logging.md`, `rules/architecture.md`            |
| API / endpoints       | `rules/api_design.md`, `rules/security.md`             |
| Security-sensitive    | `rules/security.md`                                    |
| Git / workflow        | `rules/workflow.md`                                    |

---

## Verification Protocol

1. **Reality Check:** Build and test BEFORE claiming done.
2. **No Slop:** No shortcuts. No "works for now". Production-ready only.
3. **Type Safety:** Zero `any`. Zod/Pydantic at all IO boundaries.

---

## Protocol

### Golden Rules

1. **State:** Read `keystone/project/mission.md` + `registry.md` at session start.
2. **Consensus:** Present plan, WAIT for approval before coding.
3. **Epilogue:** Update `CHANGELOG.md` after task completion.
4. **NO IMPLEMENTATION WITHOUT APPROVAL** — Plan and implement in separate responses.

> **Escape Hatch:** Simple questions or read-only tasks skip protocol.

### When to Read

| Task               | File                                   |
| ------------------ | -------------------------------------- |
| Session start      | `keystone/project/mission.md`          |
| New feature        | `keystone/directives/THINKING.md`      |
| Implementation     | `keystone/directives/EXECUTION.md`     |
| Code review        | `keystone/standards/INDEX.md`          |
| Project learnings  | `keystone/PROJECT_LEARNINGS.md`        |

---

## State Files

`keystone/project/active_state.md` | `keystone/project/handover.md` | `keystone/project/tasks.md` | `keystone/project/board.md`
