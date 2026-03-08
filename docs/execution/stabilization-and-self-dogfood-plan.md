# Portfolio Prism Stabilization and Self-Dogfood Plan

| Field | Value |
|-------|-------|
| **Created** | 2026-03-06 |
| **Updated** | 2026-03-08 |
| **Status** | Live execution document. Active for stabilization, OpenCode self-testing migration, and dogfood-suite build-out. Update during implementation. |
| **Primary Input** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/live-ui-qa-report-2026-03-06.md` |
| **App Root** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism` |
| **Scope** | Auth/session restore, sync persistence, pipeline contract/UI, pipeline truthfulness, observability, auto issue reporting, Hive contribution, self-testing, dogfooding |

## How To Use This Document

- Update task `Status`, `Notes`, and `Evidence` as work progresses.
- Append dated entries to `Work Log` instead of keeping state in chat memory.
- Add new tasks rather than rewriting history when scope changes.
- Treat `Back Pressure` items as mandatory engineering controls, not optional polish.
- During implementation, any new finding, blocker, design decision, or repro detail should be written here immediately so compaction cannot drop it.

## Why This Exists

This is the live working document for the Portfolio Prism dogfood testing suite.

We are using it to avoid losing progress during compaction and to keep one durable source of truth for:

- why the dogfood suite matters
- what already works
- what is still missing
- what the next implementation step should be
- what evidence proves the current status

The product goal is not only “have tests.” The goal is to make OpenCode able to run Portfolio Prism, exercise meaningful portfolio workflows, observe frontend and backend behavior, capture issues, fix them, and rerun the same checks with confidence.

## Desired End State

The dogfood testing suite is successful when all of the following are true:

- OpenCode can start the app reliably in a repeatable way.
- OpenCode can run a lightweight smoke loop without manual setup drift.
- OpenCode can run browser-visible checks against key product routes and features.
- Contract drift, console errors, invalid pipeline reports, and degraded analytics become explicit failures or explicit degraded states.
- Real synced data can be replayed locally without requiring a fresh Trade Republic login on every run.
- Evidence artifacts and notes are written to stable locations so a later session can continue without reconstructing context from memory.

## Definition Of Done Policy

No feature is done unless:

- a dogfood workflow exists for that feature
- the workflow has at least one successful recorded run
- the workflow produces enough evidence to debug regressions later

This policy applies both to the current app and to all future feature work.

## Dogfood Feature Coverage Boundary

This boundary is now considered closed enough to implement against. The dogfood suite must eventually cover all of these product capabilities:

- [ ] App bootstrap and runtime health
  - Notes: startup, engine health handshake, session bootstrap, navigation shell, no blank-screen failure
- [ ] Trade Republic auth and credential lifecycle
  - Notes: phone/PIN entry, 2FA flow, saved session restore, expired session handling, credential/session store behavior
- [ ] Sync and local persistence
  - Notes: sync trigger, persisted holdings/state, restart continuity, offline/cached behavior
- [ ] Dashboard
  - Notes: overview visibility, freshness/trust state, summary coherence
- [ ] Holdings
  - Notes: holdings rendering, explicit missing/invalid/degraded states, action items for gaps
- [ ] X-Ray / analytics pipeline
  - Notes: run trigger, run result, trust/degraded/failed states, diagnostics visibility
- [ ] Health / diagnostics views
  - Notes: pipeline report envelope, backend/frontend contract safety, diagnostics readability
- [ ] Unknown asset handling and manual data recovery path
  - Notes: missing ETF decomposition, manual upload/action queue path, explicit unresolved state
- [ ] Hive read / contribution / freshness workflow
  - Notes: read from Hive, contribution back to Hive, freshness/trust display, queue-and-retry when unavailable
- [ ] Diagnostics and issue intake workflow
  - Notes: durable local error logging, deduplicated issue identity, privacy-safe feedback payloads, manual issue/report path

Recommended product-facing umbrella name for the current “auto error log and issue create workflow”:

- `Diagnostics and Issue Intake`

## Recommended QA Mode Split

Default principle: prompt-driven first, scripted where repeatability and hard failure signals matter.

### Prompt-Driven By Default

- [ ] Live route walkthroughs and exploratory feature QA
  - Notes: better for finding UX issues, confusing states, contradictory copy, and undocumented edge cases
- [ ] Live Trade Republic sign-in and 2FA verification
  - Notes: likely requires human-in-the-loop support and cannot be made fully deterministic at first
- [ ] On-the-fly issue documentation, evidence interpretation, and fix planning
  - Notes: the agent can inspect logs, read code, summarize root cause candidates, and prepare the next run

### Scripted / Hard-Gated

- [ ] Startup and replay preparation
  - Notes: service boot, temp data dirs, fixture copy, environment wiring
- [ ] Contract/backpressure assertions
  - Notes: no `IPCValidationError`, no invalid envelope silently treated as success, expected route loads succeed
- [ ] Real-data replay and deterministic dogfood loop
  - Notes: this is where scripts are much stronger than prompts
- [ ] Durable artifact capture
  - Notes: logs, screenshots, route outputs, stable exit code, stable artifact paths
- [ ] Regression checks for feature workflows already proven valuable
  - Notes: once a flow matters repeatedly, graduate it from prompt-only to script/test-backed

## Recommended Quality Thresholds

These are recommended starting thresholds and can be tightened after real-snapshot runs provide better evidence.

### Universal Hard Fails

- [ ] 0 unexpected uncaught frontend console errors on required dogfood routes
- [ ] 0 `IPCValidationError` occurrences
- [ ] 0 blank-screen or navigation-dead-end failures on required routes
- [ ] 0 silent backend failure paths; critical failures must be visible in UI, logs, or both

### Auth / Session Thresholds

- [ ] Valid saved session restores successfully
- [ ] Expired session produces explicit recoverable state, not contradictory connected state
- [ ] Credential/session-store failures create a durable diagnostic record

### Pipeline / Analytics Thresholds

- [ ] `success`
  - Notes: report envelope `ready`, `runStatus=success`, `is_trustworthy=true`, quality thresholds met
- [ ] `degraded`
  - Notes: explicit degraded banner/action state, not silent success
- [ ] `failed`
  - Notes: invalid report, execution exception, or unusable adapter state

Recommended initial numeric policy for healthy snapshots:

- ETF decomposition coverage: target `>= 95%` by portfolio value for `success`
- ETF decomposition coverage: `80% to <95%` becomes `degraded`
- ETF decomposition coverage: `< 80%` becomes `failed`
- Empty adapter registry when ETF positions exist: `failed`

### Hive Thresholds

- [ ] Hive reads succeed or produce explicit stale/partial state
- [ ] Contribution writes either succeed or enter a visible retry queue
- [ ] No silent loss of contribution data

### Diagnostics And Issue Intake Thresholds

- [ ] Every critical failure class creates one durable local diagnostic record
- [ ] Repeated occurrences deduplicate by stable hash instead of spamming new issue identities
- [ ] Privacy/telemetry opt-in is respected for outbound reporting

## MVP Stance On Subagents

Subagents are not required for MVP dogfooding.

- MVP requirement: one main OpenCode agent must be able to run the app, exercise the feature, inspect frontend/backend evidence, note issues, fix issues, and rerun verification.
- Subagents are a force multiplier for speed and coverage, not a prerequisite for the first usable dogfood suite.
- Because the current Oh My OpenCode background-agent path is not yet validated in this environment, MVP must not depend on it.

## Validation And Dependency Matrix

### Assumptions We Can Validate Ourselves

- [ ] Exact route/feature inventory present in the current app shell
- [ ] Current script/runbook/skill-loading behavior
- [ ] Current smoke-gate and browser route behavior
- [ ] Whether `task(... run_in_background=true ...)` works as documented in this environment
- [ ] Which features already have enough observable frontend/backend evidence for repeatable dogfooding

### Areas Where User Help Is Still Needed

- [ ] Live Trade Republic login / 2FA when a real auth flow must be exercised
- [ ] Approval and handling for private real-portfolio snapshot capture
- [ ] Final business acceptance of analytics-quality thresholds after first replayed real-data runs

### Non-Blocking Naming Decision

- [ ] Keep `Diagnostics and Issue Intake` unless a better product term emerges later

## Tooling Baseline

- Superpowers baseline for this planning/execution workflow is pinned to the latest tagged stable release currently installed locally: `v4.3.1`.
- In this OpenCode/Codex manual-install setup, Superpowers is **not** auto-updated for us.
- Plugin marketplace installs may support update workflows, but this local git checkout should be updated intentionally and then pinned to a stable tag.
- Treat future Superpowers upgrades as an explicit maintenance action, not an implicit background behavior.

