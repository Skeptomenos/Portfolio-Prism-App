# Contributing to Portfolio Prism

Read the [project index](index.md) to locate the V2 plan and [V2 README](v2/README.md) for setup and checks. Active rebuild code is in `v2/`; root-level frontend, Python and Tauri commands exercise V1.

The [public contributor SDK](docs/plugin-sdk.md) catalogs implemented contracts and provides a synthetic provider/panel, reusable conformance and [Operate](skills/portfolio-prism-operate/SKILL.md)/[Extend](skills/portfolio-prism-extend/SKILL.md) agent workflows. Start there to add a bundled extension without private data.

The [architecture map](docs/architecture-map.html) explains the current flow and target extension boundaries.

## Add an ETF source

Use the [composition-provider skill](skills/portfolio-prism-composition-provider/SKILL.md) to research an exact ETF, reproduce the source as HTTP/CLI, and connect it through validation, persistence and the app. Agents can read this path directly or install the complete skill folder in their client's skill directory. The repository's `.agents/skills` link points to the same canonical files. This is guidance for reviewed bundled extensions; the repository-local SDK guide describes the exercised contribution workflow and its limits.

## Development boundaries

- Build small working increments against the plan's acceptance criteria. Reuse V1 behavior only after checking its source contracts and known defects.
- Keep V2 data isolated from V1. Do not migrate credentials or portfolio records implicitly.
- Keep broker and enrichment clients behind local boundaries. Validate consumed identifiers, dates, units and decimal values before publishing results.
- Preserve source evidence and expose incomplete or stale results. Do not merge companies by ticker alone or normalize partial ETF coverage to 100%.
- Include correlated diagnostics and failure behavior before live testing. Credentials, raw account payloads and document access URLs do not belong in committed fixtures or diagnostic logs.
- Use the visual direction in [AGENTS.md](AGENTS.md). Accessibility and readable uncertainty are part of the user journey.

## Verification

Select checks by the changed behavior; commands and fixture requirements live in the [V2 runtime guide](v2/README.md#checks).

| Change | Evidence |
| --- | --- |
| Core or TypeScript behavior | Typecheck, relevant tests and build |
| UI behavior | Matching synthetic browser script and the affected journey in the browser, including keyboard access, narrow layouts and changed error/coverage states |
| Sources, persistence or arithmetic | Saved-input replay on a SQLite-consistent copy, independent arithmetic and failure recovery; bounded live source evidence where required |
| Documentation | Accurate claims and working links; exercise any changed interactive artifact |

Use each recipe's documented fixture. Synthetic checks do not require a live login and do not prove broker compatibility. Private-data checks use isolated copies; an unavailable fixture stays an open check. The runtime guide explains offline mode's limits and safe local artifact locations.

Record commands, results and remaining limits. Update the owning documentation when behavior changes. Move detailed completed-run notes to dated private references and link them from the plan. Do not use historical test counts as fresh verification.

## V1 work

Use the [V1 contribution reference](docs/v1/execution/v1-contributing-reference.md) only when maintaining the old implementation. Its IPC mocks, Python integration tests and directory patterns are not V2 defaults. Follow the monorepo Git workflow for changes made in the monorepo.
