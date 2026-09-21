# Portfolio Prism

Understand what you own across direct stocks and ETFs, with a source for each contribution and a visible explanation of what is still missing.

**The active application is V2, under `v2/`: TypeScript/Effect, React/Vite and SQLite.** Start with the [interactive architecture map](docs/architecture-map.html) to explore the application, data pipeline and extension boundaries. Download the HTML and open it locally; it needs no server or network connection.

## What works today

- Connect to Trade Republic through its unofficial API client and retain portfolio snapshots locally. Inspect positions, cash, saved broker quotes and diagnostics.
- Acquire full holdings for supported iShares funds through bounded direct HTTP requests. Normal refresh needs neither a browser nor an LLM. Core checks fund identity, dates, identifiers, units and weight basis before using a source.
- Combine direct positions with supported ETF allocations by exact security ISIN. Each contribution retains its fund name, source, composition date and valuation evidence. A reviewed Alphabet A/C relationship also supports a bounded issuer subtotal; general company resolution remains unfinished.
- Keep the last good source after a failed refresh and replay saved evidence after restart. Show supported allocation, unassigned value, unvalued positions and source freshness before results.

An issuer allocation estimate is not complete company exposure or full economic/NAV reconciliation. Hedged classes, synthetic funds, non-equity rows, identity relationships and broker valuation reconciliation have separate evidence requirements. The [runtime guide](v2/README.md) owns exact support and commands; the [project index](index.md) routes to delivery status.

## Run and verify

Requires Node.js 22.13 or newer and pnpm. From this directory:

```sh
pnpm --dir v2 install --frozen-lockfile
pnpm --dir v2 dev
```

Open http://127.0.0.1:4310/. See the [runtime guide](v2/README.md#run) for storage, alternate ports, offline previews and connection handling, and [checks](v2/README.md#checks) for validation. Root-level package scripts belong to the retained legacy application.

## Data and trust

Portfolio history and source evidence stay in local SQLite; broker sessions use the operating system credential store. Network access is needed to connect and obtain new broker or issuer data. Offline replay reads saved evidence and does not make prices fresh. Never put credentials or private portfolio records into logs, issue reports or public fixtures.

Missing exposure is unknown, not zero. Partial weights are not rescaled to 100%. Results retain separate currencies and quote dates. The [coverage contract](docs/exposure-coverage-contract.md) defines what each coverage measure means and which gaps must remain visible.

## Extend the application

The [plugin architecture](docs/plugin-architecture.md) defines one shared plugin identity with typed broker, composition, enrichment, analytics and view capabilities. Core owns financial validation, identity, exposure and persistence. The common model, second provider and broader view/broker contracts are being delivered incrementally; a public plugin SDK, general loader and marketplace are not available yet.

## Find the right document

| Need | Start here |
| --- | --- |
| Understand the system visually | [Architecture map](docs/architecture-map.html) |
| Run, configure or verify the application | [Runtime guide](v2/README.md) |
| Find the current plan or a document owner | [Project index](index.md) |
| Contribute code | [Contributing](CONTRIBUTING.md) and [agent instructions](AGENTS.md) |
| Investigate the old implementation explicitly | [Legacy archive](docs/v1/index.md) |

The legacy `src/`, `src-tauri/` and `infrastructure/` trees are preserved for research and recovery. Their Python/Tauri/Supabase setup does not govern V2. Private `_planning/` documents are omitted from the public split; public setup and architecture documents remain usable without them.
