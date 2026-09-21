# Exposure coverage contract

Status: adopted by David on 2026-09-20. This is a required product contract; adoption does not mean its UI is implemented. The private delivery plan owns progress and verification. Changes to these definitions require an explicit recorded product decision.

Goal: before interpreting an exposure result, a user can see how much is supported, what remains unknown, and the next action that can improve it. Use numbers, bars and short status labels first; disclose explanations and technical evidence on demand.

## Measures and the meaning of 100%

| Measure | Calculation or completion condition | Visible qualification |
| --- | --- | --- |
| Security allocation | Supported direct and ETF security value / priced securities value, separately per currency | Exact-security allocation is not complete company grouping. Name the valuation and allocation basis. |
| Priced value accounted for | Included security value + evidenced non-company value + unresolved priced value = priced denominator | Known cash or collateral is not missing company exposure. Classify it only when amount and meaning are supported. |
| ETF composition used | Included compatible weight for each held ETF; also show ETFs with saved data and ETFs contributing to results | Saved, checked and used are distinct. A count of ETFs is not a monetary coverage percentage. |
| Company identity | Supported security-to-company relationships for the included equity | Until a defined measurable denominator exists, use a truthful state and unresolved counts, not an invented percentage. |
| Valuation completeness | Priced and unvalued position counts, with excluded assets/currencies visible | Unknown values have no invented monetary amount or share of a bar. |
| Freshness and reconciliation | Quote/composition dates, last successful refresh, refresh failures and broker reconciliation state | Independent of coverage; a high percentage is not a confidence score or proof of current prices. |

Use these completion rules:

- **100% security allocation** means all value in the named priced denominator is allocated to securities under the declared measure. It does not establish issuer grouping or value for excluded positions. Non-company assets can legitimately keep this measure below 100%.
- **100% priced value accounted for** means no unresolved priced remainder; identified non-company assets have their own segment. It does not hide unvalued positions.
- **Complete company exposure for the stated scope and dates** requires every in-scope position to be accounted for, compatible exposure inputs for every company-bearing fund, supported company relationships and no unresolved company-bearing amount or valuation. State exclusions explicitly. Freshness and broker reconciliation remain separate visible facts.

Never normalize partial weights, count a dataset merely because it was acquired, or count the same contribution under both security and company totals. Preserve decimal arithmetic; round only presentation. A rounded percentage must not show a complete state while a nonzero unresolved amount remains. Empty or zero denominators show unavailable, not 100%. Keep currencies separate without an evidenced conversion.

The existing unassigned remainder may contain both non-equity assets and unresolved items. Split it only as evidence permits. Signed or incompatible exposures that cannot share this accounting basis stay visibly separate; do not force them into a reassuring 0–100% bar.

### Application to planned history

The proposed [history and performance extension](portfolio-history-and-performance.md) preserves this contract for every checkpoint. Priced-securities coverage is not a complete portfolio valuation or return denominator: it excludes cash and unvalued positions. Historical comparisons must expose each endpoint's scope, dates and gaps. Newly priced positions, added accounts or newly admitted ETF sources must not appear as market gains. Transaction completeness and flow-boundary valuations are separate performance requirements; this does not change the exposure measures above.

### Investigation decisions and manual evidence

The adopted [investigation contract](investigation-decisions.md) adds reversible user actions for valuation gaps. Excluding an item stops investigation, not financial accounting: its unknown value and holding remain visible. Investigation status never changes the coverage denominator or creates a zero value. A compatible manual price may improve valuation completeness only through core selection, with its manual source, date and freshness visible. Manual support does not close identity or reconciliation gaps.

## Required display

The same backend-derived coverage summary appears before result rows on Home, Breakdown and Development. On fund/security details, show a compact summary with its scope stated. A portfolio percentage must never masquerade as the selected security's completeness. Local fund gaps accompany its own composition measure.

| Always visible, without opening a disclosure | Expandable detail |
| --- | --- |
| Named scope, currency and measure; partial/complete/unavailable state | Formula, denominator and excluded positions |
| Included amount / priced total and percentage; labelled segmented bar | Contribution and source evidence |
| Unassigned amount, evidenced non-company amount when available, unvalued position count | Each gap's affected amount or unknown value, cause and next action |
| Company-grouping state, valuation/composition dates and stale/failed refresh signal | Per-source dates, failures, identifier relationships and diagnostics |

