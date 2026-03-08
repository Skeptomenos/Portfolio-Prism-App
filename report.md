# OpenCode Migration Report

> Created: 2026-03-07
> Updated: 2026-03-08
> Status: in_progress
> Scope: migrate backpressure, self-test, and dogfood capabilities from Codex-specific tooling to OpenCode-native workflows

## Purpose

This file is the durable working log for the Codex -> OpenCode migration research.

Update it continuously with:

- active tasks
- findings and discoveries
- completed work
- next steps
- evidence paths

The goal is to keep the migration state intact during context compaction.

## Current Tasks

- [completed] Audit Codex-specific backpressure, self-test, and browser dogfood assets.
- [completed] Define the OpenCode-native replacement architecture.
- [completed] Turn the recommendation into concrete file moves, script changes, and skill changes.
- [completed] Implement the canonical `scripts/selftest/*` layer and Codex compatibility shims.
- [completed] Pivot the skill strategy to `$HOME/.agents/skills` and remove repo-local shared skills where possible.
- [completed] Update active runbooks, AGENTS, and selftest smoke/backpressure gates.
- [in_progress] Keep the live dogfood-suite execution plan updated as the compaction-safe source of truth.
- [in_progress] Record the first headed live dogfood findings and package the session-restore handoff for the inner-repo agent.

## Findings And Discoveries

1. Back pressure semantics are already well-defined and are mostly tool-agnostic.
   - The real logic lives in `docs/execution/stabilization-and-self-dogfood-plan.md`.
   - The important rules are about stopping, degrading, or surfacing bad states explicitly, not about Codex itself.

2. The implementation surface is heavily Codex-branded.
   - Codex-specific assets currently include:
     - `planning/codex-skills/*`
     - `scripts/codex/*`
     - `docs/execution/codex-install-config-plan.md`
     - `docs/execution/codex-self-testing-capabilities.md`
     - `.tmp/codex`
     - planned command names such as `codex:record-sync-snapshot`

3. Current smoke automation is not repo-self-contained.
   - `scripts/codex/smoke-ui.sh` depends on the external `agent-browser` CLI.
   - That means the repo still assumes machine-local Codex/browser setup instead of owning the full verification path itself.

4. OpenCode already has stronger native orchestration primitives than the Codex design assumed.
   - Relevant OpenCode capabilities available in this environment include:
     - project-local `.opencode/skills/`
     - persistent PTY sessions
     - background agents
     - browser automation tooling (`playwriter`, Playwright/Chrome DevTools toolchain)
     - richer in-session task tracking and structured execution

5. The repo already has partial Playwright infrastructure, but it is not yet doing the real self-test work.
   - `playwright.config.ts` exists.
   - `tests/e2e/` is currently empty.
   - This means deterministic browser backpressure is still more documented than encoded.

6. One operational truth from the Codex setup must be preserved.
   - One-shot startup scripts are useful for smoke validation.
   - Persistent shells are still required for user/browser handoff.
   - The migration should preserve that behavior while removing Codex-specific coupling.

7. There is a repo consistency issue worth fixing during migration.
   - `playwright.config.ts` still uses `npm run dev`.
   - Repo conventions say `pnpm` should be preferred.

8. The clean long-term split is: repo-owned verification plus agent-owned orchestration.
   - Repo scripts/tests should enforce backpressure and produce exit codes.
   - OpenCode skills should decide which loop to run and when to escalate to deeper QA or repro.

9. The primary migration challenge is skill portability, not replacing `agent-browser`.
   - User clarified that `agent-browser` remains a valuable capability.
   - The real problem is making the existing Codex skill set available in OpenCode with minimal behavior drift.
   - This shifts the recommended migration center from "replace browser tooling" to "port and normalize the skill layer."

