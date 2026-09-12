# Portfolio Prism documentation index

Reconciled: 2026-09-12. Active implementation: `v2/`. V1 remains in `src/` and `src-tauri/`.

## Continue work

In the monorepo, read `_planning/strategy/v2-mission-and-delivery-plan.md` first. It is the single V2 project plan and owns phase status, open acceptance gates and the next action. Its reference map tells you when to load implementation records, dataset priorities and ETF source findings.

The `_planning/` directory is omitted from the public split. If it is absent, use the public documents below for implemented behavior; obtain the current plan before claiming to continue its next phase. Do not substitute an old V1 plan. Personal Linear project: [Portfolio Prism](https://linear.app/helmus/project/portfolio-prism-bd56b2ed13ac). Completed source integration: [DEV-175](https://linear.app/helmus/issue/DEV-175) via [PR #254](https://github.com/Skeptomenos/ai-dev/pull/254); DEV-26 remains V1 recovery work.

## Read by task

| Task | Document |
| --- | --- |
| Classify current and historical documentation | [Documentation map](docs/index.md) |
| Investigate retained V1 infrastructure | [Infrastructure reference](infrastructure/README.md) |
| Understand the problem and product | [README](README.md) |
| Run V2, inspect storage, diagnostics or valuation contracts | [V2 README](v2/README.md) |
| Implement or verify a change | [Contributing](CONTRIBUTING.md) and [agent instructions](AGENTS.md) |
| Investigate earlier architecture and setup | [V1 README reference](docs/v1/execution/v1-readme-reference.md) |
| Investigate earlier frontend conventions and tests | [V1 contribution reference](docs/v1/execution/v1-contributing-reference.md) |
| Investigate earlier stabilization work | [V1 stabilization plan](docs/v1/execution/stabilization-and-self-dogfood-plan.md) |

## Document ownership

The README owns product explanation; the V2 README owns current runtime contracts. The private delivery plan owns delivery status and decisions. Dated private references preserve observations and prior verification. Agent instructions route work and preserve project constraints. Older architecture, specs, plans and runbooks describe V1 unless explicitly marked V2; they do not override the rebuild plan or establish current release readiness.

## Separate ongoing work

The partial V2 pilot and its scoped integration fixes are merged into main via #254. Later enrichment/acquisition work remains on `codex/portfolio-prism-v2` (last inspected `1d9c3829`) and `codex/portfolio-prism-etf-acquisition` (`ebd28a79`). Reference-only design work remains on `codex/portfolio-prism-design` (`e6eac9b7`). Resolve these with `git worktree list`; local-only branches may be absent from a fresh clone. Read their current plans before continuing that work. This integration does not import their later evidence, adapters or designs.

Scoped integration: [_planning/strategy/2026-09-12-v2-pr-integration.md](_planning/strategy/2026-09-12-v2-pr-integration.md).
