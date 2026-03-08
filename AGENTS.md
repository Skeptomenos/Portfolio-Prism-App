# Portfolio Prism

## Current Execution Handoff (2026-03-06)

This file contains stable repo-level rules, but it is not sufficient by itself for the current stabilization effort.

Current execution source of truth:

1. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/stabilization-and-self-dogfood-plan.md`
2. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/live-ui-qa-report-2026-03-06.md`
3. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/opencode-self-testing-runbook.md`
4. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/codex-install-config-plan.md`

Supporting execution context inside the inner repo:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/project-overview-live.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/codex-self-testing-capabilities.md`

Repository boundary:

- The inner repo is now the execution boundary.
- This agent should be able to execute and test from the inner repo without requiring wrapper-directory docs for the baseline execution loop.
- The wrapper repo is reserved for high-level planning, architecture, and reviews.
- Outer review docs may still be useful context, but they are optional for implementation unless explicitly requested.
- Codex skills, MCP setup, browser tooling, and machine-local secrets still live outside the repo, so the repo is execution-ready on the project side but not a complete standalone agent runtime by itself.
- The active shared skill root for both Codex and OpenCode is `$HOME/.agents/skills`.
- If this agent is running inside the prepared Codex environment, treat Codex skills and MCP servers as available platform capabilities. In that case, outer repo access is not required for plan execution, only optional for fuller architectural judgment.

Minimum required read pack (inner-only):

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/system_overview.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/analytics_pipeline.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/pipeline_triggering.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/ipc_api.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/echo_sentinel.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/identity_resolution.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/supabase_hive.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/data_model.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/product_definition.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/trade_republic.md`

Optional but high-value wrapper context for fuller architectural judgment:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/reviews/live-code-review.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/architecture-overview.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/analytics-engine.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/telemetry.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/testing.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/hive-architecture.md`

Execution/testing notes for the current repo state:

- Prefer `pnpm`, not `npm`.
- Do not stop for approval once the stabilization task is clear; continue until blocked.
- Use the live plan task board and update it during implementation.
- Use repo test skills and browser dogfooding, not only unit tests.
- The reliable live startup/testing workflow is documented in `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/opencode-self-testing-runbook.md`.

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
2. **PLAN**: Propose approach only if the path is unclear. Otherwise proceed autonomously and only stop when blocked or when a decision is genuinely needed.
3. **TDD**: Write failing test → Validate failure.
4. **CODE**: Implement → Refactor → Type Check.
5. **VERIFY**: `pnpm build && pnpm lint` — must pass. Run the smallest reliable browser/runtime checks from the execution runbook when user-facing behavior changes.
6. **HALT**: If verification fails, fix before proceeding.

## Commands
```bash
pnpm dev                # Frontend dev
pnpm dev:engine         # Python engine
pnpm build              # Production build
```

## Constraints
- No bundled Chromium (Tauri uses system WebKit)
- API keys MUST proxy via Cloudflare Worker — never in client
- Local-first, cloud-optional philosophy
- Data: `~/Library/Application Support/PortfolioPrism/`