## MVP Dogfood Checklist

Use this as the executable feature-by-feature dogfood checklist for the current app. A feature is only done when its checklist has a defined workflow and at least one successful recorded run.

| Feature Area | Required Coverage | Preferred QA Mode | Current Status | Notes |
|--------------|-------------------|-------------------|----------------|-------|
| App bootstrap and runtime health | launch app, engine health handshake, sidebar/nav shell, no blank screen | scripted smoke + prompt review | in_progress | smoke gate exists, but broader route coverage is still missing |
| Trade Republic auth | sign-in flow, 2FA, error handling | prompt-driven | todo | likely needs human-in-the-loop for real auth |
| Session restore and credential lifecycle | saved session restore, expired session, credential/session-store behavior | prompt-driven + targeted scripts | in_progress | restore-path correctness is a critical dogfood requirement |
| Sync and local persistence | trigger sync, persist data, restart continuity, offline/cached behavior | prompt-driven + scripted replay later | todo | replay/snapshot tooling is the key enabler |
| Dashboard | render useful overview, freshness/trust state, coherent top-level summary | prompt-driven, later scripted assertions | in_progress | first headed live pass confirmed real data renders; still missing replay-backed assertions |
| Holdings | render persisted holdings, handle missing/invalid/degraded states, action items | prompt-driven + hard-gated contract checks | in_progress | first headed live pass confirmed real holdings/confidence UI; route-level dogfood still not closed |
| X-Ray / analytics pipeline | run analysis, inspect run result, verify trust/degraded/failed states | prompt-driven + scripted backpressure | in_progress | first headed live pass surfaced explicit ETF decomposition failures instead of silent success |
| Health / diagnostics | inspect report envelope, contract safety, diagnostics clarity | scripted + prompt interpretation | in_progress | first headed live pass confirmed the route renders meaningful diagnostics states |
| Unknown asset/manual recovery | detect unresolved assets, present manual recovery/upload path | prompt-driven | todo | must be intentionally surfaced, not hidden in logs |
| Hive read/freshness | consume Hive data, show freshness/confidence/trust state | prompt-driven + targeted assertions | todo | visible product state, not backend trivia |
| Hive contribution and retry | queue contribution, retry when offline/error, no silent loss | scripted + prompt verification | todo | depends on queue/retry implementation |
| Diagnostics and Issue Intake | durable local logs, manual issue/report flow, deduplicated issue identity, privacy-safe evidence | prompt-driven + scripted evidence capture | in_progress | headed live feedback submission succeeded and created GitHub issue `#98` |

## First Feature Run Procedures

These are the first concrete dogfood run procedures to use while building the broader suite. They are intentionally practical, not final. Treat them as the current MVP operating recipes.

### Procedure A: Session Restore And Credential Lifecycle

- Goal: prove that saved-session discovery, restore behavior, and expired-session handling are truthful and recoverable.
- QA mode: prompt-driven primary, with targeted scripted assertions later.
- Preconditions:
  - persistent engine shell running via `pnpm dev:engine`
  - persistent frontend shell running via `pnpm dev`
  - app opens on the Vite frontend
- Run steps:
  1. Launch the app and observe initial route.
  2. If a saved session exists, verify the UI offers restore instead of forcing full sign-in immediately.
  3. Trigger restore and observe the resulting state.
  4. Verify the app lands in a truthful state:
     - authenticated -> dashboard
     - expired or unusable session -> explicit recovery path
     - invalid contract -> diagnostics-visible failure, not silent fallback
  5. Inspect frontend console, engine log, and auth-related diagnostics.
- Required evidence:
  - route reached after restore attempt
  - screenshot of restore/recovery state
  - relevant console excerpt
  - relevant engine log excerpt
- Pass conditions:
  - no contradictory connected/idle state
  - no `IPCValidationError`
  - expired session shows explicit recovery path
- Current status: partially testable now; real auth restore still needs live runtime exercise.

### Procedure B: X-Ray Pipeline Run

- Goal: prove that a user can run X-Ray analysis and get an explicit `success`, `degraded`, or `failed` truth state.
- QA mode: prompt-driven flow plus scripted backpressure checks.
- Preconditions:
  - app running with engine attached
  - portfolio data available from a live sync or future replay snapshot
- Run steps:
  1. Open Dashboard and confirm baseline portfolio presence.
  2. Navigate to X-Ray.
  3. Trigger the analysis pipeline.
  4. Observe route transitions, status banners, and action items.
  5. Verify the pipeline result is explicit:
     - `success`
     - `degraded`
     - `failed`
  6. Inspect backend output, pipeline report envelope, and route-level UI state.
- Required evidence:
  - screenshot before run
  - screenshot after run
  - pipeline result state captured from UI
  - report/log evidence showing why the run reached that state
- Pass conditions:
  - no silent success on untrustworthy analytics
  - degraded/failure states are visible and actionable
  - no console contract errors on X-Ray route
- Current status: central flow, but still blocked on replay tooling and final `runStatus` semantics work.

### Procedure C: Health Diagnostics Review

- Goal: prove that Health surfaces report-envelope truth safely without frontend crashes or hidden invalid states.
- QA mode: scripted smoke plus prompt interpretation.
- Preconditions:
  - app running with current backend
  - pipeline report path present or intentionally missing
- Run steps:
  1. Open Health directly from the app shell.
  2. Observe whether the route renders `missing`, `invalid`, `ready`, or later `degraded` states intentionally.
  3. Inspect console output for contract failures.
  4. Compare UI state against the served report envelope and backend logs.
- Required evidence:
  - Health screenshot
  - console-health log
  - envelope/log excerpt explaining rendered state
- Pass conditions:
  - no route crash
  - no `IPCValidationError`
  - invalid report becomes explicit invalid state, not a hidden or misleading success
- Current status: strongest currently testable route; smoke gate already covers a narrow version of this loop.

### Procedure D: Hive Contribution Visibility

- Goal: prove that Hive freshness/trust/contribution state is visible and that failed writes do not disappear silently.
- QA mode: prompt-driven initially, scripted later when queue/retry exists.
- Preconditions:
  - contribution/freshness signals exposed in UI or diagnostics
  - local + Hive integration path available in the runtime under test
- Run steps:
  1. Open the relevant diagnostics/action area after a sync or analysis flow that touches Hive-backed data.
  2. Check whether freshness/trust/coverage state is visible.
  3. If a contribution should occur, confirm whether it:
     - succeeded
     - queued for retry
     - failed visibly
  4. Inspect local logs and persistence for evidence of retry or failure state.
- Required evidence:
  - screenshot of freshness/contribution state
  - log evidence of contribution success or retry queue
  - no silent-loss path
- Pass conditions:
  - user-visible state for stale/partial/failed contribution
  - contribution failure is durable and diagnosable
- Current status: not ready for live acceptance yet; depends on Hive queue/retry implementation and diagnostics surfacing.

## Immediate Implementation Tranche

This is the next concrete build order for the dogfood suite itself.

### Tranche 1: Make The First Four Loops Runnable

- [ ] Write route-by-route live QA checklist prompts for:
  - Session restore and credential lifecycle
  - X-Ray pipeline run
  - Health diagnostics review
  - Hive contribution visibility
  - Notes: these prompts become the default operator recipe for prompt-driven dogfooding.
- [ ] Add a first scripted hard gate for Health/X-Ray console backpressure.
  - Notes: fail on `IPCValidationError` and other critical contract errors.
- [ ] Add explicit evidence checklist entries and artifact paths for each of the first four loops.
  - Notes: ensure later sessions can compare runs without relying on chat memory.

### Tranche 2: Make Real Data Replayable

- [ ] Create `scripts/selftest/record-sync-snapshot.sh`.
  - Goal: capture a private real portfolio sync snapshot for deterministic replay.
- [ ] Create `scripts/selftest/replay-sync-snapshot.sh`.
  - Goal: copy the snapshot into a temp `PRISM_DATA_DIR` and prepare the runtime for replay.
- [ ] Create `scripts/selftest/dogfood-real-snapshot.sh`.
  - Goal: run the default replay-based dogfood loop, collect artifacts, and exit non-zero on hard failures.
- [ ] Add package scripts:
  - `selftest:record-sync-snapshot`
  - `selftest:replay-sync-snapshot`
  - `selftest:dogfood:real-snapshot`

### Tranche 3: Graduate Prompt Loops Into Regression Gates

- [ ] Turn Health diagnostics into a stable repeated regression check.
- [ ] Turn X-Ray pipeline truth state into a stable repeated regression check.
- [ ] Add scripted assertions for Dashboard/Holdings route health once replay snapshots exist.
- [ ] Add Hive contribution/retry assertions once queueing exists.

