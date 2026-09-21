import { Schema } from 'effect'
import { Decimal } from 'decimal.js'

const validCalendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const calendar = new Date(Date.UTC(year, month - 1, day))
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
}

const isoTimestamp = Schema.String.pipe(Schema.filter(value =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && validCalendarDate(value) && Number.isFinite(Date.parse(value)),
  { message: () => 'Expected an ISO timestamp' },
))
const boundedText = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500))
const account = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256), Schema.pattern(/^[^\u0000-\u001f\u007f]+$/))
const connectionId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128), Schema.pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/))
const isin = Schema.String.pipe(Schema.pattern(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/))
const decimal = Schema.String.pipe(Schema.maxLength(128), Schema.pattern(/^\d+(?:\.\d+)?$/), Schema.filter(value => { try { return new Decimal(value).isFinite() && new Decimal(value).gt(0) } catch { return false } }, { message: () => 'Expected a positive decimal' }))
const currency = Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/))
const nullable = <A, I>(schema: Schema.Schema<A, I>) => Schema.NullOr(schema)

export const ScopeSchema = Schema.Struct({ connectionId, account, isin })
export type Scope = typeof ScopeSchema.Type

export const ManualEvidenceSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)),
  scope: ScopeSchema,
  recordedAt: isoTimestamp,
  kind: Schema.Literal('note', 'price', 'revoke'),
  price: nullable(decimal),
  currency: nullable(currency),
  asOf: nullable(isoTimestamp),
  source: boundedText,
  reason: boundedText,
  unit: nullable(Schema.Literal('per-security')),
  quantity: nullable(decimal),
  quantityObservedAt: nullable(isoTimestamp),
  revokes: nullable(Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))),
})
export type ManualEvidence = typeof ManualEvidenceSchema.Type

export const DecisionSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)),
  scope: ScopeSchema,
  state: Schema.Literal('open', 'excluded'),
  recordedAt: isoTimestamp,
  reason: Schema.String.pipe(Schema.maxLength(500)),
})
export type Decision = typeof DecisionSchema.Type

export const InvestigationSnapshotSchema = Schema.Struct({ decisions: Schema.Array(DecisionSchema), evidence: Schema.Array(ManualEvidenceSchema) })
export type InvestigationSnapshot = typeof InvestigationSnapshotSchema.Type

const commandScope = ScopeSchema
const decideCommand = Schema.Struct({ action: Schema.Literal('decide'), scope: commandScope, state: Schema.Literal('open', 'excluded'), reason: Schema.optionalWith(Schema.String.pipe(Schema.maxLength(500)), { default: () => '' }) })
const noteCommand = Schema.Struct({ action: Schema.Literal('note'), scope: commandScope, source: boundedText, reason: boundedText })
const priceCommand = Schema.Struct({ action: Schema.Literal('price'), scope: commandScope, price: decimal, currency, asOf: isoTimestamp, source: boundedText, reason: boundedText, unit: Schema.Literal('per-security') })
const revokeCommand = Schema.Struct({ action: Schema.Literal('revoke'), scope: commandScope, evidenceId: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)), reason: boundedText })

export const InvestigationCommandSchema = Schema.Union(decideCommand, noteCommand, priceCommand, revokeCommand)
export type InvestigationCommand = typeof InvestigationCommandSchema.Type

const keys = (value: object) => Object.keys(value).sort()
const exact = (value: unknown, expected: readonly string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(keys(value), null, 0) !== JSON.stringify([...expected].sort(), null, 0)) throw new Error('Unknown or missing investigation command properties')
}
const exactScope = (value: unknown) => exact(value, ['connectionId', 'account', 'isin'])
const decodeScopeUnchecked = Schema.decodeUnknownSync(ScopeSchema)

export const decodeInvestigationCommand = (value: unknown): InvestigationCommand => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Investigation command must be an object')
  exactScope((value as { scope?: unknown }).scope)
  const action = (value as { action?: unknown }).action
  if (action === 'decide') {
    const commandKeys = Object.keys(value).sort()
    const withReason = ['action', 'reason', 'scope', 'state']
    const withoutReason = ['action', 'scope', 'state']
    if (JSON.stringify(commandKeys) !== JSON.stringify(withReason) && JSON.stringify(commandKeys) !== JSON.stringify(withoutReason)) throw new Error('Unknown or missing investigation command properties')
  }
  else if (action === 'note') exact(value, ['action', 'scope', 'source', 'reason'])
  else if (action === 'price') exact(value, ['action', 'scope', 'price', 'currency', 'asOf', 'source', 'reason', 'unit'])
  else if (action === 'revoke') exact(value, ['action', 'scope', 'evidenceId', 'reason'])
  else throw new Error('Unknown investigation command action')
  return Schema.decodeUnknownSync(InvestigationCommandSchema)(value)
}

export const decodeScope = (value: unknown): Scope => {
  exactScope(value)
  return decodeScopeUnchecked(value)
}
export const decodeManualEvidence = (value: unknown): ManualEvidence => {
  exact(value, ['id', 'scope', 'recordedAt', 'kind', 'price', 'currency', 'asOf', 'source', 'reason', 'unit', 'quantity', 'quantityObservedAt', 'revokes'])
  exactScope((value as { scope: unknown }).scope)
  return Schema.decodeUnknownSync(ManualEvidenceSchema)(value)
}
export const decodeDecision = (value: unknown): Decision => {
  exact(value, ['id', 'scope', 'state', 'recordedAt', 'reason'])
  exactScope((value as { scope: unknown }).scope)
  return Schema.decodeUnknownSync(DecisionSchema)(value)
}

export type ManualEvidenceInput = Omit<ManualEvidence, 'id' | 'recordedAt'>
export type DecisionState = Decision['state']