10. The newly reviewed gap report confirms the first blocker is environment/skill-path mismatch.
    - `docs/execution/self-testing-capability-gap-report-2026-03-07.md` shows the repo-specific self-test skills exist in `~/.codex/skills` but are invisible to the active OpenCode runtime.
    - OpenCode in this environment sees `~/.config/opencode/skills` and `~/.agents/skills`, not `~/.codex/skills`.
    - This means the documented repo workflow is currently only partially usable under OpenCode.

11. The gap report also shows a second blocker outside the repo: broken subagent orchestration.
    - Minimal `call_omo_agent` sync calls fail.
    - Background task launches return error state and then disappear from `background_output` lookup.
    - This affects parallel investigation workflows, but it does not block direct testing or direct browser automation.

12. Browser capability is not the broken layer.
    - The gap report verified that Playwright MCP works.
    - It also verified that the `agent-browser` CLI works directly.
    - So the migration priority should be: fix skill availability first, keep browser capability as-is, and avoid unnecessary tool churn.

13. Quick research confirms that both Codex and OpenCode support the shared `~/.agents/skills` convention.
    - OpenCode docs explicitly list global agent-compatible discovery at `~/.agents/skills/*/SKILL.md`.
    - Codex docs explicitly list user-level discovery at `$HOME/.agents/skills`.
    - The `skills` ecosystem docs also describe Codex project path `.agents/skills/` and user path `~/.codex/skills`, while OpenCode supports project `.agents/skills/` and global `~/.config/opencode/skills/`; in practice OpenCode docs also confirm global `~/.agents/skills` compatibility.
    - This makes `~/.agents/skills` the best shared location when the goal is one user-level skill directory for both runtimes.

14. Shared-skill installation has now been staged into `/Users/david.helmus/.agents/skills`.
    - Copied: `repo-test-map`, `self-test-loop`, `frontend-qa`, `bug-repro`
    - Existing shared skills preserved: `agent-browser`, `dogfood`
    - Runtime validation was intentionally not attempted yet because user wants to restart OpenCode first.

15. After OpenCode restart, shared skill discovery is confirmed working from `~/.agents/skills`.
    - Direct `skill` loads succeeded for:
      - `repo-test-map`
      - `self-test-loop`
      - `frontend-qa`
      - `bug-repro`
    - `npx skills ls -g -a opencode` lists the shared skills from `~/.agents/skills`.
    - The `skills` CLI still shows them as `not linked` for OpenCode, but the native OpenCode `skill` loader successfully loads them, so runtime discovery is what matters.

16. The canonical repo-owned selftest command surface now exists.
    - Added `scripts/selftest/_common.sh`.
    - Added `scripts/selftest/dev-up.sh`, `dev-down.sh`, `healthcheck.sh`, `test-changed.sh`, and `smoke-ui.sh`.
    - Added `package.json` entrypoints for `selftest:dev-up`, `selftest:dev-down`, `selftest:health`, `selftest:changed`, and `selftest:smoke`.
    - Runtime state now writes under `.tmp/selftest` while keeping the old `.tmp/codex` naming only for compatibility references.

17. The old `scripts/codex/*` paths are now compatibility wrappers.
    - `scripts/codex/dev-up.sh`
    - `scripts/codex/dev-down.sh`
    - `scripts/codex/healthcheck.sh`
    - `scripts/codex/test-changed.sh`
    - `scripts/codex/smoke-ui.sh`
    - Each now emits a deprecation message and `exec`s into the canonical `scripts/selftest/*` target.

18. Repo-owned shared-skill helper scripts now exist and were validated.
    - Added `scripts/selftest/install-shared-skills.sh`.
    - Added `scripts/selftest/verify-shared-skills.sh`.
    - Verified temp mirroring into `.tmp/skill-mirror`.
    - Verified `npx skills ls -a codex` and `npx skills ls -a opencode` both enumerate the repo-local `.agents/skills/*` set.

19. The new selftest layer is now covered by an automated integration test.
    - Added `tests/integration/selftest-scripts.test.ts`.
    - Verified the TDD red phase first: tests failed because `scripts/selftest/*` did not exist.
    - Verified the green phase after implementation: the script tests now pass.

