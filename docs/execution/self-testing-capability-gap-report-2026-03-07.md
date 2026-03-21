# Self-Testing Capability Gap Report

- Date: 2026-03-07
- Repo: `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism`
- Runtime under test: OpenCode session running inside the Portfolio Prism repo
- Intended consumer: wrapper repo agent / platform owner
- Goal: explain why the documented self-testing workflow is only partially usable in the current environment

## Executive Summary

Portfolio Prism's repo-side self-testing assets are present, but the full documented workflow is degraded by two environment-level failures outside the app code itself:

1. Repo-specific self-test skills are installed under `~/.codex/skills`, but the active OpenCode `skill` loader does not discover them.
2. OpenCode subagent orchestration is broken: minimal `call_omo_agent` requests fail synchronously, and background tasks return `status: error` and then disappear from `background_output` lookup.

This means the current environment can still run direct tests and browser automation, but it cannot use the documented repo-specific skill layer or the intended parallel subagent workflow.

## Severity And Impact

| ID | Severity | Area | Result |
|----|----------|------|--------|
| F1 | high | Skill discovery | Repo-specific self-test skills are installed but unusable from the active runtime |
| F2 | high | Subagent orchestration | Delegated/background investigations are broken |
| F3 | info | Control checks | Core browser automation still works via Playwright MCP and `agent-browser` |

Operational impact on the current Portfolio Prism tranche:

- Targeted tests, `scripts/codex/test-changed.sh`, and direct browser checks remain possible.
- Skill-assisted guidance (`repo-test-map`, `self-test-loop`, `frontend-qa`, `bug-repro`) is unavailable in this runtime.
- Parallel investigation via subagents is unavailable.
- Validation is therefore slower, more manual, and easier to execute inconsistently.

## Environment Snapshot

Observed skill roots and capability surface:

- OpenCode-visible skill roots:
  - `~/.config/opencode/skills`
  - `~/.agents/skills`
- Codex-only skill root observed on disk:
  - `~/.codex/skills`
- Repo-specific self-test skills found on disk only in `~/.codex/skills`:
  - `repo-test-map`
  - `self-test-loop`
  - `frontend-qa`
  - `bug-repro`
- OpenCode-visible browser skills:
  - `agent-browser`
  - `dogfood`
  - `playwright`

Key interpretation:

- This is not a global "all skills are broken" failure.
- It is a runtime-path mismatch: the current OpenCode session can see `~/.agents/skills` and `~/.config/opencode/skills`, but not the repo-specific skills installed into `~/.codex/skills`.

## Findings

### F1: Repo-specific self-test skills are installed but invisible to OpenCode

Expected behavior:

- The active `skill` tool should load the repo-specific skills named in the repo docs: `repo-test-map`, `self-test-loop`, `frontend-qa`, and `bug-repro`.

Actual behavior:

- `skill(name="repo-test-map")` returned "Skill or command `repo-test-map` not found".
- `skill(name="self-test-loop")` returned "Skill or command `self-test-loop` not found".
- `skill(name="frontend-qa")` returned "Skill or command `frontend-qa` not found".
- `skill(name="bug-repro")` returned "Skill or command `bug-repro` not found".
- The same `skill` tool did list `agent-browser`, `dogfood`, `playwright`, and the `superpowers/*` skills.

Filesystem evidence:

- `ls -la ~/.codex/skills` shows:
  - `repo-test-map`
  - `self-test-loop`
  - `frontend-qa`
  - `bug-repro`
- `ls -la ~/.agents/skills` shows only:
  - `agent-browser`
  - `dogfood`
- `ls -la ~/.config/opencode/skills` shows the normal OpenCode skill tree, but not the repo-specific Codex skills.

Root-cause judgment:

- The repo-specific skills were installed into the Codex skill root, but the active runtime is OpenCode.
- OpenCode skill discovery in this environment is not reading `~/.codex/skills`.
- The docs in `docs/execution/codex-install-config-plan.md` are accurate for Codex, but incomplete for OpenCode.

