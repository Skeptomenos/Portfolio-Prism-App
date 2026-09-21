# Portfolio Prism V2 — local portfolio preview

Portfolio, Breakdown and Development show priced allocation, unassigned value, unvalued positions, company-grouping limits and source dates before results. Detail pages use a compact portfolio summary with explicit scope. Security detail then puts the saved investment subtotal and contribution table before source explanations. ETF rows use saved position names (including known currency/distribution class), falling back to a retained source name or ISIN. Keyboard-accessible evidence disclosures retain account, exact values, quote timestamp/age/quality and per-fund composition provenance. Mobile rows stack without hiding distinguishing names. Presentation does not change calculation or source admission.

For saved-data UI-only comparisons, run `node v2/tests/compare-exposure.mjs BASELINE_URL CANDIDATE_URL`. It compares the complete exposure response except that additive name field; both previews must use the same saved fixture. No refresh is performed.

Local TypeScript/Effect backend, React/Vite interface and SQLite storage. It connects to Trade Republic, stores position snapshots and source data, and estimates supported position values from saved broker bid quotes. The exposure view combines direct stocks with six reviewed, retained iShares compositions and preserves the original top-ten pilot as a recovery input. The Development view also retains Amundi's dated substitute basket as inspection evidence; it is not economic exposure.

See the [project index](../index.md) for the delivery plan and task-specific references.

## Run

Requires Node.js 22.13 or newer and pnpm. From the Portfolio Prism directory:

```sh
pnpm --dir v2 install --frozen-lockfile
pnpm --dir v2 dev
```

Open http://127.0.0.1:4310. Enter your phone number and PIN in the local interface, then approve the login in the Trade Republic app. Do not put credentials into terminal commands or issue reports. The PIN is not saved. Session cookies are stored with `@napi-rs/keyring` in the system credential store. Access to that store may prompt on macOS.

The service refreshes on startup and every 15 minutes while running. Broker login is unofficial and may fail if the upstream protocol or access requirements change. Live authentication and response compatibility require verification on the user's account. A failure before the holdings commit preserves the prior holdings; this implementation does not attempt to bypass broker challenges.

`PRISM_V2_PORT` changes the loopback port. `PRISM_V2_DATA_DIR` changes portfolio storage; default is `~/.portfolio-prism-v2`. `PRISM_V2_EVIDENCE_DIR` optionally points to a private retained-source directory used by the Development view; evidence is read only and is never bundled into the application or admitted to calculation by being displayed. V1 data and credentials are not imported. Successful snapshots are retained locally for replay; this preview has no automated retention cleanup. Protect backups of this directory as financial data.

Disconnect keeps portfolio history, clears the broker session and disables automatic reconnection until a successful login. If credential deletion fails, the UI reports it and automatic reconnection remains disabled across restart.

For a saved-data preview, set `PRISM_V2_OFFLINE=1` and point `PRISM_V2_DATA_DIR` at a SQLite-consistent private copy. Offline mode suppresses startup and periodic broker/composition refresh. It is not a read-only sandbox: explicit login, extraction and refresh controls remain available. Do not use those controls during offline acceptance.

## Contributor package

The [repository-local SDK](../docs/plugin-sdk.md) documents implemented extension contracts, registration, version/replay limits and public Operate/Extend skills. `pnpm --dir v2 conformance` reuses capability-specific synthetic suites. `pnpm --dir v2 example:check` verifies a synthetic provider through admission, SQLite reopen and a useful registered panel; `pnpm --dir v2 example:source` opens an isolated temporary-data demonstration. Run these from the project root. No private plan or captured portfolio is required. Live issuer/broker acceptance and actual split publication remain separate gates.

## Checks

```sh
pnpm --dir v2 check
pnpm --dir v2 test
pnpm --dir v2 build
```

Playwright is a pinned V2 development dependency. Install its browser with `pnpm --dir v2 exec playwright install chromium`. With the local service running, `node v2/tests/browser-smoke.mjs` tests the UI with synthetic responses. It does not authenticate to the broker. Run `node v2/tests/explorer-smoke.mjs` for holdings sorting, valuation coverage and source exploration, and `node v2/tests/exposure-smoke.mjs` for synthetic exposure failure/recovery. Set `PRISM_V2_URL` to the running service origin. Screenshots go to ignored `v2/test-results/`.

Run `PRISM_V2_URL=http://127.0.0.1:4312 node v2/tests/development-smoke.mjs` against an offline server configured with the private retained evidence directory and a copied saved database. This acceptance fixture expects seven specific held ETFs and the saved IUSA top-ten pilot. It checks counts, source-row inspection, skip-link focus, detail links, filter/sort/page restoration, remembered security sections, contribution follow-through and 320/390px layout. It does not log in or refresh sources. `pnpm --dir v2 exec tsx tests/development-errors-smoke.ts` starts an isolated synthetic server to check hash mismatch, wrong-fund identity, missing receipt, malformed JSON and contextual attributes without security identifiers. It never reads private source files; `--serve` leaves that synthetic server on port 4314 for manual inspection.
Run `PRISM_V2_URL=http://127.0.0.1:4328 node v2/tests/amundi-inspection-smoke.mjs` against an offline server configured with a private copied SQLite database containing an accepted Amundi inspection. It checks the exact API source/date, all reported basket rows for the saved publication, the partial benchmark scope, fraction units, unresolved gaps and the absence of security/economic links. `PRISM_AMUNDI_REPLAY_DB=PRIVATE_DB pnpm --dir v2 exec tsx tests/amundi-live-replay.ts` performs the bounded direct POST into a private SQLite path and reopens the same database for offline replay; raw response bytes remain in that private database and are never committed.