20. The canonical `test-changed` path is working, but the wider unit suite is still noisy.
    - `./scripts/selftest/test-changed.sh src/App.tsx` successfully routes into frontend unit tests.
    - The unit suite completes, but existing warnings and noisy stderr remain in unrelated tests (`TwoFactorModal`, `ErrorBoundary`, `XRayView`).
    - Those warnings predate this migration batch and are not caused by the new selftest scripts.

21. The active shared-skill strategy has changed again based on explicit user direction.
    - The preferred and active skill location is now `$HOME/.agents/skills`.
    - Repo-local shared skills should be avoided where possible rather than treated as canonical.
    - The selftest helper scripts now need to validate global skill discovery instead of repo-local `.agents/skills` discovery.

22. The selftest helper scripts have been updated for the home-level skill model.
    - `scripts/selftest/install-shared-skills.sh` now treats `$HOME/.agents/skills` as the default source and target root.
    - `scripts/selftest/verify-shared-skills.sh` now verifies the expected skill files under `$HOME/.agents/skills` and runs `npx skills ls -g -a codex` plus `npx skills ls -g -a opencode`.
    - The integration test coverage now explicitly hides repo-local `.agents` during verification so the home-level behavior is what gets tested.

23. The repo-local shared skill files were removed to honor the new strategy.
    - Deleted the tracked `Portfolio-Prism/Portfolio-Prism/.agents/skills/*` skill files.
    - The remaining directories are now empty placeholders and should be cleaned up from the filesystem when convenient.
    - Active skill content has been updated directly in `/Users/david.helmus/.agents/skills/*`.

24. The Playwright smoke gate now works with the repo config after switching the spec to `page.goto('/')`.
    - `pnpm exec playwright test tests/e2e/selftest-smoke.spec.ts --reporter=line` now passes.
    - In this environment, `localhost:1420` is the reliable target for the Playwright web server path; `127.0.0.1:1420` is not.

25. The active runtime docs now have a dedicated OpenCode runbook.
    - Added `docs/execution/opencode-self-testing-runbook.md`.
    - Updated both AGENTS entrypoints to treat that runbook as the current runtime/testing source of truth.
    - Updated the stabilization plan terminology toward `selftest:*`, `$HOME/.agents/skills`, and active-runtime wording while keeping historical work-log references intact.

26. The existing stabilization document is also the right live dogfood-suite tracking document.
    - No separate live dogfood-suite plan file was needed.
    - `docs/execution/stabilization-and-self-dogfood-plan.md` was updated with a compaction-safe live progress snapshot section, explicit why/goal context, checkboxes, notes, and open next steps.

27. A first headed/watchable live dogfood pass now proves the current OpenCode workflow is usable for real runtime QA.
    - Persistent engine/frontend PTYs plus visible browser automation were enough to exercise multiple routes live.
    - This validates the prompt-driven dogfood model for exploratory and evidence-gathering passes.

28. Session restore remains the highest-value focused handoff item for the inner-repo agent.
    - The headed run reproduced a path where clicking `Restore Session` ended on the login form instead of a clearly restored authenticated state.
    - The root cause is still not proven: it may be a truthful expired session, a frontend orchestration bug, or both.
    - The fix handoff therefore needs a debugging-first plan, not a guessed patch.

29. The app is already partially dogfoodable, but not yet fully self-sufficient for replay-based inner-repo ownership.
    - Health, X-Ray, Dashboard, Holdings, and Diagnostics/Issue Intake have real live evidence now.
    - Deterministic replay-based full-suite dogfooding is still blocked on the missing snapshot/replay scripts.

## Recommended Direction

Recommendation: use a hybrid shared-skill model with a skill-portability-first rollout.

Priority order:

