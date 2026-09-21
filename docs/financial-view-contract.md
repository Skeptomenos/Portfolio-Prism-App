# Financial read and view contracts

Implemented contract: `portfolio-financial/1`. [Runtime schemas](../v2/contracts/financial.ts) define the exact browser-safe shape and validate both server projections and clients. The legacy endpoints remain unchanged. [History](history-api-contract.md) retains its separate immutable `portfolio-history/1` contract.

## Read boundary

All requests are same-origin, loopback GETs under `/api/financial/`. They inherit the host's origin checks and perform no refresh, persistence or source admission.

| Resource | Data |
| --- | --- |
| `overview` | Positions, exact decimal quantities/values, per-currency securities/cash totals and original observation/quote dates |
| `exposure` | Canonical security totals and direct/ETF contributions; source identities, hashes, dates, qualification and bounded issuer relationships; unresolved gaps and refresh diagnostics |
| `coverage` | Canonical denominators, included/unassigned values, unknowns, source states and next actions |
| `development` | Source register, qualification checks and delivery gaps; excludes internal directory/manifest paths |
| `fund/:isin` | One exact supported fund's normalized source rows, original units, inspection limits and core-derived illustrative/included values |
| `diagnostics` | Allowlisted operational events, including optional connection/provider correlation IDs; no credentials or raw responses |
| `analysis` | Exposure and coverage read together for one analytical input |

Each response has this envelope (abbreviated example):

```json
{
  "contractVersion": "portfolio-financial/1",
  "resource": "overview",
  "snapshot": { "kind": "live-projection", "id": "<64-character SHA-256>" },
  "data": { "rows": [], "totals": [] }
}
```

The content ID identifies the exact projected data for that read. It is not a durable history checkpoint or evidence of fresh market prices. Original source/observation times live inside the data. A live projection can change as freshness state advances; historical views use frozen H1 records instead. The example omits required fields; the schemas and synthetic tests are authoritative.

Keep decimal strings unchanged. Unknown amounts remain null; inspection fractions remain fractions. Views neither admit a source nor change canonical calculations. The exposure projection omits redundant internal `sourceRows`; normalized row inspection remains available through `fund/:isin`. No provider artifacts, raw broker payloads, decoder inputs or credential context enter these contracts. Undeclared fields are stripped recursively. Malformed declared fields fail the response; they do not become defaults.

Invalid parameters return 400, missing resources/funds 404, and unavailable/incompatible saved data 500, using `{ "error": "safe explanation" }`. Clients reject missing/wrong versions, mismatched resources and fund identities, malformed values and failed reads. They retain useful last-good data with an error where polling supports it. Fund navigation clears a different fund's old details.

## Registration and capabilities

[Bundled registration](../v2/web/views/bundled.tsx) binds reviewed browser modules to scoped clients. Portfolio, Breakdown (including security detail), Development (including fund detail), Explore, History, Wiki, Amundi inspection and Contribution mix use explicit view registrations. The host still owns navigation, route focus, connection/status controls, the shared coverage summary and styling. The financial views receive only the reads they use and the fixed `composition.refresh` command where needed. That command retains the existing guarded POST; it accepts no arbitrary endpoint or authentication fields.

The Amundi provider and panel share one plugin descriptor with separate backend/browser entrypoints. Its panel now reads the versioned `fund` projection. Disabling acquisition preserves accepted inspection/history data and can leave read-only inspection usable. Disabling a view prevents its rendering without removing accepted data or affecting unrelated routes. Incompatible view versions/read contracts render an explicit unavailable state. Activation/render failures are isolated. Reload reconstructs the reviewed bundled registrations; no installation UI or arbitrary loader is introduced.

Analytics metadata declares `analytics/1`, the input contract and method version. The [analytics registry](../v2/web/views/analytics-registry.ts) validates inputs and supplies a detached, frozen copy; its outputs are separate from canonical financial results. This protects the contract against accidental mutation, not hostile code: bundled TypeScript remains trusted application code, not a sandbox.

**Contribution mix 1.0.0** sums already-included direct and ETF contribution values separately within each currency and verifies their sum against canonical included coverage. It never adds issuer subtotals twice, invents unknown amounts, normalizes weights or computes returns. The page shows canonical coverage first, preserves gaps/unknowns, links to contribution/source investigation and discloses the method and exact input content ID. A mismatch or unavailable/disabled/incompatible analysis preserves prior figures with a visible failure signal.

## Verification

Run the README typecheck, tests and build. `financial-contracts.test.ts` exercises real service projections over synthetic saved inputs, origin/GET restrictions, safe failures, malformed contracts, exact decimal/unknown semantics, immutable history and analytics isolation. The browser bundle boundary test excludes backend/storage/provider execution and fixtures.

For two isolated offline previews of the **same SQLite-consistent copy**:

```sh
pnpm --dir v2 exec tsx tests/financial-equality.ts BASELINE_ORIGIN CANDIDATE_ORIGIN
PRISM_V2_URL=CANDIDATE_ORIGIN pnpm --dir v2 exec tsx tests/financial-view-smoke.ts
```

The comparison includes complete legacy overview/exposure/coverage, development and fund details, every history run/checkpoint, plus canonical values in the new projections. Only Development's request-generated timestamp is excluded between independent reads. The browser check covers useful real saved data, exact analytical amounts, source/detail navigation, Back/reload, keyboard, 320/390px and failed/malformed/incompatible/disabled states. Both scripts refuse primary 4336 and preview 4344. Private screenshots remain outside Git. These checks do not establish broker login compatibility, full economic exposure, complete identity, source-use permission or performance returns.
