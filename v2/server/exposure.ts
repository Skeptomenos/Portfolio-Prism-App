import { Decimal } from 'decimal.js'
import { pilotIsin, validIsin, type Composition, type CompositionAttempt } from './composition'
import type { overview, ValuedPosition } from './overview'
const D = Decimal.clone({ precision: 256 })
export interface Contribution {
  kind: 'direct' | 'etf'
  positionIsin: string
  account: string
  value: string | null
  positionValue: string | null
  weightPercent: string
  quoteAt: string | null
  quality: string
}
export interface CompanyExposure {
  isin: string
  name: string
  currency: string | null
  direct: string
  indirect: string
  knownTotal: string
  percentOfPriced: string | null
  contributions: Contribution[]
}
export function exposure(
  valuations: ReturnType<typeof overview>,
  composition: Composition | null,
  attempt: CompositionAttempt | null,
  refreshing = false,
  now = Date.now()
) {
  const companies = new Map<string, CompanyExposure>()
  function add(
    isin: string,
    name: string,
    p: ValuedPosition,
    kind: Contribution['kind'],
    weight: string
  ) {
    const key = `${isin}:${p.currency}`
    const company = companies.get(key) ?? {
      isin,
      name,
      currency: p.currency,
      direct: '0',
      indirect: '0',
      knownTotal: '0',
      percentOfPriced: null,
      contributions: [],
    }
    const value = p.value === null ? null : new D(p.value).mul(weight).div(100).toFixed()
    company.contributions.push({
      kind,
      account: p.account,
      positionIsin: p.isin,
      positionValue: p.value,
      weightPercent: weight,
      value,
      quoteAt: p.quoteAt,
      quality: p.quality,
    })
    if (value !== null) {
      const field = kind === 'direct' ? 'direct' : 'indirect'
      company[field] = new D(company[field]).add(value).toFixed()
      company.knownTotal = new D(company.knownTotal).add(value).toFixed()
    }
    companies.set(key, company)
  }
  const gaps: {
    account: string
    isin: string
    name: string
    currency: string | null
    value: string | null
    reason: string
  }[] = []
  for (const p of valuations.rows) {
    if (new D(p.quantity).isZero()) continue
    if (new D(p.quantity).isNegative()) {
      gaps.push({
        account: p.account,
        isin: p.isin,
        name: p.name,
        currency: p.currency,
        value: null,
        reason: p.quality,
      })
      continue
    }
    if (p.instrumentType.toLowerCase() === 'stock' && validIsin(p.isin)) {
      add(p.isin, p.name, p, 'direct', '100')
      if (p.value === null)
        gaps.push({
          account: p.account,
          isin: p.isin,
          name: p.name,
          currency: p.currency,
          value: null,
          reason: p.quality,
        })
    } else if (p.isin === pilotIsin && composition?.fundIsin === pilotIsin) {
      for (const r of composition.rows) if (r.isin) add(r.isin, r.name, p, 'etf', r.weightPercent)
      const unresolved = new D(100).sub(composition.identifiedPercent)
      gaps.push({
        account: p.account,
        isin: p.isin,
        name: p.name,
        currency: p.currency,
        value: p.value === null ? null : new D(p.value).mul(unresolved).div(100).toFixed(),
        reason:
          p.value === null
            ? `ETF valuation unavailable: ${p.quality}`
            : `${unresolved.toFixed()}% undisclosed or without a verified equity ISIN; includes any unreported cash and derivatives`,
      })
    } else
      gaps.push({
        account: p.account,
        isin: p.isin,
        name: p.name,
        currency: p.currency,
        value: p.value,
        reason: 'No supported company composition or identity',
      })
  }
  const rows = [...companies.values()]
  const coverage = valuations.totals.map((t) => {
    const known = rows
      .filter((c) => c.currency === t.currency)
      .reduce((s, c) => s.add(c.knownTotal), new D(0))
    for (const c of rows.filter((c) => c.currency === t.currency))
      if (new D(t.securities).gt(0))
        c.percentOfPriced = new D(c.knownTotal).div(t.securities).mul(100).toFixed()
    return {
      currency: t.currency,
      pricedSecurities: t.securities,
      knownCompanyValue: known.toFixed(),
      unresolvedValue: new D(t.securities).sub(known).toFixed(),
      knownPercent: new D(t.securities).gt(0) ? known.div(t.securities).mul(100).toFixed() : null,
    }
  })
  rows.sort(
    (a, b) =>
      (a.currency ?? '').localeCompare(b.currency ?? '') || new D(b.knownTotal).cmp(a.knownTotal)
  )
  return {
    rows,
    coverage,
    gaps,
    composition,
    attempt,
    refreshing,
    pilotOwned: valuations.rows.some((p) => p.isin === pilotIsin),
    holdingsAt: valuations.holdingsAt,
    missingValuations: valuations.missingCount,
    stale:
      !!composition && (!composition.asOf || now - Date.parse(composition.asOf) > 30 * 86400000),
    refreshFailed: attempt?.status === 'failed',
  }
}