The development launcher serves Vite and the API on one loopback origin. It is not a hosted deployment or a finished desktop installer. The build verifies the frontend bundle; `dev` remains the current launcher.

## Wiki

Open **Wiki** in the desktop sidebar or compact navigation menu (`#/wiki`). It embeds the canonical [architecture map](../docs/architecture-map.html), with shortcuts to the application, pipeline, plugins, remaining gaps and sources. **Open full page** opens the same interactive guide separately. Wiki presents dated documentation; Development owns live portfolio progress.

The explicit public catalog is `wiki-pages.ts`. `wiki-assets.ts` serves those HTML pages in development and includes them in the Vite build. Referenced public Markdown and code files are bundled as plain-text sources that open separately. Private planning, databases and evidence are never scanned or bundled. The standalone HTML remains the content owner; no second copy is maintained. The embedded document is sandboxed without same-origin access. Wiki needs no broker login or API connection and does not poll portfolio endpoints.

The project `AGENTS.md` is intentionally public contribution guidance and can appear in the source references. Vite development and preview return 404 for missing or disallowed Wiki assets; preview reads emitted files, never replacement content from the working checkout. A future static host must likewise exclude `/wiki-assets/` from its SPA fallback.

Validation: `pnpm --dir v2 exec vitest run tests/wiki.test.ts tests/wiki-preview.test.ts` checks public packaging, reference boundaries and actual built-preview HTTP responses. Browser acceptance covers the Wiki menu, direct URL/reload, section links and Back, interactive controls, local sources, full-page mode, keyboard navigation and 320px layout. Repeat against `pnpm --dir v2 exec vite preview` after a build to verify the static artifact without an API service.

## Development overview

The **Development** route is the evidence-gated progress view. It has six expandable stages: import and reconcile the portfolio; acquire a full dated composition for every held ETF; qualify composition semantics; resolve securities to companies; calculate compatible exposure; and verify and maintain the result. Connectivity, saved data, source freshness and development progress are separate states. The interface intentionally has no overall completion percentage.

When `PRISM_V2_EVIDENCE_DIR` is configured, the route reads the exact held-fund artifacts and the dated manifest from that private directory. It shows source URLs, composition dates, verification dates, row counts, identifiers, hashes and blockers. Six reviewed iShares full-holdings sources can be imported offline for the explicitly labelled issuer allocation measure below. NQSE uses an underlying-weight equity estimate; its class hedge adjustment is unknown and is not included in the numerical remainder. Amundi's exact direct POST response is persisted separately as a typed inspection observation: its signed substitute-basket fractions and ten-row `INDEX_TOP10` benchmark view remain outside calculation, because indirect unfunded-swap economics and the dated swap/benchmark allocation basis are not established. The saved justETF top-ten pilot remains its recovery source. Technical admission does not close operational reuse or full economic/NAV gates. `GET /api/development` returns the register and `GET /api/development/etf/:isin` returns retained rows for one exact held fund.

Inspectable acquisition requires a matching manifest hash and provider product identity. Legacy responses without identity require a separately hashed receipt binding the exact payload bytes to an allowlisted official product URL. Rejected, unreadable and unbound evidence shows a diagnostic and does not count as acquired. Country, exchange and currency are contextual attributes, not security identifiers; valid ISIN and source-ticker coverage are shown separately. Reported weights retain their source units: iShares percentages remain percentages, while Amundi basket weights remain signed fractions. Composition ranges exclude verification dates.

The shared bundled registry owns plugin identity, version/host compatibility, typed composition/inspection/view contributions, lifecycle state and decoder lookup. The host controls bounded HTTP operations and cancellation. Core owns source validation, identity admission, SQLite persistence, replay and exposure selection. Disabled or incompatible plugins cannot acquire new data. Accepted evidence remains retained; disabling acquisition alone does not prevent replay through a compatible retained decoder. Missing or incompatible decoders produce a replay warning. View metadata has separate server and browser entrypoints. Portfolio, Breakdown, Development, their financial details, Explore, History, Wiki, Amundi inspection and Contribution mix now use explicit browser registration. Financial consumers use the validated `portfolio-financial/1` read boundary. Contribution mix declares its method and exact live input content ID while preserving canonical coverage, source dates and unknowns. See the [financial view contract](../docs/financial-view-contract.md) for endpoints, lifecycle boundaries and copied-data/browser checks.

**Your ETF data** separates data saved, datasets checked for calculation and ETFs actually used. The matrix shows included and unassigned monetary values from the selected calculation, with causes and next actions in expandable rows. Unknown values appear first; remaining rows sort by unassigned amount within currency. Pending checks are distinct from failed checks. Source evidence and the six delivery stages remain available below.

`GET /api/coverage` is a core read projection of the same valuation, exposure and fund-register inputs. It retains decimal strings, currency groups, selected source hashes and original dates. It adds no composition and performs no refresh. The shared summary polls this endpoint and retains the last successful response with a visible warning on failure. Source changes also reload the selected fund detail. Non-equity source rows do not yet establish a compatible monetary split, so their value remains unassigned; `nonCompanyValue` stays unknown. Even 100% priced allocation does not close unvalued positions, company grouping or broker reconciliation. See the [coverage contract](../docs/exposure-coverage-contract.md).

