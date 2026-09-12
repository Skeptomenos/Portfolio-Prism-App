# Portfolio Prism V2 — local portfolio preview

Local TypeScript/Effect backend, React/Vite interface and SQLite storage. It connects to Trade Republic, stores position snapshots and source data, and estimates supported position values from saved broker bid quotes. The one-ETF company exposure pilot combines direct stocks with sourced top-ten constituents.

See the [project index](../index.md) for the delivery plan and task-specific references.

## Run

Requires Node.js 22.13 or newer and pnpm. From the Portfolio Prism directory:

```sh
pnpm --dir v2 install --frozen-lockfile
pnpm --dir v2 dev
```

Open http://127.0.0.1:4310. Enter your phone number and PIN in the local interface, then approve the login in the Trade Republic app. Do not put credentials into terminal commands or issue reports. The PIN is not saved. Session cookies are stored with `@napi-rs/keyring` in the system credential store. Access to that store may prompt on macOS.

The service refreshes on startup and every 15 minutes while running. Broker login is unofficial and may fail if the upstream protocol or access requirements change. Live authentication and response compatibility require verification on the user's account. A failure before the holdings commit preserves the prior holdings; this implementation does not attempt to bypass broker challenges.

`PRISM_V2_PORT` changes the loopback port. `PRISM_V2_DATA_DIR` changes portfolio storage; default is `~/.portfolio-prism-v2`. V1 data and credentials are not imported. Successful snapshots are retained locally for replay; this preview has no automated retention cleanup. Protect backups of this directory as financial data.

Disconnect keeps portfolio history, clears the broker session and disables automatic reconnection until a successful login. If credential deletion fails, the UI reports it and automatic reconnection remains disabled across restart.

## Checks

```sh
pnpm --dir v2 check
pnpm --dir v2 test
pnpm --dir v2 build
```

With the local service running, `node v2/tests/browser-smoke.mjs` uses the parent project Playwright installation to test the UI with synthetic responses. It does not authenticate to the broker. Run `node v2/tests/explorer-smoke.mjs` for holdings sorting, valuation coverage and source exploration with synthetic responses. Screenshots go to ignored `v2/test-results/`.

The development launcher serves Vite and the API on one loopback origin. It is not a hosted deployment or a finished desktop installer. The build verifies the frontend bundle; `dev` remains the current launcher.

## Broker boundary

