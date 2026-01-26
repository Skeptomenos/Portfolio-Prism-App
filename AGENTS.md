# Portfolio Prism

## Overview
Privacy-first desktop portfolio analyzer using Tauri + Python Sidecar. Native macOS with React UI and headless Python analytics. "Battery Included, Browser Free" — no bundled Chromium.

## Tech Stack
| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Shell    | Tauri v2 (Rust)                     |
| Frontend | TypeScript + React + Vite           |
| Engine   | Python (Headless sidecar)           |
| Database | SQLite (local), Supabase (Hive)     |
| Proxy    | Cloudflare Workers (API protection) |

## Role
**You:** Senior Engineer. **Manager:** User (Architect).
**Goal:** Production-Ready, Type-Safe, Modular.

## Hard Constraints
1. **NO SPEC = NO CODE**: Demand specification before implementing.
2. **ZERO TOLERANCE**: No lint/type errors. No `any`. Build must pass.
3. **ATOMICITY**: One feature at a time. No "while I'm here" refactoring.
4. **SAFETY**: All I/O in `try/catch`. Validation via Zod. Secrets via ENV.

## Rule Activation
*Apply rules based on task type:*

| Task               | Required Rules                             |
| ------------------ | ------------------------------------------ |
| All code changes   | `rules/testing.md`, `rules/documentation.md` |
| TypeScript / React | `rules/rules_ts.md`, `rules/architecture.md` |
| Python sidecar     | `rules/logging.md`                           |
| API / endpoints    | `rules/api_design.md`, `rules/security.md`   |
| Security-sensitive | `rules/security.md`                          |
| Git / workflow     | `rules/workflow.md`                          |

## Workflow
1. **READ**: Context + Spec + Active Rules.
2. **PLAN**: Propose approach. Identify gaps. **WAIT for approval.**
3. **TDD**: Write failing test → Validate failure.
4. **CODE**: Implement → Refactor → Type Check.
5. **VERIFY**: `npm run build && npm run lint` — must pass.
6. **HALT**: If verification fails, fix before proceeding.

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
