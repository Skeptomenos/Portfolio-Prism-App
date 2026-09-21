# Documentation map

Active application: **Portfolio Prism V2**. Reconciled: 2026-09-21.

| Classification | Document | Owns |
| --- | --- | --- |
| Current product | [README](../README.md) | Purpose and quick start |
| Current navigation | [Project index](../index.md) | Where to continue and who owns each fact |
| Current runtime | [V2 README](../v2/README.md) | Implemented behavior, setup and verification recipes |
| Visual explanation | [Architecture map](architecture-map.html) | Dated application/pipeline diagrams, code pointers and explicit current/target separation; opens offline |
| Adopted target | [Plugin architecture](plugin-architecture.md) | Core/host/extension boundaries; not a claim that the SDK or loader exists |
| Adopted product contract | [Exposure coverage](exposure-coverage-contract.md) | Coverage meaning, visible gaps and acceptance rules |
| Accepted target extension | [Portfolio history and performance](portfolio-history-and-performance.md) | Implemented H1 observation/checkpoint foundation; later timeline, event reconciliation, invested capital and return targets |
| Implementation contract | [H1 history API](history-api-contract.md) | Implemented H1 wire types, examples and endpoint semantics; historical company projections remain open |
| Implementation contract | [Financial views](financial-view-contract.md) | Versioned financial projections, scoped clients, analytics/view registration and lifecycle verification |
| Implementation contract | [Contributor SDK](plugin-sdk.md) | Repository-local entrypoints, synthetic provider/panel, capability conformance and lifecycle limits |
| Current contribution path | [Contributing](../CONTRIBUTING.md) | Safe changes and relevant checks |
| Historical only | [V1 archive](v1/index.md) | Earlier designs and runbooks; not current runtime instructions |

The private `_planning/strategy/v2-mission-and-delivery-plan.md` owns delivery status. The [project index](../index.md) explains its public-split boundary. Dated reports remain evidence, not a second execution plan. The [retained infrastructure](../infrastructure/README.md) belongs to V1 and is not a V2 runtime dependency.
