# Codex Install And Config Plan For Self-Testing

> Purpose: make Codex able to test code and implementation itself with a repeatable browser + repo workflow
> Created: 2026-03-05
> Scope: this machine, this Codex install, and Portfolio Prism as the first repo to operationalize

## Live Status

- `2026-03-05 20:30 Europe/Berlin` Step 1 complete: backed up `~/.codex/config.toml` and added `playwright` MCP via `codex mcp add playwright -- npx @playwright/mcp@latest`
- `2026-03-05 20:30 Europe/Berlin` Validation complete: `codex mcp list` shows `playwright` enabled and `~/.codex/config.toml` contains `[mcp_servers.playwright]`
- `2026-03-05 20:36 Europe/Berlin` Step 2A complete: installed `agent-browser` for Codex with `npx skills add vercel-labs/agent-browser -g -a codex -s agent-browser -y`
- `2026-03-05 20:37 Europe/Berlin` Step 2B complete: installed `dogfood` for Codex with `npx skills add vercel-labs/agent-browser -g -a codex -s dogfood -y`
- `2026-03-05 20:38 Europe/Berlin` Validation complete: installed skill paths are `~/.agents/skills/agent-browser` and `~/.agents/skills/dogfood`
- `2026-03-05 20:42 Europe/Berlin` Runtime fix complete: upgraded stale global `agent-browser` CLI from `0.6.0` to `0.16.3` with `npm install -g agent-browser@latest`
- `2026-03-05 20:43 Europe/Berlin` Runtime fix complete: installed Playwright browser payloads with `agent-browser install` and `npx playwright install`
- `2026-03-05 20:44 Europe/Berlin` Validation complete: `agent-browser open about:blank && agent-browser snapshot -i && agent-browser close` succeeded
- `2026-03-05 23:00 Europe/Berlin` Step 3 complete: created repo harness scripts under `Portfolio-Prism/scripts/codex/` and custom skill sources under `planning/codex-skills/`
- `2026-03-05 23:01 Europe/Berlin` Step 3 complete: installed custom Codex skills into `~/.codex/skills/` for `repo-test-map`, `self-test-loop`, `frontend-qa`, and `bug-repro`
- `2026-03-05 23:05 Europe/Berlin` Runtime fix complete: created `Portfolio-Prism/.env` with matching `VITE_ECHO_BRIDGE_TOKEN` and `PRISM_ECHO_TOKEN` because the repo had no local `.env` and `dev:browser` requires both
- `2026-03-05 23:06 Europe/Berlin` Validation complete: `Portfolio-Prism/scripts/codex/dev-up.sh` succeeded out of sandbox and brought up frontend `1420` + engine `5001`
- `2026-03-05 23:07 Europe/Berlin` Validation complete: `Portfolio-Prism/scripts/codex/smoke-ui.sh` succeeded out of sandbox and produced screenshots/logs in `Portfolio-Prism/output/playwright/smoke`
- `2026-03-05 23:09 Europe/Berlin` Learning captured: separate sandboxed commands cannot see or bind the out-of-sandbox dev ports reliably, so browser/runtime validation scripts must run out of sandbox in this environment
- `2026-03-05 23:10 Europe/Berlin` Harness correction complete: narrowed `Portfolio-Prism/scripts/codex/test-changed.sh` so the default frontend branch runs `pnpm test:unit`; integration tests remain explicit because they require local port binding
- `2026-03-05 23:12 Europe/Berlin` Validation complete: `Portfolio-Prism/scripts/codex/test-changed.sh src/App.tsx` now passes cleanly with 25 unit test files / 374 tests passing
- `2026-03-05 23:13 Europe/Berlin` Documentation correction complete: repo-specific skills now prefer one-shot `smoke-ui.sh` for browser validation, with `dev-up.sh` + `healthcheck.sh` reserved for persistent local shells
- `2026-03-06 00:02 Europe/Berlin` Restart verification complete: `codex mcp list` still shows `playwright` enabled after restart
- `2026-03-06 00:04 Europe/Berlin` Restart verification complete: custom skills under `~/.codex/skills/` are present after restart
- `2026-03-06 00:06 Europe/Berlin` Skill linkage fix complete: copied `agent-browser` and `dogfood` into `~/.codex/skills/` because `npx skills ls -g -a codex` initially showed them as `not linked`
- `2026-03-06 00:07 Europe/Berlin` Final verification complete: `npx skills ls -g -a codex` now shows `agent-browser`, `dogfood`, `playwright`, `repo-test-map`, `self-test-loop`, `frontend-qa`, and `bug-repro` all linked to Codex
- `2026-03-06 13:55 Europe/Berlin` Real-data assessment complete: confirmed the app already has a local-first SQLite write path for real Trade Republic syncs into `prism.db` and a separate `pipeline.db` design for pipeline-run snapshots
- `2026-03-06 13:57 Europe/Berlin` Gap identified: the current sync path persists the latest portfolio state only; there is no implemented time-series snapshot ledger of each Trade Republic sync in the main app database
- `2026-03-06 13:58 Europe/Berlin` Gap identified: `pipeline.db` exists and is tested in isolation, but it is not currently wired into the live pipeline execution path
- `2026-03-06 14:02 Europe/Berlin` Runtime check complete: local dev stack can be started reliably via `Portfolio-Prism/scripts/codex/dev-up.sh`, but this Codex shell sandbox cannot directly inspect the out-of-sandbox local ports, so live auth handoff must use the started app itself rather than in-sandbox HTTP probes
- `2026-03-06 14:11 Europe/Berlin` Runtime validation repeated: restarted the local frontend and engine successfully, then re-ran `Portfolio-Prism/scripts/codex/smoke-ui.sh` successfully against `http://127.0.0.1:1420`
- `2026-03-06 14:11 Europe/Berlin` Verified live UI state: Trade Republic login form is reachable with phone field, PIN field, remember-device checkbox, and connect button; artifacts refreshed under `Portfolio-Prism/output/playwright/smoke/`
- `2026-03-06 18:49 Europe/Berlin` Startup root cause confirmed: `Portfolio-Prism/scripts/codex/dev-up.sh` proves readiness but does not leave frontend/engine alive for user handoff in this environment; persistent PTY sessions for `pnpm dev:engine` and `pnpm dev` do stay up and make the app reachable from the browser
- `2026-03-06 18:50 Europe/Berlin` Live UI bug confirmed during handoff validation: `tr_check_saved_session` returns `phoneNumber: null`, but the frontend IPC validation rejects null and logs initialization errors even though the Trade Republic login form still renders

