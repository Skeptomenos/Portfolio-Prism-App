---
name: bug-repro
description: Use when a Portfolio Prism issue needs confirmation, narrowing, or evidence with concrete reproduction steps and artifacts.
---

# Portfolio Prism Bug Repro

Use this skill when the target is a reproducible bug report rather than a broad QA sweep.

## Setup

1. Boot the browser-test stack:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
./scripts/selftest/dev-up.sh
./scripts/selftest/healthcheck.sh
```

2. Create a timestamped artifact directory under:

- `Portfolio-Prism/output/playwright/repro/<timestamp>`

3. Use `agent-browser` or the active runtime's equivalent browser tooling for targeted reproduction.

## Minimum Evidence

Capture:

- the exact URL
- the minimal step list
- at least one screenshot of the broken state
- console output if relevant
- page errors if relevant

## Preferred Workflow

1. Reproduce the issue with the fewest possible steps.
2. Capture artifacts as you go.
3. If the bug is interactive or timing-sensitive, record a short repro video.
4. Stop once the bug is clearly proven or clearly disproven.

## Escalate Only If Needed

- Use `dogfood` when the problem is broad and exploratory.
- Use Playwright E2E only when the repro should be converted into automated coverage.

## Constraint

If the repro needs live auth, MFA, or protected external data, ask only for the missing credential or approval at that point. Do not ask earlier.

## Runtime Note

- Install this skill under shared `~/.agents/skills/`.
- `scripts/codex/*` still works only as a deprecated compatibility wrapper.
