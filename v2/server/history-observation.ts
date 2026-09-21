import { Schema } from 'effect'
import type { DataSource, Json } from './explorer'

// Provider-neutral retained boundary. No login data, raw account documents or URLs.
const nullableText = Schema.NullOr(Schema.String)
const scalar = Schema.NullOr(Schema.Union(Schema.String, Schema.Number))
const Quote = Schema.Struct({ isin: Schema.String, venue: nullableText, currency: Schema.optional(nullableText), price: scalar, time: Schema.NullOr(Schema.Number), failed: Schema.Boolean })
const Instrument = Schema.Struct({ isin: Schema.String, confirmedIsin: nullableText, priceFactor: scalar, unit: Schema.optional(Schema.Literal('per-crypto-unit')),
  listings: Schema.Array(Schema.Struct({ venue: nullableText, currency: nullableText, active: Schema.Boolean })), failed: Schema.Boolean })
const Cash = Schema.Struct({ accountId: nullableText, currency: nullableText, amount: scalar })
export const FinancialObservationSchema = Schema.Struct({
  sourceId: Schema.Literal('quotes', 'instrumentDetails', 'cash'),
  observedAt: nullableText, checkedAt: nullableText,
  completeness: Schema.Literal('not-fetched', 'success', 'partial', 'failed', 'unsupported'),
  quotes: Schema.Array(Quote), instruments: Schema.Array(Instrument), cash: Schema.Array(Cash),
})
export type FinancialObservation = typeof FinancialObservationSchema.Type
export { financialObservation } from './trade-republic-observation'

// Compatibility adapter keeps current valuation admission unchanged. Numeric cash from
// the old SDK remains numeric; H1 does not invent precision already lost upstream.
export function valuationSource(o: FinancialObservation): DataSource {
  let payload: Json[]
  if (o.sourceId === 'quotes') payload = o.quotes.map(q => ({ isin: q.isin, venue: q.venue, ...(q.currency !== undefined ? { currency: q.currency } : {}), quote: { bid: { price: q.price, time: q.time } }, ...(q.failed ? { error: true } : {}) }))
  else if (o.sourceId === 'instrumentDetails') payload = o.instruments.map(i => ({ isin: i.isin, response: { isin: i.confirmedIsin, priceFactor: i.priceFactor, ...(i.unit === 'per-crypto-unit' ? { typeId: 'crypto', legalTypeId: 'CRYPTO' } : {}), listings: i.listings.map(l => ({ slug: l.venue, currencyId: l.currency, active: l.active })) }, ...(i.failed ? { error: true } : {}) }))
  else payload = o.cash.map(c => ({ accountNumber: c.accountId, currencyId: c.currency, amount: c.amount }))
  return { id: o.sourceId, title: '', note: '', coverage: '', status: o.completeness, payload, ...(o.observedAt ? { fetchedAt: o.observedAt } : {}) }
}
