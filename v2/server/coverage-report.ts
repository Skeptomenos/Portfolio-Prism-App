import { Decimal } from 'decimal.js'
import type { overview } from './overview'
import type { exposure } from './exposure'
import type { DevelopmentProgress } from './development'

const D = Decimal.clone({ precision: 256 })
type Valuations = ReturnType<typeof overview>
type Exposure = ReturnType<typeof exposure>
const sum = (values: string[]) => values.reduce((total, value) => total.add(value), new D(0))
const range = (values: (string | null)[]) => {
  const dates = values.filter((value): value is string => !!value).sort()
  return { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null }
}

// Read-only projection of the selected calculation. It never admits a source or changes totals.
export function coverageReport(
  valuations: Valuations,
  result: Exposure,
  progress: DevelopmentProgress,
  refresh: { failed: boolean; warning: string | null },
  now = Date.now()
) {
  const held = valuations.rows.filter(position => !new D(position.quantity).isZero())
  const contributions = result.rows.flatMap(row => row.contributions.map(item => ({ ...item, currency: row.currency })))
  const funds = progress.funds.filter(fund => held.some(position => position.isin === fund.isin)).map(fund => {
    const positions = held.filter(position => position.isin === fund.isin)
    const used = contributions.filter(item => item.kind === 'etf' && item.positionIsin === fund.isin)
    const source = result.compositions.find(source => source.fundIsin === fund.isin)
    const currencies = [...new Set(positions.filter(position => position.value !== null && position.currency).map(position => position.currency!))].sort()
    const values = currencies.map(currency => {
      const priced = sum(positions.filter(position => position.currency === currency && position.value !== null).map(position => position.value!))
      const included = sum(used.filter(item => item.currency === currency && item.value !== null).map(item => item.value!))
      return {
        currency, priced: priced.toFixed(), included: included.toFixed(),
        unassigned: priced.sub(included).toFixed(),
        percent: priced.gt(0) ? included.div(priced).mul(100).toFixed() : null,
      }
    })
    const state = used.length
      ? source?.scope === 'top-ten' ? 'pilot' : 'included'
      : fund.validated ? 'integration-pending'
        : fund.qualificationState === 'failed' || ['rejected', 'unreadable', 'unbound'].includes(fund.acquisitionState) ? 'checks-failed'
        : fund.inspection ? 'inspection-only'
        : fund.acquisitionState === 'missing' ? 'missing'
          : fund.acquisitionState === 'underlying-observation' ? 'underlying-only' : 'checks-pending'
    const nextAction = positions.some(position => position.value === null) ? 'Resolve the missing valuation'
      : state === 'included' ? values.some(value => !new D(value.unassigned).isZero()) ? 'Account for the remaining allocation' : 'Keep source data current'
      : state === 'pilot' ? 'Connect the full composition'
        : state === 'integration-pending' ? 'Integrate the checked data'
          : state === 'checks-failed' ? 'Resolve the failed source checks'
          : state === 'inspection-only' ? 'Obtain economic exposure data'
          : state === 'missing' ? 'Acquire full composition'
            : state === 'underlying-only' ? 'Resolve the share-class hedge' : 'Complete source checks'
    return { isin: fund.isin, name: fund.name, provider: fund.provider, state,
      saved: ['acquired', 'underlying-observation'].includes(fund.acquisitionState),
      checked: fund.validated, used: used.length > 0,
      compositionDate: source?.asOf ?? fund.compositionDate,
      sourceHash: source?.sha256 ?? fund.evidence.sha256,
      quoteDates: range(positions.map(position => position.quoteAt)),
      values, unvalued: positions.filter(position => position.value === null).length,
      nextAction, reason: fund.blocker, evidenceAction: fund.nextAction,
      sourceUrl: source?.sourceUrl ?? fund.sourceUrl,
      rowCount: fund.evidence.rowCount, acquisitionState: fund.acquisitionState,
    }
  })
  const gaps = result.gaps.filter(gap => gap.value === null || !new D(gap.value).isZero()).map(gap => {
    const fund = funds.find(fund => fund.isin === gap.isin)
    return { ...gap, fund: !!fund,
      nextAction: gap.value === null ? 'Resolve the missing valuation'
        : fund?.nextAction ?? 'Verify instrument identity and supported exposure',
    }
  })
  const quotes = held.filter(position => position.value !== null).map(position => position.quoteAt)
  const heldSources = result.compositions.filter(source => funds.some(fund => fund.isin === source.fundIsin && fund.used))
  return {
    totals: result.coverage.map(group => {
      const total = new D(group.pricedSecurities), included = new D(group.knownCompanyValue), remainder = new D(group.unresolvedValue)
      return { ...group,
        state: total.lte(0) ? 'unavailable' as const
          : included.lt(0) || remainder.lt(0) || !included.add(remainder).eq(total) ? 'incompatible' as const
            : remainder.isZero() ? 'allocated' as const : 'partial' as const,
        // Retained non-equity rows do not establish a compatible monetary breakdown of this remainder.
        nonCompanyValue: null as string | null,
      }
    }),
    pricedCount: valuations.pricedCount, unvalued: valuations.missingCount,
    zeroCount: valuations.zeroCount, positionCount: held.length,
    companyGrouping: held.length ? 'partial' as const : 'unavailable' as const,
    reconciliation: 'pending' as const,
    holdingsAt: valuations.holdingsAt, quoteDates: range(quotes),
    compositionDates: range(heldSources.map(source => source.asOf)),
    staleQuotes: quotes.filter(date => !date || now - Date.parse(date) > 86400000).length,
    staleCompositions: heldSources.filter(source => !source.asOf || now - Date.parse(source.asOf) > 30 * 86400000).length,
    refreshFailed: refresh.failed, warning: refresh.warning,
    counts: { held: funds.length, saved: funds.filter(fund => fund.saved).length,
      checked: funds.filter(fund => fund.checked).length, used: funds.filter(fund => fund.used).length,
      underlyingOnly: funds.filter(fund => fund.acquisitionState === 'underlying-observation').length },
    funds, gaps,
  }
}

export type CoverageReport = ReturnType<typeof coverageReport>
