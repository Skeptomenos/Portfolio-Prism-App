# Portfolio Prism documentation index

Reconciled: 2026-09-12. This checkout contains V1. The active V2 rebuild remains on a separate branch; this documentation handoff does not merge its code or establish release readiness.

## Continue work

| Purpose | Source |
| --- | --- |
| Continue the V2 rebuild | Local branch `codex/portfolio-prism-etf-acquisition`, inspected at `ebd28a79` |
| Find the V2 plan | `apps/portfolio-prism/_planning/strategy/v2-mission-and-delivery-plan.md` in that branch |
| Record findings and verification | Follow the plan's reference map into `_planning/reviews/`; keep phase status, decisions and next actions in the plan |
| Run or change V2 | Read that checkout's `AGENTS.md`, `index.md`, and relevant sections of `v2/README.md` |
| Inspect the published V2 baseline | [Draft PR #245](https://github.com/Skeptomenos/ai-dev/pull/245), branch `codex/portfolio-prism-v2`; this predates the local acquisition branch |
| Investigate V1 | [V1 README](README.md) and [V1 execution records](docs/execution/stabilization-and-self-dogfood-plan.md) |

Resolve the local branch with `git worktree list`. The acquisition branch was local-only at reconciliation; a fresh clone may not contain it. If unavailable, obtain that worktree or its current handoff before continuing acquisition. The older published draft is a baseline, not evidence that later work is present.

The single V2 plan owns scope, phases, acceptance, decisions and next actions. Its linked dated records own detailed findings and verification. V1 execution documents are historical context for the rebuild and must not substitute for the V2 plan. This index records navigation, not live project status; confirm the branch and plan before acting.

No current Linear issue or project binding is recorded in the V2 source index. Private `_planning/` files are omitted from public splits; missing private context does not make a historical V1 plan current.
