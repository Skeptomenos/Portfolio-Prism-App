---
name: frontend-qa
description: Use when a Portfolio Prism change affects routes, rendering, interactions, loading states, startup behavior, or any other browser-visible behavior.
---

# Portfolio Prism Frontend QA

Use this skill for browser validation on the Vite app.

## Baseline Workflow

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
./scripts/selftest/smoke-ui.sh
```

This validates:

- frontend startup on port `1420`
- Python Echo-Bridge health on port `5001`
- browser open/render path
- navigation to the `Health` view
- screenshot/console/error artifact capture

Use `smoke-ui.sh` for one-shot validation. Do not assume `dev-up.sh` leaves the app alive for user handoff in this environment.

## Persistent User Handoff Workflow

If the user needs to open the app in their own browser and interact with it:

1. Start the engine in a persistent local shell:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
set -a && source .env && set +a
export UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache
pnpm dev:engine
```

2. Start the frontend in a second persistent local shell:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
export TAURI_DEV_HOST=127.0.0.1
pnpm dev
```

3. Validate the page with Playwright MCP, Chrome DevTools tooling, or `agent-browser`.
4. Only then hand the URL to the user.

## Artifact Paths

- Smoke screenshots/logs: `Portfolio-Prism/output/playwright/smoke`
- Runtime logs: `Portfolio-Prism/.tmp/selftest`

## When To Escalate

- If the user explicitly asks for exploratory QA: use `dogfood`
- If a very specific interaction needs repro: use direct `agent-browser` commands
- If existing Playwright E2E coverage already matches the flow: run `pnpm exec playwright test --reporter=line`

## Reporting

Always report:

- the URL tested
- the script(s) used
- whether startup was one-shot or persistent
- artifact paths
- whether the issue reproduced or not

## Runtime Note

- Install this skill under shared `~/.agents/skills/`.
- `scripts/codex/*` and `.tmp/codex` are historical compatibility names; prefer `scripts/selftest/*` and `.tmp/selftest`.