## Test Readiness Gate

Use this section to decide when to start live testing.

### Ready To Test Now

- [x] The current app is ready for prompt-driven live testing of:
  - app bootstrap/runtime health
  - session restore behavior at the UI/runtime level
  - Health diagnostics route
  - current X-Ray route behavior
- [x] The current app is ready for narrow scripted smoke testing of Health/backpressure via the existing smoke gate.

### Not Ready Yet For Full Acceptance

- [ ] Replay-based dogfooding without fresh live login every run
- [ ] Full Hive contribution visibility/retry acceptance
- [ ] Broad feature-complete scripted acceptance across all routes

### User Notification Rule

- Tell the user we are ready to test as soon as a feature loop reaches the `Ready To Test Now` bar above.
- Tell the user a feature is not yet ready for acceptance when it still depends on missing replay tooling, missing diagnostics visibility, or missing backend truth-state implementation.

## Open Questions And Help Needed

### Closed Enough To Proceed Without Blocking

- The feature coverage boundary is now specific enough to implement against.
- Subagents are confirmed as non-required for MVP dogfooding.
- The default QA philosophy is set: prompt-driven first, scripted for replay, hard gates, and repeatable regressions.

### Questions I Can Close Myself During Implementation

- Which current routes/components already expose enough evidence for dogfooding
- Which feature flows deserve graduation from prompt-only to scripted regression checks
- Whether the documented Oh My OpenCode `task(... run_in_background=true ...)` path works in this environment

### Questions That Still Need User Participation

- When to run a live Trade Republic auth flow that may need human assistance
- When it is acceptable to capture and store a private real-portfolio replay snapshot
- Whether the recommended initial ETF coverage thresholds feel too strict or too lenient after the first real replay runs

### Current Recommendation

- No blocking product-goal ambiguity remains.
- We can proceed directly into implementation using this document as the live tracker.
- The first user-dependent checkpoint is real auth and/or private snapshot capture, not earlier planning.

## Live Progress Snapshot

### Current Overall Status

- Overall state: `in_progress`
- Dogfood-suite maturity: partial foundation in place; not yet full feature-by-feature product QA
- Main execution mode today: OpenCode + shared skills in `$HOME/.agents/skills` + canonical `scripts/selftest/*`

### What Already Works

- [x] Shared skill strategy is standardized on `$HOME/.agents/skills`.
  - Notes: OpenCode native `skill` loading works from the shared agent-compatible path.
  - Evidence: `docs/execution/opencode-self-testing-runbook.md`, `report.md`
- [x] Canonical repo selftest harness exists under `scripts/selftest/*`.
  - Notes: `scripts/codex/*` remains only as a deprecated compatibility wrapper.
  - Evidence: `scripts/selftest/`, `tests/integration/selftest-scripts.test.ts`
- [x] The repo has a working browser smoke gate.
  - Notes: Playwright smoke now passes using the current config and route navigation.
  - Evidence: `tests/e2e/selftest-smoke.spec.ts`, `pnpm exec playwright test tests/e2e/selftest-smoke.spec.ts --reporter=line`
- [x] Active runbooks and AGENTS entrypoints have been updated to the OpenCode/selftest model.
  - Notes: The runtime/testing source of truth now includes the OpenCode self-testing runbook.
  - Evidence: `AGENTS.md`, `Portfolio-Prism/AGENTS.md`, `docs/execution/opencode-self-testing-runbook.md`
- [x] A first headed/watchable live dogfood pass has been completed against the real app runtime.
  - Notes: persistent engine/frontend PTYs plus visible browser control now prove that prompt-driven live dogfooding works for several high-value routes.
  - Evidence: `output/playwright/dogfood/`, headed browser run on `http://localhost:1420`
- [x] Several core feature loops now have direct live evidence.
  - Notes: Health, X-Ray, Dashboard, Holdings, and Diagnostics/Issue Intake were exercised successfully enough to capture actionable product findings.
  - Evidence: `output/playwright/dogfood/health-live-pass.png`, `output/playwright/dogfood/xray-live-pass.png`, `output/playwright/dogfood/dashboard-live-pass.png`, `output/playwright/dogfood/holdings-live-pass.png`, `output/playwright/dogfood/feedback-after-submit-live-pass.png`

### What Is Still Missing

- [ ] Replayable real-data dogfood loop.
  - Notes: Snapshot capture/replay scripts still do not exist.
  - Evidence needed: `scripts/selftest/record-sync-snapshot.sh`, `scripts/selftest/replay-sync-snapshot.sh`, `scripts/selftest/dogfood-real-snapshot.sh`
- [ ] Feature-by-feature browser coverage for the major user-facing product areas.
  - Notes: Current coverage is smoke-oriented, not full route/feature acceptance coverage.
  - Evidence needed: route-level QA runbook and/or additional E2E specs
- [ ] A stable delegated/background-agent repro path for parallel investigation in Oh My OpenCode.
  - Notes: earlier `call_omo_agent` usage looked unreliable; official docs suggest validating the `task(... run_in_background=true ...)` path separately.
  - Evidence needed: minimal documented repro with `task` + `background_output`
- [ ] Session restore is not yet trustworthy enough for inner-repo self-ownership.
  - Notes: the headed run reproduced a path where clicking `Restore Session` landed on the login form instead of a clearly restored authenticated state; root cause is still unproven.
  - Evidence needed: dedicated fix plan, runtime traces, and a green post-fix dogfood pass

### Open Next Steps

- [ ] Create and hand off a dedicated session-restore fix plan to the inner-repo agent.
  - Notes: the plan should force root-cause investigation first, then a narrow fix plus headed dogfood verification.
- [ ] Build the real-data snapshot capture/replay scripts.
  - Notes: this is the highest-value missing capability for reliable dogfooding without repeated live login.
- [ ] Add one route-by-route live QA checklist for Dashboard, Health, Holdings, and X-Ray.
  - Notes: use this as the prompt/runbook source for live OpenCode browser testing.
- [ ] Convert the highest-value repeatable browser checks into stable regression gates.
  - Notes: start with console-error backpressure, route health, and degraded/invalid state rendering.

## Agent Handoff Pack

Use this document as the execution source of truth, not as a loose background memo.

Recommended handoff model:

- Keep `AGENTS.md` as the stable entrypoint and operating instructions.
- Keep this file as the live execution backlog and implementation truth.
- Keep the QA report as the evidence base.

Minimum required read order for a fresh execution/testing agent:

1. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/AGENTS.md`
2. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/AGENTS.md`
3. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/stabilization-and-self-dogfood-plan.md`
4. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/live-ui-qa-report-2026-03-06.md`
5. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/opencode-self-testing-runbook.md`
6. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/codex-install-config-plan.md`
7. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/system_overview.md`
8. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/analytics_pipeline.md`
9. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/pipeline_triggering.md`
10. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/ipc_api.md`
11. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/echo_sentinel.md`
12. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/standards/logging.md`
13. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/identity_resolution.md`
14. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/supabase_hive.md`
15. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/data_model.md`
16. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/product_definition.md`
17. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/trade_republic.md`

Supporting inner-repo context:

17. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/project-overview-live.md`
18. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/codex-self-testing-capabilities.md`

Optional but high-value wrapper context for fuller architectural judgment:

19. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/reviews/live-code-review.md`
20. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/architecture-overview.md`
21. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/analytics-engine.md`
22. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/telemetry.md`
23. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/testing.md`
24. `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/hive-architecture.md`

Mandatory execution/testing skills for the active runtime:

- `repo-test-map`
- `self-test-loop`
- `frontend-qa`
- `bug-repro`
- `dogfood`
- `agent-browser`

Preferred shared skill install:

- `$HOME/.agents/skills`

Repository boundary note:

- The inner repo is now the execution boundary for this project.
- Live documents, implementation plans, and runtime/testing runbooks should stay in the inner repo.
- The wrapper repo is for high-level planning, reviews, and architecture/roadmap context.
- Outer docs may still be useful context, but execution should not depend on wrapper-only live documents.

Self-containment status:

- Project-side baseline: sufficient. The inner repo now contains the minimum specs, live docs, runbooks, rules, and test harness scripts needed for implementation and testing.
- Agent-runtime baseline: not fully self-contained. Shared skills under `$HOME/.agents/skills`, MCP configuration, Playwright/agent-browser installs, and machine-local secrets still live outside the repo.
- Highest-quality architectural judgment: improved but not closed. Wrapper strategy/review docs remain useful optional context.
- Practical operating assumption: if the agent runs inside the prepared Codex or OpenCode environment on this machine, shared skills and MCP are available already. Under that assumption, wrapper-doc access is optional context rather than a requirement for executing this plan.

