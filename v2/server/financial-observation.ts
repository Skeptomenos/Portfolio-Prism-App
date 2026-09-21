import { Schema } from 'effect'
const text = Schema.NullOr(Schema.String)
/** Versioned provider-neutral inputs. Financial eligibility belongs to valuation. */
export const observationContractVersion = 'broker-observation/1'
export const FinancialObservationSchema = Schema.Struct({
  sourceId: Schema.Literal('quotes', 'instrumentDetails', 'cash'),
  observedAt: text, checkedAt: text,
  completeness: Schema.Literal('not-fetched', 'success', 'partial', 'failed', 'unsupported'),
  quotes: Schema.Array(Schema.Struct({ isin: Schema.String, venue: text, price: text, time: Schema.NullOr(Schema.Number), failed: Schema.Boolean })),
  instruments: Schema.Array(Schema.Struct({ isin: Schema.String, confirmedIsin: text,
    unit: Schema.Literal('per-security', 'unsupported'),
    listings: Schema.Array(Schema.Struct({ venue: text, currency: text, active: Schema.Boolean })), failed: Schema.Boolean })),
  cash: Schema.Array(Schema.Struct({ accountId: text, currency: text, amount: text })),
})
export type FinancialObservation = typeof FinancialObservationSchema.Type
export const decodeFinancialObservation = Schema.decodeUnknownSync(FinancialObservationSchema)
