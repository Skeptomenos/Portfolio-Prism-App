# Portfolio Prism

Local portfolio analysis: combine direct stocks and ETF constituents into sourced company exposure.
Ownership-ID: Personal

Read [index.md](index.md) at session start for the active implementation and plan. Read [v2/README.md](v2/README.md) before running or changing V2. Private planning is omitted from public splits; the index describes that boundary.

## Project constraints

- Keep V2 under `v2/` and its storage separate from V1 — the old implementation remains a recovery and research reference.
- Use the agreed TypeScript/Effect, React/Vite and SQLite direction — V1's Python/Tauri architecture does not govern the rebuild.
- Preserve identifiers, dates, weight units and decimal precision — missing exposure is unknown, not zero, and partial composition must stay partial.
- Include safe correlated diagnostics before live tests — users need a cause and resolution path when broker or enrichment operations fail.
- Follow the V2 README checks and the plan's acceptance gates — passing synthetic tests does not establish live source compatibility or numerical reconciliation.

## UI direction

- Design a futuristic, minimalist, slim interface with a tasteful “tech renaissance” character — Prism should invite users to take responsibility for their future and act with ambition and intent.
- Use subtle Greco-futurist nuances through classical proportions, sculptural geometry and restrained accents — the reference should enrich the interface while keeping the portfolio central.
- Favor generous negative space, precise typography, fine lines and a restrained palette — visual refinement should make complex financial information easy to understand.
- Keep motion quiet and purposeful, with readable contrast and clear interaction states — the interface should feel advanced, calm and usable.
- Express ambition through clarity, craft and personal agency — help users make informed decisions without pressure to trade or promises of returns.

## Documentation

Use the plan for phases, decisions and next actions. Read its linked references only when relevant. Keep completed implementation detail in dated references so the plan stays compact. Use [docs/index.md](docs/index.md) for classification. V1 references live under `docs/v1/`; their requirements and commands are historical source material. Read them only for legacy investigation or evidence-backed reuse. The retained `infrastructure/` code is V1; read its README before touching it.
