# Portfolio Prism

Local portfolio analysis: combine direct stocks and ETF constituents into sourced company exposure.
Ownership-ID: Personal

Read [index.md](index.md) at session start to resolve the implementation checkout and its current plan. The V2 rebuild is not yet merged into this checkout; V1 architecture does not govern V2 work.

## Project constraints

- Keep V2 and its storage separate from V1 — the old implementation remains a recovery and research reference.
- Preserve identifiers, dates, weight units and decimal precision — missing exposure is unknown, not zero, and partial composition must stay partial.
- Include safe correlated diagnostics before live tests — users need a cause and resolution path when broker or enrichment operations fail.
- Use the selected implementation's documented checks and plan acceptance gates — synthetic tests do not establish live source compatibility or numerical reconciliation.

Private planning and evidence live in `_planning/`, which is omitted from public splits. The index identifies the current plan and its evidence map; obtain that context before continuing a phase.
