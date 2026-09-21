# Portfolio Prism documentation index

Active application: **V2 in `v2/`**. Reconciled: 2026-09-21.

## Start here

1. Read [AGENTS.md](AGENTS.md) for project constraints.
2. Use [v2/README.md](v2/README.md) for the current runtime, supported behavior and verification commands.
3. In the monorepo, continue through the [single delivery plan](_planning/strategy/v2-mission-and-delivery-plan.md). It owns phases, decisions, open gates and next actions. Follow its linked evidence only when needed.

The `_planning/` directory is omitted from the public split. If it is absent, use the public documents below; obtain the current plan before claiming to continue a private delivery phase. Live issue state belongs to the personal [Portfolio Prism project](https://linear.app/helmus/project/portfolio-prism-bd56b2ed13ac). Resolve current branches/PRs from Git and the tracker, not historical handoff notes.

## Read by task

| Need | Owner |
| --- | --- |
| Product purpose and quick start | [README](README.md) |
| Visual system, pipeline and plugin explanation | [Architecture map](docs/architecture-map.html), also in the app’s **Wiki** tab — a dated code/target map, not live portfolio status |
| Setup, API/storage contracts and checks | [Runtime guide](v2/README.md) |
| Research and implement an ETF source | [Composition-provider skill](skills/portfolio-prism-composition-provider/SKILL.md) |
| Core/host/plugin boundaries and contributor target | [Plugin architecture](docs/plugin-architecture.md) |
| Financial view and analytics extension contracts | [Financial read/view contract](docs/financial-view-contract.md); broker connection contracts and checks are in the [runtime guide](v2/README.md) |
| Coverage meaning, visible gaps and acceptance | [Coverage contract](docs/exposure-coverage-contract.md) |
| User decisions on unresolved items and manual valuation inputs | [Investigation contract](docs/investigation-decisions.md) — implemented; reversible decisions and dated manual price fallbacks |
| Durable history, capital flows and return definitions | [History architecture](docs/portfolio-history-and-performance.md); H1 merged and active on the primary portfolio; later performance stages remain planned |
| Parallel history/backend and view delivery | [Shared API contract](docs/history-api-contract.md), [execution handoff](_planning/strategy/2026-09-21-history-plugin-handoff.md) — handoff is private |
| Development workflow and check selection | [Contributing](CONTRIBUTING.md#verification) |
| Delivery phases and open acceptance | [Delivery plan](_planning/strategy/v2-mission-and-delivery-plan.md) — private |
| Plugin gaps and forward-phase validation | [Plugin plan](_planning/strategy/v2-plugin-support-plan.md) — private |
| History milestones and validation | [History plan](_planning/strategy/v2-history-and-performance-plan.md), [combined H1 evidence](_planning/reviews/2026-09-21-history-integration.md) — private; combined acceptance passed; merged and primary activation verified |
| Documentation classification | [Documentation map](docs/index.md) |

## Historical material

Use the [V1 archive](docs/v1/index.md) only for a specific legacy question. Retained V1 code lives in `src/`, `src-tauri/` and [infrastructure](infrastructure/README.md). The private [strategy inventory](_planning/strategy/INDEX.md) separates current plans from superseded strategies. Dated evidence records what was observed at that revision; old test counts, ports and branch references do not establish current readiness.

The earlier one-ETF pilot and branch handoff are preserved in the [2026-09-12 integration record](_planning/strategy/2026-09-12-v2-pr-integration.md). They are not the current implementation or continuation route.