Missing for a truly self-contained working directory:

- Repo-owned copies of the currently active shared skills are not the source of truth; the live shared skill root is `$HOME/.agents/skills`.
- A repo-local bootstrap path for shared skills and MCP wiring, instead of relying on prior machine setup.
- A documented strategy for machine-local secrets and auth/session state that does not assume pre-existing `.env` and installed browser/runtime state.
- Optional mirror copies of the most important wrapper strategy docs if the goal is zero dependence on outer read access even for higher-level design reasoning.

Recommended model:

- Keep the inner repo self-contained for baseline execution, testing, and plan delivery.
- Allow optional read-only access to the wrapper repo for higher-level architecture, roadmap, and review context.
- Do not make implementation depend on wrapper-only documents, but do not duplicate all outer strategy material into the inner repo unless the team is willing to own the resulting drift risk.

First code anchors to inspect after the document pack:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/lib/schemas/ipc.ts`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/lib/ipc.ts`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/App.tsx`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/auth/`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/integrations/`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/src/commands.rs`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/core/pipeline.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/core/services/sync_service.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/schema.sql`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/scripts/codex/`

Status vocabulary:

- `todo`
- `in_progress`
- `blocked`
- `done`
- `deferred`

## Problem Statement

Portfolio Prism is already beyond prototype stage, but the current live build has a split failure mode:

1. Real Trade Republic sync works and persists latest holdings locally.
2. The frontend and backend contracts have drifted, so valid backend data is rejected in the UI.
3. The analytics pipeline does run, but it currently produces untrustworthy output for the tested real portfolio.
4. Codex can browser-test the app now, but it still lacks deterministic replay inputs and hard gates that would let it dogfood major workflows without user intervention every time.

The objective is not just to patch visible bugs. The objective is to create a system where:

- invalid contracts fail immediately and visibly
- degraded analytics are surfaced as degraded, not “complete”
- real synced data can be replayed locally without Trade Republic login on every run
- Codex can run browser and backend verification loops against captured real data and trust the result

## Working Definitions

### Back Pressure

Back pressure means forcing bad states to stop, downgrade, or surface explicitly instead of flowing through the system as if they were acceptable.

Examples:

- A missing report file returns `status: missing`, not `null` that then blows up in Zod.
- A pipeline with `is_trustworthy = false` returns `degraded` or `failed`, not `success`.
- An empty adapter registry fails startup checks or run preflight, not only post-hoc CSV output.
- A browser dogfood run fails if console contract errors appear, even if the page still renders.

### Real-Data Self-Test

“No mock data” does not mean “must hit Trade Republic every run.” The correct model is:

- capture real synced data into local deterministic fixtures or snapshots
- replay those snapshots into an isolated data directory
- run UI and pipeline checks against the replayed real data

This keeps tests realistic without tying every validation loop to live login and 2FA.

## Design Alignment Scan

This plan has been checked against the project’s stated design documents, not only against the live QA report.

Primary design sources:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/analytics_pipeline.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/pipeline_triggering.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/ipc_api.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/analytics-engine.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/architecture-overview.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/telemetry.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/echo_sentinel.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/hive-architecture.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/identity_resolution.md`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/product_definition.md`

Current alignment judgment:

- **Aligned:** Keep `sync_portfolio` and `run_pipeline` decoupled. The design explicitly wants fast sync and on-demand analysis.
- **Aligned:** Keep `prism.db` as the canonical local vault and use `PRISM_DATA_DIR`-style replay for local-first testing.
- **Aligned:** Use explicit contracts and replayable real snapshots instead of permissive mocks.
- **Needs tightening:** Preserve the “thin orchestrator, contract-driven services” pipeline design. Fixes must not move business logic into UI or IPC handlers.
- **Needs tightening:** Preserve IPC transport semantics. Transport-level success/error should stay explicit, while analytics truth should be represented as a nested run/result state.
- **Missing in previous draft:** Echo-Sentinel and telemetry integration. Critical contract and pipeline failures should become structured `system_logs` entries and flow into the privacy-safe reporting path.
- **Missing in previous draft:** Hive freshness, trust, contribution queueing, and RPC-only writes should be explicit parts of the stabilization work.
- **Guardrail:** Hive is shared current-state truth for community data. Local historical sync/pipeline snapshots belong in `prism.db`, not in Hive.

## Current Root Causes

## 1. Auth Bootstrap and Session Restore

Observed in:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/auth/schemas.ts`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/App.tsx`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/auth/components/SessionRestorePrompt.tsx`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/tr_auth.py`

Likely root causes:

- Frontend Zod contracts mark `lastError` and `phoneNumber` as optional strings, but backend legitimately returns `null`.
- `Restore Session` does not actually call a backend restore-session command. It only calls `trGetAuthStatus()` and branches on the result.
- App bootstrap treats any validation error as initialization failure, resets auth to `idle`, and sends the user to the Trade Republic view.
- UI shell status mixes auth-state-driven `Connected` with store-only sync timestamps, producing contradictory status text.

Fix direction:

- Make auth IPC contracts explicitly nullable where backend can return `null`.
- Introduce an explicit `tr_restore_session` IPC command that wraps `auth_manager.try_restore_session()`.
- Make app bootstrap distinguish:
  - `no session`
  - `session present but expired`
  - `authenticated`
  - `contract invalid`
- Derive connection and sync freshness from actual backend or persisted sync state, not disconnected store fragments.

Back pressure:

- Shared contract fixture tests for auth IPC payloads with `null` values.
- Browser test that clicking `Restore Session` must cause a backend restore attempt or explicit failure state.
- Console-regression gate: any `tr_get_auth_status` or `tr_check_saved_session` validation error fails QA.

## 2. Pipeline Report Contract Drift

Observed in:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/lib/schemas/ipc.ts`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/hooks/usePipelineDiagnostics.ts`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src/features/xray/types.ts`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/headless/handlers/holdings.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/core/pipeline.py`

Likely root causes:

- `get_pipeline_report` returns `None` when the file is absent, but the frontend expects a full `PipelineHealthReport`.
- The live backend health report writer emits an incomplete `decomposition` object. The frontend requires:
  - `etfs_processed`
  - `etfs_failed`
  - `total_underlying`
  - `per_etf`
  but the written JSON only contains `per_etf`.
- Pipeline report types are duplicated across multiple frontend files, increasing drift risk.
- Tests use hand-written permissive report objects instead of validating a real backend-shaped JSON contract.

Fix direction:

- Replace raw `PipelineHealthReport | null` semantics with a versioned envelope, for example:
  - `status: 'missing' | 'ready' | 'invalid'`
  - `reportVersion`
  - `generatedAt`
  - `report`
  - `validationErrors`
- Validate the report before saving it and before serving it over IPC.
- Collapse frontend pipeline-report typing to one source of truth backed by the shared Zod schema.
- Update Health, Holdings, and X-Ray to handle `missing`, `invalid`, `degraded`, and `ready` explicitly.

Back pressure:

- Contract test: backend-generated JSON must parse through the frontend schema.
- Handler test: missing report returns `status: missing`, not `None`.
- Browser QA gate: X-Ray, Health, and Holdings must load without any `get_pipeline_report` console errors.

## 3. Analytics Pipeline Is Completing With Untrustworthy Output

Observed in:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/core/pipeline.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/core/services/sync_service.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/adapters/registry.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/snapshot_repo.py`

Observed backend facts from the real run:

- Adapter registry config file was missing, leaving the registry empty.
- All `10` ETF positions failed decomposition with `NO_ADAPTER`.
- The pipeline still reported completion and wrote outputs.
- Data quality reported:
  - `is_trustworthy = false`
  - `TOTAL_MISMATCH_LARGE`
  - `PERCENTAGE_SUM_LOW`

Likely root causes:

- Missing or mislocated adapter config means the system starts with zero decomposition capability.
- `run_pipeline()` only considers catastrophic exceptions, not quality-gate failures.
- “Pipeline complete” is a transport-level success, not an analytics-level success.
- Actionable next steps for missing adapters/manual holdings are generated in artifacts but not exerting enough UI or API back pressure.

Fix direction:

- Treat adapter-registry availability as a startup or run preflight invariant.
- Introduce pipeline run status:
  - `success`
  - `degraded`
  - `failed`
- Make `run_pipeline` return status plus summary metrics and run ID, not just `success: boolean`.
- Define fail/degrade thresholds:
  - missing adapter count
  - ETF coverage threshold
  - trustworthiness threshold
  - aggregation mismatch threshold
- Surface these thresholds in the UI and in test automation.

Back pressure:

- If `is_trustworthy = false`, the pipeline cannot be reported as plain success.
- If adapter coverage for a replayed real portfolio is below threshold, CI/local self-test must fail.
- Action queue must show blocking “manual upload required” tasks for missing ETF holdings.

## 4. Persistence Model Supports Latest State, Not History

Observed in:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/schema.sql`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/database.py`
- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/portfolio_src/data/pipeline_db.py`

