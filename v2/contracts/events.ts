import { Schema } from 'effect'

export const eventContractVersion = 'broker-events/1' as const
export const ledgerContractVersion = 'portfolio-events/1' as const
const text = Schema.String.pipe(Schema.maxLength(256))
const nullableText = Schema.NullOr(text)
const decimal = Schema.String.pipe(Schema.maxLength(128), Schema.pattern(/^-?\d+(?:\.\d+)?$/))
const nullableDecimal = Schema.NullOr(decimal)
const date = Schema.String.pipe(Schema.filter(v => /^\d{4}-\d{2}-\d{2}T/.test(v) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(v) && Number.isFinite(Date.parse(v))))
const currency = Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/))
export const EventSchema = Schema.Struct({
  sourceId: text.pipe(Schema.minLength(1)), sourceType: text, accountId: nullableText,
  occurredAt: Schema.NullOr(date), tradeAt: Schema.NullOr(date), settlementAt: Schema.NullOr(date),
  status: Schema.Literal('executed', 'non-economic', 'unresolved'),
  kind: Schema.Literal('buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'tax', 'fx', 'delivery', 'corporate-action', 'card-payment', 'card-refund', 'unknown'),
  // Each cash leg is a booked net movement. Fee/tax components below are already
  // included where indicated and must never be added to this movement again.
  reportedCash: Schema.NullOr(Schema.Struct({ currency, amount: decimal })),
  cash: Schema.Array(Schema.Struct({ currency, amount: decimal })),
  securities: Schema.Array(Schema.Struct({ accountId: nullableText, isin: Schema.String.pipe(Schema.pattern(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/)), quantity: decimal, precision: Schema.Literal('exact', 'reported-display') })),
  gross: Schema.NullOr(Schema.Struct({ currency, amount: decimal })),
  fee: nullableDecimal, tax: nullableDecimal, componentsCurrency: Schema.NullOr(currency),
  componentsIncludedInCash: Schema.Boolean,
  transferReference: nullableText, reversesSourceId: nullableText,
  gaps: Schema.Array(text), evidenceHash: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/)), parserVersion: text,
})
export type LedgerEvent = typeof EventSchema.Type
export const decodeEvent = Schema.decodeUnknownSync(EventSchema)
export interface SavedEvent extends LedgerEvent { connectionId: string; providerId: string; versionId: number; revisionCount: number; observedAt: string }
export const EventCoverageSchema = Schema.Struct({
  timelineObservedAt: Schema.NullOr(date), lastAttemptAt: Schema.NullOr(date),
  acquisition: Schema.Literal('partial', 'failed'), observedAt: Schema.NullOr(date),
  olderAvailable: Schema.NullOr(Schema.Boolean),
  detailsPending: Schema.Number.pipe(Schema.int(), Schema.nonNegative(), Schema.filter(Number.isSafeInteger)),
  failedDetails: Schema.Number.pipe(Schema.int(), Schema.nonNegative(), Schema.filter(Number.isSafeInteger)),
  recentGap: Schema.Boolean, historyComplete: Schema.Literal(false),
})
export const EventCashBalanceSchema = Schema.Struct({ accountId: text.pipe(Schema.minLength(1)), currency, amount: decimal, observedAt: date })
export type EventCashBalance = typeof EventCashBalanceSchema.Type
export const decodeEventCashBalance = Schema.decodeUnknownSync(EventCashBalanceSchema)
export type EventCoverage = typeof EventCoverageSchema.Type
export const decodeEventCoverage = Schema.decodeUnknownSync(EventCoverageSchema)
export const decodeEventObservationDate = Schema.decodeUnknownSync(date)
export interface ReconciliationRow {
  connectionId: string; accountId: string; unit: string; openingAt: string; closingAt: string; opening: string; movement: string; expected: string; closing: string; difference: string
  state: 'matched-with-gaps' | 'difference' | 'reconciled'; gaps: readonly string[]
}
export interface LedgerReadModel {
  contractVersion: typeof ledgerContractVersion
  events: readonly SavedEvent[]
  connections: readonly { id: string; providerId: string; coverage: EventCoverage | null }[]
  totals: readonly { currency: string; purchases: string; sales: string; cashAdded: string; cashWithdrawn: string; income: string; spending: string; internalTransfers: number; netCashMovement: string }[]
  reconciliation: { from: string | null; to: string | null; rows: readonly ReconciliationRow[]; gaps: readonly string[] }
  gaps: readonly string[]
}