Render the summary in the first viewport at desktop and narrow widths; do not put sources or long prose ahead of it. Labels, amounts and accessible text must carry meaning without relying on color. Keep explanations below data. Filters/search do not change portfolio-wide denominators. A failed refresh preserves the last successful figures with their original dates and a failure signal.

### Estimate uncertainty

Keep an unknown estimate adjustment separate from the numerical coverage remainder. NQSE's fund detail and contribution disclosures show a dated historical hedge/class-value observation and a user-controlled sensitivity. The historical figure is neither today's allocation error nor an error bound. A scenario applies only to its named saved allocation or contribution, never the whole portfolio or other ETF contributions. Show the missing evidence, historical source/date and hypothetical input explicitly; scenarios must not change selected sources, totals or history. Missing values stay unavailable and tiny positive impacts must not round to zero.

## Recommended layout: Your ETF data

Use **Your ETF data** as the main coverage workspace within the existing Development view. This is a layout recommendation, not a new route or navigation rewrite. Reuse the summary in the other views.

1. **Portfolio coverage:** large percentage, included / priced amount, labelled allocation bar and visible limits. Explicitly label this portfolio-wide, including direct stocks.
2. **ETF progress:** separate compact counters for data saved, checked and included in calculations. Show numerator and denominator for each stage; use the held ETF set, never source-file counts. Shared-underlying-only data must be distinguishable from compatible held-class data.
3. **Fund matrix:** one compact row per held ETF. Default order: largest unresolved priced value first, unknown amounts visible. No long explanation blocks between the counters and the matrix.
4. **Gap drawer:** selecting a fund or remainder expands its precise cause, needed evidence or implementation, source dates and diagnostics below the row.

Recommended matrix:

| ETF name | Saved | Checked | Used | Included allocation | Value unassigned | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| Human-readable name linked to fund | State + composition date | Compatible / partial / pending | Full / partial / none | Bar + % + amount | Amount or unknown | Short verb-led action; expand for evidence |

“Full” in Used means all supported rows are integrated, not 100% company exposure. A remaining unsupported portion is still visible. Compatible data awaiting integration displays **Ready · not integrated**, with integration as the immediate next action. Missing data, unresolved meaning, missing identity and unfinished implementation must remain distinguishable.

Portfolio and ETF-only figures have separate denominators. Never label the portfolio-wide percentage as “ETF coverage.” Show a secondary ETF-only monetary measure only if it is actually derived. Progress steps are not equally weighted percentages toward an overall completion score.

## Acceptance gates

| Scenario | Required observable result |
| --- | --- |
| Partial portfolio | Before scrolling, user sees included / total, unassigned amount, percentage, unvalued count and a visible route to gaps on all three overview views. |
| Known non-company assets | Separate labelled segment when supported; accounting balances without treating that amount as a missing company or an included equity. |
| 100% priced allocation with unvalued holdings or incomplete company grouping | The priced measure may be complete; the overall exposure state stays partial with the remaining limits visible. |
| Tiny nonzero remainder, empty or zero denominator | Rounding cannot imply completion; unavailable has no success bar. |
| Stale data or failed refresh | Existing results remain usable; original dates and the stale/failure state remain visible without expanding details. |
| Source acquired, compatible rows not integrated | **Ready · not integrated** and the integration action are visible. Supported data must be connected before the increment is called complete. |
| Source integrated or identity resolved | Results, monetary summary, stage counts and gap rows update from the same selected inputs; no duplicate value. |
| Fund/security navigation and filters | Portfolio scope stays explicit; selected entity data and gaps do not inherit an unrelated portfolio percentage. |
| Desktop and narrow viewport | Summary visible before results; matrix scans by fund name, amount and state; keyboard can expand details; no color-only meanings. |
| Offline restart | Same saved inputs reproduce totals, accounting and gap states; no refreshed-date claim without retrieval. |

Use focused accounting/regression checks and browser acceptance against these scenarios. A warning existing somewhere in the DOM is insufficient. Extend current core read models and shared presentation components; a new plugin framework, generalized scoring engine or full NAV model is not a prerequisite. This contract does not delay already supported issuer-allocation estimates or close the separate broker reconciliation gates.
