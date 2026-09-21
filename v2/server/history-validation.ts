import { Schema } from 'effect'
import type { HistoryCheckpointDetail, HistoryRunSummary } from '../contracts/history'
const text = Schema.String
const nullable = Schema.NullOr(text)
const decimal = text.pipe(Schema.pattern(/^-?\d+(\.\d+)?$/))
const amount = Schema.NullOr(decimal)
const count = Schema.Number.pipe(Schema.int(), Schema.nonNegative())
const date = text.pipe(Schema.filter(v => Number.isFinite(Date.parse(v))))
const dates = Schema.Struct({ min: Schema.NullOr(date), max: Schema.NullOr(date) })
const account = Schema.Struct({ connectionId: text, accountId: text })
export const noticeSchema = Schema.Struct({ code: text, severity: Schema.Literal('info', 'warning', 'error'), message: text, nextAction: nullable, diagnosticId: nullable })
export const summarySchema = Schema.Struct({
  id: text, runId: text, recordedAt: date, reason: Schema.Literal('holdings', 'valuation', 'composition', 'migration'), datasetId: text,
  accounts: Schema.Array(account), holdingsObservedAt: Schema.NullOr(date), quoteDates: dates, compositionDates: dates,
  currencies: Schema.Array(Schema.Struct({ currency: text.pipe(Schema.pattern(/^[A-Z]{3}$/)), pricedSecurities: decimal, includedSecurityValue: decimal, unassignedValue: decimal,
    nonCompanyValue: amount, coveragePercent: amount, allocationState: Schema.Literal('allocated', 'partial', 'unavailable', 'incompatible'), cashValue: amount, cashState: Schema.Literal('known', 'partial', 'unknown') })),
  pricedPositionCount: count, unvaluedPositionCount: count, zeroPositionCount: count, valuationState: Schema.Literal('valued', 'partial', 'unavailable', 'empty'),
  companyGrouping: Schema.Literal('partial', 'unavailable'), reconciliation: Schema.Literal('pending'), notices: Schema.Array(noticeSchema),
})
export const checkpointSchema = Schema.Struct({
  contractVersion: Schema.Literal('portfolio-history/1'), checkpoint: summarySchema,
  positions: Schema.Array(Schema.Struct({ account, isin: text, name: text, quantity: decimal, currency: nullable, unitPrice: amount, value: amount, quoteAt: Schema.NullOr(date), valuationStatus: Schema.Literal('priced', 'zero', 'unsupported-negative', 'unavailable'), quality: text })),
  inputs: Schema.Array(Schema.Struct({ id: text, kind: Schema.Literal('holdings', 'quote', 'cash', 'instrument', 'composition', 'identity', 'policy'), sourceId: text,
    asOf: nullable, observedAt: nullable, sha256: nullable, parserVersion: nullable })),
  versions: Schema.Record({ key: text, value: text }), replay: Schema.Struct({ state: Schema.Literal('available', 'unavailable'), reason: nullable }),
})
export const runSchema = Schema.Struct({ id: text, trigger: Schema.Literal('broker-sync', 'composition-refresh', 'migration'), startedAt: date, finishedAt: Schema.NullOr(date),
  status: Schema.Literal('running', 'succeeded', 'partial', 'failed', 'cancelled', 'interrupted'), checkpointCount: count, latestCheckpoint: Schema.NullOr(summarySchema), notices: Schema.Array(noticeSchema) })
export const decodeCheckpoint: (v: unknown) => HistoryCheckpointDetail = Schema.decodeUnknownSync(checkpointSchema)
export const decodeRun: (v: unknown) => HistoryRunSummary = Schema.decodeUnknownSync(runSchema)
