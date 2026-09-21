---
name: portfolio-prism-composition-provider
description: Research ETF holdings sources, build repeatable HTTP or CLI acquisition, and integrate a Portfolio Prism composition provider with persistence, exposure, visible gaps and offline replay.
---

# Build a composition provider

Deliver a repeatable source-to-user path for an exact ETF. A downloaded file is an intermediate result; every supported contribution must reach saved results and the relevant views.

## Orient

Find the Portfolio Prism root containing `AGENTS.md`, `index.md` and `v2/`. Read those entrypoints and the runtime guide. This skill ships with the public project; private plans and an existing investor database are optional. Use synthetic or explicitly redistributable fixtures when private evidence is unavailable.

Read `docs/plugin-architecture.md` before changing boundaries and `docs/exposure-coverage-contract.md` before changing financial results or coverage. The current implementation supports reviewed, bundled TypeScript modules through explicit registration. Use the [contributor SDK](../../docs/plugin-sdk.md) for entrypoints, the synthetic provider/panel and reusable conformance. It is not an arbitrary-plugin installer or a separately versioned stable package.

## Follow the evidence

1. **Research:** identify the exact fund/share class, needed measure and already-tested routes. Use [source research](references/source-research.md). Finish with a dated source that proves identity, units, denominator and completeness, or name the exact missing fact and best next source. A failed URL does not rule out the provider.
2. **Automate:** reproduce the browser discovery as a bounded HTTP request or CLI capture without browser state or an LLM. Keep the original bytes, request parameters, content hash and receipt. Repeat acquisition and replay the parser offline. See [integration](references/integration.md).
3. **Qualify:** distinguish physical holdings, shared underlying holdings, substitute baskets and economic exposure. Preserve signed/non-equity/rejected rows and original precision. A usable narrower estimate can ship with its specific limitation; incomplete semantics must not silently become complete company exposure.
4. **Integrate:** use the existing provider/inspection capability, core acceptance and persistence. Propagate every compatible selected row into calculations and the user journey in this increment. Inspect-only data must explain what blocks calculation and whether the next action is data acquisition or implementation.
5. **Prove:** execute the relevant [acceptance cases](references/acceptance.md). Hand back the source recipe, code/registration, saved replay evidence, visible results and remaining gaps. Update the owning public docs and any applicable project plan/tracker.

## Decisions that matter

- A new ETF using an existing source format usually needs a profile, not a second provider or scraper framework.
- Source ISIN identifies a security; company grouping across classes/ADRs needs separate relationship evidence. A ticker/name can find candidates but cannot authorize a merge.
- Missing weights or unsupported economics stay unknown. Keep partial coverage partial; never normalize it to 100% or perform a second FX conversion on an already valued ETF position.
- A percentage needs a denominator. A whole-fund weight, equity-only weight, index weight and swap notional percentage are different inputs.
- An uncertainty scenario is not a confidence interval. Historical hedge balances are dated context, not a current allocation factor or a bound on error.
- Refresh failures preserve accepted inputs with their original dates. Disabled acquisition must not prevent replay when the compatible saved decoder remains available.
- Source access and permission to retain/redistribute are separate facts. Keep restricted raw payloads private; request authorization before paid access or vendor correspondence.