1. Make the repo-specific skill layer visible to both Codex and OpenCode through `.agents/skills` / `~/.agents/skills`.
2. Normalize the repo's own script/doc naming away from Codex-only assumptions.
3. Preserve `agent-browser` and current browser automation paths.
4. Encode backpressure as repo-owned runnable checks.
5. Add replay/dogfood flows on top of that stable base.

Repo-owned verification:

- replace `scripts/codex/*` with `scripts/opencode/*` or a neutral testing layer
- keep `agent-browser`-compatible smoke and dogfood flows where they are valuable, but stop making them Codex-only
- move the non-interactive verification contract into repo-owned shell/Node/Playwright automation
- add replay commands for real snapshots and a single dogfood command that exits non-zero on backpressure failures

Agent-owned orchestration:

- port the current Codex skill set into project-local `.agents/skills/`
- treat project-local `.agents/skills/` as the new source of truth
- use `~/.agents/skills/` as the preferred shared user-level install
- create `.agents/skills/repo-test-map/SKILL.md`
- create `.agents/skills/self-test-loop/SKILL.md`
- create `.agents/skills/frontend-qa/SKILL.md`
- create `.agents/skills/bug-repro/SKILL.md`
- preserve `agent-browser` as a first-class dependency/companion skill where appropriate
- use OpenCode PTY sessions for persistent runtime handoff
- use OpenCode browser tooling for targeted repro, dogfood, and artifact capture

Platform caveat:

- The current OpenCode environment also has a wrapper/platform issue around `call_omo_agent`.
- That should be tracked separately from repo migration work.
- The repo migration should not depend on subagent fan-out being healthy.
- Direct-tool and direct-skill execution must remain the baseline path.

Backpressure should remain unchanged semantically but move closer to runnable code:

- console validation errors -> hard fail
- invalid report envelope -> hard fail
- pipeline `runStatus = failed` -> hard fail
- pipeline `runStatus = degraded` on expected-healthy snapshot -> hard fail
- low adapter coverage / trust-threshold failures -> hard fail or explicit action queue block

## Options Considered

### Option A: Thin rename/port

- Rename Codex files/docs to OpenCode and keep roughly the same external browser CLI model.
- Pros: fastest path to naming consistency.
- Cons: still machine-local, still not truly self-contained, still too dependent on external browser agent tooling.

### Option B: Hybrid repo-runner + shared `.agents/skills` layer (recommended)

- Repo scripts/tests enforce the checks.
- OpenCode skills orchestrate, choose the smallest loop, and escalate when needed.
- Existing Codex skills are ported with minimal semantic drift into `.agents/skills/`.
- Pros: best balance of determinism, portability, CI-friendliness, and OpenCode fit.
- Cons: moderate migration work.

### Option C: Pure Playwright suite

- Convert almost all dogfood flows into Playwright tests and minimize custom skills.
- Pros: standard and CI-friendly.
- Cons: weaker for exploratory QA, targeted repro, and human-in-the-loop debugging.

### Option D: Skill-compatibility layer

- Keep the existing skill intent almost unchanged, port the files into `.agents/skills/`, and add thin wrapper scripts so old docs/commands still map to new locations.
- Pros: fastest way to preserve existing operator habits and `agent-browser` workflows.
- Cons: can preserve too much Codex-era naming and delay cleanup unless followed by a second normalization pass.

### Option E: Project-local shared skill source of truth plus optional installer (recommended refinement)

- Store the repo-specific skills in `.agents/skills/` inside the repo.
- Optionally provide a bootstrap/install script that can mirror them into `~/.agents/skills/`.
- Pros: best fit for Codex+OpenCode sharing, repo-self-contained, reviewable in git, avoids duplicated per-agent copies.
- Cons: requires a small migration script and doc refresh.

## Completed Tasks

