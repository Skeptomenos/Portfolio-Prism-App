# Contributor SDK

This is a repository-local SDK for reviewed, bundled TypeScript contributions. It exposes the contracts exercised by the application, not a separately installed package. Start with [setup and checks](../v2/README.md#run). No private plan, portfolio, source capture or credentials are needed for the synthetic contributor journey below.

## Entrypoints and capabilities

Import the entrypoint for your execution environment. Paths below are relative to `v2/`.

| Entrypoint | Exports and granted context | Version / limit |
| --- | --- | --- |
| `sdk/contracts.ts` | Shared descriptor metadata, financial/history/connection wire types and schemas | Browser-safe; no backend execution |
| `sdk/server.ts` | `PluginDescriptor`, composition/inspection provider contracts, broker contracts, source hash/date helpers | Trusted backend contributions. Does not grant storage or a global credential handle |
| `sdk/browser.ts` | Shared contracts, `BrowserViewModule`, `BrowserViewRegistry`, `RegisteredViewHost`, financial/history clients, analytics registry, coverage summary | No server imports, raw source fixtures, keyring or broker SDK |
| `sdk/conformance/composition.ts` | `compositionConformance` Vitest suite | Test-only host access; never import in product modules |

| Capability | Implemented contract | Boundary and representative module |
| --- | --- | --- |
| Plugin descriptor | `portfolio-prism-host/1` | Explicit registration in `server/plugin-registry.ts`; `activate/deactivate({pluginId, signal})`. Metadata entrypoints identify code; they are not dynamic import paths |
| Composition | `composition-provider/1`, `issuer-allocation/1`, evidence `composition-evidence/1` | `acquire(fundIsin, {signal,get,post?})`, `decode(evidence)`. Original bytes, hash, dates and exact fund identity reach core admission. See `server/ishares-provider.ts` |
| Inspection | `composition-inspection/1` | Same bounded transport; saved substitute-basket/partial benchmark observations remain outside financial exposure. See `server/amundi-provider.ts` |
| Broker | `broker-connector/1`, normalized `broker-observation/1`, optional `broker-events/1` | `create({connectionId,vault})`; declared auth fields, cancellation, complete/partial/authoritative-empty holdings and typed observations. Optional bounded event batches retain revisions, opaque continuation and explicit coverage. See `server/broker.ts`; `tests/synthetic-broker.ts` is a redistributable synthetic ledger example |
| Analytics | `analytics/1` with `portfolio-financial/1` input | Method version plus detached, frozen, validated exposure/coverage input. Output is separate from canonical totals. See `web/views/contribution-mix.ts` |
| Views | `view/1` | Explicit `BrowserViewModule` with a scoped client and shell presentation/route parameters. Read models: `portfolio-financial/1`, `portfolio-history/1`, `portfolio-events/1`, bundled `wiki-pages/1`. See [financial views](financial-view-contract.md) |
| Enrichment and arbitrary plugin state | Target only | No generic public runtime or general namespaced state API is offered by this increment |

Broker connection HTTP currently uses `ConnectionsSchema` rather than a versioned envelope. Do not infer a wire version from the broker connector version. Generic connection create/auth commands exist locally, but the current login form is Trade Republic-specific. There is no generated credential form for an arbitrary new connector.

Provider HTTP is a host policy, not an arbitrary fetch function. Production currently allows reviewed iShares/Amundi routes with request-count, deadline, size and redirect restrictions. A new issuer requires a reviewed transport-policy registration in `server/provider-http.ts` and its checks. Do not bypass it with direct `fetch`. The example uses a reserved `.invalid` URL and an injected fixture context; it never expands production access.

## Run the synthetic source-to-panel journey

From the Portfolio Prism root (the public repository root after splitting):

```sh
pnpm --dir v2 install --frozen-lockfile
pnpm --dir v2 check
pnpm --dir v2 test
pnpm --dir v2 build
pnpm --dir v2 conformance
pnpm --dir v2 exec playwright install chromium
pnpm --dir v2 example:check
pnpm --dir v2 example:source
```

`example:source` prints a unique loopback URL. Open it and use **Reload saved figures** and **Source evidence**. Ctrl+C closes the server and removes that run's temporary directory. It creates only synthetic holdings and normalized observations in a new temporary SQLite database, acquires fixture bytes through `ProviderContext`, admits them through core validation, reopens SQLite, verifies the same financial projection and renders a registered panel. The example exposes only financial GET routes; it does not open the production broker service or system credential store.

Expected: EUR 1,000 priced fund value; two source contributions of `601.23456789012345678` and `398.76543210987654322`; source date `2026-09-20`; one unvalued holding and pending reconciliation. The existing checksum-valid identifiers carry fictional names/amounts. No issuer affiliation, live source validity or investment result is asserted. Fixture `marketValue`/`notionalValue` fields are synthetic zero values and are not independently verified valuation evidence.

`example:check` runs that path plus reload, keyboard, 1280/390/320px layouts, source hashes, request/version failure and recovery. Synthetic screenshots go to ignored `v2/test-results/sdk-example/`. It uses an ephemeral loopback port and removes its own database afterward. This is author-run acceptance, not proof that an independent contributor succeeded.

## Add a contribution

1. Create a module directory under `v2/examples/` for a synthetic trial, or a reviewed implementation directory for a real contribution. Use `examples/synthetic-source/{metadata,server,browser,fixture}.ts*` as the small provider-plus-panel template. The fixture and `host.ts` are demonstration/test support; do not register them in the production bundle.
2. Choose unique plugin, provider and view IDs. Declare exact supported fund identities, host/provider/parser versions and source constraints. Metadata belongs in a browser-safe shared module. Keep original decimal strings, explicit units, publication/retrieval dates and original artifacts. Core admission owns identity decisions, accounting and persistence.
3. Implement acquisition only through the granted context. Decode unknown source data with a runtime schema and fail explicitly. For a real ETF, follow the [composition-provider research skill](../skills/portfolio-prism-composition-provider/SKILL.md); a downloaded file or passing fixture is not a qualified source.
4. Register the descriptor in `bundledPluginDescriptors` in `v2/server/plugin-registry.ts`. Register `yourView(financialClient)` in the `BrowserViewRegistry` list in `v2/web/views/bundled.tsx`. These are explicit reviewed imports. A provider-only contribution can have `views: []`; a view-only contribution needs no provider. Do not alter core exposure, admission or persistence to accommodate a provider.
5. For a synthetic exercise, copy `examples/synthetic-source/` to your own directory, change its IDs/names/parser and bytes, and use the copied `host.ts` and `entry.tsx` registrations. Run `pnpm --dir v2 exec tsx examples/YOUR_DIRECTORY/smoke.ts` after adapting expected values. The production registry already has a provider for the example's fund ISIN; registering that unchanged example there correctly fails as a duplicate.
6. Add a `tests/YOUR_PROVIDER.test.ts` calling `compositionConformance` with your descriptor, evidence factory, synthetic context and rejected source cases. Copy the invocation in `tests/sdk-example.test.ts`. Supply source-specific malformed/partial/empty/identity/date/units/duplicate cases; the harness cannot invent your source's invalid bytes. Run your test explicitly with `pnpm --dir v2 exec vitest run tests/YOUR_PROVIDER.test.ts`, plus the capability command below. A green shared suite alone does not test a new module.
7. A panel reads the public financial/history client, shows supported results and remaining gaps, preserves last-good dates on failure and makes retry visible. Import no backend provider, raw capture or credential code. Analytics must consume the provided immutable input and publish their method/version; never replace canonical financial amounts.
8. Run setup/check/test/build/conformance and the affected browser journey from a clean project-only tree. Record revision, commands, fixture provenance, failures/corrections and remaining live gates. Submit code and registration for review. Source merge, independent contributor acceptance and actual split publication are separate outcomes.

No core financial or persistence changes are required for this exercised provider-plus-panel workflow. Adding a genuinely new capability or source semantics can require separate host design work; do not label unsupported inputs compatible.

## Capability-aware conformance

```sh
pnpm --dir v2 conformance composition view
pnpm --dir v2 conformance broker
pnpm --dir v2 conformance inspection analytics
```

No arguments selects every implemented capability. Unknown capability names fail. The command reuses existing synthetic host tests; it does not contact issuers or brokers. The runner lists exact test paths in `sdk/conformance/run.ts`.

| Selection | Evidence exercised |
| --- | --- |
| Shared + example | Duplicate/incompatible registration, activation failure, source-specific rejection, cancellation/HTTP failure, SQLite reopen, disable/enable, compatible descriptor upgrade, incompatible decoder warning and restoration |
| Composition | Malformed, partial/empty, identity/date/hash/policy/parser, units/weights, duplicates, bounded transport, mid-flight cancellation, independent fund failure, last-good replay/conflict protection |
| Inspection | Exact issuer/request identity, signed fraction/partial scope, host failure, independent persistence/replay without exposure admission |
| Broker | Declared auth and safe HTTP boundaries, account namespaces, normalized quantities/observations, partial/authoritative-empty holdings, cancellation, retirement/disable, version/recovery, cash retention |
| View | Browser bundle boundary, version/malformed read contracts, view failure/disable/incompatibility, scoped history/financial clients |
| Analytics | Validated frozen input, method version, exact contribution mix, malformed/incompatible input and disabled analysis |

Capability selection is not a universal certification. The reusable provider harness checks the supplied module; the shared suites check host behavior. New brokers, inspection parsers, analytics and views still need their own source/module-specific cases and browser journey. Browser checks run separately from Vitest.

## Lifecycle and recovery

- Host compatibility is exact, not a semver range. IDs are stable kebab-case; versions are explicit. Descriptor upgrades can retain the same provider/parser decoder; the harness proves that case across SQLite reopen.
- Composition replay currently requires exact saved provider and parser versions. Changing them does not migrate old evidence automatically. Restore the compatible decoder to recover; incompatible/missing decoders produce replay warnings while stored evidence and immutable checkpoints remain. There is no generic multi-version decoder manager or automatic migration system.
- Backend disable blocks new acquisition and retains a registered decoder for saved replay. Enable retries activation. Browser failure/incompatibility/disable is isolated by the view host; reload reconstructs its registry. There is no persistent install/upgrade UI.
- Abort signals, bounded network operations and last-good persistence are operational safeguards. Bundled code is trusted and can technically import host internals; scoped types and bundle checks are not a security sandbox.
- Source access does not grant retention or redistribution rights. Use synthetic/redistributable fixtures in public contributions and keep investor captures private. `sourceConstraints.retention` currently supports only `unsettled-private-use`; do not invent a production licence claim because the example bytes are redistributable.

## Agent workflows

Read [Operate](../skills/portfolio-prism-operate/SKILL.md) for setup, saved reads and diagnostics, or [Extend](../skills/portfolio-prism-extend/SKILL.md) for contribution delivery. They ship as repository-local skills with relative `.agents/skills` links. Agents can read these files directly; installing them globally or adding an MCP layer is unnecessary.
