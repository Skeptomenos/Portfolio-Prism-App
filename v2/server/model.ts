import type { DataSource } from './explorer'
import type { Diagnostic } from './diagnostics'
import { Schema } from 'effect'
import { Decimal } from 'decimal.js'

const PlainDecimalText = Schema.String.pipe(
  Schema.filter((value) => /^-?\d+(\.\d+)?$/.test(value) && new Decimal(value).isFinite())
)
// Expand provider scientific notation as decimal text, never through a JS number.
const DecimalText = Schema.transform(
  Schema.String.pipe(
    Schema.filter(
      (value) =>
        value.length <= 128 &&
        /^-?\d+(\.\d+)?([eE][+-]?\d{1,3})?$/.test(value) &&
        new Decimal(value).isFinite() &&
        Math.abs(new Decimal(value).e) <= 100
    )
  ),
  PlainDecimalText,
  {
    decode: (value) => (/[eE]/.test(value) ? new Decimal(value).toFixed() : value),
    encode: (value) => value,
  }
)
export const PositionSchema = Schema.Struct({
  account: Schema.String,
  isin: Schema.String.pipe(Schema.pattern(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/)),
  name: Schema.String,
  quantity: DecimalText,
  instrumentType: Schema.String,
  averageBuyIn: DecimalText,
})
export const SnapshotSchema = Schema.Struct({
  fetchedAt: Schema.String,
  positions: Schema.Array(PositionSchema),
})
export type Snapshot = typeof SnapshotSchema.Type
export type Position = typeof PositionSchema.Type
export const decodeSnapshot = Schema.decodeUnknownSync(SnapshotSchema)
export const LoginSchema = Schema.Struct({
  phone: Schema.String.pipe(Schema.pattern(/^\+[1-9]\d{6,14}$/)),
  pin: Schema.String.pipe(Schema.pattern(/^\d{4}$/)),
})
export interface OperationOutcome {
  holdings: { snapshotId: number; fetchedAt: string } | null
  valuation: 'not-requested' | 'refreshing' | 'success' | 'partial' | 'failed' | 'cancelled'
  sources: { id: string; status: DataSource['status'] }[]
}
export type Status = {
  outcome: OperationOutcome | null
  lastDiagnostic: Diagnostic | null
  phase: 'disconnected' | 'connecting' | 'awaiting-approval' | 'restoring' | 'connected' | 'syncing'
  error: string | null
  sessionWarning: string | null
  lastAttemptAt: string | null
  snapshot: Snapshot | null
}
