# OpenCode Self-Test Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Portfolio Prism's repo-specific self-test, backpressure, and dogfood workflow work natively in both OpenCode and Codex by standardizing the custom skill layer under `$HOME/.agents/skills`, preserving `agent-browser`, and replacing Codex-only runtime assumptions with shared skills plus repo-owned commands.

**Architecture:** The repo owns the runtime/test command surface under `scripts/selftest/`, while the active shared skill layer lives in `$HOME/.agents/skills`. Existing `scripts/codex/` stays alive only as a compatibility shim while docs and habits migrate. Backpressure stays enforced by repo scripts/tests and exit codes, not by skill prose alone.

**Tech Stack:** Markdown skills, Bash, `pnpm`, Playwright, `agent-browser`, OpenCode skill loading, PTY-based runtime sessions.

---

### Task 1: Make project-local shared skills committable

**Files:**
- Modify: `.gitignore`
- Create: `.agents/skills/README.md`
- Create: `.agents/skills/repo-test-map/SKILL.md`

**Step 1: Prove the current repo cannot commit project-local OpenCode skills safely**

Run:

```bash
git check-ignore -v .agents/skills/repo-test-map/SKILL.md || true
```

Expected: either `.agents/skills/` is ignored, or no project-local shared skill tree exists yet.

**Step 2: Change `.gitignore` so `.agents/skills` stays committable**

If `.agents/` is ignored anywhere, add an allow-list entry so `.agents/skills/**` can be committed.

If no ignore rule affects `.agents/skills`, leave `.gitignore` unchanged.

**Step 3: Add a short skill README**

Create `.agents/skills/README.md` with exact guidance:

```md
# Portfolio Prism Shared Skills

These skills are the canonical repo-owned self-test workflow for Portfolio Prism.

- Source of truth lives in this repo under `.agents/skills/`.
- Preferred shared user install is `~/.agents/skills/`.
- Both Codex and OpenCode support `.agents/skills/` and `~/.agents/skills/`.
```

**Step 4: Port `repo-test-map` first as the discoverability sentinel**

Create `.agents/skills/repo-test-map/SKILL.md` by copying the current wrapper source from `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/codex-skills/repo-test-map/SKILL.md`.

Do not change the runnable command paths yet. Keep the current `scripts/codex/*` and `.tmp/codex` references because they are still the live repo harness today.

Do change the framing so the skill works for both Codex and OpenCode:

