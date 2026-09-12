# Contributing to Portfolio Prism

Read the [project index](index.md) to locate the V2 plan and [V2 README](v2/README.md) for setup and checks. Active rebuild code is in `v2/`; root-level frontend, Python and Tauri commands exercise V1.

## Development boundaries

- Build small working increments against the plan's acceptance criteria. Reuse V1 behavior only after checking its source contracts and known defects.
- Keep V2 data isolated from V1. Do not migrate credentials or portfolio records implicitly.
- Keep broker and enrichment clients behind local boundaries. Validate consumed identifiers, dates, units and decimal values before publishing results.
- Preserve source evidence and expose incomplete or stale results. Do not merge companies by ticker alone or normalize partial ETF coverage to 100%.
- Include correlated diagnostics and failure behavior before live testing. Credentials, raw account payloads and document access URLs do not belong in committed fixtures or diagnostic logs.
- Use the visual direction in [AGENTS.md](AGENTS.md). Accessibility and readable uncertainty are part of the user journey.

## Verification

Run the relevant commands in the [V2 checks section](v2/README.md#checks). For browser changes, use the synthetic browser scripts against a running local preview. They do not prove real broker compatibility. Source integrations also need bounded live evidence and replay where the plan requires it.

Record commands, results and remaining limits. Update the owning documentation when behavior changes. Move detailed completed-run notes to dated private references and link them from the plan. Do not use historical test counts as fresh verification.

## V1 work

Use the [V1 contribution reference](docs/v1/execution/v1-contributing-reference.md) only when maintaining the old implementation. Its IPC mocks, Python integration tests and directory patterns are not V2 defaults. Follow the monorepo Git workflow for changes made in the monorepo.
