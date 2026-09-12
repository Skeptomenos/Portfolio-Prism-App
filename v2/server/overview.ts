import { Decimal } from 'decimal.js'
import type { Snapshot, Position } from './model'
import type { DataSource } from './explorer'
import {
  positionKey,
  quantityObservations,
  type QuantityObservation,
} from './quantity-observations'
const D = Decimal.clone({ precision: 256 })
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
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
export function overview(
  snapshot: Snapshot | null,
  sources: DataSource[],
  now = Date.now(),
  observations: readonly QuantityObservation[] = quantityObservations(snapshot ? [snapshot] : [])
) {
  const observed = new Map(observations.map((p) => [positionKey(p.account, p.isin), p]))
  const source = (id: string) => sources.find((s) => s.id === id)
  const instruments = list(source('instrumentDetails')?.payload),
    quotes = list(source('quotes')?.payload)
  const rows: ValuedPosition[] = (snapshot?.positions ?? []).map((p) => {
    const basis = observed.get(positionKey(p.account, p.isin))
    const quantity = new D(p.quantity)
    const item = obj(instruments.find((v) => obj(v).isin === p.isin)),
      instrument = obj(item.response)
    const q = obj(quotes.find((v) => obj(v).isin === p.isin)),
      bid = obj(obj(q.quote).bid)
    const listing = obj(
      list(instrument.listings).find((v) => obj(v).slug === q.venue && obj(v).active === true)
    )
    const currency =
      typeof listing.currencyId === 'string' && /^[A-Z]{3}$/.test(listing.currencyId)
        ? listing.currencyId
        : null
    const result: ValuedPosition = {
      ...p,
      currency,
      venue: typeof q.venue === 'string' ? q.venue : null,
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
    if (instrument.isin !== p.isin)
      return { ...result, quality: 'Instrument identity not confirmed' }
    if (
      !['stock', 'fund', 'etf'].includes(p.instrumentType.toLowerCase()) ||
      String(instrument.priceFactor) !== '1'
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
      if (source('quotes')?.status === 'failed' || source('instrumentDetails')?.status === 'failed')
        result.quality += ' · latest source refresh failed'
    } catch {
      return result
    }
    return result
  })
  const currencies = new Set(rows.flatMap((r) => (r.currency ? [r.currency] : [])))
  const cashRows = list(source('cash')?.payload)
  for (const row of cashRows) {
    const c = obj(row).currencyId
    if (typeof c === 'string' && /^[A-Z]{3}$/.test(c)) currencies.add(c)
  }
  const totals = [...currencies].map((currency) => {
    const priced = rows.filter((r) => r.currency === currency && r.valuationStatus === 'priced')
    const securities = priced.reduce((sum, r) => sum.add(r.value!), new D(0))
    let cash: string | undefined
    const balances = cashRows.filter((v) => obj(v).currencyId === currency)
    if (
      balances.length &&
      balances.every(
        (v) =>
          typeof obj(v).accountNumber === 'string' &&
          typeof obj(v).amount === 'number' &&
          Number.isFinite(obj(v).amount)
      ) &&
      new Set(balances.map((v) => obj(v).accountNumber)).size === balances.length
    )
      cash = balances
        .reduce<Decimal>((sum, v) => sum.add(String(obj(v).amount)), new D(0))
        .toFixed()
    for (const row of priced)
      if (securities.gt(0)) row.weight = new D(row.value!).div(securities).mul(100).toFixed(4)
    return {
      currency,
      securities: securities.toFixed(),
      cash: cash === undefined ? null : String(cash),
      pricedCount: priced.length,
      cashAt: source('cash')?.fetchedAt ?? null,
      cashStale:
        source('cash')?.status !== 'success' ||
        now - Date.parse(source('cash')?.fetchedAt ?? '') > 86400000,
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
    quoteRetrievedAt: source('quotes')?.fetchedAt ?? null,
  }
}