ETF detail leads with the saved holding value, source/date summary and next action. Technical evidence is collapsed. For six registered exact fund contexts, the `illustrative` API field provides row values with an explicit per-row state. Rows matching the selected full source hash/date, security identity, weight and actual same-currency Breakdown contributions are marked `included`; other eligible values remain `conditional` and outside totals. Conditional values use: unrounded saved ETF value × reported percent ÷ 100. This assumes whole-published-portfolio percentage weights; it does not qualify the source or change Breakdown totals. Same-currency account values are combined only if every nonzero account position has compatible pricing and a quote date. Mixed currencies, missing valuation, duplicate accounts, negative holdings, unverified sources, missing dates/ISINs, invalid weights, non-equity rows and unsupported hedged underlying-only data suppress the amount with a reason. Row trading currency does not cause another FX conversion. Monetary display rounds to two decimals; the API preserves precision. Bars compare eligible equity weights with the largest equity weight in that fund and retain their scale while filtering.

Breakdown gaps are portfolio-wide even when a security is selected. Retained-but-unchecked fund data has a specific pending reason and a link to its source detail. Conditional previews, source-qualified allocation estimates actually included by a calculation adapter, and exact NAV/economic reconciliation are different measures. The retained issuer importer below admits the six reviewed sources; inspection alone never admits a source. Run `PRISM_V2_URL=http://127.0.0.1:4312 node v2/tests/etf-clarity-smoke.mjs` on the same private offline fixture for the World → NVIDIA → Breakdown journey, exclusions, unchanged totals, responsive layout and synthetic ready/failed states.

Portfolio leads with valued securities, separate cash and visible gaps. The connection summary beside them shows Trade Republic connection state, the last successful sync and Connect & sync / Sync portfolio. Saved holdings remain useful while disconnected. **Data & connections** preserves the `#/data` route and puts the connection form first; broker extraction and diagnostics sit under **Advanced data**. Login imports automatically after phone approval; no second sync is needed. Failure/partial outcomes keep the committed data boundary visible and offer Retry sync or Reconnect & sync. Portfolio sync, ETF composition refresh and advanced extraction are separate operations.

`GET /api/status` separates `connected`, `activeOperation`, `automaticRefresh`, `lastPortfolioAttempt` and `lastSuccessfulSyncAt`. The last two derive from terminal portfolio diagnostics, not extraction events or the snapshot date. A failed/partial attempt does not advance the successful-sync time. They persist across restart within the existing 1,000-event diagnostic retention; older records without terminal metadata or pruned history display **Not recorded**, not a guessed success. Offline previews explicitly report automatic refresh disabled; manual controls remain available.

Portfolio, Breakdown and Explore remain primary navigation, with Data & connections and Development separate. `#/home`, `#/fund/:isin` and `#/security/:isin` provide dedicated destinations. Search, sort, page and section state live in the URL; Back restores investigation context. A fund's saved pilot contribution can be followed into combined exact-security exposure with the source contribution highlighted. Only selected qualified compositions supply monetary exposure. Bounded Alphabet A/C and HEICO common/Class A equity-class relationships are available; a general company resolver, fundamentals and other researched relationships remain unavailable.

At widths up to 900px, navigation is one 64px sticky row: compact Prism branding and a current-page Menu button. Its disclosure contains all destinations, with the active destination marked. Escape returns focus to the button; selecting a route, clicking outside or tabbing out closes the disclosure. Above 900px the sidebar stays pinned, with its own scrolling when viewport height is limited. Skip-to-content and route focus keep headings clear of the sticky bar. Run `PRISM_V2_URL=http://127.0.0.1:4312 node v2/tests/header-smoke.mjs` against the saved-data preview for breakpoint, scrolling and keyboard regression checks; private screenshots stay in ignored `v2/test-results/sticky-header/`.

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

A failed individual instrument or quote read retains one unambiguous saved observation, with its original quote timestamp and a visible latest-refresh-failed warning. On a first import with no saved observation, only that instrument remains unavailable; successful rows before and after it are saved and the source is partial. Fresh successful reads replace failed or retained rows. An older retained quote cannot value a newly changed quantity.

The main **Your holdings** table now joins broker positions, instrument listings and saved bid quotes. Prism values stocks/funds only when the reference ISIN matches, the quoted venue has an active listing with a declared currency, and the instrument price factor is 1. Other pricing conventions stay unvalued. Arithmetic uses Decimal.js; display rounds monetary amounts to two decimals. The unrounded decimal result remains in the overview API. Bid timestamps older than 24 hours are marked; quote quality codes are not yet interpreted, and these estimates are not execution prices.

Subtotals are grouped by currency. Cash remains separate, and duplicated cash-account records are rejected. Percentages use only priced securities in the same currency, excluding cash and unsupported positions; incomplete coverage is explicit. Average buy-in remains a broker field with unreconciled currency conventions, so profit/loss is deferred. Login/startup/periodic/manual holdings refresh also refreshes the valuation input sources; full personal/tax/document/history extraction stays separate. No external enrichment is used in the valuation view.

Run `node v2/tests/explorer-smoke.mjs` against the running service for a synthetic UI check. It intercepts all data and extraction calls, checks source fields, failure notes, filters, sorting, provenance and mobile overflow, and saves synthetic screenshots under ignored `v2/test-results/`.

## Company exposure pilot

The exposure UI derives source labels from the selected composition scope. A `full-holdings` source with `issuer-reported-allocation-estimate` is labelled as an included issuer allocation estimate, not a top-ten pilot, illustrative preview or exact NAV reconciliation. Source-provided local-use findings and non-equity accounting remain visible separately. The top-ten refresh action is hidden for a selected full source because that endpoint cannot refresh issuer data. The synthetic exposure smoke covers both source modes, missing operational evidence and mobile layout; this presentation support does not itself add an issuer adapter.