Why this matters:

- The repo's documented self-test workflow explicitly tells the agent to use those skills.
- In the current runtime, that guidance is impossible to follow exactly because the skills are not discoverable.

Recommended fix:

1. Make repo-specific skill installation dual-targeted:
   - install into `~/.codex/skills` for Codex, and
   - install into an OpenCode-visible root such as `~/.config/opencode/skills` or another supported user-skill path.
2. Add a post-install verification step that checks both:
   - filesystem presence, and
   - actual `skill`-tool discoverability in the target runtime.
3. Update bootstrap docs to distinguish clearly between Codex-only and OpenCode-compatible skill install paths.

### F2: OpenCode subagent orchestration is broken even for minimal prompts

Expected behavior:

- `call_omo_agent` should return a valid synchronous response for a trivial prompt.
- Background subagent launches should return a task that can be read with `background_output`.

Actual behavior:

- Minimal synchronous calls failed:
  - `call_omo_agent(subagent_type="librarian", prompt="Reply with exactly: OK", run_in_background=false)` -> `Error: No assistant or tool response found`
  - `call_omo_agent(subagent_type="explore", prompt="Reply with exactly: OK", run_in_background=false)` -> `Error: No assistant or tool response found`
- Background calls failed in a second way:
  - launch response returned a `task_id` plus `Status: error`
  - immediate follow-up via `background_output(task_id=...)` returned `Task not found`

Root-cause judgment:

- This is not a prompt-quality issue; the repro uses the smallest possible prompt.
- This is not specific to one subagent type; both `librarian` and `explore` failed.
- The failure appears to be inside the wrapper/subagent platform layer:
  - either the subagent runner is not healthy,
  - or the response is not being marshaled back,
  - or the task registry is dropping errored tasks before `background_output` can inspect them.

Why this matters:

- The current superpowers workflow encourages parallel investigation via subagents.
- That workflow is not usable right now, so troubleshooting and repo exploration fall back to manual direct-tool execution.

Recommended fix:

1. Repair synchronous subagent response handling.
2. Repair background task registration and retention so errored tasks remain queryable.
3. Add explicit health checks for subagent backends.
4. Add a wrapper-level smoke test with both:
   - minimal sync call (`Reply with exactly: OK`), and
   - minimal async call plus `background_output` retrieval.
5. Ensure failure surfaces are explicit; the tool should return a real backend error, not only `No assistant or tool response found`.

### F3: Core browser self-testing still works

This is the control check that proves the environment is degraded, not totally blocked.

Verified working:

- Playwright MCP responded successfully:
  - `browser_tabs` listed the current `about:blank` tab
  - `browser_navigate` to `about:blank` succeeded
  - `browser_snapshot` succeeded
- `agent-browser` CLI works directly:
  - `agent-browser --session selftest-cap open about:blank`
  - `agent-browser --session selftest-cap snapshot -i`
  - `agent-browser --session selftest-cap close`
  - all succeeded

Interpretation:

- Browser automation and browser binaries are not the broken layer.
- The failures are concentrated in skill discovery and subagent orchestration.

## Non-Issues / Exclusions

These were observed but should not be misclassified as self-testing-platform failures:

- `http://127.0.0.1:5001/health` returned connection refused because the Portfolio Prism runtime was not started yet. That is an app-runtime state issue, not a wrapper/self-test capability defect.
- The repo harness scripts were not the source of the failures documented here. The issue is the environment layer that should help the agent discover/use the right workflows.

## Reproduction Steps

### Repro A: Skill discovery mismatch

1. In the active OpenCode session, attempt to load a repo-specific skill:

```text
skill(name="repo-test-map")
```

2. Observe `not found` even though the repo docs expect the skill to exist.

3. Inspect disk paths:

```bash
ls -la ~/.codex/skills
ls -la ~/.agents/skills
ls -la ~/.config/opencode/skills
```

4. Observe:

