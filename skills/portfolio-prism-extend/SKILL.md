---
name: portfolio-prism-extend
description: Add a reviewed Portfolio Prism provider, broker, analytics module or view using the public contributor SDK, synthetic examples and capability-aware conformance.
---

# Extend Portfolio Prism

Deliver a usable contribution through acquisition, core validation, persistence and the relevant view. Work in the repository; this is not a plugin installer.

## Route

1. Read `CONTRIBUTING.md`, `v2/README.md` and [the SDK guide](../../docs/plugin-sdk.md). Use its capability table to separate working contracts from target-only enrichment/state/installation behavior.
2. Keep server contributions on `v2/sdk/server.ts`, shared metadata on `v2/sdk/contracts.ts` and browser modules on `v2/sdk/browser.ts`. Scope clients to the needed reads/commands. Never import credentials, raw captures, storage or backend providers into a browser module.
3. For an ETF source, follow the existing [composition-provider skill](../portfolio-prism-composition-provider/SKILL.md) for exact identity, source research, acquisition and qualification. This skill does not replace its source research procedure.
4. Follow the SDK's [add-a-contribution recipe](../../docs/plugin-sdk.md#add-a-contribution). Start with synthetic or redistributable source bytes. Add unique modules and explicit registrations; core financial logic and persistence retain authority. New real issuer routes need separate reviewed host transport-policy registration.
5. Reuse `compositionConformance` for a new composition provider with source-specific rejected fixtures. For other capabilities, use the catalog's reference module and add module-specific tests. Run both those tests and the selected existing conformance suites; shared green tests alone do not exercise a new module.
6. Prove supported results in the user journey. Show source dates/hashes, missing valuations and source gaps; retain last-good results on failure. Read `docs/exposure-coverage-contract.md` before changing financial or coverage views. Do not normalize partial data or infer identity from a name/ticker.
7. Run install/check/test/build, capability conformance and the relevant synthetic browser recipe in a clean project-only tree without `_planning` or private captures. Use `example:check` for the supplied example; adapt its assertions for your own contribution.

## Done means

- The contribution has explicit versions, source semantics, diagnostics, cancellation and applicable disable/recovery/replay coverage.
- Public instructions and redistributable fixtures are sufficient to reproduce the contributor journey. Credentials, source access rights, live compatibility and numerical reconciliation remain separate gates.
- Hand back exact revision, changed module/registration paths, commands/results and remaining limitations. Independent contributor acceptance and actual split publication require their own evidence; author tests cannot establish either.