- Read the required AGENTS and execution docs.
- Audited Codex-specific skills, scripts, and runtime docs.
- Mapped the current backpressure definitions and self-dogfood expectations.
- Identified the OpenCode-native capabilities already available in this environment.
- Selected a provisional recommended migration architecture: hybrid repo-runner + OpenCode skills.
- Created this durable `report.md` file for compaction-safe tracking.
- Wrote the concrete migration plan in `docs/plans/2026-03-07-opencode-self-test-migration.md`.
- Added the canonical repo-owned `scripts/selftest/*` layer.
- Added `package.json` `selftest:*` entrypoints for the new canonical command surface.
- Replaced `scripts/codex/*` implementations with compatibility shims that emit deprecation notices and delegate into `scripts/selftest/*`.
- Added `scripts/selftest/install-shared-skills.sh` and `scripts/selftest/verify-shared-skills.sh`.
- Added integration coverage in `tests/integration/selftest-scripts.test.ts` and verified the red/green TDD loop for the new script layer.
- Pivoted the shared-skill strategy to `$HOME/.agents/skills` as the only active shared root.
- Removed the tracked repo-local shared skill files under `Portfolio-Prism/Portfolio-Prism/.agents/skills/`.
- Updated the live shared skills in `/Users/david.helmus/.agents/skills/` to point at canonical `scripts/selftest/*` paths.
- Verified the Playwright smoke gate passes with `pnpm exec playwright test tests/e2e/selftest-smoke.spec.ts --reporter=line`.
- Created `docs/execution/opencode-self-testing-runbook.md`.
- Updated both AGENTS files plus the active execution docs to point at the OpenCode runbook and the `$HOME/.agents/skills` + `scripts/selftest/*` model.
- Updated `docs/execution/stabilization-and-self-dogfood-plan.md` to act explicitly as the live dogfood-suite progress tracker.

## Proposed Migration Tasks

1. Create and maintain a durable migration report.
2. Make project-local `.agents/skills/` the canonical source of truth for repo-specific skills.
3. Port the current Codex skill set into `.agents/skills/`.
   - `planning/codex-skills/repo-test-map` -> `.agents/skills/repo-test-map`
   - `planning/codex-skills/self-test-loop` -> `.agents/skills/self-test-loop`
   - `planning/codex-skills/frontend-qa` -> `.agents/skills/frontend-qa`
   - `planning/codex-skills/bug-repro` -> `.agents/skills/bug-repro`
4. Add an optional bootstrap/mirror script for supported skill roots if needed.
   - mirror to `~/.agents/skills` when user wants shared global availability
   - do not depend on `~/.codex/skills` for OpenCode runtime success
5. Rename/restructure Codex-branded runtime assets.
   - `scripts/codex/*` -> `scripts/opencode/*` or a neutral equivalent
   - `.tmp/codex` -> `.tmp/opencode` or `.tmp/runtime`
   - Codex execution docs -> OpenCode execution docs
6. Preserve `agent-browser` flows where they add value, but decouple them from Codex-only assumptions.
7. Add real-snapshot capture/replay commands and dogfood orchestration.
8. Encode backpressure as exit-code-producing checks, not only documentation.
9. Add minimal `tests/e2e/` smoke coverage for critical routes and console-error gating.
10. Update stabilization-plan terminology from Codex self-sufficiency to OpenCode self-sufficiency while preserving task-board semantics.
11. Keep temporary compatibility wrappers so older docs/scripts do not break immediately.
12. Track the separate OpenCode platform issue: broken subagent orchestration.

## Next Steps

- Finish the remaining doc consistency pass, especially historical-vs-active references around `scripts/codex/*` and `codex:*` in execution docs.
- Update the live docs/report with the headed dogfood findings and current inner-repo handoff readiness.
- Create a dedicated session-restore fix plan under `docs/plans/` for the inner-repo agent.
- Add snapshot/dogfood entrypoint scripts: `scripts/selftest/record-sync-snapshot.sh`, `scripts/selftest/replay-sync-snapshot.sh`, and `scripts/selftest/dogfood-real-snapshot.sh`.
- Add `selftest:record-sync-snapshot`, `selftest:replay-sync-snapshot`, and `selftest:dogfood:real-snapshot` package scripts.
- Run the final targeted verification/grep pass for the updated docs and helper scripts.
- Use the live dogfood-suite plan as the ongoing execution log while implementing replay/dogfood coverage.