---

## Goal

Enable Codex to:

- run the right local commands without guessing
- drive a real browser deterministically
- collect artifacts when checks fail
- perform lightweight exploratory QA on `localhost`
- do all of that safely enough to be trusted and repeated

---

## Current Baseline

### Already present

- `codex` CLI is installed
- `~/.codex/config.toml` exists
- current MCP config only includes Google Workspace servers
- local runtimes are available:
  - `node`, `npm`, `npx`, `pnpm`
  - `uv`
  - `python3`
  - `cargo`
  - `docker`
- local Playwright binary exists
- one Codex user skill is installed:
  - `~/.codex/skills/playwright`

### Missing for self-testing

- no Playwright MCP server configured in Codex
- no `agent-browser` skill
- no `dogfood` exploratory QA skill
- no repo-specific self-test skills
- no repo-level test harness scripts for Codex
- no artifact standard beyond ad hoc usage

---

## Target End State

After rollout, Codex should have:

1. **Playwright MCP**
2. **`agent-browser` skill**
3. **`dogfood` skill**
4. **Repo-specific self-test skills**
5. **Repo harness scripts** for startup, smoke checks, and artifact capture
6. **Optional sandbox/runtime add-ons** only after the above are stable

---

## Portfolio Prism Real-Data Assessment

### What already exists

- The app is already built for local-first persistence.
- The headless engine initializes a local SQLite database on startup via `portfolio_src/headless/lifecycle.py` and `portfolio_src/data/database.py`.
- Real Trade Republic sync writes current positions into the app database through `SyncService.sync_portfolio()` -> `sync_positions_from_tr()`.
- The main app database schema already includes:
  - `assets`
  - `positions`
  - `transactions`
  - `sync_state`
  - `historical_prices`
  - `system_logs`
  - `settings`
  - `isin_cache`
