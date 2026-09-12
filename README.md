# Portfolio Prism

Portfolio Prism helps you understand which companies you own across individual stocks and ETFs. A company can appear in several funds as well as in a direct holding. Prism aims to combine those contributions so you can see concentration and shape your portfolio around your intentions.

## Current implementation

V2 is a local browser application under `v2/`. It connects to Trade Republic through an unofficial API client, stores holdings and broker source data locally, and shows sortable holdings with estimated values, quote dates and explicit coverage gaps. Cash is shown separately. Local diagnostics explain failed operations without recording credentials.

The one-ETF pilot combines direct stocks with dated, partial holdings from the iShares Core S&P 500 UCITS ETF USD (Dist). It shows each contribution, source, date and unresolved remainder. Other ETFs and cross-share-class company aggregation remain unsupported. The [project index](index.md#separate-ongoing-work) routes ongoing acquisition and reference design work to their separate branches. The current preview is not a completed portfolio analysis release; broker valuation reconciliation and daily-use acceptance remain open.

## Run and test

Use the [V2 setup guide](v2/README.md) for requirements, startup commands, checks, storage and diagnostics. V2 requires Node.js 22.13 or newer and pnpm. The default local URL is http://127.0.0.1:4310/.

The backend uses TypeScript and Effect. The interface uses React and Vite. SQLite stores portfolio data, and the operating system credential store holds the broker session. Customized shadcn/ui and restrained Motion are the agreed interface direction; full component adoption and visual polish remain ahead.

## Data and trust

Broker data and Prism calculations are labeled separately. Missing values stay unknown rather than becoming zero. Current estimates use supported broker bid quotes with listing currency and timestamps; subtotals remain separated by currency. The ETF pilot uses dated constituent evidence and exact security ISIN matches; company totals remain explicitly incomplete.

Portfolio storage is local. Network access is required for broker login and refresh; the ETF pilot retrieves public composition from justETF. Offline access means reading saved data, not obtaining fresh prices. Login may require approval or reauthentication in the broker app. Never put PINs or session material in logs or issue reports.

## Product direction

The first goal is “What do I actually own today?” Later options include comparing ETFs, simulating purchases, exploring investment themes and adding brokers. These are not delivered features. The interface should feel calm, precise and futuristic, with subtle classical proportions and clear information that supports personal agency.

## Repository navigation

- [Project index](index.md): documentation map and the continuation path for agents.
- [V2 README](v2/README.md): current runtime and validation contracts.
- [Contributing](CONTRIBUTING.md): development boundaries and verification.
- [AGENTS.md](AGENTS.md): project instructions.
- [V1 README reference](docs/v1/execution/v1-readme-reference.md): historical Tauri/Python design and setup.

The root `src/` and `src-tauri/` trees hold V1. V2 is an isolated rebuild; V1 is retained for investigation and recovery, not as proof of correct V2 behavior. Private plans and reviews live under `_planning/` in the monorepo and are omitted from the public split. The index explains how to navigate either checkout.