## Plan Artifact

- Implementation plan: `Portfolio-Prism/Portfolio-Prism/docs/plans/2026-03-07-opencode-self-test-migration.md`

## Evidence

- `Portfolio-Prism/AGENTS.md`
- `Portfolio-Prism/Portfolio-Prism/AGENTS.md`
- `Portfolio-Prism/Portfolio-Prism/docs/execution/stabilization-and-self-dogfood-plan.md`
- `Portfolio-Prism/Portfolio-Prism/docs/execution/codex-install-config-plan.md`
- `Portfolio-Prism/Portfolio-Prism/docs/execution/codex-self-testing-capabilities.md`
- `Portfolio-Prism/Portfolio-Prism/docs/execution/live-ui-qa-report-2026-03-06.md`
- `Portfolio-Prism/Portfolio-Prism/docs/execution/self-testing-capability-gap-report-2026-03-07.md`
- `https://opencode.ai/docs/skills`
- `https://developers.openai.com/codex/skills`
- `https://github.com/vercel-labs/skills`
- `Portfolio-Prism/planning/codex-skills/repo-test-map/SKILL.md`
- `Portfolio-Prism/planning/codex-skills/self-test-loop/SKILL.md`
- `Portfolio-Prism/planning/codex-skills/frontend-qa/SKILL.md`
- `Portfolio-Prism/planning/codex-skills/bug-repro/SKILL.md`
- `/Users/david.helmus/.agents/skills/repo-test-map/SKILL.md`
- `/Users/david.helmus/.agents/skills/self-test-loop/SKILL.md`
- `/Users/david.helmus/.agents/skills/frontend-qa/SKILL.md`
- `/Users/david.helmus/.agents/skills/bug-repro/SKILL.md`
- `Portfolio-Prism/Portfolio-Prism/tests/integration/selftest-scripts.test.ts`
- `Portfolio-Prism/Portfolio-Prism/scripts/codex/dev-up.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/codex/dev-down.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/codex/healthcheck.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/codex/smoke-ui.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/codex/test-changed.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/_common.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/dev-up.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/dev-down.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/healthcheck.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/test-changed.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/smoke-ui.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/install-shared-skills.sh`
- `Portfolio-Prism/Portfolio-Prism/scripts/selftest/verify-shared-skills.sh`
- `Portfolio-Prism/Portfolio-Prism/playwright.config.ts`
- `Portfolio-Prism/scripts/ralph.sh`

## Work Log

### 2026-03-07

- User requested research and a proposal for updating backpressure and self-test capabilities after moving from Codex to OpenCode.
- Confirmed that the most valuable semantics to preserve are not Codex-specific; the branding/runtime assumptions are.
- Confirmed that OpenCode-native skills and browser/runtime tooling can replace the current Codex-specific orchestration layer.
- Created `Portfolio-Prism/report.md` as the durable compaction-safe working artifact.
- User clarified that `agent-browser` should be treated as a preserved capability; the harder migration problem is porting the full Codex skill layer into OpenCode.
- Adjusted the recommendation toward a skill-portability-first rollout instead of a browser-tool replacement-first rollout.
- Read `docs/execution/self-testing-capability-gap-report-2026-03-07.md`.
- Confirmed the most immediate runtime blocker is that repo-specific skills live only in `~/.codex/skills`, which OpenCode does not discover.
- Confirmed `call_omo_agent` / background subagent orchestration is currently broken at the platform layer and should be treated as a separate blocker, not as a repo migration failure.
- Confirmed browser tooling itself is healthy: Playwright MCP and `agent-browser` both still work.
- Created the formal implementation plan at `docs/plans/2026-03-07-opencode-self-test-migration.md` with phased tasks covering:
  - `.agents/skills/` as source of truth
  - `scripts/selftest/*` as canonical runtime layer
  - `scripts/codex/*` compatibility shims
  - OpenCode runbook/doc migration
  - runnable backpressure and dogfood entrypoints