```md
- say that `scripts/codex/*` is a historical path name, not a Codex-only workflow contract
- add a runtime note that both Codex and OpenCode support `.agents/skills/` and `~/.agents/skills/`
```

Also change the description text from Codex-specific language to shared Codex+OpenCode language.

**Step 5: Verify the file is no longer ignored and the skill is discoverable**

Run:

```bash
git check-ignore -v .agents/skills/repo-test-map/SKILL.md || true
npx skills ls -a codex
npx skills ls -a opencode
```

Expected:
- `git check-ignore` returns no match
- both agent listings can see the project skill in `.agents/skills/`

**Step 6: Commit**

```bash
git add .gitignore .agents/skills/README.md .agents/skills/repo-test-map/SKILL.md
git commit -m "chore: add project-local shared skill root"
```

---

### Task 2: Port the remaining repo-specific skills into `.agents/skills`

**Files:**
- Create: `.agents/skills/self-test-loop/SKILL.md`
- Create: `.agents/skills/frontend-qa/SKILL.md`
- Create: `.agents/skills/bug-repro/SKILL.md`

**Step 1: Port `self-test-loop` with the new canonical paths**

Create `.agents/skills/self-test-loop/SKILL.md` from `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/codex-skills/self-test-loop/SKILL.md`.

```md
- keep `./scripts/codex/test-changed.sh`
- keep `./scripts/codex/smoke-ui.sh`
- keep `Portfolio-Prism/.tmp/codex/*.log`
- add a note that these path names are historical and current, not Codex-only
```

Also update wording so the skill says `Codex or OpenCode` / `the active runtime`, not only `Codex`.

**Step 2: Port `frontend-qa`**

Create `.agents/skills/frontend-qa/SKILL.md` from `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/codex-skills/frontend-qa/SKILL.md` and update framing only:

```md
- keep current script and artifact paths
- explicitly say Playwright MCP, Chrome DevTools tooling, or `agent-browser` are all valid depending on runtime
```

Keep the instructions that prefer persistent PTY shells for user handoff.

**Step 3: Port `bug-repro`**

Create `.agents/skills/bug-repro/SKILL.md` from `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/planning/codex-skills/bug-repro/SKILL.md` and update framing only:

```md
- keep current script paths
- explicitly say `agent-browser` or the active runtime's equivalent browser tooling can be used
```

Preserve the `agent-browser`-based targeted reproduction guidance.

**Step 4: Add an OpenCode-specific note to all four skills**

Append a short note like this near the end of each skill:

```md
## Runtime Note

- These are shared skills intended to work from project `.agents/skills/` or user `~/.agents/skills/`.
- Both Codex and OpenCode support those locations.
```

**Step 5: Verify discoverability for all four skills**

Run:

```bash
npx skills ls -a codex
npx skills ls -a opencode
```

Expected:
- both runtimes can discover the three project-local skills in `.agents/skills/`

**Step 6: Commit**

```bash
git add .agents/skills/self-test-loop/SKILL.md .agents/skills/frontend-qa/SKILL.md .agents/skills/bug-repro/SKILL.md
git commit -m "chore: port self-test skills to shared agents directory"
```

---

### Task 3: Create the canonical `scripts/selftest/` command layer

**Files:**
- Create: `scripts/selftest/_common.sh`
- Create: `scripts/selftest/dev-up.sh`
- Create: `scripts/selftest/dev-down.sh`
- Create: `scripts/selftest/healthcheck.sh`
- Create: `scripts/selftest/test-changed.sh`
- Create: `scripts/selftest/smoke-ui.sh`
- Modify: `package.json`

**Step 1: Create the shared common shell helper**

Create `scripts/selftest/_common.sh` with the shared constants now duplicated across `scripts/codex/*.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.tmp/selftest"
UV_CACHE_DIR="$ROOT_DIR/.tmp/uv-cache"
ENV_FILE="$ROOT_DIR/.env"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:1420}"
ENGINE_URL="${ENGINE_URL:-http://127.0.0.1:5001/health}"
OUTPUT_SMOKE_DIR="${OUTPUT_SMOKE_DIR:-$ROOT_DIR/output/playwright/smoke}"
```

**Step 2: Port the existing five scripts with minimal logic drift**

Copy the logic from the current `scripts/codex/*.sh` files into the new `scripts/selftest/*.sh` files, but:

- source `_common.sh`
- write runtime logs and pid files under `.tmp/selftest`
- keep `pnpm`, not `npm`
- keep `agent-browser` in `smoke-ui.sh`

For example, `scripts/selftest/smoke-ui.sh` should still do this exact sequence:

```bash
"$ROOT_DIR/scripts/selftest/dev-up.sh" >/dev/null
agent-browser --session "$SESSION_NAME" open "$BASE_URL"
agent-browser --session "$SESSION_NAME" wait --load networkidle
agent-browser --session "$SESSION_NAME" screenshot --annotate "$OUTPUT_DIR/home.png"
agent-browser --session "$SESSION_NAME" console >"$OUTPUT_DIR/console-home.log" || true
agent-browser --session "$SESSION_NAME" errors >"$OUTPUT_DIR/errors-home.log" || true
```

**Step 3: Add package entrypoints for the new canonical scripts**

Modify `package.json` and add these exact scripts:

```json
{
  "scripts": {
    "selftest:dev-up": "./scripts/selftest/dev-up.sh",
    "selftest:dev-down": "./scripts/selftest/dev-down.sh",
    "selftest:health": "./scripts/selftest/healthcheck.sh",
    "selftest:changed": "./scripts/selftest/test-changed.sh",
    "selftest:smoke": "./scripts/selftest/smoke-ui.sh"
  }
}
```

**Step 4: Verify the new canonical commands work before touching wrappers**

Run:

```bash
./scripts/selftest/test-changed.sh src/App.tsx
pnpm run selftest:changed -- src/App.tsx
```

Expected:
- frontend unit tests run
- the behavior matches the current `scripts/codex/test-changed.sh` behavior

**Step 5: Commit**

```bash
git add scripts/selftest package.json
git commit -m "chore: add canonical selftest script layer"
```

---

### Task 4: Turn `scripts/codex/*` into compatibility shims

**Files:**
- Modify: `scripts/codex/dev-up.sh`
- Modify: `scripts/codex/dev-down.sh`
- Modify: `scripts/codex/healthcheck.sh`
- Modify: `scripts/codex/test-changed.sh`
- Modify: `scripts/codex/smoke-ui.sh`

**Step 1: Replace the implementation of each Codex script with a wrapper**

Each wrapper should be this exact shape, with only the final target file changed:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "[deprecated] use scripts/selftest/dev-up.sh" >&2
exec "$ROOT_DIR/scripts/selftest/dev-up.sh" "$@"
```

Repeat for:

- `dev-down.sh`
- `healthcheck.sh`
- `test-changed.sh`
- `smoke-ui.sh`

**Step 2: Verify compatibility behavior**

Run:

```bash
./scripts/codex/test-changed.sh src/App.tsx
```

Expected:
- deprecation message on stderr
- same test behavior as `./scripts/selftest/test-changed.sh src/App.tsx`

**Step 3: Verify smoke wrapper path still works**

Run:

```bash
./scripts/codex/smoke-ui.sh
```

Expected:
- deprecation message
- normal smoke artifact generation under `output/playwright/smoke`

**Step 4: Commit**

```bash
git add scripts/codex
git commit -m "chore: add codex selftest compatibility shims"
```

---

### Task 5: Add optional shared-skill bootstrap and runtime verification helpers

**Files:**
- Create: `scripts/selftest/install-shared-skills.sh`
- Create: `scripts/selftest/verify-shared-skills.sh`

**Step 1: Add the optional mirror installer**

Create `scripts/selftest/install-shared-skills.sh` with this exact behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/.agents/skills"
TARGET_ROOT="${TARGET_ROOT:-$HOME/.agents/skills}"

mkdir -p "$TARGET_ROOT"

for skill_dir in "$SOURCE_DIR"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$TARGET_ROOT/$skill_name"
  cp -R "$skill_dir" "$TARGET_ROOT/$skill_name"
  echo "installed $skill_name -> $TARGET_ROOT/$skill_name"
done
```

This is a convenience path only. The repo-local `.agents/skills/` tree remains canonical.

**Step 2: Add a repo-owned verification helper**

Create `scripts/selftest/verify-shared-skills.sh` with these checks:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

test -f "$ROOT_DIR/.agents/skills/repo-test-map/SKILL.md"
test -f "$ROOT_DIR/.agents/skills/self-test-loop/SKILL.md"
test -f "$ROOT_DIR/.agents/skills/frontend-qa/SKILL.md"
test -f "$ROOT_DIR/.agents/skills/bug-repro/SKILL.md"

npx skills ls -a codex
npx skills ls -a opencode
```

**Step 3: Verify the installer against a temp target first**

Run:

```bash
TARGET_ROOT="$PWD/.tmp/skill-mirror" ./scripts/selftest/install-shared-skills.sh
./scripts/selftest/verify-shared-skills.sh
```

Expected:
- mirror directories are created under `.tmp/skill-mirror`
- both runtimes can see the shared/project skill set

**Step 4: Commit**

```bash
git add scripts/selftest/install-shared-skills.sh scripts/selftest/verify-shared-skills.sh
git commit -m "chore: add shared skill bootstrap helpers"
```

---

### Task 6: Refresh active runbooks and AGENTS to point at shared-skill assets

**Files:**
- Modify: `AGENTS.md`
- Modify: `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/AGENTS.md`
- Modify: `docs/execution/stabilization-and-self-dogfood-plan.md`
- Modify: `docs/execution/project-overview-live.md`
- Modify: `docs/execution/self-testing-capability-gap-report-2026-03-07.md`
- Create: `docs/execution/opencode-self-testing-runbook.md`

**Step 1: Create the new OpenCode runbook instead of mutating history away**

Create `docs/execution/opencode-self-testing-runbook.md` with these sections:

```md
# OpenCode Self-Testing Runbook

## Canonical Skills
- `.agents/skills/repo-test-map`
- `.agents/skills/self-test-loop`
- `.agents/skills/frontend-qa`
- `.agents/skills/bug-repro`

## Canonical Commands
- `./scripts/selftest/test-changed.sh`
- `./scripts/selftest/smoke-ui.sh`
- `./scripts/selftest/dev-up.sh`
- `./scripts/selftest/healthcheck.sh`

## Compatibility Notes
- `scripts/codex/*` still works, but is deprecated.
- `~/.agents/skills` is the preferred shared global install for Codex and OpenCode.
```

**Step 2: Update AGENTS references**

Change both AGENTS files so the current execution/testing source of truth points at `docs/execution/opencode-self-testing-runbook.md`, not only `docs/execution/codex-install-config-plan.md`.

**Step 3: Update the stabilization plan's active terminology**

In `docs/execution/stabilization-and-self-dogfood-plan.md`, change active instruction lines such as:

```md
codex:record-sync-snapshot -> selftest:record-sync-snapshot
codex:replay-sync-snapshot -> selftest:replay-sync-snapshot
codex:dogfood:real-snapshot -> selftest:dogfood:real-snapshot
scripts/codex/... -> scripts/selftest/...
```

Historical work-log lines can stay unchanged.

**Step 4: Update the gap report with the repo-side resolution state**

Append a short resolution note to `docs/execution/self-testing-capability-gap-report-2026-03-07.md` explaining that the repo-specific shared skills now live under `.agents/skills/` and can be installed globally in `~/.agents/skills/`, while subagent breakage remains a platform issue outside the repo.

**Step 5: Verify active docs no longer point engineers at the wrong runtime root**

Run:

```bash
grep -n "~/.codex/skills\|scripts/codex/\|codex:dogfood:real-snapshot" AGENTS.md docs/execution/opencode-self-testing-runbook.md docs/execution/stabilization-and-self-dogfood-plan.md
```

Expected:
- active instructions point to `.agents/skills` and the canonical command surface
- remaining Codex mentions are explicitly historical or compatibility notes

**Step 6: Commit**

```bash
git add AGENTS.md docs/execution /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/AGENTS.md
git commit -m "docs: switch self-test runbooks to opencode"
```

---

### Task 7: Add runnable backpressure checks and real dogfood entrypoints

**Files:**
- Create: `tests/e2e/selftest-smoke.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Create: `scripts/selftest/record-sync-snapshot.sh`
- Create: `scripts/selftest/replay-sync-snapshot.sh`
- Create: `scripts/selftest/dogfood-real-snapshot.sh`

**Step 1: Fix Playwright config to match repo conventions**

In `playwright.config.ts`, change this exact line:

```ts
command: 'npm run dev'
```

to:

```ts
command: 'pnpm dev'
```

Do not change the rest of the config yet.

**Step 2: Write the failing smoke/backpressure spec**

Create `tests/e2e/selftest-smoke.spec.ts` with this minimum shape:

```ts
import { test, expect } from '@playwright/test'

test('health route has no IPC validation errors', async ({ page }) => {
  const consoleErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('http://127.0.0.1:1420')
  await page.getByRole('button', { name: 'Health' }).click()

  expect(consoleErrors.filter((msg) => msg.includes('IPCValidationError'))).toEqual([])
})
```

**Step 3: Run the spec to prove the harness is wired**

Run:

```bash
pnpm exec playwright test tests/e2e/selftest-smoke.spec.ts --reporter=line
```

Expected: initial failure is acceptable if runtime or route assumptions are still incomplete. The point is to create the runnable gate.

**Step 4: Add the real-data command skeletons**

Create these three scripts with fail-fast argument parsing and explicit non-zero exits when required inputs are missing:

```bash
./scripts/selftest/record-sync-snapshot.sh --snapshot-dir <private-dir>
./scripts/selftest/replay-sync-snapshot.sh --snapshot-dir <private-dir>
./scripts/selftest/dogfood-real-snapshot.sh --snapshot-dir <private-dir>
```

At minimum, `dogfood-real-snapshot.sh` must orchestrate this sequence:

```bash
./scripts/selftest/replay-sync-snapshot.sh --snapshot-dir "$SNAPSHOT_DIR"
./scripts/selftest/dev-up.sh
pnpm exec playwright test tests/e2e/selftest-smoke.spec.ts --reporter=line
```

The script must return non-zero when:

- snapshot input is missing
- the browser test fails
- log/console output contains the targeted backpressure failures

**Step 5: Expose package entrypoints**

Add these exact scripts to `package.json`:

```json
{
  "scripts": {
    "selftest:record-sync-snapshot": "./scripts/selftest/record-sync-snapshot.sh",
    "selftest:replay-sync-snapshot": "./scripts/selftest/replay-sync-snapshot.sh",
    "selftest:dogfood:real-snapshot": "./scripts/selftest/dogfood-real-snapshot.sh",
    "selftest:e2e": "playwright test tests/e2e/selftest-smoke.spec.ts"
  }
}
```

**Step 6: Verify the minimal command surface**

Run:

```bash
./scripts/selftest/record-sync-snapshot.sh --help || true
./scripts/selftest/replay-sync-snapshot.sh --help || true
./scripts/selftest/dogfood-real-snapshot.sh --help || true
pnpm run selftest:e2e
```

Expected:
- help output or clear usage text for all three scripts
- e2e gate exists and runs

**Step 7: Commit**

```bash
git add tests/e2e/selftest-smoke.spec.ts playwright.config.ts package.json scripts/selftest
git commit -m "test: add opencode selftest backpressure entrypoints"
```

---

### Task 8: Final verification and cleanup pass

**Files:**
- Review: `.agents/skills/**`
- Review: `scripts/selftest/**`
- Review: `scripts/codex/**`
- Review: `docs/execution/**`

**Step 1: Run the repo-owned skill verification**

Run:

```bash
./scripts/selftest/verify-shared-skills.sh
```

Expected: shared skills exist in the repo and both runtimes can discover them.

**Step 2: Run the smallest repo-owned test loop**

Run:

```bash
./scripts/selftest/test-changed.sh src/App.tsx
./scripts/selftest/smoke-ui.sh
```

Expected:
- targeted tests run successfully
- smoke artifacts are written under `output/playwright/smoke`

**Step 3: Verify compatibility shims still function**

Run:

```bash
./scripts/codex/test-changed.sh src/App.tsx
./scripts/codex/smoke-ui.sh
```

Expected:
- both commands still work
- both commands emit deprecation notices

**Step 4: Run a documentation sanity sweep**

Run:

```bash
grep -R "scripts/codex/\|~/.codex/skills\|codex:dogfood:real-snapshot" .
```

Expected: remaining hits are archival, historical, or explicitly labeled compatibility notes.

**Step 5: Commit the final integration pass**

```bash
git add .
git commit -m "chore: complete opencode selftest migration"
```

---

## Notes For The Implementer

- Do not block this repo migration on the current `call_omo_agent` / `background_output` failure. That is a platform/runtime issue documented in `docs/execution/self-testing-capability-gap-report-2026-03-07.md`.
- Preserve `agent-browser`; do not rip it out just to make the system feel more OpenCode-native.
- Prefer project-local `.agents/skills/` as the shared source of truth.
- Prefer `scripts/selftest/` as the canonical repo command layer. `scripts/codex/` is only a compatibility surface.
- Keep historical Codex docs as evidence where useful, but stop routing active instructions through them.
