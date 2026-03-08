# OpenCode Self-Testing Runbook

## Scope

This runbook is the active self-testing/runtime guide for Portfolio Prism in OpenCode.

- App root: `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism`
- Preferred shared skill root: `$HOME/.agents/skills`
- Canonical repo-owned runtime commands: `scripts/selftest/*`

## Canonical Skills

The active shared skills live in `$HOME/.agents/skills`:

- `$HOME/.agents/skills/repo-test-map/SKILL.md`
- `$HOME/.agents/skills/self-test-loop/SKILL.md`
- `$HOME/.agents/skills/frontend-qa/SKILL.md`
- `$HOME/.agents/skills/bug-repro/SKILL.md`

Preserved companion skills:

- `$HOME/.agents/skills/agent-browser/SKILL.md`
- `$HOME/.agents/skills/dogfood/SKILL.md`

## Canonical Commands

- `./scripts/selftest/test-changed.sh`
- `./scripts/selftest/smoke-ui.sh`
- `./scripts/selftest/dev-up.sh`
- `./scripts/selftest/dev-down.sh`
- `./scripts/selftest/healthcheck.sh`
- `pnpm run selftest:e2e`

## Default Verification Loop

1. Run `./scripts/selftest/test-changed.sh <touched-paths>`.
2. If the change affects browser-visible behavior, run `./scripts/selftest/smoke-ui.sh`.
3. If the change adds or updates the Playwright smoke gate, run `pnpm run selftest:e2e`.
4. Review smoke artifacts under `output/playwright/smoke` and runtime logs under `.tmp/selftest`.

## Persistent User Handoff

For a live browser/dev session, use persistent shells instead of one-shot smoke scripts:

1. Start the engine with `pnpm dev:engine`.
2. Start the frontend with `pnpm dev`.
3. Use `agent-browser`, Playwright, or Chrome DevTools tooling for validation.

## Compatibility Notes

- `scripts/codex/*` still works, but only as a deprecated compatibility wrapper to `scripts/selftest/*`.
- `docs/execution/codex-install-config-plan.md` remains useful as historical machine-setup context, but this runbook is the active runtime/testing reference.
- In this environment, Playwright should target `http://localhost:1420`; `http://127.0.0.1:1420` is not reliable for the current smoke gate.