- The analytics pipeline reads from the local `positions` table, not directly from Trade Republic, so the app does not need to hit Trade Republic every time the pipeline runs.

### What this means operationally

- Yes, we can run the app, let the user authenticate against Trade Republic, sync real holdings once, and then run the pipeline on locally stored portfolio state.
- Yes, this already satisfies the core requirement of "do not pull from Trade Republic every time the app opens" for current-state holdings, assuming the user only syncs when they want fresher data.
- No, the current implementation does not yet give us a proper holdings history over time in the main portfolio database.

### Current persistence model

- `prism.db`
  - Intended system-of-record for the current portfolio state.
  - Current sync overwrites/upserts the latest `positions` rows for the portfolio.
  - `sync_state` stores last sync metadata.
  - `historical_prices` caches market history, but this is price history, not holdings history.
  - `transactions` exists in schema but is not currently populated by the live Trade Republic sync path.
- `pipeline.db`
  - Separate design for pipeline-run snapshots and holdings breakdown persistence.
  - Contains `pipeline_runs`, pipeline `positions`, and `holdings_breakdown`.
  - Exists in code and tests, but is not yet wired into the live pipeline execution path.
- Output files
  - The live pipeline currently writes CSV/JSON reports under the app outputs directory.
  - This gives report persistence, but not queryable historical portfolio-state tracking.

### Current gaps against the desired end state

- Missing holdings snapshot history:
  - Each sync updates the current `positions` table in place.
  - There is no `portfolio_snapshots` or `position_snapshots` table recording each sync as a point in time.
- Missing transaction-ledger ingestion from live Trade Republic sync:
  - The schema has a `transactions` table, but the active sync path only ingests current positions.
- Pipeline-run database not integrated:
  - `pipeline.db` is implemented but not used by the current `Pipeline.run()` / `SyncService.run_pipeline()` flow.
- Credentials storage is weaker than it should be:
  - "Remember me" currently stores phone and PIN in a local JSON file with base64 encoding, which is obfuscation rather than real protection.
  - For a real-user flow, avoid relying on saved PIN storage until this is hardened.

### Practical answer for the current repo

- We can proceed with a real Trade Republic auth + sync session now.
- The app can already persist the synced latest holdings locally and use them for dashboard/pipeline work.
- If the goal is reliable historical tracking of portfolio-state changes over time, that still needs implementation.

### Recommended next implementation

1. Keep the current `positions` table as the latest materialized state.
2. Add immutable sync snapshot tables, for example:
   - `portfolio_sync_runs`
   - `position_snapshots`
3. Record one sync-run row per Trade Republic refresh with timestamps and status.
4. Insert one snapshot row per position per sync run.
5. Optionally later ingest Trade Republic transactions into the existing `transactions` table for true ledger reconstruction.
6. Wire the existing `pipeline.db` layer into live pipeline execution only if we still want a separate analytics-history database after the above is in place.

### Working local startup process

For one-shot browser validation:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
./scripts/codex/smoke-ui.sh
```

For a user-facing live session that must remain reachable in the browser:

Engine shell:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
set -a && source .env && set +a
export UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache
pnpm dev:engine
```

Frontend shell:

```bash
cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism
export TAURI_DEV_HOST=127.0.0.1
pnpm dev
```

Do not rely on `./scripts/codex/dev-up.sh` for user handoff in this environment. It can prove readiness inside the command that launched it, but the child processes are not reliably still alive afterward.

---

## Phase 1: Add Playwright MCP

### Why first

This is the cleanest deterministic browser-control layer for Codex itself.

### Preferred install path

Use the local Codex CLI:

```bash
codex mcp add playwright -- npx @playwright/mcp@latest
```

### Manual config fallback

If we prefer direct file editing, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

### Validate

```bash
codex mcp list
```

Expected result:

- `playwright` appears as an enabled MCP server

### Notes

- This requires network access the first time if the package is not already cached.
- Codex may need a restart before the app fully picks up the new MCP server in the desktop session.

