# Source research and qualification

## Establish the requested observation

Record the held ISIN, issuer, fund/sub-fund, share class, distribution policy, currency and hedging status. Decide whether the required output is physical holdings, economic company exposure, or a narrower issuer allocation estimate. Similar names and the same benchmark do not prove identical funds.

For each candidate keep: exact URL/method/body, access requirements, source format, identity evidence, composition date, retrieval time, units, denominator, row counts/pagination termination, identifier types, cash/derivative treatment, repeatability and reuse terms. Record failed routes and what new evidence would justify a retry. Use a compact source matrix, not a transcript of every click.

Prefer issuer product pages and downloadable/API holdings. Reports/prospectuses often establish meaning even when an API supplies the rows. A third-party source needs an exact-fund sample and the same checks. Coverage marketing does not prove that a service contains the required UCITS share class, full list or permitted use.

Use browser DOM/network discovery when necessary. Then reproduce only the necessary public requests in a terminal or provider adapter. Remove incidental browser headers/cookies and verify the result still binds the same fund/date. Do not bypass authentication or an access restriction; record the blocker and try a supported route.

## Lessons from implemented routes (verified September 2026; recheck before reuse)

| Case | Working approach | Trap |
| --- | --- | --- |
| iShares modern pages | Bind product ID and held ISIN from the official page; discover its holdings publication date; request `holdings.all` via the product-data endpoint. See `v2/server/ishares-provider.ts` and `issuer-profiles.ts` for exact requests. | The latest NAV date can differ from the holdings date. Equal row-array lengths and exact source fields matter. A previous download URL returning 403 does not establish that the public product-data route is blocked. |
| iShares older German pages | Existing provider uses the legacy holdings JSON plus CSV/date evidence and product page. | Localized asset labels, decimal separators and encodings differ. A JSON success without its date evidence is insufficient. |
| EUR-hedged share class | Exact class identity and shared underlying equity weights can support a labelled estimate. | Identical holdings across two classes do not establish a class-to-underlying factor of one. Keep the class hedge adjustment unknown until a same-date bridge is evidenced. |
| Amundi ProductAPI | A fixed POST explicitly requesting `composition.compositionFields` returns the complete published basket. See `v2/server/amundi-provider.ts`. | Omitting the composition request can produce an apparently successful response without rows. Weights are fractions. `INDEX_TOP10` is partial benchmark data. The complete substitute basket of a swap ETF is not its economic company exposure. |
| Top-ten aggregators | Useful as explicitly partial recovery evidence when identity/date/units are established. | Ten rows cannot establish full coverage, and a later full composition must supersede rather than duplicate them. |

Public route anchors:
- iShares: `https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data`
- Amundi: `https://www.amundietf.de/mapi/ProductAPI/getProductsData`

Use maintained provider code for required parameters; these addresses alone are not runnable recipes. Vanguard research and commercial services are leads unless their exact-fund semantics, automated route and rights have been demonstrated. They are not bundled provider capabilities.

Document catalogues are discovery evidence only. Verify the identity inside each returned document: an exact-fund catalogue can link a PDF for a different fund. URL dates and catalogue `recordDate` fields do not establish the document's effective date. Compare original-byte hashes to detect unchanged documents served from newer URLs.

## Economic gaps

For a synthetic ETF, establish which returns are retained, swapped away or received. Seek a full issuer economic-exposure file; alternatively obtain exact full benchmark constituents plus the same-date benchmark-to-fund exposure basis and residual treatment. Counterparties, a tracking objective, a substitute basket or top-ten index rows cannot establish that basis alone. A regulatory swap-exposure amount is not automatically an economic allocation factor; qualify its definition before using it.

For a hedged class, seek class-specific security weights or the same-date attributable-underlying/class-NAV ratio, with currency and hedge treatment. A class NAV alone, fund-wide derivative percentage, gross forward notional, or old report cannot supply today's factor.

A blocker handoff names the missing field, why it changes the calculation, sources already tested, the best next route and any required access. Keep supported results in the app while that gap remains open.