Likely root causes:

- `positions` is a current-state table with upsert semantics, not an immutable history.
- `transactions` exists but is not populated in the active sync path.
- `pipeline_db.py` exists as a separate design, but the live app path does not use it.
- Output CSV/JSON files exist outside the main app DB, which creates split-brain persistence.

Recommendation:

- Do not adopt `pipeline.db` as a second live source of truth.
- Use the existing `prism.db` as the canonical runtime DB.
- Reuse ideas from `pipeline_db.py` but fold them into `prism.db`.

Target persistence model:

- `sync_runs`
  - one row per TR sync execution
- `position_snapshots`
  - immutable holdings captured per sync run
- `pipeline_runs`
  - one row per analytics run, linked to `sync_run_id`
- `pipeline_reports`
  - normalized or JSON report payloads linked to `pipeline_run_id`
- `pipeline_failures`
  - normalized failure records linked to `pipeline_run_id`

Back pressure:

- UI and pipeline must reference snapshot/run IDs, not only “latest files on disk”.
- Dogfood runs should be able to select a recorded `sync_run_id` and replay it in isolation.

## 5. Self-Dogfood Capability Still Depends Too Much On Live Human Login

Current state:

- The active runtime can start the app, drive the browser, inspect engine logs, and inspect the DB.
- The active runtime cannot yet rerun most meaningful flows deterministically without your live account session.

Target state:

- Record once from real Trade Republic sync.
- Replay many times without re-authentication.
- Dogfood browser flows and pipeline outputs against replayed real snapshots.

Design:

- Add a private local snapshot capture command:
  - `selftest:record-sync-snapshot`
  - captures the current `prism.db` or selected sync run into a private fixture directory
- Add a replay command:
  - `selftest:replay-sync-snapshot`
  - boots the app with `PRISM_DATA_DIR` pointed at a temp copy of the captured snapshot
- Add a full dogfood command:
  - `selftest:dogfood:real-snapshot`
  - starts engine and frontend against the temp data dir
  - runs pipeline
  - checks browser console
  - checks UI states
  - validates report contract
  - stores artifacts

Back pressure:

- Dogfood command fails if:
  - any contract validation error appears in console
  - report envelope is `invalid`
  - pipeline status is `failed`
  - pipeline status is `degraded` for portfolios marked “expected healthy”

## Delivery Strategy

## Phase 0: Stop The Most Damaging Drift

Goal:

- Restore truthful UI state and contract sanity before deeper pipeline work.

Deliverables:

- Auth nullable fix
- Explicit restore-session command
- Pipeline report envelope
- No more frontend console contract errors for auth/report loading

## Phase 1: Make Pipeline States Truthful

Goal:

- Ensure the UI and IPC distinguish `missing`, `invalid`, `degraded`, and `ready`.

Deliverables:

- validated report writing and serving
- X-Ray/Health/Holdings updated to render degraded states
- `run_pipeline` returns structured status

## Phase 2: Make Analytics Output Worth Trusting

Goal:

- Improve ETF coverage and prevent “complete but wrong” runs.

Deliverables:

- adapter registry packaging fix
- coverage threshold enforcement
- actionable manual-upload path integrated into action queue

## Phase 3: Make Real Data Replayable

Goal:

- Persist historical sync/pipeline runs and make them replayable for dogfooding.

Deliverables:

- immutable sync and pipeline run tables in `prism.db`
- replay tooling for captured real snapshots

## Phase 4: Make Self-Testing Self-Sufficient

Goal:

- Let the active runtime validate most regressions without asking for live TR login.

Deliverables:

- browser dogfood script against replayed real snapshots
- contract and artifact diff checks
- CI/local quality gates

## Phase 5: Make Failures Actionable And Shareable

Goal:

- Ensure critical failures become durable, privacy-safe diagnostic records and that Hive contribution/freshness is visible and retryable.

Deliverables:

- `system_logs` coverage for auth/report/pipeline contract failures
- Sentinel-compatible issue categorization and auto-report eligibility
- local contribution queue and retry flow for Hive writes
- explicit freshness/trust/coverage surfaced in UI and diagnostics

## Master Task Board

| ID | Status | Priority | Workstream | Task | Back Pressure / Self-Test | Notes |
|----|--------|----------|------------|------|---------------------------|-------|
| G1 | todo | P0 | Architecture Guard | Keep pipeline fixes inside service/contracts boundaries and preserve transport-vs-domain status separation in IPC. | Contract tests and code review must show IPC handlers remain thin and UI does not infer hidden business rules. | Aligns with `analytics_pipeline.md`, `analytics-engine.md`, and `ipc_api.md`. |
| A1 | done | P0 | Auth | Change auth/session Zod schemas to accept nullable backend fields. | Unit tests with real backend-shaped payloads containing `null`. | Frontend auth/session schemas now accept backend-valid `null` for `lastError` and `phoneNumber`; targeted IPC/auth tests pass. |
| A2 | done | P0 | Auth | Add explicit `tr_restore_session` IPC command and wire `Restore Session` button to it. | Component test must prove button triggers restore command, not only status fetch. | Added Rust/Python IPC command and rewired `SessionRestorePrompt` to call restore explicitly; dispatcher/transport tests updated for the new command. |
| A3 | done | P0 | Auth | Refactor app bootstrap to distinguish missing session, expired session, authenticated, and invalid-contract states. | App init integration test with four fixture responses. | `src/App.tsx` now separates missing-session, expired-session, authenticated, and invalid-contract bootstraps and surfaces explicit auth errors in the Trade Republic view. |
| A4 | todo | P1 | Auth | Unify connected/sync freshness UI with backend truth. | Browser test asserts no `Connected` + `Never` contradiction after sync. | Prefer real sync-state source over volatile store-only timestamp. |
| R1 | done | P0 | Report Contract | Replace raw `get_pipeline_report` payload with versioned envelope (`missing`, `ready`, `invalid`). | Handler tests for missing and invalid report file states. | Python `handle_get_pipeline_report()` now serves a versioned envelope and frontend IPC validates the envelope instead of raw report/null shapes. |
| R2 | in_progress | P0 | Report Contract | Validate report shape before save and before serve. | Contract test reads real generated JSON and parses with frontend schema. | Serve-time validation now converts structurally invalid stored reports into `status: invalid` with explicit `validationErrors`; the writer now emits the required decomposition summary, but an explicit pre-save schema validation step and a freshly regenerated live report artifact are still pending. |
| R3 | done | P0 | Report Contract | Remove duplicate pipeline report interfaces and use one shared frontend source of truth. | Type-check and test mocks must import shared type/schema, not re-declare. | Shared report/envelope types now come from `src/lib/schemas/ipc.ts` via `src/types`, and Health/Holdings/X-Ray plus mocks/tests consume the shared source. |
| R4 | in_progress | P1 | Report Contract | Update X-Ray, Health, and Holdings to render `missing`, `invalid`, `degraded`, and `ready` states explicitly. | Browser dogfood checks all three routes after pipeline run. | Missing/invalid/ready states now render explicitly in Health, Holdings, and X-Ray; degraded remains blocked on pipeline `runStatus` work in `P2`. |
| P1 | done | P0 | Pipeline Truth | Fix backend health report writer to emit full `decomposition` object and other required fields. | Regression test on real report fixture plus live pipeline run. | `Pipeline._write_health_report()` now writes `etfs_processed`, `etfs_failed`, `total_underlying`, and failed ETF rows into `decomposition`; targeted pipeline artifact regression test passes. |
| P2 | todo | P0 | Pipeline Truth | Keep IPC transport explicit and add analytics `runStatus` (`success`, `degraded`, `failed`) plus run metadata to `run_pipeline` responses. | Unit and browser tests assert degraded runs surface as degraded without breaking transport-level error handling. | Current boolean is too lossy and does not match desired IPC explicitness. |
| P3 | todo | P0 | Pipeline Truth | Make quality gates affect pipeline outcome, not only report artifacts. | Self-test fails if `is_trustworthy = false` on expected-healthy snapshot. | Use data-quality thresholds. |
| P4 | todo | P1 | Pipeline Truth | Fix adapter-registry packaging/config discovery so coverage is not zero by default. | Startup/preflight test fails when registry is empty in supported environment. | Current live run logged empty registry. |
| P5 | todo | P1 | Pipeline Truth | Convert missing adapter/manual upload requirements into first-class blocking action items in UI. | Browser test must show actionable items for all missing ETF ISINs. | Leverage existing manual upload flow. |
| D1 | todo | P1 | Persistence | Add immutable `sync_runs` and `position_snapshots` tables to `prism.db`. | DB integration tests verify repeated syncs create history, not overwrite-only state. | Do not use separate live `pipeline.db`. |
| D2 | todo | P1 | Persistence | Add `pipeline_runs`, `pipeline_reports`, and `pipeline_failures` to `prism.db`. | Browser/UI and backend tests use run IDs rather than only output files. | Reuse good ideas from `pipeline_db.py`. |
| D3 | todo | P2 | Persistence | Start persisting transactions if the TR source can provide them; otherwise mark explicit gap. | Sync contract test checks whether ledger support is available and surfaced. | Required for long-term time-travel accuracy. |
| O1 | todo | P0 | Observability | Log auth/report/pipeline contract failures into `system_logs` with stable component/category/error hashes. | Integration tests assert invalid report envelope and auth contract drift create durable log records. | Align with `echo_sentinel.md` and `telemetry.md`. |
| O2 | todo | P1 | Observability | Classify degraded pipeline outcomes and empty-adapter preflight failures as Sentinel-reportable diagnostic events. | Repeated degraded runs deduplicate by hash instead of disappearing into console noise. | Respect telemetry opt-in and PII scrubbing rules. |
| O3 | todo | P1 | Observability | Attach sanitized recent logs plus `sync_run_id` and `pipeline_run_id` to manual feedback and auto-report payloads. | Manual feedback flow and auto-report payload tests must exclude financial values and identifiers. | Align with privacy-first telemetry design. |
| O4 | todo | P2 | Observability | Persist telemetry/reporting preference intentionally and expose local debug-log access. | UI test verifies opt-in state survives restart and logs are locally accessible. | Consistent with product and telemetry specs. |
| H1 | todo | P1 | Hive Contribution | Surface Hive freshness, trust, and coverage explicitly in pipeline reports, action queue, and diagnostics UI. | Browser test must show stale/low-confidence/missing-coverage states intentionally. | Align with Hive decay and trust model. |
| H2 | todo | P1 | Hive Contribution | Queue Hive contributions locally when offline or when RPC writes fail, then retry later. | Integration test simulates Hive outage and verifies no contribution is lost. | Identity-resolution design explicitly wants local-first queueing. |
| H3 | todo | P1 | Hive Contribution | Route all Hive writes through RPC functions and keep local historical snapshots separate from shared current-state Hive data. | Tests verify contribution client uses RPC surface and that local history remains in `prism.db`. | Align with `architecture-overview.md` and `supabase_hive.md`. |
| T1 | todo | P0 | Test Infrastructure | Replace permissive hand-built report mocks with shared contract factories. | Existing Health/Holdings/X-Ray tests should fail on drift. | Current tests hide real failures. |
| T2 | todo | P0 | Test Infrastructure | Add backend-to-frontend contract test using a real generated pipeline report JSON. | One command should generate and parse the same report across layers. | Prevent contract drift recurrence. |
| T3 | todo | P1 | Test Infrastructure | Add browser regression that fails on console validation errors. | Dogfood run checks `frontend-console.log` and exits non-zero on IPC validation failures. | This is the simplest high-value back pressure. |
| T4 | todo | P1 | Test Infrastructure | Add real-data snapshot capture/replay tooling using private local fixtures and `PRISM_DATA_DIR`. | The active runtime can replay a real snapshot without live TR login. | This is the key to self-dogfooding without mocks. |
| T5 | todo | P1 | Test Infrastructure | Add `selftest:dogfood:real-snapshot` orchestration script. | One command boots app, runs pipeline, verifies UI, stores artifacts. | Use existing skills and artifact conventions. |
| U1 | todo | P2 | UX | Show trustworthy/degraded banners and snapshot/run timestamps in Dashboard/X-Ray/Health. | Browser test asserts visible degraded warnings on bad runs. | Users must know when results are unsafe. |
| U2 | todo | P2 | UX | Expose pipeline run ID and sync run ID in diagnostics views for traceability. | Artifact correlation test links UI state to DB rows and files. | Helps the active runtime reason from UI to backend. |