The original recovery pilot covers direct stocks and one owned physical ETF: **IE0031442068, iShares Core S&P 500 UCITS ETF USD (Dist)**. It uses the [justETF profile](https://www.justetf.com/en/etf-profile.html?isin=IE0031442068), because the tested issuer downloads were inaccessible. The first verified response was dated **2026-07-30**, disclosed **37.11%** in ten holdings and left **62.89%** undisclosed. These are dated observations, not guaranteed current coverage.

The adapter validates the page's fund ISIN/name, holdings date, explicit percentage units, top-ten row count, total weight and constituent ISIN checksums. Equity identity comes from the source's stock-profile links. Duplicate identities, malformed weights, mismatched funds and impossible/future dates fail closed. Rows without a valid stock-profile ISIN remain unresolved; the original raw response preserves their evidence. Invalid compositions never replace the last good response. A missing date stays unknown when explicitly supplied as a dash; missing/changed markup is a source-format failure. A new composition cannot replace a known date with an older or unknown date.

Prism computes position value × weight ÷ 100 with Decimal.js at 256-digit precision. Values already use the broker listing currency, so constituent weights do not trigger another FX conversion. Direct and indirect amounts join on exact ISIN within each currency. Separate share classes, listings and ADRs remain separate until their relationship is evidenced. Company figures are known subtotals, not complete company totals. The view exposes every contribution and quote date, unknown valuations, the composition date, retrieval time, raw-evidence hash, unresolved rows and priced-value gaps. Cash is excluded from the denominator. Composition older than 30 days or without a known date is labeled stale; failed refreshes remain visible even when saved data is usable.

`GET /api/exposure` returns the calculated view. `POST /api/composition/refresh` uses the existing same-origin mutation protection. No source URL, credentials or account data are accepted from the client. The adapter requests a fixed public HTTPS URL without credentials or redirects, with a 20-second deadline and a 2 MB response limit. Pilot fallback automatic refresh runs only when the pilot is owned and the previous attempt is at least a day old; manual refresh is available in the UI. Shutdown cancellation permits a retry on restart. Composition attempts have independent correlation IDs, safe diagnostics and a storage-failure warning.

SQLite schema 5 adds composition evidence and last-attempt tables. The current writer accepts prior schemas through 10 and migrates additively to schema 11, preserving existing provider evidence and inspection tables. Schema 5 describes the historical pilot migration; schema 11 adds the durable history records described below. Before pre-11 migration, the writer creates an adjacent SQLite-consistent private backup including committed WAL data. Recovery restores that untouched backup to a separate path; an older writer must not open schema 11. Raw source bytes plus retrieval time are retained privately; decoding evidence on read reproduces the composition or inspection observation offline. Failed refreshes preserve accepted data. Raw evidence is not served as executable HTML or included in diagnostics. The database retains the prior broker tables. Before applying schema 5 to an existing database, stop older Prism processes and make a SQLite-consistent backup; older versions cannot open schema 5. Recovery uses that backup, not a destructive down migration.

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

### History boundary

Schema 11 retains immutable financial observations, operation outcomes and saved calculation checkpoints alongside the existing latest-source tables. Checkpoints pin holdings, compatible quotes, cash, selected ETF publications, quantity continuity, identity/policy versions and the calculation clock. They preserve complete unrounded overview/exposure results in integrity-checked compressed manifests. Later syncs, failures or source changes do not rewrite earlier checkpoints. Failed runs can have no checkpoint; interrupted runs retain useful committed results.

Open **History** (`#/history`) → operation → checkpoint to inspect saved values, quantities, cash, source references and gaps. History and the migrated Wiki use the same bundled browser registration contract; the Amundi inspection panel exercises a provider-plus-view path without adding monetary exposure. Financial consumers also use the versioned financial read contract described above. This does not provide an arbitrary plugin loader.

The [versioned history API](../docs/history-api-contract.md) exposes `GET /api/history/runs`, `GET /api/history/runs/:id` and `GET /api/history/checkpoints/:id`. Reads do not fetch new source data or recalculate an old point. Migration creates a baseline from surviving inputs at migration time; it does not attach current prices to older holdings. Complete historical exposure is retained internally, but historical company-contribution read models and interactive charts are still to be implemented. The bounded H2 ledger below normalizes supported saved events; complete statement reconciliation, invested-capital and return calculations remain open in the [history architecture](../docs/portfolio-history-and-performance.md).

For a deliberately bounded transaction-evidence request, `POST /api/history/batch` reads at most one `timelineTransactions` page and 20 `timelineDetailV2` records (four concurrently). It requires the normal same-origin mutation headers and an already connected session. It saves the continuation cursor and retries failed details on a later batch. It does not fetch unrelated source groups, loop automatically, or establish complete account history. The broader `/api/history/continue` operation retains its existing multi-batch behavior.

For copied-data acceptance, run `pnpm --dir v2 exec tsx tests/history-replay.ts PRIVATE_COPY NEW_REPORT.json offline`. Its `exercise` mode deliberately changes only a disposable copy to test later syncs, failures and restart. Never run it against a primary database or another active writer. `PRISM_V2_URL=http://127.0.0.1:4341 PRISM_REQUIRE_AMUNDI=1 pnpm --dir v2 exec tsx tests/history-persisted-smoke.ts` reads an isolated combined preview; screenshots remain private. Synthetic view checks use `pnpm --dir v2 exec tsx tests/history-view-smoke.ts`. See the [history architecture](../docs/portfolio-history-and-performance.md) for what observations can establish.

### Event ledger and bounded acquisition

Open **Transactions** (`#/events`) for retained executed activity, source-reported amounts that cannot yet be booked, precise cash movements, revisions and reconciliation gaps. `GET /api/events` exposes the validated `portfolio-events/1` read model. It does not fetch data. Net purchase/sale cash is labelled separately from gross consideration; displayed fee/tax components are never charged twice. A fully reversed movement remains an evidenced zero, not unknown.

The optional broker `readEvents` capability emits `broker-events/1` batches. Adapters interpret source fields; core validates and stores immutable versions keyed by connection, source event identity and content hash. Re-observing an earlier version changes the selected head without deleting either revision. Cash observations, opaque bounded continuation state and event evidence persist separately from H1 checkpoints. The view receives no raw documents, account numbers, signed URLs or credential context.

Normal sync checks one recent timeline page and at most twenty details. A separate recent cursor closes a gap across later syncs without overwriting the older backfill cursor. **Continue primary history** calls `POST /api/events/backfill`, one older page and twenty details per invocation. Failures preserve compatible evidence and report the attempt plus last successful timeline cutoff; a failed detail refresh cannot attach old details to a revised event. Missing/mismatched response IDs and duplicate detail wrappers cannot contribute quantities or costs. Authentication and cancellation follow the existing guarded broker-operation path.

Trade Republic admission currently supports executed savings-plan purchases, explicitly labelled buy/sell orders, bank cash transfers, card payment/refund cash, interest and corporate-action cash. A confirmed cash-dividend detail supplies the dividend classification. Source `amount.value` is major currency units; `fractionDigits` bounds precision, not a divisor. Source status and signs must agree. Pending/cancelled/failed/deleted activity has no booked effects. Unqualified aggregate rewards/round-ups and other unsupported events remain visible with their reported amount and a gap.

Only explicit retained `accountPairs` evidence links a cash account to its securities account. Missing links stay unknown. Displayed share quantities retain their reported precision; execution and settlement timestamps are not invented. Quantity and cash reconciliation compare dated saved boundaries using evidenced legs and exact decimals. A match remains **matched with gaps** until statement completeness is established. Transfers require an explicit unique pairing reference; matching amounts or account counts are insufficient. API cursor exhaustion does not establish a complete statement period.

Schema 13 adds event versions/heads, acquisition state and cash observations. Migration takes the existing SQLite-consistent `.pre-history-*.sqlite` backup before adding tables; original holdings, observations and checkpoints remain unchanged. Roll back by restoring the untouched backup into a separate data directory with the matching old runtime. Never open schema 13 with an older writer.

Copied-data checks, from the project directory:

```sh
pnpm --dir v2 exec tsx tests/event-ledger-replay.ts PRIVATE_COPY.sqlite PRIVATE_REPORT.json
python3 v2/tests/event-decimal-audit.py PRIVATE_COPY.sqlite
PRISM_V2_URL=http://127.0.0.1:4360 pnpm --dir v2 exec tsx tests/events-view-smoke.ts
```

The replay command requires a quiescent SQLite-consistent copy, verifies original table/checkpoint equality, and writes only to that copy. The browser command requires an isolated offline preview and rejects the primary port. Synthetic fixtures cover revisions, identical amounts on distinct trades, pending/cancelled events, partial acquisition, detail identity, round trips, explicit splits/deliveries/reversals, internal transfers and settlement delay. These checks do not establish complete real-account reconciliation, tax lots, gains or return rates.

### Current valuation behavior

Quotes now use exact active instrument listings: preserve LSX when available, otherwise prefer an explicit primary venue, then BHS/B2C and deterministic same-currency ordering. At most two venues are attempted. Missing, conflicting or inactive listings produce a specific gap; failures retain the original quote venue and timestamp. A retained quote cannot be rebound to a different listing currency.

The narrow Bitcoin profile supports `XF000BTC0017` only when Trade Republic confirms its crypto/legal type, price factor one, an active EUR BHS/B2C listing and an EUR quote receipt. Its per-BTC feed convention was corroborated against a user-observed broker-app quantity/value; this does not reconcile the app's rounded valuation or qualify other crypto assets. Original bid decimals and timestamps value the unchanged observed quantity. Average buy-in never supplies the current price. Unsupported units remain unknown.

Priced Bitcoin is a separate non-company amount. The priced-assets denominator includes it, while company/security contributions and unresolved issuer allocation exclude it. Coverage exposes the amount and separate bar segment; holdings and the crypto detail show the saved bid/date. The compatibility field `pricedSecurities` contains the named priced denominator; a populated `nonCompanyValue` requires the priced-assets label. A lower security percentage after admitting crypto is a denominator change, not a lost company holding. TAAT-like inactive listings stay unvalued with the old quote date and a listing/suspension next action.

New checkpoints pin valuation/calculator policy version 2. Version 1 retains its exact eligibility, diagnostic strings and allocation output for historical replay. The expanded observation decoder accepts old records without crypto units or quote currency; only explicitly qualified new crypto observations can be priced. No database schema change is needed.

Focused checks: `pnpm --dir v2 exec vitest run tests/quote-listings.test.ts tests/quote-acquisition.test.ts tests/crypto-valuation.test.ts tests/history.test.ts tests/identity-history.test.ts`. The offline Decimal audit also checks separately classified crypto and full priced-value conservation. Private quote captures and broker-app observations must not appear in public fixtures.

Only positive supported positions enter the priced ownership denominator. Negative source quantities remain visible with an unsupported warning; they do not create negative unresolved value or inflate coverage. A zero quantity contributes zero without a quote and does not count as a missing valuation.

The latest snapshot history establishes when each account/security quantity was first observed unchanged. A quantity change, disappearance or unknown history resets that boundary. A quote before the boundary cannot value that position, even if retrieved recently. An unchanged quantity can still use an older compatible quote with the existing age warning. This is a conservative admission rule, not corporate-action detection. Missing compatible quotes remain unknown.

The existing snapshot rows retain this evidence across restart; no new database schema is introduced by the integration fix. Operation diagnostics retain the saved snapshot ID/time, source outcome IDs/statuses and valuation refresh result. A cancellation or failure after holdings commit preserves those holdings and reports what completed. The UI also shows saved partial/failed/cancelled valuation outcomes after restart. Diagnostic retention remains bounded; it is not an unlimited operation journal.

For isolated synthetic browser checks, run `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4397 --strictPort` from `v2/`. Run each of the three smoke scripts from the project directory with `PRISM_V2_URL=http://127.0.0.1:4397`. Synthetic mode uses mocked API responses and needs no broker process, credentials or database. Only explicit `PRISM_V2_REAL=1` uses saved API data for the exposure smoke.


## Retained IUSA full allocation import

The narrow offline importer admits the retained 9 September 2026 IUSA evidence for `IE0031442068`. It uses the issuer whole-published-portfolio weight as a labelled **issuer-reported allocation estimate**. It does not establish NAV equality, full economic exposure, source-use permission or unattended retrieval. No new issuer or broker request is made.

First make a SQLite online backup of the intended private database (including committed WAL state) to a separate local path. Do not copy the live `.sqlite` file alone. Keep that untouched backup for recovery and import into another copy. Then run from `v2/`:

```sh
pnpm exec tsx server/qualify-iusa.ts PRIVATE_EVIDENCE_DIR NEW_PRIVATE_REPORT.json
pnpm exec tsx server/import-iusa.ts PRIVATE_EVIDENCE_DIR COPIED_PRIVATE_DB.sqlite
```

The evidence directory must contain the original `manifest-2026-09-11.json`, the two pinned IUSA 20260909 JSON captures and their receipt files. Hashes, exact source route, identity, date, units, row alignment, identifiers and independent repeat agreement are rechecked. Weight-total tolerance is a consistency check, not proof of completeness. Signed equity is rejected by this narrow long-only adapter. A failed import prints a safe attempt ID, stage and resolution; failed qualification does not open the database.

Schema 7 adds `iusa_allocations` without replacing saved portfolio or pilot tables. Raw source bytes, receipts, manifest and parser version persist together. Imports are content-deduplicated; conflicting same-date rows fail. Restart revalidates the retained bundle. Corrupt newer evidence falls back to the last valid issuer version, then to the saved top-ten pilot, with a warning. Restore the untouched backup if reverting the schema; do not run an older binary against a migrated database.

Only valid equity ISIN rows enter allocation arithmetic. Cash, collateral and futures remain in source accounting; no equity normalization or second FX conversion occurs. The selected full source takes precedence over subsequent pilot refreshes. Its UI hides the pilot refresh action. This importer is deliberately pinned to the reviewed publication; future source dates require a separately reviewed extension. Keep reports and original issuer/portfolio data private and out of Git.

## Multiple retained issuer compositions

The offline importer supports the reviewed publications for IUSA (`IE0031442068`, 9 September 2026), Core MSCI World (`IE00B4L5Y983`), IUIT (`IE00B3WJKG14`), CNDX (`IE00B53SZB19`), NQSE (`IE00BYVQ9F29`) and EXXT (`DE000A0F5UF5`), the latter five dated 10 September 2026. It makes no provider or broker request. These pinned profiles do not establish compatibility with later publications.

After making a SQLite online backup, import into a separate private copy from `v2/`:

```sh
pnpm exec tsx server/import-issuer-sources.ts PRIVATE_EVIDENCE_DIR COPIED_PRIVATE_DB.sqlite
# Optionally append one or more registered fund ISINs to limit the import.
```

Both original September 11 manifests, original response pairs and hashed receipts are required. EXXT additionally requires its two CSV responses and retained exact product page with receipt. Replay validates parser/bundle versions, trusted profiles, manifest hashes and sizes, receipt times, exact issuer routes and publication dates, row alignment, explicit weight units, unique equity ISINs, long-only equity and repeat equality. EXXT uses a strict German CSV parser to corroborate the JSON row order, identifiers' context and decimal values. Original numeric tokens remain strings. Signed non-equity rows stay in accounting. No original weights are normalized.

Schema 8 stores evidence and latest import attempts independently for each fund. Failed replacement preserves that fund's last valid input and other funds' selections. Corrupt newer evidence falls back to the prior valid version with a warning; IUSA can also recover its original schema-7 issuer bundle or top-ten pilot. Imports deduplicate by fund and body hash, reject same-date row conflicts and preserve original retrieval times across restart. Recovery from migration uses the untouched backup; do not open schema 8 with an older binary.

`GET /api/exposure` adds `compositions`, per-contribution `source`, per-fund `sourceAttempts`, `directStockCoverage` and `issuerGroups`. The legacy singular `composition` field remains for compatibility. Calculations use each account's saved ETF value and that fund's original percentage. Exact security ISINs aggregate only within a currency. Source date, receipt time, hash, allocation measure and staleness remain attached to each ETF contribution. Fund rows link to the matching highlighted contribution. Direct-stock coverage includes unvalued positions and matches only selected sources for currently held positive ETF positions; saved sources for sold, absent or negative positions cannot imply a portfolio contribution. Unmatched identifiers are not evidence of absence.

The versioned Alphabet relationship binds only `US02079K3059` (Class A) and `US02079K1079` (Class C) to SEC CIK `0001652044`, using exchange ISIN records and the registrant's SEC 2026 Q2 cover. It projects their existing monetary subtotals per currency, without altering securities, quantities, contribution lines or portfolio totals. It does not infer relationships for other share classes, ADRs, preferred stock, debt or similarly named companies. The record includes source URLs, exchange capture hashes and the distinct SEC web-read method.

The HEICO relationship binds only `US4228061093` and `US4228062083` to LEI `529900O1DTDLCJ7L0I14`, using the retained 2026-09-05 GLEIF ISIN mapping and SEC share-class corroboration. The retained LEI registration was lapsed and non-conforming; this is dated relationship evidence, not a current registration claim. Both relationships preserve independent securities and monetary totals. New checkpoints pin the versioned relationship set; earlier Alphabet-only checkpoints retain their original policy and replay result. Unknown or mismatched policy evidence disables replay.

NQSE is included through a labelled issuer-reported equity allocation estimate. Its class hedge adjustment remains unknown and is not included in the numerical remainder; no class-to-underlying factor, weight rescaling or USD-to-EUR row conversion is applied. Amundi is retained as inspection evidence only: its substitute basket does not establish swap economics, benchmark allocation or company exposure. Non-equity economics, exact NAV reconciliation, broader issuer relationships and source-use permission remain open. Automatic retrieval for the six supported allocation-estimate funds and the separate Amundi inspection are described below.

**Development → NQSE → How approximate is this allocation?** displays a dated historical hedge/class-value reference and a hypothetical relative adjustment to the included ETF allocation. Security contribution tables expose the same sensitivity for that NQSE contribution only. These explanatory controls never change portfolio totals, stored history or source admission. The current error margin stays unknown; the historical figure is not a bound. See the [coverage contract](../docs/exposure-coverage-contract.md#estimate-uncertainty).

The retained `multi-etf-smoke.mjs` script covers the earlier five-source fixture. For the current NQSE increment, run `PRISM_V2_URL=http://127.0.0.1:4330 pnpm --dir v2 exec node tests/nqse-allocation-smoke.mjs AUDIT.json` against the same private offline copied fixture; it verifies selected NQSE contributions, residual/source/date visibility, Breakdown, restart-backed totals, responsive layout and no mutations. Both scripts perform no source or broker writes. Synthetic parser/store tests require no private files. Vite's development WebSocket shares the selected HTTP server so parallel previews do not compete for a default port.

## Automatic bundled iShares provider

DEV-255 connects one reviewed composition provider to direct HTTP discovery, core admission, SQLite selection and the existing exposure views. The bundled provider now supports six exact profiles, including the NQSE held-class estimate. The historical importers remain available for replay and recovery; their pinned-date restrictions do not govern this new acquisition path.

Normal refresh needs neither browser navigation nor an LLM. The provider reads the product page's selected **holdings** date, binds its exact fund/product/share class and fetches the matching columnar JSON. EXXT additionally binds the selected holdings date to its dated German CSV and verifies every JSON/CSV row. NAV dates and date-menu maxima are never publication discovery inputs. JSON numeric tokens, signed non-equity rows, source units and whole-published-portfolio basis remain unchanged. Core admission supports the existing issuer-reported equity allocation estimate; it adds no NAV-reconciliation prerequisite.

Use **Data & connections → Refresh held funds** for a manual refresh or **Cancel refresh** to stop pending work. Each held supported fund has an independent saved outcome, timestamp, diagnostic reference and resolution. Normal startup and 15-minute scheduling check eligible funds; each fund is attempted at most once per day automatically, except cancelled work can retry. Manual refresh bypasses that daily throttle. `PRISM_V2_OFFLINE=1` suppresses startup/periodic requests; explicit manual issuer refresh still works against a copied database.

In normal mode, each successful holdings commit also checks newly held supported funds immediately. If a provider batch is already running, one queued automatic pass re-reads the latest holdings afterward and applies the same per-fund throttle. Cancel and shutdown discard queued work. Offline mode suppresses this post-import automatic check too.

### Bundled Amundi inspection provider

The Amundi provider uses the fixed public `POST https://www.amundietf.de/mapi/ProductAPI/getProductsData` route with the exact `FR0010361683` request context and composition fields established by the source investigation. It runs browser-free through the host's bounded POST context, retains the original response bytes and request hash, and admits only the typed inspection contract. The parser binds the fund ISIN and publication date, preserves the actual reported row count, validates valid unique equity ISINs, keeps signed cash/non-equity rows, and retains fraction strings without converting them to percentages.

The 2026-09-16 evidence returned 103 substitute-basket rows (102 equities and one signed cash row) and a separate ten-row `INDEX_TOP10` partial benchmark. The basket is not an economic index allocation, and the benchmark list is not complete exposure. Counterparty names and `Indirect (Unfunded swap)` replication do not establish a dated swap allocation ratio. This source therefore appears in Development only; `selectedCompositions()` and exposure never consume its rows.

Amundi replay enforces the same exact source URL and reviewed request contract as acquisition, including requested fields and retail context. JSON whitespace and object-key order may vary when the original request hash is valid. Same-date inspection revisions compare rows plus displayed fund, replication, benchmark, counterparty and source-limit metadata. Changed semantics produce a conflict and preserve the accepted observation; response formatting and retrieval metadata alone do not create a revision. Fund detail shows the saved ETF position value, account count and quote dates independently from constituent eligibility. Inspection pages omit constituent monetary calculation guidance and require complete economic constituents, or a full benchmark plus evidenced swap allocation and residual treatment, before economic admission can be considered.

The same-origin protected commands are `POST /api/compositions/refresh` and `POST /api/compositions/cancel`; `GET /api/compositions/status` returns progress and saved outcomes. Clients cannot supply a source URL. Public requests use the fixed iShares HTTPS route families, no cookies/credentials or redirects, a 25-second request deadline, five requests per fund and a 90-second per-fund deadline. Holdings/CSV responses are limited to 3 MB; product HTML permits 5 MB because the verified IUSA and World pages exceed 3.6 MB. These trusted bundled modules are not a sandbox for arbitrary installed code.

Schema 9 adds provider evidence and per-fund attempts without removing schema-7/8 records. Schema 10 adds a separate `provider_inspections` table; it never mixes inspection observations with economic compositions. It saves original payloads, URLs, retrieval/publication dates, SHA-256, provider/contract/parser versions and `issuer-allocation/1` policy version where applicable. Replay revalidates all evidence before selecting it. A later valid publication replaces that fund only. Same-date identical composition rows are unchanged even if surrounding metadata changes; inspections also compare their semantic metadata as described above. Unchanged evidence creates no new record or retrieval-time rewrite. An admitted full composition supersedes a same-date top-ten recovery source, which remains saved for recovery. Same-date changes to an already accepted full composition or inspection observation are a conflict requiring review; older dates, malformed/partial/duplicate sources and cancellation cannot replace last-good data. Corrupt or incompatible newer evidence remains retained and falls back to the same fund's prior valid source with a diagnostic. Contribution provenance includes the selected provider/parser/policy versions.

Before using this schema on existing data, make a SQLite online backup and use a separate copy for acceptance. Never open a migrated database with an older writer; recover from the untouched backup. Private original evidence remains in the local database and is not included in public fixtures or raw API responses. Public accessibility and technical admission do not establish source-use or redistribution rights; private retrieval/retention permission remains recorded as unsettled.

Explicit acceptance utilities, from `v2/`, require a private copied database and new report paths:

```sh
pnpm exec tsx tests/provider-live-replay.ts COPIED_DB NEW_REPORT.json refresh
pnpm exec tsx tests/provider-live-replay.ts COPIED_DB OFFLINE_REPORT.json offline
# Run after the replay utility closes the copied database:
python3 tests/provider-decimal-audit.py NEW_REPORT.json COPIED_DB NEW_AUDIT.json
# Controlled HTTP failure and cancellation on a separate saved-data copy; no network:
pnpm exec tsx tests/operational-recovery.ts FAULT_TEST_COPIED_DB RECOVERY_REPORT.json
```

The Python audit independently checks original source weights, every valued contribution and priced-value conservation with Decimal arithmetic. NQSE hedge economics, Amundi swap/benchmark economics, broader company identity, non-equity economics, source-use permission and phase-one broker reconciliation remain separate open gates.

For copied-data UI acceptance, from the project directory run `PRISM_V2_URL=http://127.0.0.1:4319 node v2/tests/provider-smoke.mjs PRIVATE_AUDIT.json PRIVATE_SCREENSHOT_DIR`. It compares the selected results with the independent audit and checks provider outcomes, fund → security → Breakdown navigation, exact provenance, 320/390px layout and absence of mutations.

## Connection-scoped broker inputs

Broker contributions register through the shared plugin descriptor. A broker declares its identity/version, authentication fields and restore/approval capabilities. Trade Republic remains the bundled live connector; the independent ledger connector is a synthetic conformance fixture, not a supported brokerage integration.

The adapter translates wire formats and upstream errors. The core receives account-scoped holdings and typed instrument, quote and cash observations. It owns completeness admission, quantity continuity, valuation and persistence. A partial holdings response cannot replace accepted holdings. An empty response requires explicit authoritative-empty scope and confirmed accounts. Each connection values its own observations before cross-connection totals are combined; matching ISINs cannot borrow another connection's quote. Decimal strings remain exact and unknown cash remains unknown.

Schema 12 adds connection identities, append-only holdings and financial-observation journals. The existing default Trade Republic connection retains its H1 identity, saved snapshots, explorer data and credential-store alias. New connections receive separate credential-store entries. Disabled or unavailable connectors preserve saved data and replay. Recovery uses the pre-migration SQLite backup; never open schema 12 with an older writer. Connection-manifest checkpoints pin the connection inputs and retain the older H1 replay path.

**Data & connections → Saved connections** shows connection availability, saved holdings dates and operation problems. The legacy Trade Republic controls and financial HTTP responses remain compatible. Additional same-origin APIs are `GET /api/connections`, `POST /api/connections` with a registered `providerId`, and `POST /api/connections/:id/{authenticate,sync,restore,cancel,disable,enable,logout}`. Authenticate accepts only that connector's declared fields; other commands accept an empty object. Commands use the existing origin, JSON-content and bounded-body guards. Connection creation and generic authentication forms are API capabilities; the UI currently exposes the existing Trade Republic form and a read-only connection list.

Run synthetic connection checks with `pnpm --dir v2 exec vitest run tests/broker-connections.test.ts tests/connection-contract.test.ts`. For fault/restart acceptance, first take a private online backup, then from `v2/` run `pnpm exec tsx tests/broker-connection-replay.ts PRIVATE_DISPOSABLE_COPY NEW_REPORT.json`. This deliberately adds a synthetic ledger connection and exercises failures on the copy. It does not contact a provider or access system credentials. Real Trade Republic login → refresh → restart remains a separate live gate; synthetic compatibility does not close it.