V1 authentication and portfolio sync are built on [pytr](https://github.com/pytr-org/pytr), an unofficial Python client for Trade Republic's private API. The V1 daemon uses `pytr.api.TradeRepublicApi` and `pytr.portfolio.Portfolio`. Consult pytr's source and upstream issues when investigating protocol changes or comparing behavior during the rebuild.

V2 uses the TypeScript SDK below instead of executing pytr, in line with the agreed TypeScript/Effect runtime. Neither client is an official Trade Republic integration. Keep pytr as a protocol and behavior reference; verify compatibility against actual responses.

The MIT-licensed `trade-republic-sdk` 0.2.2 provides app-approval login, refresh and read-only topic subscriptions. The connection path reads account pairs and portfolios; valuation refresh and the broker explorer use the additional read sources described below. SDK schema warnings are disabled to avoid logging account payloads; Prism validates the consumed fields before committing a snapshot. Complete retrieval of all returned securities accounts is required before publishing a new snapshot. Empty account discovery is an error, while explicit empty position arrays are valid.

Quantities and average buy-in remain decimal strings. Scientific notation from the broker is expanded with Decimal.js without conversion through JavaScript numbers. Average buy-in is never used as a market price. All positions are retained, including unsupported instrument types. Company exposure uses exact security ISIN matches in the pilot below.

## Local diagnostics

Observability is a required part of every V2 increment. Diagnose failure paths before asking for live acceptance.

Authentication, restore and import attempts have correlation IDs, stages, timestamps, durations and outcomes. HTTP failures include status codes; transport failures include allowlisted network codes. Error messages show a diagnostic reference. Expand **Local diagnostics** in the interface to inspect the latest event or open `/api/diagnostics` for the latest 100 events.

Events persist in the local SQLite database across restart. Retention is capped at 1,000 events. Diagnostics exclude phone numbers, PINs, session cookies, headers, request/response bodies, raw provider messages and portfolio positions. Tests verify persistence, correlation and sensitive-data exclusion. A storage failure produces a visible warning.

## Broker data explorer

**Extract broker data** reads and saves 26 source groups locally. The explorer includes the seven registered HTTP resources, all registered WebSocket read topics through account/position/watchlist/event parameters, and public `instrument` / `stockDetails` reads for held instruments. The latter follow pytr's read protocol through a fixed-host, credential-free TypeScript adapter. No trades, order changes, account acknowledgements or payments are sent.

Each source shows provenance, explanatory notes, last attempt, saved-response time, coverage and expandable response fields. Search filters source names and descriptions. Holdings headings now sort numerically or alphabetically; average buy-in is visible. The source viewer renders broker content as text, not HTML or executable actions.

Extraction proceeds in bounded history batches (10 pages and 50 event-detail reads per batch with at most four concurrent reads, up to 100 batches per operation). Progress persists between batches. Cancel stops pending work; **Continue history & details** resumes saved progress. End-of-history means the broker returned no continuation cursor, not proof that its API exposes every historical record. Failed detail records remain visible and do not block other events; a fresh extraction retries them. An overlapping history refresh updates matching events while preserving older records and its saved continuation cursor.

Each source retains its last successful response when a whole-source request fails. Quotes and event details preserve individual failures and are labeled partial. Authentication rejection stops extraction. Account datasets are private financial/personal data in the local SQLite database, separate from diagnostics; they currently retain the latest response per source. Diagnostic retention remains separately bounded. PINs, tokens, session material and HTTP URLs that may grant document access are omitted from extracted payloads. The document catalog and event document metadata are included; PDF bytes are not downloaded. This is an inventory of the implemented read surface, not a claim that every undocumented Trade Republic endpoint is covered.

The main **Your holdings** table now joins broker positions, instrument listings and saved bid quotes. Prism values stocks/funds only when the reference ISIN matches, the quoted venue has an active listing with a declared currency, and the instrument price factor is 1. Other pricing conventions stay unvalued. Arithmetic uses Decimal.js; display rounds monetary amounts to two decimals. The unrounded decimal result remains in the overview API. Bid timestamps older than 24 hours are marked; quote quality codes are not yet interpreted, and these estimates are not execution prices.

Subtotals are grouped by currency. Cash remains separate, and duplicated cash-account records are rejected. Percentages use only priced securities in the same currency, excluding cash and unsupported positions; incomplete coverage is explicit. Average buy-in remains a broker field with unreconciled currency conventions, so profit/loss is deferred. Login/startup/periodic/manual holdings refresh also refreshes the valuation input sources; full personal/tax/document/history extraction stays separate. No external enrichment is used in the valuation view.

Run `node v2/tests/explorer-smoke.mjs` against the running service for a synthetic UI check. It intercepts all data and extraction calls, checks source fields, failure notes, filters, sorting, provenance and mobile overflow, and saves synthetic screenshots under ignored `v2/test-results/`.

## Company exposure pilot

The company view covers direct stocks and one owned physical ETF: **IE0031442068, iShares Core S&P 500 UCITS ETF USD (Dist)**. It uses the [justETF profile](https://www.justetf.com/en/etf-profile.html?isin=IE0031442068), because the tested issuer downloads were inaccessible. The first verified response was dated **2026-07-30**, disclosed **37.11%** in ten holdings and left **62.89%** undisclosed. These are dated observations, not guaranteed current coverage.

The adapter validates the page's fund ISIN/name, holdings date, explicit percentage units, top-ten row count, total weight and constituent ISIN checksums. Equity identity comes from the source's stock-profile links. Duplicate identities, malformed weights, mismatched funds and impossible/future dates fail closed. Rows without a valid stock-profile ISIN remain unresolved; the original raw response preserves their evidence. Invalid compositions never replace the last good response. A missing date stays unknown when explicitly supplied as a dash; missing/changed markup is a source-format failure. A new composition cannot replace a known date with an older or unknown date.

Prism computes position value × weight ÷ 100 with Decimal.js at 256-digit precision. Values already use the broker listing currency, so constituent weights do not trigger another FX conversion. Direct and indirect amounts join on exact ISIN within each currency. Separate share classes, listings and ADRs remain separate until their relationship is evidenced. Company figures are known subtotals, not complete company totals. The view exposes every contribution and quote date, unknown valuations, the composition date, retrieval time, raw-evidence hash, unresolved rows and priced-value gaps. Cash is excluded from the denominator. Composition older than 30 days or without a known date is labeled stale; failed refreshes remain visible even when saved data is usable.

`GET /api/exposure` returns the calculated view. `POST /api/composition/refresh` uses the existing same-origin mutation protection. No source URL, credentials or account data are accepted from the client. The adapter requests a fixed public HTTPS URL without credentials or redirects, with a 20-second deadline and a 2 MB response limit. Automatic refresh runs only when the pilot is owned and the previous attempt is at least a day old; manual refresh is available in the UI. Shutdown cancellation permits a retry on restart. Composition attempts have independent correlation IDs, safe diagnostics and a storage-failure warning.

SQLite schema 5 adds composition evidence and last-attempt tables. Raw HTML plus retrieval time is retained for the latest successful source; decoding that evidence on read reproduces the composition offline. Failed refreshes preserve it. Raw evidence is not served as executable HTML or included in diagnostics. The database retains the prior broker tables. Before applying schema 5 to an existing database, stop older Prism processes and make a SQLite-consistent backup; older versions cannot open schema 5. Recovery uses that backup, not a destructive down migration.

[Source terms](https://www.justetf.com/documents/justETF_general_terms_and_conditions.pdf) are linked in the view. This is a local composition pilot, not a redistribution license. Real source pages and portfolio reports stay in private local storage; repository fixtures are synthetic. Wider data reuse and a full issuer composition remain separate work.

### Replay and browser checks

From the project directory, with a private copied database:

```sh
pnpm --dir v2 exec tsx tests/composition-replay.ts /absolute/private/portfolio.sqlite /absolute/private/replay.json --refresh
pnpm --dir v2 exec tsx tests/composition-replay.ts /absolute/private/portfolio.sqlite /absolute/private/offline-replay.json
PRISM_V2_URL=http://127.0.0.1:4311 node v2/tests/exposure-smoke.mjs
PRISM_V2_URL=http://127.0.0.1:4311 PRISM_V2_REAL=1 node v2/tests/exposure-smoke.mjs
```

The replay runner never authenticates to the broker. `--refresh` acquires public composition and requires the pilot in saved positions; omit it for offline replay. It checks every contribution, priced-value conservation and restart equality, then writes a private report. Its Decimal.js cross-check uses the same library; it is not broker reconciliation.

The exposure smoke runner uses synthetic composition and mocked API responses by default. It requires a server with saved composition only in real mode. `PRISM_V2_REAL=1` uses the actual local API and triggers one public composition refresh; run it against a copied database with `auto_restore` disabled to isolate it from broker access. Screenshots under ignored `v2/test-results/` may contain private portfolio values in real mode. Both older smoke scripts now honor `PRISM_V2_URL` and mock their data before navigation.

## Valuation admission and saved outcomes

Only positive supported positions enter the priced ownership denominator. Negative source quantities remain visible with an unsupported warning; they do not create negative unresolved value or inflate coverage. A zero quantity contributes zero without a quote and does not count as a missing valuation.

The latest snapshot history establishes when each account/security quantity was first observed unchanged. A quantity change, disappearance or unknown history resets that boundary. A quote before the boundary cannot value that position, even if retrieved recently. An unchanged quantity can still use an older compatible quote with the existing age warning. This is a conservative admission rule, not corporate-action detection. Missing compatible quotes remain unknown.

The existing snapshot rows retain this evidence across restart; no new database schema is introduced by the integration fix. Operation diagnostics retain the saved snapshot ID/time, source outcome IDs/statuses and valuation refresh result. A cancellation or failure after holdings commit preserves those holdings and reports what completed. The UI also shows saved partial/failed/cancelled valuation outcomes after restart. Diagnostic retention remains bounded; it is not an unlimited operation journal.

For isolated synthetic browser checks, run `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4397 --strictPort` from `v2/`. Run each of the three smoke scripts from the project directory with `PRISM_V2_URL=http://127.0.0.1:4397`. Synthetic mode uses mocked API responses and needs no broker process, credentials or database. Only explicit `PRISM_V2_REAL=1` uses saved API data for the exposure smoke.
