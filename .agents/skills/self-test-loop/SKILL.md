---
name: self-test-loop
description: Use ONLY when working inside the Portfolio Prism project (~/repos/ai-dev/apps/Portfolio-Prism). Runs the Portfolio Prism self-test scripts to validate changes. Do NOT use for other projects.
---

# Portfolio Prism Self-Test Loop

Use this skill after making changes in Portfolio Prism.

Start from the wrapper root:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism`

Repo commands should target the nested app root:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism`

## Default Loop

1. Map the changed files mentally into frontend, Python, or E2E buckets.
2. Run:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
./scripts/selftest/test-changed.sh
```

3. If the change touches UI behavior, startup behavior, or user flows, also run:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
./scripts/selftest/smoke-ui.sh
```

4. Use `dev-up.sh` and `healthcheck.sh` only for one-shot startup verification. For a real user handoff, prefer persistent PTY shells with `pnpm dev:engine` and `pnpm dev`.

5. If a smoke check fails, inspect:

- `Portfolio-Prism/.tmp/selftest/*.log`
- `Portfolio-Prism/output/playwright/smoke/*`

6. Summarize:

- what ran
- what passed
- what failed
- what was not validated

## Escalation Rules

- Use `dogfood` only when a simple smoke run is not enough or the user explicitly wants exploratory QA.
- Use raw `agent-browser` commands when you need targeted repro or additional screenshots beyond the smoke script.
- Use `pnpm exec playwright test` when the existing E2E suite is the best fit.
- If an integration or browser flow needs local port binding, expect to run it out of sandbox.

## Do Not

- jump straight to broad E2E if a smaller loop can validate the change
- skip artifact collection on UI failures
- assume the desktop Tauri shell is required for every validation

## Runtime Note

- Install this skill under shared `~/.agents/skills/`.
- `scripts/codex/*` still exists only as a deprecated compatibility wrapper.
