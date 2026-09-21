# Acceptance and handback

Use `CONTRIBUTING.md` and `v2/README.md` for current commands and fixture requirements. Existing tests are examples, not interchangeable recipes: some assert an old pilot snapshot or a particular copied database baseline.

| Gate | Evidence required |
| --- | --- |
| Identity/date/unit | Exact fund/class; holdings date distinct from quote/retrieval dates; original decimal precision and denominator; explicit missing-field failures. |
| Complete source | Reported row count or pagination termination matches capture; mismatched arrays, duplicates and omitted pages detected; zero and signed rows retained. |
| Semantics | Cash, collateral, futures, hedge and swap rows handled as their actual measure; unsupported rows remain visible. No false contribution from a substitute basket. |
| Determinism | A second bounded retrieval verifies the route; unchanged publications do not duplicate results. Pure decode of original saved bytes works without network/browser/LLM. |
| Accounting | Independently derive admitted weights and per-position contributions from original payloads. Check totals and remainders in each currency without normalization or double FX. |
| Recovery/history | Failure, partial result, cancellation, bad hash, wrong identity, regression/conflict and incompatible parser preserve last-good data. Compatible retained decoders replay while acquisition is disabled. Historical checkpoints do not change after a refresh. |
| User journey | Overview → fund → constituent → direct/ETF contributions. All eligible rows are used; amounts, source/date, uncertainty, missing data and next action are visible. Check keyboard and narrow layout. |
| Public contribution | A clean checkout can find the skill, required public docs, code and synthetic fixtures without private plans, developer home paths or investor data. Source redistribution rights are separately established. |

For live-data acceptance, make a SQLite-consistent disposable copy before starting another service. Offline mode suppresses automatic refresh but is not a read-only sandbox; do not use its mutation controls unintentionally. Keep raw provider captures and portfolio snapshots outside Git. Never replace a user's primary database with a fixture.

Report four separate outcomes: source acquired; meaning qualified for a named measure; persisted and integrated; journey/replay verified. For anything open, name the missing evidence or implementation and its next action. Passing synthetic tests alone proves neither live compatibility nor source-use permission. Phase-one broker reconciliation stays separate.

Useful current examples: `v2/tests/provider-host-integration.test.ts`, `provider-refresh-service.test.ts`, `provider-store.test.ts`, `ishares-provider.test.ts`, `amundi-provider.test.ts`, `plugin-registry.test.ts`. The independent `provider-decimal-audit.py` and live replay scripts have private-fixture requirements; read those requirements before use.