---

## Phase 2: Install Browser Skills

### 2A. Install `agent-browser`

Install the core coding-agent browser skill:

```bash
npx skills add vercel-labs/agent-browser --skill agent-browser
```

### 2B. Install `dogfood`

Install the exploratory QA skill from the same repo:

```bash
npx skills add vercel-labs/agent-browser --skill dogfood
```

### Why both

- `agent-browser` gives Codex a browser-native operating layer
- `dogfood` gives Codex a structured exploratory QA workflow and report output

### Validate

Confirm the skill folders exist under:

- `~/.agents/skills/agent-browser`
- `~/.agents/skills/dogfood`

### Notes

- These commands require network access.
- Per the local `skill-installer` guidance, Codex should be restarted after new skills are installed.
- On this machine, the `skills` CLI installed to the universal skill location `~/.agents/skills/`, not `~/.codex/skills/`.
- The pre-existing `agent-browser` CLI on PATH was stale (`0.6.0`) and had to be upgraded to `0.16.3` to match current Playwright browser builds.

---

## Phase 3: Create Repo-Specific Codex Skills

These should be created locally rather than installed from the internet.

### Skills to add

#### `self-test-loop`

Purpose:

- pick the smallest relevant checks first
- escalate to broader tests only when needed
- collect artifacts on failure
- summarize result + confidence

#### `repo-test-map`

Purpose:

- encode the canonical commands for this repo
- define startup prerequisites and expected ports
- record where artifacts should go

#### `frontend-qa`

Purpose:

- boot the local UI
- run browser smoke checks on important routes
- inspect console and page errors
- retain screenshot and trace artifacts

#### `bug-repro`

Purpose:

- convert bug reports into reproducible steps
- store URLs, inputs, screenshots, traces, and logs

### Recommended skill location

User-scoped Codex skills:

- `~/.codex/skills/self-test-loop`
- `~/.codex/skills/repo-test-map`
- `~/.codex/skills/frontend-qa`
- `~/.codex/skills/bug-repro`

### What these skills should encode for Portfolio Prism

- frontend install command
- frontend dev/start command
- Python analytics runtime command
- health/readiness checks
- canonical smoke routes
- artifact directory policy
- what to do when Trade Republic auth is not available

---

## Phase 4: Add Repo Harness Scripts

Codex is much better when the repo gives it stable entrypoints.

### Recommended scripts

Create a small `scripts/codex/` layer in the repo:

- `scripts/codex/dev-up.sh`
- `scripts/codex/dev-down.sh`
- `scripts/codex/healthcheck.sh`
- `scripts/codex/test-changed.sh`
- `scripts/codex/smoke-ui.sh`
- `scripts/codex/collect-artifacts.sh`

### Why this matters

Without these, Codex will keep guessing:

- how to boot the app
- which port to use
- which test subset is appropriate
- where traces and screenshots belong

### Artifact convention

Standardize on:

- `output/playwright/` for browser artifacts
- repo-specific subfolders by date/session if needed

Suggested retained artifacts:

- screenshot on failure
- trace on retry/failure
- console log capture
- page error capture

---

## Phase 5: Add Accessibility To The Default Loop

This should be part of the base rollout, not an afterthought.

### Add

- `@axe-core/playwright`

### Use

- smoke-check a small set of important pages
- run it as part of `frontend-qa` and `self-test-loop`

---

## Phase 6: Optional Higher-Level Additions

Only add these after Phases 1-5 are stable.

### Browser Use MCP

Best when we want a more agentic browser task layer.

Self-hosted MCP option from the docs:

```bash
uvx --from 'browser-use[cli]' browser-use --mcp
```

Use when:

- we want higher-level browser tasks
- we want optional `localhost` exploratory QA
- we want to evaluate `vibetest-use`

### Docker

Use when:

- we want more reproducible local execution
- tests mutate the environment
- dependency state drifts too much across machines

### E2B

Use when:

- we want disposable remote sandboxes
- we want safer parallel agent execution
- we want to push toward remote CI-like agent testing

### Browserbase / Stagehand

Use when:

