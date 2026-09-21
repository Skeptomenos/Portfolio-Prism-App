# Acquisition and app integration

Paths below are relative to the Portfolio Prism root. Read the actual types before implementing; this map is not a substitute SDK.

## Deterministic capture

Use the same pure parser in a research CLI and the provider. A thin CLI should accept exact fund/date and an output directory, perform bounded source requests, save original bytes plus a receipt, and return a typed outcome/diagnostic. Avoid embedding a second financial calculation in the CLI. An app API should call the existing host service, not a separate scraper with its own database.

Receipts retain method/URL, the non-secret request body or its safe representation, UTC retrieval time, HTTP/content type, byte count, SHA-256, fund identity, composition date and parser version. In the existing Amundi route the fixed POST body and its hash are part of replay evidence. Save original numeric text before conversion; use decimal arithmetic and explicit fraction-to-percent conversion where supported.

Honor cancellation, time/size bounds, request allowlists and limited retry/backoff. Distinguish source absence, malformed response, partial/empty result, unchanged publication and network failure. A request succeeding with HTML instead of expected JSON is a failure, not empty holdings. Inspect `v2/server/provider-http.ts` for current host behavior.

## Implement the exercised boundary

| Concern | Current implementation |
| --- | --- |
| Acquisition and evidence/candidate types | `v2/server/composition-provider.ts` |
| Inspection-only evidence | `v2/server/composition-inspection.ts`, `amundi-provider.ts` |
| Existing physical/hedged source adapter | `v2/server/ishares-provider.ts`, `issuer-profiles.ts` |
| Shared plugin descriptors, activation and retained decoders | `v2/server/plugin-registry.ts` |
| Core validation/admission | `v2/server/composition-admission.ts` |
| Refresh orchestration and persistence | `v2/server/provider-refresh-service.ts`, `store.ts` |
| Exposure and coverage | `v2/server/exposure.ts`, `coverage-report.ts`, `development.ts` |
| Registered browser views | `v2/web/views/plugin-metadata.ts`, `registry.tsx`, `bundled.tsx` |
| Immutable checkpoint compatibility | `v2/server/history-validation.ts`, `docs/history-api-contract.md` |

1. Extend a compatible provider profile or implement `CompositionProvider.acquire/decode`. Use an inspection capability when the source is useful but has incompatible economic meaning. Decoding saved evidence must require no network.
2. Register stable IDs, parser/provider versions, exact funds and capability/host compatibility in the shared descriptor. Current contracts are narrow: e.g. public unauthenticated sources and whole-published-holdings allocation. If the new source needs a different measure/access model, explicitly extend and test the contract; do not mislabel data to fit its literals.
3. Core acceptance validates the source and selects compatible evidence. Preserve the existing full/partial promotion, duplicate/conflict and date-regression rules. Plugins do not write accepted tables or decide canonical company merges.
4. Retain raw evidence and accepted versions through core storage. Use the same registry for refresh and restart/checkpoint decoding. Acquisition disablement and historical decode compatibility are separate concerns.
5. Feed selected results to existing calculation/read models, including names, source dates, per-contribution evidence and unresolved amounts. Optional panels consume read models/commands and register through the browser registry; metadata entrypoint strings alone do not dynamically load code.
6. Reconcile all supported rows, not only the headline holding used in the first demo. Separate source-list completeness, identifier coverage, priced portfolio allocation and company grouping.

Bundled code is trusted, not sandboxed. Source-specific parsing belongs in the provider; financial policy and schema migrations belong in core. Browser code receives no provider credentials. Do not promise a runtime package loader, complete broker SDK or arbitrary plugin isolation before those exist.
