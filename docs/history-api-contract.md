# H1 history integration contract

Status: implementation handoff, accepted direction 2026-09-21. The [TypeScript contract](../v2/contracts/history.ts) fixes the initial shared wire shape. Its [synthetic examples](../v2/tests/fixtures/history-contract.ts) let backend and view tasks work independently. The H1 backend and registered history view now implement this contract. Integration/release status belongs to the delivery plan; historical company-contribution projections and interactive timelines are not part of this initial response shape. The [history architecture](portfolio-history-and-performance.md) owns financial semantics.

## Read interface

| Request | Successful response | Behavior |
| --- | --- | --- |
| `GET /api/history/runs?limit=25&cursor=…` | `HistoryRunsPage` | Newest runs first; default 25, maximum 100. An opaque cursor pins ordering by stable run identity/sequence, so concurrent new runs do not shift subsequent pages. Empty history returns an empty list. |
| `GET /api/history/runs/:id` | `HistoryRunDetail` | One operation and its checkpoint summaries in chronological commit order. Failed operations can have zero checkpoints; partial/cancelled ones may have useful committed checkpoints. |
| `GET /api/history/checkpoints/:id` | `HistoryCheckpointDetail` | Frozen summary, positions, safe input references, versions and replay availability. The core stores the full result/input manifest; the API is a bounded presentation projection, not a raw-data export. |

All responses include `contractVersion: 'portfolio-history/1'`. Keep the existing local host/origin protections and `{ error: string }` error shape. Return 400 for invalid parameters/IDs/cursors, 404 for unknown well-formed IDs and a safe error for storage failure. A missing endpoint, failed request or incompatible version must never appear as an empty successful portfolio. Leave the existing `POST /api/history/continue` broker extraction command intact. Reading history never triggers refresh, login, mutation or recomputation.

`runId` identifies an operation; `checkpoint.id` identifies one immutable published result. Every normal sync/issuer refresh has an operation outcome. An unchanged successful sync can create another checkpoint referencing deduplicated observations; repeated persistence of the same checkpoint is idempotent. Terminal run status can update once while the run completes; saved financial checkpoints never change. On process restart, unfinished runs become visibly interrupted without losing committed checkpoints. List summaries may advance as a run receives checkpoints; selecting a checkpoint always freezes the displayed values.

## Shared meaning

- Amounts, quantities and percentages remain decimal strings; unknowns are null, never fabricated zero. ISO timestamps retain their recorded precision; source dates remain source dates.
- `datasetId` identifies the durable local dataset across copies/restart. Accounts are namespaced by stable connection ID and broker account ID. Do not derive identity from phone numbers, display names or absolute filesystem paths. A copied test database must not become another live writer to the original dataset.
- Core alone derives currency totals and coverage. In H1, included security value plus unassigned value equals priced securities when the allocation state is compatible; non-company value remains unknown unless genuinely supported by a coordinated contract update. Cash is separate. Unknown-currency positions remain in global unvalued counts and details.
- A `100` priced allocation percentage with an unvalued holding remains partial portfolio valuation. `valuationState: 'valued'` only establishes that in-scope securities have supported values; it does not certify complete company grouping, cash, freshness or broker reconciliation. Keep cash state, notices and these qualifications alongside amounts.
- `holdingsObservedAt` is the saved holdings observation time, not an invented broker effective date. Quote/composition ranges expose selected source dates. `recordedAt` is checkpoint publication time, not a fresh market price.
- Notices preserve safe causes and next actions for stale/failed sources, unvalued positions, unsupported units, missing cash and incomplete migration evidence. Do not serve credentials, signed links, raw broker bodies or private source payloads.
- `inputs` contains immutable references sufficient to navigate provenance; not a requirement to split every provider payload into a new table. Source hashes/parser versions may be null only when absent in surviving evidence. `versions` names the policies/calculator/identity versions actually used. Stored internal manifests also pin quantity-history evidence, selection inputs and the calculation clock so relative freshness can be replayed as recorded.
- The normal history UI shows results as recorded. Do not apply today's price, source selection, elapsed-time warnings or identity decisions to an earlier checkpoint. Later reprocessing must be explicitly separate; automatic historical recomputation is outside H1.

## Observation boundary needed by H1

The backend owns the provider-neutral observation envelope: dataset/connection/account scope; kind; stable observation/version identity; observed and source times; completeness; safe evidence/hash/parser references; and original decimal units. Preserve partial, failed, authoritative-empty and unchanged distinctions. Normalize provider formats at the acquisition boundary while retaining replay evidence. Do not infer a trade from quantity changes or require a complete multi-broker/authentication rewrite to capture history. The view consumes the shared history contract, never this private ingestion envelope or provider payloads.

## Compatibility and verification

The coordinator owns changes to `v2/contracts/history.ts`, these semantics and the shared examples while the two tasks run. Both tasks may propose evidence-backed changes; neither silently forks the response shape. Additive changes must be accepted by both consumers; breaking changes require an explicit version update and migration/replay decision. Backend implements runtime validation at ingress and validates saved records; frontend checks version and safely handles malformed/error responses. Compile-time fixture agreement alone is not runtime validation.

The fixture deliberately combines 100% priced allocation with a missing valuation, and a failed run without a checkpoint. Extend task-local fixtures for empty history, multiple currencies, cash unknown/partial, running/interrupted/cancelled runs, stale inputs, unavailable replay and multiple checkpoints. The backend must supply API conformance tests and copied-data replay. The view must prove accessible navigation and error/gap presentation. Acceptance requires the combined real-data journey after both are integrated; mock results never become production fallback data.