- we want cloud browser sessions
- we want more managed recordings/session control
- we need scale beyond local Playwright/agent-browser

---

## Recommended Rollout Order

### Minimal practical path

1. Add Playwright MCP
2. Install `agent-browser`
3. Install `dogfood`
4. Create `repo-test-map`
5. Create `self-test-loop`
6. Add repo harness scripts
7. Add accessibility checks

### Do not start with

- Browser Use
- Browserbase
- E2B

Those are useful later, but they are not the first bottleneck on this machine.

---

## What I Can Do Myself

I can do the following end-to-end:

- inspect and patch `~/.codex/config.toml`
- add the Playwright MCP config
- validate MCP registration with `codex mcp list`
- create the repo-specific Codex skills locally
- create the repo harness scripts in this repo
- define artifact conventions and wire them into scripts/skills
- tailor the skills specifically for Portfolio Prism
- test the local setup after the installs are present

---

## Learnings So Far

- The current Codex CLI supports `codex mcp add`, and that was the safest way to register Playwright MCP without hand-editing TOML.
- The `skills` CLI installed external skills to the universal path `~/.agents/skills/`, while local Codex-specific custom skills still fit naturally under `~/.codex/skills/`.
- The pre-existing `agent-browser` CLI on this machine was stale enough to be incompatible with current Playwright browser builds. Updating it was required.
- `agent-browser install` alone was not enough while the CLI version was stale. The actual fix was upgrading `agent-browser`, then reinstalling browser payloads.
- Portfolio Prism browser/dev mode requires a local `.env` with matching `VITE_ECHO_BRIDGE_TOKEN` and `PRISM_ECHO_TOKEN`.
- In this environment, scripts that start local servers or bind ports must run out of sandbox. Sandboxed validation is still useful for unit tests and file inspection, but not for the live dev stack.
- The original `test-changed.sh` design was too broad because `pnpm test:run` includes the integration suite. For reliable “smallest relevant checks first,” the default frontend branch should stay on `pnpm test:unit`.
- A one-shot smoke script that starts the stack and validates it within the same execution is more reliable for Codex than trying to keep background dev servers alive across separate tool calls.
- External skills installed via `skills` may still need an explicit Codex-local linkage step on this machine. Verifying linkage with `npx skills ls -g -a codex` is necessary.

---

## Where I Need Manual Help

### Networked installs / approvals

I need your approval for commands that fetch packages or skills over the network, for example:

- `codex mcp add playwright -- npx @playwright/mcp@latest`
- `npx skills add vercel-labs/agent-browser --skill agent-browser`
- `npx skills add vercel-labs/agent-browser --skill dogfood`

### Codex restart

I can edit config and install skills, but you may need to restart the Codex desktop app so new skills/MCP config are loaded into the current session.

### External accounts / API keys

If we later add any of these, I will need your help:

- Browser Use cloud features
- Browserbase
- E2B
- any authenticated browser test that requires MFA, CAPTCHA, or a human login step

### Product-specific secrets

If Portfolio Prism requires local secrets, auth tokens, or live external credentials for test flows, I need those to already exist or for you to complete the human-in-the-loop login portion.

---

## Fastest Next Step

If we want the highest-value path with the lowest complexity, the next execution sequence should be:

1. add Playwright MCP
2. install `agent-browser`
3. install `dogfood`
4. restart Codex
5. verify the new skills appear in the restarted Codex session
6. use `self-test-loop` and `frontend-qa` on a real code change

That is the shortest route from “Codex can code” to “Codex can verify its own changes.”

---

## Sources

- [Playwright MCP repo](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP browser automation docs](https://playwright.dev/agents/playwright-mcp-browser-automation)
- [agent-browser repo](https://github.com/vercel-labs/agent-browser)
- [agent-browser skills docs](https://agent-browser.dev/skills)
- [Browser Use MCP docs](https://docs.browser-use.com/customize/integrations/mcp-server)
- [OpenHands Docker sandbox docs](https://docs.openhands.dev/openhands/usage/sandboxes/docker)
- [E2B docs](https://e2b.dev/docs)
- [Playwright accessibility testing docs](https://playwright.dev/docs/accessibility-testing)