- repo-specific skills exist only in `~/.codex/skills`
- OpenCode-visible roots do not contain those repo-specific skills

### Repro B: Subagent failure

1. Run a trivial synchronous subagent call:

```text
call_omo_agent(subagent_type="librarian", prompt="Reply with exactly: OK", run_in_background=false)
```

2. Observe:

```text
Error: No assistant or tool response found
```

3. Run a trivial background subagent call.

4. Observe launch response includes `Status: error`.

5. Query with `background_output(task_id=...)`.

6. Observe:

```text
Task not found: <task_id>
```

### Repro C: Control check proving browser layer still works

```bash
agent-browser --session selftest-cap open about:blank && \
agent-browser --session selftest-cap snapshot -i && \
agent-browser --session selftest-cap close
```

And with Playwright MCP:

```text
skill_mcp(mcp_name="playwright", tool_name="browser_tabs", arguments={"action":"list"})
skill_mcp(mcp_name="playwright", tool_name="browser_navigate", arguments={"url":"about:blank"})
skill_mcp(mcp_name="playwright", tool_name="browser_snapshot", arguments={})
```

All of the above succeeded.

## Recommended Wrapper-Repo Fix Plan

### Priority 1: Align skill installation with the active runtime

- Decide whether OpenCode should read `~/.codex/skills`, or whether repo bootstrap should install skills into both runtime roots.
- Add a single bootstrap path that is explicit about target runtime.
- Prefer a zero-ambiguity verification step that fails loudly if installed skills are not discoverable.

### Priority 2: Repair subagent plumbing

- Confirm the backend agent runner is healthy.
- Confirm sync responses are returned to `call_omo_agent`.
- Confirm async tasks are retained long enough for `background_output` inspection.
- Add regression coverage for the minimal `OK` call.

### Priority 3: Update docs and bootstrap checks

- Update `docs/execution/codex-install-config-plan.md` to include OpenCode compatibility notes.
- Add a runtime matrix documenting which skill roots each environment reads.
- Add a known-good capability smoke test that validates:
  - skill discovery,
  - subagent sync call,
  - subagent async call,
  - Playwright MCP,
  - `agent-browser` CLI.

## Acceptance Criteria

The wrapper fix should be considered complete only when all of the following are true in the active OpenCode runtime:

1. `skill` can load `repo-test-map`, `self-test-loop`, `frontend-qa`, and `bug-repro`.
2. Minimal synchronous `call_omo_agent` returns a real response.
3. Minimal background `call_omo_agent` returns a task whose output can be retrieved with `background_output`.
4. Existing browser sanity checks still pass via both Playwright MCP and `agent-browser`.
5. The install docs clearly differentiate Codex and OpenCode setup paths.

## Immediate Workaround

Until the wrapper fix lands, Portfolio Prism validation can continue with a degraded but usable manual path:

- use direct `bash` for repo commands and tests
- use `pty_spawn` for persistent engine/frontend shells
- use Playwright MCP directly for browser validation
- use `agent-browser` CLI directly for scripted browser capture
- do not rely on repo-specific skill wrappers or subagent fan-out

## Repo Resolution Update

Repo-side migration has now closed the original skill-path mismatch for the active Portfolio Prism workflow:

- the active shared skill root is `$HOME/.agents/skills`
- the Portfolio Prism self-test skills now load from that shared root in OpenCode
- canonical repo runtime commands now live under `scripts/selftest/*`
- `scripts/codex/*` remains only as a deprecated compatibility layer

What remains unresolved is platform-side, not repo-side:

- synchronous `call_omo_agent` failure handling
- async/background task retention for `background_output`

That means direct repo testing and skill-guided execution are now usable again, while delegated subagent fan-out is still a separate runtime defect.

## Evidence References

- Primary live plan: `docs/execution/stabilization-and-self-dogfood-plan.md`
- Self-testing/install doc: `docs/execution/codex-install-config-plan.md`
- This handoff report: `docs/execution/self-testing-capability-gap-report-2026-03-07.md`
