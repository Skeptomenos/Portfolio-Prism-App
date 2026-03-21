# Codex Self-Testing Capabilities Research

> Purpose: research note on what to add to Codex so it can test implementations more autonomously
> Created: 2026-03-05
> Scope: local audit + web research on browser automation, sandboxing, and agentic QA tooling

---

## Short Answer

To make Codex reliably test code and implementation itself, it needs **four layers**:

1. **Deterministic browser control**
2. **Higher-level autonomous browser/QA tools**
3. **Isolated reproducible runtimes for executing builds/tests**
4. **Project-specific self-test skills and harness scripts**

The best immediate combination for this environment is:

- **Playwright MCP** for official Codex-integrated browser tools
- **agent-browser** for richer CLI-first browser workflows optimized for coding agents
- **A repo-specific self-test skill** that tells Codex exactly how to start the app, run tests, collect artifacts, and interpret failures
- **A sandbox layer** such as Docker/OpenHands-style containers or E2B when safe/reproducible test execution matters

For more autonomous web QA, especially on authenticated or flaky sites:

- **Browser Use** or **Browserbase/Stagehand** are strong additions

---

## 1. Local Audit: Current State

### What this Codex environment already has

- Terminal command execution
- File editing / patching
- Web research
- One installed skill: [`~/.codex/skills/playwright/SKILL.md`](/Users/david.helmus/.codex/skills/playwright/SKILL.md)

### What is available on PATH locally

- `node`, `npm`, `npx`, `pnpm`
- `uv`
- `python3`
- `cargo`, `rustc`
- `docker`
- `gh`, `jq`
- `ffmpeg`

### What appears missing or unconfigured

- No visible MCP resources/templates were configured in this Codex session
- No `agent-browser` install/config
- No `playwright-mcp` MCP server configured
- No broader self-test skill beyond the existing Playwright skill
- No obvious sandbox/runtime abstraction dedicated to autonomous test execution
- `pytest` was not on PATH directly, which means Python test execution likely depends on `uv run`

### Practical conclusion

Codex can already run tests and drive a browser in a limited way, but it is missing the tooling and instructions that make the loop **reliable, reusable, and low-friction**.

---

## 2. What “Self-Testing” Actually Requires

A coding agent does not become good at testing just by having shell access.

It needs:

- A way to run the app locally and know when it is healthy
- A way to interact with the real UI, not just unit tests
- A way to inspect browser state, console logs, network failures, and visual regressions
- A safe place to install dependencies and run possibly destructive commands
- Durable instructions for when to use unit tests vs integration vs E2E vs exploratory browser checks
- A reliable artifact path for screenshots, traces, videos, and logs

The gap is not only “missing tools.” It is also “missing workflow encoding.”

---

## 3. Recommended Additions

## A. Add Official Playwright MCP To Codex

### Why