## Implementation Notes By Workstream

## Auth and Session Restore

Recommended sequence:

1. Fix nullable parsing.
2. Add explicit restore-session command.
3. Refactor `SessionRestorePrompt` to call restore, then refresh auth and sync state.
4. Refactor app bootstrap to tolerate valid nullable payloads and only fall back to `trade-republic` for genuine auth absence or failure.

Important note:

`SessionRestorePrompt` currently calls `trGetAuthStatus()` inside `handleRestore()`. That is not a restore operation. This needs to be treated as a functional bug, not just a UX oddity.

## Pipeline Report Contract

Recommended envelope shape:

```ts
type PipelineReportEnvelope =
  | { status: 'missing'; reportVersion: number; generatedAt: null; report: null; validationErrors: [] }
  | { status: 'invalid'; reportVersion: number; generatedAt: string | null; report: null; validationErrors: string[] }
  | { status: 'ready'; reportVersion: number; generatedAt: string; report: PipelineHealthReport; validationErrors: [] }
```

Why:

- It gives the UI a stable no-data state.
- It gives the backend a place to surface invalid report details without crashing the frontend.
- It provides a clear contract target for tests and dogfood scripts.

## Pipeline Truthfulness

Recommended status model:

```ts
type PipelineRunStatus = 'success' | 'degraded' | 'failed'
```

Important protocol note:

- Keep IPC transport semantics explicit.
- Transport should still communicate `success` or `error` for the command itself.
- Analytics truth should be represented inside the returned data, for example `runStatus`, `qualitySummary`, and `pipelineRunId`.
- This matches the repo’s “state in motion” IPC design better than overloading one top-level boolean or top-level status.

Suggested threshold rules:

- `failed`
  - report invalid
  - execution exception
  - adapter registry unavailable when ETF positions exist
- `degraded`
  - `is_trustworthy = false`
  - ETF coverage below threshold
  - critical aggregation mismatch
- `success`
  - report valid
  - trustworthiness true
  - quality thresholds met

The key change is that `Pipeline complete` must stop meaning “no exception was thrown.”

## Persistence and Replay

Recommended data strategy:

- Keep `prism.db` as canonical.
- Add immutable run/snapshot tables there.
- Keep CSV/JSON outputs as export artifacts, not the only runtime truth.
- Make replay tooling copy a known-good private fixture directory into a temp `PRISM_DATA_DIR`.

This is the cleanest way to satisfy:

- no repeated TR login for every test
- no hand-made fake data
- reproducible Codex dogfood loops

Important boundary:

- Hive remains the shared community current-state source for aliases, mappings, and ETF holdings.
- Local sync and pipeline history remain private app state in `prism.db`.
- Do not blur these roles by pushing user-local run history into Hive.

## Observability and Auto Issue Reporting

Required stabilization direction:

1. `system_logs` becomes the first durable sink for critical auth, contract, pipeline, and contribution failures.
2. Invalid report envelopes, empty adapter registries, `is_trustworthy = false`, and restore-session contract failures must be categorized consistently enough to deduplicate by `error_hash`.
3. Sentinel should batch and report only privacy-safe critical failures, gated by telemetry opt-in.
4. Manual feedback should reuse the same sanitized evidence path instead of inventing a separate debugging channel.

Back pressure:

- A failure that matters must leave a durable local record, not only a console line.
- A recurring degraded run should become one issue thread with repeated occurrences, not invisible repetition.

## Hive Contribution and Freshness

Required stabilization direction:

1. Keep identity resolution and contribution local-first: local cache first, Hive second, external APIs after that.
2. Any successful new resolution or holdings upload should contribute back through the Hive RPC surface.
3. If Hive is unavailable or contribution fails, queue locally and retry later instead of dropping the result.
4. Freshness and trust are product-facing states, not backend trivia. The UI should show when Hive data is stale, partial, or below confidence threshold.

Back pressure:

- Unknown or stale ETF decomposition should create an action item, not just a weak warning in logs.
- Contribution write failures should be visible in diagnostics until retried or resolved.

## Self-Dogfood Architecture

Minimum viable loop:

1. `selftest:replay-sync-snapshot`
2. `pnpm dev:engine` against temp data dir
3. `pnpm dev`
4. browser opens Dashboard
5. browser runs X-Ray pipeline
6. script checks:
   - no auth/report validation errors in console
   - pipeline envelope status
   - pipeline run status
   - report trustworthiness threshold
7. artifacts copied to `output/playwright/dogfood`

