import { Schema } from 'effect'
import type { DataSource } from './explorer'
import { FinancialObservationSchema, type FinancialObservation as RetainedObservation } from './history-observation'
import type { FinancialObservation } from './financial-observation'
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : []
const text = (v: unknown) => typeof v === 'string' ? v : null
const numberOrText = (v: unknown) => typeof v === 'string' || typeof v === 'number' && Number.isFinite(v) ? v : null
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null

/** TR adapter: retain only fields consumed by versioned valuation policy.
 * BTC unit qualification is restricted to the exact crypto instrument; its
 * per-BTC feed convention was corroborated against broker-app quantity/value.
 * Original feed timestamps and decimals remain authoritative for valuation.
 */
export function financialObservation(source: DataSource): RetainedObservation | null {
  if (!['quotes', 'instrumentDetails', 'cash'].includes(source.id)) return null
  const rows = list(source.payload).map(obj)
  return Schema.decodeUnknownSync(FinancialObservationSchema)({
    sourceId: source.id, observedAt: date(source.fetchedAt), checkedAt: date(source.attemptedAt), completeness: source.status,
    quotes: source.id === 'quotes' ? rows.map(r => { const bid = obj(obj(r.quote).bid); return {
      isin: text(r.isin) ?? '', venue: text(r.venue), ...(typeof r.currency === 'string' ? { currency: r.currency } : {}), price: numberOrText(bid.price),
      time: typeof bid.time === 'number' && Number.isFinite(bid.time) ? bid.time : null, failed: !!r.error,
    } }) : [],
    instruments: source.id === 'instrumentDetails' ? rows.map(r => { const i = obj(r.response); return {
      isin: text(r.isin) ?? '', confirmedIsin: text(i.isin), priceFactor: numberOrText(i.priceFactor), failed: !!r.error,
      ...(r.isin === 'XF000BTC0017' && i.isin === r.isin && i.typeId === 'crypto' && i.legalTypeId === 'CRYPTO' && String(i.priceFactor) === '1' ? { unit: 'per-crypto-unit' } : {}),
      listings: list(i.listings).map(obj).map(l => ({ venue: text(l.slug), currency: text(l.currencyId), active: l.active === true })),
    } }) : [],
    cash: source.id === 'cash' ? rows.map(r => ({ accountId: text(r.accountNumber), currency: text(r.currencyId), amount: numberOrText(r.amount) })) : [],
  })
}


/** Translate source conventions without granting valuation eligibility. */
export function tradeRepublicObservation(source: DataSource): FinancialObservation | null {
  const o = financialObservation(source)
  if (!o) return null
  return { ...o,
    instruments: o.instruments.map(i => ({ isin: i.isin, confirmedIsin: i.confirmedIsin, unit: i.unit === 'per-crypto-unit' ? 'per-crypto-unit' : String(i.priceFactor) === '1' ? 'per-security' : 'unsupported', listings: i.listings, failed: i.failed })),
    quotes: o.quotes.map(q => ({ ...q, price: typeof q.price === 'string' ? q.price : null })),
    // Preserve legacy admission: the SDK supplied finite numeric cash. Do not
    // promote a raw string the old adapter did not support into accepted money.
    cash: o.cash.map(c => ({ ...c, amount: typeof c.amount === 'number' ? String(c.amount) : null })),
  }
}