The official [Playwright MCP server](https://github.com/microsoft/playwright-mcp) is the cleanest official browser-control integration for Codex.

It gives Codex:

- structured browser automation tools
- accessibility-tree based page state
- deterministic interaction without requiring a vision model
- browser capabilities that fit MCP-native agent workflows

Playwright’s README explicitly includes Codex configuration:

- `codex mcp add playwright npx "@playwright/mcp@latest"`
- or:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

### What matters technically

The Playwright MCP README states it:

- uses the **accessibility tree**, not pixel-based input
- is **LLM-friendly**
- is **deterministic**

It also exposes useful config knobs:

- browser selection
- console level
- output directory
- device emulation
- permissions
- CDP connection
- optional capabilities like `vision`, `pdf`, and `devtools`

### Best use

Use Playwright MCP when Codex needs:

- first-party browser automation inside the Codex tool model
- structured snapshots for stable interactions
- exploratory browser debugging with persistent state

---

## B. Add `agent-browser` Skill + CLI

### Why

`agent-browser` is currently the strongest **CLI-first browser automation tool designed for coding agents** that I found.

Its README is unusually relevant here because it explicitly targets AI coding assistants and says it works with **Codex**.

### Why it may be better than MCP alone

The Playwright MCP README itself says that if you are using a coding agent, you may benefit from **CLI + SKILLS** instead of MCP alone.

That matters because Codex is exactly that use case.

### Why agent-browser is compelling

It gives the agent a lot more than basic click/fill/snapshot:

- ref-based accessibility snapshots
- screenshot diffing
- URL diffing
- console inspection
- uncaught page error inspection
- trace capture
- profiler capture
- saved auth/session state
- encrypted saved state
- domain allowlists / action policy / confirmation controls
- persistent profiles
- streaming / pair-browsing
- CDP connection
- Browserbase / Browser Use / Kernel providers
- iOS simulator support

### Relevant install points from the project

The README says:

- install the skill with `npx skills add vercel-labs/agent-browser`
- this works with **Codex**
- add browser automation instructions to `AGENTS.md`

### Why this matters for self-testing

This is the missing layer between “Codex can technically open a browser” and “Codex can systematically validate UI changes.”

It is especially strong for:

- localhost smoke testing
- login flow validation
- console/network debugging
- visual diff checks after changes
- collecting artifacts without writing full Playwright suites

### Recommendation

Add **both**:

- the official Playwright MCP server
- the `agent-browser` skill/CLI

Use Playwright MCP as the stable built-in browser tool.
Use `agent-browser` when Codex needs a faster CLI loop, richer debugging, or more browser-state management.

---

## C. Add A Repo-Specific “Self-Test” Skill

### Why

Generic browser skills are not enough. Codex also needs a **project-specific testing skill**.

This should answer:

- how to install deps
- how to start the app locally
- how to wait for readiness
- which tests to run for changed files
- which browser route to open for smoke checks
- where to write screenshots/traces
- how to interpret common failures

### Recommended skill set

1. `self-test-loop`
   - run smallest relevant tests first
   - escalate to integration/E2E if needed
   - collect artifacts on failure
   - summarize pass/fail and confidence

2. `frontend-qa`
   - start dev server
   - run browser smoke checks on key flows
   - inspect console errors
   - capture screenshot + trace on failure

3. `bug-repro`
   - turn bug reports into minimal repro steps
   - persist failing inputs/URLs/artifacts

4. `repo-test-map`
   - document canonical commands and prerequisites for the repo
   - this can be generated once and updated over time

### Why this is more important than it sounds

Without a repo-specific self-test skill, Codex falls back to ad hoc guessing:

- wrong startup commands
- wrong ports
- wrong test subsets
- no artifact collection
- no recovery steps

---

## D. Add A Safe Sandbox Layer

### Why

A testing-capable coding agent needs to install packages, run servers, execute tests, and sometimes reproduce CI-like failures.

Doing that directly on the host is fragile and riskier than it should be.

### Strong options

#### Docker / OpenHands-style sandbox

OpenHands recommends Docker because it gives:

- **isolation**
- **reproducibility**

and supports mounting the current repo into the sandbox.

This is a good fit when:

- tests mutate the environment
- system dependencies are messy
- you want more consistent results across machines

#### E2B

E2B provides:

- isolated sandboxes
- secure Linux VMs created on demand
- direct command execution
- examples for **computer use** and **GitHub Actions CI/CD**

This is a stronger option if you want:

- ephemeral per-task runtime environments
- remote execution
- agent-safe experimentation
- future hosted/parallel workflows

### Recommendation

If you want local-first reliability, start with **Docker**.

If you want cloud/ephemeral execution for agents, evaluate **E2B** next.

---

## E. Add Higher-Level Browser Agent Capability

Deterministic browser control is necessary, but it is not sufficient for exploratory QA.

For more autonomous testing, add a higher-level browser agent stack.

### Option 1: Browser Use

Browser Use offers:

- hosted MCP server for browser automation
- local self-hosted MCP via `uvx browser-use --mcp`
- cloud browser profiles for persistent auth
- real-time task monitoring
- higher-level browser tasks

It is better than raw browser control when Codex needs:

- “do this journey” rather than “click these exact elements”
- authenticated sessions
- task monitoring
- rapid exploratory flows

Browser Use also has useful adjacent pieces:

- **Documentation MCP** for giving the agent current docs context
- **Vibetest-Use**, which launches multiple agents in parallel, crawls production or `localhost`, and records screenshots, broken links, and accessibility issues

### Option 2: Browserbase / Stagehand

Browserbase MCP and Stagehand are good when you want:

- cloud browser infrastructure
- session persistence
- concurrency
- stealth/proxies
- recordings/logging
- natural-language browser actions
- the ability to mix AI actions with deterministic frameworks

Stagehand is particularly interesting because its docs position it as a way to prompt at multiple levels of granularity and interleave AI actions with Playwright when needed.

### Recommendation

Use:

- **Browser Use** if you want a more open-source/agent-native stack
- **Browserbase/Stagehand** if you want heavier cloud infrastructure, recordings, concurrency, and enterprise-style browser automation

---

## F. Add Accessibility Scanning To The Default QA Loop

Codex should not only test “does it click.”
It should also test “did this change break accessibility.”

Playwright’s official accessibility testing docs recommend using `@axe-core/playwright` to scan pages for common accessibility violations.

This is a strong addition because it lets the agent:

- catch missing labels
- catch duplicate IDs
- catch WCAG-tagged violations
- include accessibility in automated smoke checks

### Recommendation

At the repo level, add:

- `@axe-core/playwright`
- a small accessibility smoke suite for key pages/components

Then encode it into the self-test skill.

---

## G. Add Trace/Screenshot/Report Discipline

Codex needs a standard artifact loop.

Playwright’s official docs recommend traces because:

- traces help debug failed tests after the run
- `trace.zip` can be opened locally or in `trace.playwright.dev`
- traces can be recorded on retry or failure

This should be part of the default self-test setup:

- traces on retry/failure
- screenshots on failure
- console log capture
- network log capture where relevant
- artifact paths known to the agent

### Recommendation

Standardize:

- output directory per repo
- trace-on-first-retry or retain-on-failure
- screenshot/video policy
- a skill instruction that always links artifacts back into the final report

---

## 4. How `agent-browser` Specifically Helps

If the question is “how would `agent-browser` help Codex test implementations itself?”, the answer is:

1. It gives Codex a **browser-native CLI loop** optimized for agents
2. It uses **refs from accessibility snapshots**, which are cheaper and more stable than vision-only interaction
3. It has **debugging primitives** the current local Playwright skill does not fully cover:
   - console
   - page errors
   - traces
   - screenshot diff
   - URL diff
4. It supports **persistent sessions and encrypted auth state**, which matters for authenticated app testing
5. It supports **cloud providers** when localhost browsers are not enough
6. It supports **streaming / pair browsing**, which helps human-in-the-loop debugging

In short:

> `agent-browser` is not just “browser control.” It is a testing/debugging operating layer for AI coding agents.

---

## 5. Recommended Rollout Order

### Phase 1: Immediate, low-friction

1. Add **Playwright MCP** to Codex
2. Install **agent-browser** skill and CLI
3. Create a **repo-specific self-test skill**

### Phase 2: Make the loop trustworthy

1. Add trace/screenshot policy
2. Add accessibility scans with `@axe-core/playwright`
3. Add stable startup/health-check scripts per repo

### Phase 3: Add safety and scale

1. Add Docker sandbox workflow
2. Evaluate E2B for remote disposable environments
3. Add Browser Use or Browserbase/Stagehand for authenticated, parallel, or cloud browser testing

### Phase 4: Advanced autonomous QA

1. Add Vibetest-style exploratory QA
2. Add multi-agent parallel smoke checks
3. Add automatic issue filing from captured artifacts

---

## 6. Recommended Concrete Stack For This Codex Setup

If I were optimizing this specific Codex environment, I would add the following:

### Must-have

- **Playwright MCP**
- **agent-browser skill**
- **agent-browser CLI**
- **self-test-loop skill**
- **repo-test-map skill**

### High-value

- **Dockerized test runtime**
- **Playwright traces + artifact conventions**
- **`@axe-core/playwright`**

### Conditional / when needed

- **Browser Use MCP**
- **Browserbase MCP / Stagehand**
- **E2B sandboxes**
- **Vibetest-use**

---

## 7. Practical Recommendation

Do not choose just one browser tool.

The strongest setup is:

- **Playwright MCP** for official, structured browser tooling in Codex
- **agent-browser** for CLI-first, coding-agent-friendly browser workflows
- **repo-specific self-test skill** so Codex knows how to test each project
- **sandboxing** so those tests run safely and reproducibly

Everything after that is optimization:

- Browser Use for higher-level agentic browsing
- Browserbase/Stagehand for cloud scale and infra
- E2B for disposable remote runtimes
- Vibetest for broader exploratory QA

---

## Sources

- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP browser automation docs](https://playwright.dev/agents/playwright-mcp-browser-automation)
- [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
- [browser-use GitHub](https://github.com/browser-use/browser-use)
- [Browser Use Documentation MCP](https://docs.browser-use.com/customize/integrations/docs-mcp)
- [Browser Use MCP Server](https://docs.browser-use.com/customize/integrations/mcp-server)
- [Browser Use sandbox quickstart](https://docs.browser-use.com/customize/sandbox/quickstart)
- [Vibetest-Use example](https://docs.browser-use.com/examples/apps/vibetest-use)
- [Browserbase MCP docs](https://docs.browserbase.com/integrations/mcp/introduction)
- [Stagehand docs](https://docs.browserbase.com/introduction/stagehand)
- [E2B docs](https://e2b.dev/docs)
- [OpenHands Docker sandbox docs](https://docs.openhands.dev/openhands/usage/sandboxes/docker)
- [Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer)
- [Playwright debugging docs](https://playwright.dev/docs/debug)
- [Playwright accessibility testing docs](https://playwright.dev/docs/accessibility-testing)