This should become the default verification path for UI and pipeline work.

## Risks and Decisions

| Item | Decision / Risk | Current Position |
|------|------------------|------------------|
| Separate `pipeline.db` | Risk of split-brain runtime storage | Do not adopt as second live DB. Fold history into `prism.db`. |
| Real-data testing | User does not want mocks | Use captured real local snapshots and replay them privately. |
| Adapter coverage | Current run had zero adapter coverage | Treat empty registry as preflight failure, not best-effort warning. |
| UX on degraded data | Users currently see empty or generic states | Make degraded and invalid states explicit and blocking where necessary. |
| IPC semantics | Transport and domain states can drift into ambiguity | Keep command transport explicit and expose analytics truth as nested run state. |
| Auto reporting | Can violate privacy or become noisy if naive | Route through `system_logs`, scrub aggressively, honor opt-in, deduplicate by hash. |
| Hive history boundary | Shared Hive can become polluted with local run history | Keep Hive current-state/community-focused and keep local historical runs in `prism.db`. |

## Work Log

### 2026-03-08

- Confirmed this file remains the correct live execution and dogfood-suite tracking document; no separate dogfood-suite live plan file existed.
- Updated the document header and usage guidance so it functions explicitly as a compaction-safe live tracker for stabilization plus dogfood-suite build-out.
- Added a durable live snapshot section covering:
  - what already works
  - what is still missing
  - open next steps
- Captured the current OpenCode-era status:
  - shared skills standardized on `$HOME/.agents/skills`
  - canonical test harness under `scripts/selftest/*`
  - working Playwright smoke gate
  - updated OpenCode runbook and AGENTS references
- Captured the current major remaining gaps:
  - missing real-data snapshot replay scripts
  - incomplete feature-by-feature browser coverage
  - unresolved minimal proof for background/delegated Oh My OpenCode investigation flow
- Closed the feature coverage boundary for implementation planning:
  - app bootstrap/runtime health
  - Trade Republic auth/session restore/credential lifecycle
  - sync/local persistence
  - Dashboard
  - Holdings
  - X-Ray / analytics pipeline
  - Health / diagnostics
  - unknown asset/manual recovery path
  - Hive read/contribution/freshness
  - diagnostics and issue intake
- Recorded the recommended QA split:
  - prompt-driven by default for exploratory/live feature testing and issue analysis
  - scripted for startup, replay, artifacts, contract/backpressure checks, and repeatable regressions
- Recorded recommended initial quality thresholds, including a starting ETF coverage policy for `success` / `degraded` / `failed`.
- Recorded the MVP stance that subagents are not required for first usable dogfooding; they are a later force multiplier.
- Captured which assumptions can be validated without user help versus which still require user participation.
- Added a tooling-baseline note pinning the planning/execution workflow to Superpowers `v4.3.1` stable and documenting that this local manual install is not auto-updated.
- Added an executable MVP dogfood checklist covering the current app feature areas and preferred QA mode for each.
- Added a concise “Open Questions And Help Needed” section to distinguish what is already closed, what I can validate myself, and where user participation is still required.
- Added the first concrete per-feature dogfood run procedures for:
  - session restore and credential lifecycle
  - X-Ray pipeline run
  - Health diagnostics review
  - Hive contribution visibility
- Added an immediate implementation tranche for:
  - feature-loop prompts and evidence checklists
  - first hard-gated console/backpressure checks
  - real-data snapshot/replay script creation
- Added a test-readiness gate that distinguishes what is ready for live testing now versus what is still blocked on replay or missing implementation.

### 2026-03-06

- Derived plan from live browser QA report and real-data pipeline run.
- Confirmed auth contract drift in frontend schemas.
- Confirmed `Restore Session` button does not actually invoke session restoration.
- Confirmed `get_pipeline_report` drift is caused by backend emitting incomplete report structure and missing-report semantics.
- Confirmed backend pipeline executes but is untrustworthy for the tested real portfolio because ETF decomposition coverage is effectively zero.
- Chose `prism.db` expansion over reviving separate `pipeline.db` as a second runtime database.
- Marked this plan as the live implementation document to be updated on the fly during future work.
- Re-scanned architecture/spec documents for pipeline, IPC, telemetry, Echo-Sentinel, Hive, and identity resolution.
- Confirmed the plan is directionally aligned with the intended decoupled sync/pipeline design and local-first replay model.
- Identified two missing workstreams in the earlier draft: structured observability/auto-reporting and Hive contribution/freshness/queueing.
- Clarified that `run_pipeline` should preserve transport-level IPC semantics while exposing analytics truth as nested run state.
- Added an architecture guard to keep fixes inside service/contracts boundaries and avoid spreading business logic into UI or invoke handlers.
- Moved live execution docs and implementation plans from the wrapper `planning/` area into inner `docs/execution/`.
- Moved the live review document out of inner `docs/reviews/` into wrapper `reviews/` to enforce the new boundary: outer for planning/reviews, inner for specs/live execution docs/plans.
- Updated both AGENTS entrypoints so the inner repo is self-sufficient for baseline implementation/testing, with wrapper strategy/review docs treated as optional high-value context.
- Created execution branch `codex/stabilize-ipc-xray` before implementation.
- Read the required inner-repo execution/spec pack and code anchors in the mandated order.
- Confirmed the first execution tranche remains `A1/A2/A3`: nullable auth contract drift, explicit restore-session IPC, and bootstrap-state handling in `src/App.tsx`.
- Confirmed `handle_tr_check_saved_session()` legitimately emits `phoneNumber: None`, `handle_tr_get_auth_status()` legitimately emits `lastError: None`, and the frontend schemas reject both valid backend shapes.
- Confirmed `handle_get_pipeline_report()` still returns raw `None` on missing report and the frontend duplicates report typing in multiple locations; keeping that as the next P0 tranche after auth.
- Completed auth tranche `A1/A2/A3`: nullable auth contract fix, explicit `tr_restore_session` IPC command, `SessionRestorePrompt` restore wiring, bootstrap-state split in `src/App.tsx`, and Trade Republic auth-error surfacing.
- Validation evidence for auth tranche:
  - `pnpm exec vitest run --project unit src/App.test.tsx src/features/auth/components/SessionRestorePrompt.test.tsx src/lib/ipc.test.ts` passed.
  - `UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache uv run pytest portfolio_src/headless/handlers/test_handlers_tr_auth.py` passed from `src-tauri/python`.
  - `UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache uv run pytest portfolio_src/headless/handlers/test_handlers_tr_auth.py portfolio_src/headless/test_dispatcher.py portfolio_src/headless/transports/test_transports.py` passed after updating registry expectations for the new restore command.
- Repo validation loop status:
  - `scripts/codex/test-changed.sh ...` completed frontend unit tests successfully (`25` files, `381` tests passed), then failed in its Python phase with a transient `uv` panic.
  - Re-running `uv run pytest` directly from `src-tauri/python` did not reproduce the panic; it surfaced a broader pre-existing red Python suite unrelated to the auth tranche, including pipeline, daemon, and filesystem-permission failures.
- Browser/runtime validation status:
  - `./scripts/codex/smoke-ui.sh` succeeded and wrote smoke artifacts under `output/playwright/smoke`.
  - Smoke console logs for the Health route captured the next P0 blocker: `get_pipeline_report` still triggers frontend contract validation errors because the backend serves an invalid raw report shape.
- Started report-contract tranche `R1/R2/R3` immediately after auth completion so invalid report states degrade explicitly instead of throwing in the browser.
- Implemented report-envelope tranche across backend and frontend:
  - `handle_get_pipeline_report()` now returns a versioned envelope with `missing`, `invalid`, and `ready` states.
  - Frontend `getPipelineReport()` now validates the shared envelope schema instead of a raw report payload.
  - Shared pipeline report types were consolidated into `src/lib/schemas/ipc.ts` and re-exported through `src/types`.
  - Health, Holdings, and X-Ray now render explicit missing/invalid states instead of crashing or silently assuming report readiness.
- Validation evidence for report-envelope tranche:
  - `pnpm exec vitest run --project unit src/lib/schemas/ipc.test.ts src/lib/ipc.test.ts src/components/views/HealthView.test.tsx src/features/portfolio/components/HoldingsView.test.tsx src/features/xray/components/XRayView.test.tsx` passed (`5` files, `80` tests).
  - `UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache uv run pytest portfolio_src/headless/handlers/test_handlers_holdings.py` passed (`12` tests) from `src-tauri/python`.
  - `./scripts/codex/test-changed.sh src/components/views/HealthView.tsx src/components/views/HealthView.test.tsx src/features/portfolio/components/HoldingsView.tsx src/features/portfolio/components/HoldingsView.test.tsx src/features/xray/components/XRayView.tsx src/features/xray/components/XRayView.test.tsx src/features/xray/hooks/usePipelineDiagnostics.ts src/features/xray/index.ts src/features/xray/types.ts src/lib/ipc.ts src/lib/ipc.test.ts src/lib/schemas/ipc.ts src/lib/schemas/ipc.test.ts src/test/mocks/ipc.ts src/test/mocks/tauri.ts src/types/index.ts` passed (`25` files, `386` tests).
