---
name: repo-test-map
description: Use when deciding how to boot Portfolio Prism, which ports to expect, which validation loop to run, and where runtime or browser artifacts are written.
---

# Portfolio Prism Test Map

Portfolio Prism is a nested repo.

- Wrapper root: `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism`
- App root: `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism`

Always run repo commands from the app root unless the user explicitly asks otherwise.

## Runtime Map

- Frontend dev server: `pnpm dev`
- Frontend + Python engine for browser testing: `pnpm dev:browser`
- Python engine only: `pnpm dev:engine`
- Tauri desktop dev shell: `pnpm tauri:dev`

## Fixed Ports

- Frontend: `http://127.0.0.1:1420`
- Python Echo-Bridge health: `http://127.0.0.1:5001/health`

## Canonical Harness Commands

Use the repo harness scripts instead of ad hoc commands when possible.

The canonical repo harness now lives under `scripts/selftest/`.

- `./scripts/selftest/dev-up.sh`
- `./scripts/selftest/dev-down.sh`
- `./scripts/selftest/healthcheck.sh`
- `./scripts/selftest/test-changed.sh`
- `./scripts/selftest/smoke-ui.sh`

Compatibility note:

- `./scripts/codex/*` still works as a deprecated wrapper layer.

## Test Commands

- Frontend unit + integration baseline: `pnpm test:run`
- Frontend unit only: `pnpm test:unit`
- Frontend integration only: `pnpm test:integration`
- Playwright E2E: `pnpm exec playwright test --reporter=line`
- Python tests: `cd src-tauri/python && uv run pytest`

## Artifact Locations

- Browser smoke artifacts: `Portfolio-Prism/output/playwright/smoke`
- Runtime logs + pid files: `Portfolio-Prism/.tmp/selftest`

The old `.tmp/codex` path name is historical. Prefer `.tmp/selftest`.

## Default Testing Strategy

1. Start with `./scripts/selftest/test-changed.sh` from the app root.
2. If the change touches UI flows or browser-visible behavior, run `./scripts/selftest/smoke-ui.sh`.
3. If the user needs a long-lived browser handoff, do not rely on `dev-up.sh`. Start persistent shells instead:
   - engine: `pnpm dev:engine`
   - frontend: `pnpm dev`
4. Use `./scripts/selftest/dev-up.sh` and `./scripts/selftest/healthcheck.sh` for one-shot startup verification inside the same execution context.
5. Only escalate to `dogfood` or broader E2E if the smaller loop is insufficient.

## Important Constraints

- The browser-first validation path should use the Vite app on port `1420`, not `tauri dev`, unless the user specifically needs the native shell.
- Trade Republic auth may require saved state or human-in-the-loop steps. Do not block basic UI validation on live auth unless the task specifically requires it.
- In this environment, local dev servers started out of sandbox are not reliably reachable from later sandboxed commands. Prefer one-shot validation scripts like `smoke-ui.sh`.
- In this environment, `dev-up.sh` does not reliably leave child processes alive for user/browser handoff after the script exits. For a session the user must interact with, use persistent PTY shells with `pnpm dev:engine` and `pnpm dev`.

## Runtime Note

- Install this skill under shared `~/.agents/skills/`.
- Avoid repo-local shared skills unless a temporary fallback is unavoidable.
