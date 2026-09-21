import { Schema } from 'effect'
import { historyContractVersion, type HistoryRunsPage, type HistoryRunDetail, type HistoryCheckpointDetail } from '../../contracts/history'

const text = Schema.String
const nonempty = text.pipe(Schema.minLength(1))
const nullable = <A, I, R>(schema: Schema.Schema<A, I, R>) => Schema.NullOr(schema)
const decimal = text.pipe(Schema.pattern(/^-?\d+(?:\.\d+)?$/))
const date = text.pipe(Schema.filter(value => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value))))
const count = Schema.Number.pipe(Schema.int(), Schema.nonNegative())
const account = Schema.Struct({ connectionId: nonempty, accountId: nonempty })
const notice = Schema.Struct({ code: nonempty, severity: Schema.Literal('info', 'warning', 'error'), message: nonempty, nextAction: nullable(text), diagnosticId: nullable(text) })
const range = Schema.Struct({ min: nullable(date), max: nullable(date) })
const currency = Schema.Struct({
  currency: nonempty, pricedSecurities: decimal, includedSecurityValue: decimal, unassignedValue: decimal,
  nonCompanyValue: nullable(decimal), coveragePercent: nullable(decimal),
  allocationState: Schema.Literal('allocated', 'partial', 'unavailable', 'incompatible'),
  cashValue: nullable(decimal), cashState: Schema.Literal('known', 'partial', 'unknown'),
})
const checkpoint = Schema.Struct({
  id: nonempty, runId: nonempty, recordedAt: date, reason: Schema.Literal('holdings', 'valuation', 'composition', 'migration'),
  datasetId: nonempty, accounts: Schema.Array(account), holdingsObservedAt: nullable(date), quoteDates: range, compositionDates: range,
  currencies: Schema.Array(currency), pricedPositionCount: count, unvaluedPositionCount: count, zeroPositionCount: count,
  valuationState: Schema.Literal('valued', 'partial', 'unavailable', 'empty'), companyGrouping: Schema.Literal('partial', 'unavailable'),
  reconciliation: Schema.Literal('pending'), notices: Schema.Array(notice),
})
const run = Schema.Struct({
  id: nonempty, trigger: Schema.Literal('broker-sync', 'composition-refresh', 'migration'), startedAt: date, finishedAt: nullable(date),
  status: Schema.Literal('running', 'succeeded', 'partial', 'failed', 'cancelled', 'interrupted'), checkpointCount: count,
  latestCheckpoint: nullable(checkpoint), notices: Schema.Array(notice),
})
const contractVersion = Schema.Literal(historyContractVersion)
const pageSchema = Schema.Struct({ contractVersion, items: Schema.Array(run), nextCursor: nullable(nonempty) })
const runSchema = Schema.Struct({ contractVersion, run, checkpoints: Schema.Array(checkpoint) })
const detailSchema = Schema.Struct({
  contractVersion, checkpoint,
  positions: Schema.Array(Schema.Struct({ account, isin: nonempty, name: text, quantity: decimal, currency: nullable(nonempty),
    unitPrice: nullable(decimal), value: nullable(decimal), quoteAt: nullable(date),
    valuationStatus: Schema.Literal('priced', 'zero', 'unsupported-negative', 'unavailable'), quality: text })),
  inputs: Schema.Array(Schema.Struct({ id: nonempty, kind: Schema.Literal('holdings', 'quote', 'cash', 'instrument', 'composition', 'identity', 'policy'),
    sourceId: nonempty, asOf: nullable(date), observedAt: nullable(date), sha256: nullable(text), parserVersion: nullable(text) })),
  versions: Schema.Record({ key: text, value: text }), replay: Schema.Struct({ state: Schema.Literal('available', 'unavailable'), reason: nullable(text) }),
})

export interface HistoryClient {
  runs(cursor: string | null, signal: AbortSignal): Promise<HistoryRunsPage>
  run(id: string, signal: AbortSignal): Promise<HistoryRunDetail>
  checkpoint(id: string, signal: AbortSignal): Promise<HistoryCheckpointDetail>
}

// Read-only, fixed same-origin endpoints. No arbitrary URL, command, provider or storage handle.
export function createHistoryClient(request: typeof fetch = fetch): HistoryClient {
  async function read<A>(path: string, schema: Schema.Schema<A>, signal: AbortSignal): Promise<A> {
    let response: Response
    try { response = await request(path, { signal, headers: { Accept: 'application/json' } }) } catch {
      throw new Error('History unavailable: cannot reach the local service. Reopen Prism and retry.')
    }
    if (!response.ok) throw new Error(`History unavailable (HTTP ${response.status}). Reopen Prism with history support, then retry.`)
    let value: unknown
    try { value = await response.json() } catch { throw new Error('History unavailable: the service returned an invalid response. Retry after checking the local service.') }
    if (!value || typeof value !== 'object' || !('contractVersion' in value) || value.contractVersion !== historyContractVersion)
      throw new Error('History unavailable: incompatible history version. Update the local service and reload.')
    try { return Schema.decodeUnknownSync(schema)(value) } catch {
      throw new Error('History unavailable: malformed saved history response. Check the local service before retrying.')
    }
  }
  return {
    runs: (cursor, signal) => read(`/api/history/runs?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, pageSchema, signal),
    run: async (id, signal) => {
      const result = await read(`/api/history/runs/${encodeURIComponent(id)}`, runSchema, signal)
      if (result.run.id !== id || result.checkpoints.some(item => item.runId !== id)) throw new Error('History unavailable: inconsistent run identity.')
      return result
    },
    checkpoint: async (id, signal) => {
      const result = await read(`/api/history/checkpoints/${encodeURIComponent(id)}`, detailSchema, signal)
      if (result.checkpoint.id !== id) throw new Error('History unavailable: inconsistent checkpoint identity.')
      return result
    },
  }
}