- Runtime/browser validation detail for report-envelope tranche:
  - The first smoke rerun after code changes still failed with `IPCValidationError` because `scripts/codex/dev-up.sh` reused a stale already-running Python sidecar that predated the handler patch.
  - Restarting the persistent engine/frontend workflow and rerunning `./scripts/codex/smoke-ui.sh` cleared the `get_pipeline_report` console errors; `output/playwright/smoke/console-health.log` is now clean of report-contract failures.
- Current remaining report-contract gap:
  - The live local `pipeline_health.json` is still structurally invalid for the desired full report schema (`decomposition` is missing numeric summary fields), but the app now degrades this to `status: invalid` instead of throwing in Health.
- Fixed the writer-side report gap in `Pipeline._write_health_report()`:
  - `decomposition` now includes `etfs_processed`, `etfs_failed`, `total_underlying`, and failed ETF entries with explicit `status: failed`.
  - The pipeline regression harness now injects a temp `SnapshotRepository` instead of patching stale module-level output constants, so generated `pipeline_health.json` artifacts are asserted directly.
- Validation evidence for writer-side fix:
  - `UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache uv run pytest tests/test_pipeline_e2e.py::TestHarvesting::test_full_pipeline_execution portfolio_src/headless/handlers/test_handlers_holdings.py` passed (`13` tests).
- Remaining unvalidated runtime gap after writer fix:
  - The current live user-data `pipeline_health.json` on disk was not regenerated from a fresh in-app diagnostics run after the writer patch, so browser smoke still proves safe degradation and clean envelope serving, but not a newly written real report artifact yet.
- Resumed execution on `codex/stabilize-ipc-xray`, re-read the required inner-repo execution/spec pack, and reconfirmed the shared dirty worktree before further changes.
- Reconfirmed current tranche state from code and docs:
  - `A1`, `A2`, `A3`, `R1`, `R3`, and `P1` remain landed in the worktree.
  - `R2` and `R4` remain materially advanced but still require fresh runtime validation against a regenerated live artifact.
  - `O1` is still the next smallest high-value implementation item and can be wired through the existing `system_logs` path without widening architecture scope.
- Re-ran focused validation for the landed auth/report/pipeline tranche:
  - `pnpm exec vitest run --project unit src/App.test.tsx src/features/auth/components/SessionRestorePrompt.test.tsx src/lib/ipc.test.ts src/lib/schemas/ipc.test.ts src/components/views/HealthView.test.tsx src/features/portfolio/components/HoldingsView.test.tsx src/features/xray/components/XRayView.test.tsx` passed (`7` files, `101` tests).
  - `UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache uv run pytest portfolio_src/headless/handlers/test_handlers_tr_auth.py portfolio_src/headless/handlers/test_handlers_holdings.py tests/test_pipeline_e2e.py::TestHarvesting::test_full_pipeline_execution` passed from `src-tauri/python` (`24` tests).
- Re-ran the required changed-file loop:
  - `./scripts/codex/test-changed.sh ...` passed its frontend branch (`25` files, `386` tests) and then hit the same intermittent `uv` launcher panic in the Python branch (`Attempted to create a NULL object`) instead of reproducing a touched-code assertion failure.
  - Current judgment: treat this as a harness/runtime issue to document while proceeding with the required live runtime validation, because the narrower direct Python slice for the touched files is green.
- Ran the first headed/watchable live dogfood pass against the real app runtime using persistent frontend/backend PTYs plus visible browser control.
- Live dogfood findings from the headed run:
  - Session restore prompt appeared correctly, but clicking `Restore Session` landed on the Trade Republic login form instead of a clearly restored authenticated/dashboard state.
  - Health rendered meaningful diagnostics rather than crashing or hiding invalid state.
  - X-Ray rendered real portfolio data and surfaced ETF decomposition failures explicitly.
  - Dashboard rendered real synced overview data.
  - Holdings rendered real holdings plus resolution/confidence UI.
  - Diagnostics/Issue Intake worked end-to-end; feedback submission created GitHub issue `#98`.
- Current root-cause judgment for session restore: still unproven.
  - Backend restore may have truthfully returned an expired/idle state.
  - Frontend restore orchestration may still be muddy because `SessionRestorePrompt.tsx` and `TradeRepublicView.tsx` both perform post-restore sync/auth side effects.
  - Do not patch blindly; hand over with a dedicated debugging-first fix plan.
- Inner-repo handoff readiness judgment after the headed run:
  - ready for a focused session-restore fix + headed self-dogfood validation
  - not yet ready for fully deterministic replay-based dogfood ownership because snapshot/replay tooling is still missing
- Implemented the replay-tooling tranche under `scripts/selftest/`:
  - `record-sync-snapshot.sh`
  - `replay-sync-snapshot.sh`
  - `dogfood-real-snapshot.sh`
- Added package entrypoints:
  - `selftest:record-sync-snapshot`
  - `selftest:replay-sync-snapshot`
  - `selftest:dogfood:real-snapshot`
- Added integration coverage proving the new script surface works at the contract level:
  - snapshot recording copies `prism.db` plus companion files into a private target
  - replay copies the snapshot into an isolated target `PRISM_DATA_DIR`
  - dogfood orchestration wires replay -> startup -> Playwright smoke
  - dogfood orchestration exits non-zero when targeted backpressure errors appear in logs
- Validation evidence for the snapshot/replay tranche:
  - `pnpm test:integration tests/integration/selftest-scripts.test.ts` passed (`11` tests)
- Updated readiness judgment after the script tranche:
  - the repo now has the missing canonical snapshot/replay command surface
  - the remaining replay gap is running the scripts against a real private snapshot and widening replay-based browser assertions beyond the current smoke gate

## Evidence

- QA report:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/execution/live-ui-qa-report-2026-03-06.md`
- Browser artifacts:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood`
- Live DB:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/data/prism.db`
- Live pipeline health artifact:
  `/Users/david.helmus/Library/Application Support/PortfolioPrism/outputs/pipeline_health.json`
- Engine logs:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/codex/engine.log`
- Frontend logs:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/codex/frontend.log`
- Smoke artifacts:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/smoke/home.png`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/smoke/health.png`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/smoke/console-home.log`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/smoke/console-health.log`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/smoke/errors-home.log`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/smoke/errors-health.log`
- Design docs scanned:
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/analytics_pipeline.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/pipeline_triggering.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/ipc_api.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/echo_sentinel.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/architecture/identity_resolution.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/product_definition.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/docs/specs/supabase_hive.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/analytics-engine.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/architecture-overview.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/telemetry.md`
  `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/strategy/hive-architecture.md`

## Next Recommended Execution Order

1. G1, R2, R4, O1
2. P2, T1, T2, T3
3. P3, P4, P5, H1, O2
4. D1, D2, H2, H3, T4, T5
5. D3, O3, O4, U1, U2

## Restart Brief

- Resume on branch `codex/stabilize-ipc-xray`; do not start a new execution branch unless the user explicitly asks for one.
- Treat the following as already landed and validated at the narrow-loop level: `A1`, `A2`, `A3`, `R1`, `R3`, `P1`, and the shared writer/handler validator extraction.
- Treat `R2` and `R4` as functionally advanced but not fully closed until a fresh in-app diagnostics run rewrites the live `pipeline_health.json` and the browser path is rechecked against that new artifact.
- The next highest-value work is still `O1`: persist auth/report/pipeline contract failures into `system_logs` with stable component/category/error hashes, following `echo_sentinel.md` and `logging.md`.
- Before trusting smoke results, restart the persistent engine/frontend workflow. Previous smoke false negatives were caused by a stale Python sidecar serving pre-patch code.
- Required close-the-gap validation sequence:
  1. targeted tests for any touched files,
  2. `./scripts/codex/test-changed.sh ...`,
  3. restart engine/frontend if runtime code changed,
  4. trigger a fresh in-app diagnostics/deep-analysis run,
  5. inspect the rewritten live `pipeline_health.json`,
  6. rerun `./scripts/codex/smoke-ui.sh`,
  7. review frontend and engine logs for contract/report failures.
- Do not stop at code changes. End this tranche only after updating this document, committing to the current branch, and pushing that branch.
