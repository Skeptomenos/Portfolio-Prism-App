import { Decimal } from 'decimal.js'
import type { Snapshot, Position } from './model'
import type { FinancialObservation } from './financial-observation'
import {
  positionKey,
  quantityObservations,
  type QuantityObservation,
} from './quantity-observations'
const D = Decimal.clone({ precision: 256 })
export interface ValuedPosition extends Position {
  currency: string | null
  price: string | null
  value: string | null
  quoteAt: string | null
  venue: string | null
  quality: string
  weight: string | null
  quantityObservedAt: string | null
  valuationStatus: 'priced' | 'zero' | 'unsupported-negative' | 'unavailable'
}
export function valueObservations(
  snapshot: Snapshot | null,
  sources: readonly FinancialObservation[],
  now = Date.now(),
  observations: readonly QuantityObservation[] = quantityObservations(snapshot ? [snapshot] : [])
) {
  const observed = new Map(observations.map((p) => [positionKey(p.account, p.isin), p]))
  const source = (id: string) => sources.find((s) => s.sourceId === id)
  const instruments = source('instrumentDetails')?.instruments ?? [],
    quotes = source('quotes')?.quotes ?? []
  const rows: ValuedPosition[] = (snapshot?.positions ?? []).map((p) => {
    const basis = observed.get(positionKey(p.account, p.isin))
    const quantity = new D(p.quantity)
    const instrument = instruments.find(i => i.isin === p.isin)
    const q = quotes.find(q => q.isin === p.isin)
    const listing = instrument?.listings.find(l => l.venue === q?.venue && l.active)
    const currency = listing?.currency && /^[A-Z]{3}$/.test(listing.currency) ? listing.currency : null
    const bid = { price: q?.price, time: q?.time }
    const result: ValuedPosition = {
      ...p,
      currency,
      venue: q?.venue ?? null,
      price: null,
      value: null,
      quoteAt: null,
      quality: 'Missing quote or listing metadata',
      weight: null,
      quantityObservedAt: basis && quantity.eq(basis.quantity) ? basis.observedAt : null,
      valuationStatus: 'unavailable',
    }
    if (quantity.isZero())
      return {
        ...result,
        value: '0',
        valuationStatus: 'zero',
        quality: 'Zero quantity · no economic contribution',
      }
    if (quantity.isNegative())
      return {
        ...result,
        valuationStatus: 'unsupported-negative',
        quality: 'Negative quantity · unsupported in long-only exposure',
      }
    if (instrument?.confirmedIsin !== p.isin)
      return { ...result, quality: 'Instrument identity not confirmed' }
    if (
      !['stock', 'fund', 'etf'].includes(p.instrumentType.toLowerCase()) ||
      instrument.unit !== 'per-security'
    )
      return { ...result, quality: 'Pricing convention not supported yet' }
    if (
      !currency ||
      typeof bid.price !== 'string' ||
      bid.price.length > 128 ||
      typeof bid.time !== 'number' ||
      !Number.isFinite(bid.time)
    )
      return result
    try {
      const price = new D(bid.price)
      if (
        !price.isFinite() ||
        Math.abs(price.e) > 100 ||
        price.lte(0) ||
        bid.time <= 0 ||
        bid.time > now + 60000
      )
        return result
      result.price = price.toFixed()
      result.quoteAt = new Date(bid.time).toISOString()
      const boundary = Date.parse(result.quantityObservedAt ?? '')
      if (
        !Number.isFinite(boundary) ||
        boundary > Date.parse(snapshot!.fetchedAt) ||
        boundary > now ||
        bid.time < boundary
      )
        return {
          ...result,
          quality:
            'Quantity/quote basis unverified · a quote at or after the quantity observation is required',
        }
      result.value = price.mul(quantity).toFixed()
      result.valuationStatus = 'priced'
      result.quality = now - bid.time > 86400000 ? 'Quote older than 24h' : 'Recent timestamp'
      result.quality += ' · quote quality code not interpreted'
      if (q?.failed || instrument.failed || source('quotes')?.completeness === 'failed' || source('instrumentDetails')?.completeness === 'failed')
        result.quality += ' · latest source refresh failed'
    } catch {
      return result
    }
    return result
  })
  const currencies = new Set(rows.flatMap((r) => (r.currency ? [r.currency] : [])))
  const cashRows = source('cash')?.cash ?? []
  for (const row of cashRows) {
    const c = row.currency
    if (typeof c === 'string' && /^[A-Z]{3}$/.test(c)) currencies.add(c)
  }
  const totals = [...currencies].map((currency) => {
    const priced = rows.filter((r) => r.currency === currency && r.valuationStatus === 'priced')
    const securities = priced.reduce((sum, r) => sum.add(r.value!), new D(0))
    let cash: string | undefined
    const balances = cashRows.filter((v) => v.currency === currency)
    if (
      balances.length &&
      balances.every(
        (v) =>
          typeof v.accountId === 'string' && v.accountId.length > 0 &&
          typeof v.amount === 'string' && v.amount.length <= 128 &&
          /^-?\d+(\.\d+)?$/.test(v.amount) && new D(v.amount).isFinite()
      ) &&
      new Set(balances.map((v) => v.accountId)).size === balances.length
    )
      cash = balances
        .reduce<Decimal>((sum, v) => sum.add(v.amount!), new D(0))
        .toFixed()
    for (const row of priced)
      if (securities.gt(0)) row.weight = new D(row.value!).div(securities).mul(100).toFixed(4)
    return {
      currency,
      securities: securities.toFixed(),
      cash: cash === undefined ? null : String(cash),
      pricedCount: priced.length,
      cashAt: source('cash')?.observedAt ?? null,
      cashStale:
        source('cash')?.completeness !== 'success' ||
        now - Date.parse(source('cash')?.observedAt ?? '') > 86400000,
      olderQuotes: priced.filter((r) => r.quality.startsWith('Quote older')).length,
    }
  })
  return {
    rows,
    totals,
    pricedCount: rows.filter((r) => r.valuationStatus === 'priced').length,
    zeroCount: rows.filter((r) => r.valuationStatus === 'zero').length,
    missingCount: rows.filter((r) => r.value === null).length,
    holdingsAt: snapshot?.fetchedAt ?? null,
    quoteRetrievedAt: source('quotes')?.observedAt ?? null,
  }
}
