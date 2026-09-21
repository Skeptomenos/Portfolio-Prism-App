import { Decimal } from 'decimal.js'
import { issuerGroups, currentIdentityPolicy } from './issuer-relationships'
import { pilotIsin, validIsin, type Composition, type CompositionAttempt } from './composition'
import type { overview, ValuedPosition } from './overview'
const D = Decimal.clone({ precision: 256 })
export interface Contribution {
  kind: 'direct' | 'etf'
  positionIsin: string
  positionName?: string
  account: string
  value: string | null
  positionValue: string | null
  weightPercent: string
  manualEvidence?: import('./valuation').ValuedPosition['manualEvidence']
  quoteAt: string | null
  quality: string
  source?: { fundIsin: string; sha256: string; asOf: string | null; retrievedAt: string; url: string; measure: string; stale: boolean; parserVersion?: string; provider?: Composition['provider']; estimateLimitation?: Composition['estimateLimitation'] }
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
  input: Composition | readonly Composition[] | null,
  attempt: CompositionAttempt | null,
  refreshing = false,
  now = Date.now(),
  identityPolicyVersion: string = currentIdentityPolicy.version,
  calculatorVersion: string = 'exposure/2'
) {
  const compositions: readonly Composition[] = input === null ? [] : Array.isArray(input) ? input : [input as Composition]
  const selected = new Map<string, Composition>()
  for (const source of compositions) {
    if (selected.has(source.fundIsin)) throw Error('Multiple selected compositions for one fund')
    selected.set(source.fundIsin, source)
  }
  // Compatibility field for the old single-pilot API; contributions carry their own source.
  const composition = selected.get(pilotIsin) ?? compositions[0] ?? null
  const companies = new Map<string, CompanyExposure>()
  function add(
    isin: string,
    name: string,
    p: ValuedPosition,
    kind: Contribution['kind'],
    weight: string,
    source?: Composition
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
      positionName: p.name,
      positionValue: p.value,
      weightPercent: weight,
      value,
      ...(p.manualEvidence ? { manualEvidence: p.manualEvidence } : {}),
      quoteAt: p.quoteAt,
      quality: p.quality,
      ...(source ? { source: { fundIsin: source.fundIsin, sha256: source.sha256, asOf: source.asOf,
        retrievedAt: source.retrievedAt, url: source.sourceUrl, parserVersion: source.sourceParserVersion, provider: source.provider, measure: source.measure ?? 'partial-top-ten',
        estimateLimitation: source.estimateLimitation,
        stale: !source.asOf || now - Date.parse(source.asOf) > 30 * 86400000 } } : {}),
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
    const composition = selected.get(p.isin)
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
    if (calculatorVersion !== 'exposure/1' && p.instrumentType.toLowerCase() === 'crypto' && p.value !== null) continue
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
    } else if (composition?.fundIsin === p.isin) {
      for (const r of composition.rows) if (r.isin) add(r.isin, r.name, p, 'etf', r.weightPercent, composition)
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
            : composition.scope === 'full-holdings'
              ? `${unresolved.toFixed()}% outside admitted equity allocation; retained cash, collateral and futures remain separate. This is an issuer-reported allocation estimate, not NAV or full economic reconciliation.`
            : `${unresolved.toFixed()}% undisclosed or without a verified equity ISIN; includes any unreported cash and derivatives`,
      })
    } else
      gaps.push({
        account: p.account,
        isin: p.isin,
        name: p.name,
        currency: p.currency,
        value: p.value,
        reason: calculatorVersion !== 'exposure/1' && p.value === null ? p.quality : 'No supported company composition or identity',
      })
  }
  const heldFundIsins = new Set(valuations.rows.filter(position => position.instrumentType.toLowerCase() === 'fund' && new D(position.quantity).gt(0)).map(position => position.isin))
  const rows = [...companies.values()]
  const coverage = valuations.totals.map((t) => {
    const known = rows
      .filter((c) => c.currency === t.currency)
      .reduce((s, c) => s.add(c.knownTotal), new D(0))
    for (const c of rows.filter((c) => c.currency === t.currency))
      if (new D(t.securities).gt(0))
        c.percentOfPriced = new D(c.knownTotal).div(t.securities).mul(100).toFixed()
    const nonCompany = calculatorVersion === 'exposure/1' ? new D(0) : valuations.rows.filter(p => p.currency === t.currency && p.instrumentType.toLowerCase() === 'crypto' && p.value !== null).reduce((sum, p) => sum.add(p.value!), new D(0))
    return {
      ...(nonCompany.gt(0) ? { nonCompanyValue: nonCompany.toFixed() } : {}),
      currency: t.currency,
      pricedSecurities: t.securities,
      knownCompanyValue: known.toFixed(),
      unresolvedValue: new D(t.securities).sub(known).sub(nonCompany).toFixed(),
      knownPercent: new D(t.securities).gt(0) ? known.div(t.securities).mul(100).toFixed() : null,
    }
  })
  rows.sort(
    (a, b) =>
      (a.currency ?? '').localeCompare(b.currency ?? '') || new D(b.knownTotal).cmp(a.knownTotal)
  )
  return {
    rows,
    issuerGroups: issuerGroups(rows, identityPolicyVersion),
    coverage,
    gaps,
    composition,
    compositions,
    attempt,
    refreshing,
    pilotOwned: valuations.rows.some((p) => p.isin === pilotIsin),
    holdingsAt: valuations.holdingsAt,
    missingValuations: valuations.missingCount,
    directStockCoverage: valuations.rows.filter(position => position.instrumentType.toLowerCase() === 'stock').map(position => {
      const matchedFunds = compositions.filter(source => heldFundIsins.has(source.fundIsin) && source.rows.some(row => row.isin === position.isin)).map(source => ({
        fundIsin: source.fundIsin, sha256: source.sha256, asOf: source.asOf,
      }))
      return { isin: position.isin, name: position.name, account: position.account, currency: position.currency,
        value: position.value, valuationStatus: position.valuationStatus, validIsin: validIsin(position.isin), matchedFunds,
        finding: !validIsin(position.isin) ? 'Invalid security ISIN; verify broker identity before matching.' : matchedFunds.length
          ? 'Exact security ISIN found in selected sources for currently held positive ETF positions.'
          : 'No exact security ISIN in selected sources for currently held positive ETF positions. This does not establish absence from unsupported funds or a related share class.',
        nextAction: !validIsin(position.isin) ? 'Obtain a corrected authoritative security identifier.' : matchedFunds.length
          ? position.value === null ? 'Resolve the direct holding valuation; ETF contributions remain independently valued.' : 'Keep per-source updates and identity evidence current.'
          : `${position.value === null ? 'Resolve the direct holding valuation. ' : ''}Inspect missing fund coverage or primary issuer share-class evidence; do not match by name or ticker.`,
      }
    }),
    stale:
      compositions.some(source => !source.asOf || now - Date.parse(source.asOf) > 30 * 86400000),
    refreshFailed: attempt?.status === 'failed',
  }
}