- Performed quick documentation research on shared skill directories.
- Confirmed both Codex and OpenCode support `~/.agents/skills` as a valid shared discovery path.
- Copied the repo-specific skills into `/Users/david.helmus/.agents/skills` so they can become shared after OpenCode restart.
- Deferred runtime validation until after the requested OpenCode reload.
- After reload, verified that OpenCode can load the shared skills from `~/.agents/skills`.
- Created repo-local canonical shared skill copies in `Portfolio-Prism/Portfolio-Prism/.agents/skills/`.
- Synced the updated shared skill copies back into `/Users/david.helmus/.agents/skills`.
- Added `tests/integration/selftest-scripts.test.ts` first and confirmed it failed because the canonical selftest scripts did not exist yet.
- Implemented `scripts/selftest/*` and re-ran `pnpm test:integration tests/integration/selftest-scripts.test.ts` to green.
- Replaced `scripts/codex/*` implementations with deprecation wrappers targeting `scripts/selftest/*`.
- Verified the shared-skill helper scripts by mirroring into `.tmp/skill-mirror` and listing both Codex and OpenCode project skills.
- Verified `./scripts/selftest/test-changed.sh src/App.tsx` routes into the frontend unit bucket; observed unrelated pre-existing unit-test warnings during the wider run.
- User changed the skill portability requirement: prefer `$HOME/.agents/skills` and avoid repo-local shared skills if possible.
- Updated `scripts/selftest/install-shared-skills.sh` and `scripts/selftest/verify-shared-skills.sh` to use the home-level skill root model.
- Removed the tracked repo-local `.agents/skills/*` files and updated the live shared skill files in `$HOME/.agents/skills` to use canonical `scripts/selftest/*` commands.
- Re-ran `pnpm test:integration tests/integration/selftest-scripts.test.ts` successfully after the home-level pivot.

### 2026-03-08

- Ran the first headed/watchable live dogfood pass against the real app runtime with persistent frontend/backend PTYs and visible browser control.
- Confirmed partial live dogfood coverage now works for:
  - session-restore UI prompt reproduction
  - Health diagnostics
  - X-Ray
  - Dashboard
  - Holdings
  - Diagnostics/Issue Intake submission
- Captured the main headed-run product finding: clicking `Restore Session` reached the login form instead of a clearly restored authenticated state.
- Confirmed the session-restore root cause is still unproven and should be handed over as a debugging-first fix plan, not as a guessed frontend-only patch.
- Confirmed the feedback flow created GitHub issue `#98`, which proves the current Diagnostics/Issue Intake path works live.
- Updated the migration status judgment:
  - the inner repo is ready to own a focused session-restore fix plus headed dogfood verification
  - the inner repo is not yet ready to own deterministic replay-based full-suite dogfooding until snapshot/replay scripts exist
- Implemented the canonical snapshot/replay tranche:
  - added `scripts/selftest/record-sync-snapshot.sh`
  - added `scripts/selftest/replay-sync-snapshot.sh`
  - added `scripts/selftest/dogfood-real-snapshot.sh`
  - added matching package scripts in `package.json`
- Added integration coverage in `tests/integration/selftest-scripts.test.ts` for:
  - recording a snapshot from a source data dir
  - replaying a snapshot into an isolated target data dir
  - orchestrating replay + startup + Playwright smoke
  - failing dogfood orchestration on targeted backpressure log matches
- Verified the new command surface with:
  - `pnpm test:integration tests/integration/selftest-scripts.test.ts`
- Updated the replay-status judgment:
  - missing snapshot/replay scripts are no longer the blocker
  - the next blocker is exercising the scripts with a real private snapshot and broadening replay-based browser coverage
