import React, { useEffect, useState } from 'react'
import { Schema } from 'effect'
import { createFinancialClient } from './financial-client'

const nullable = Schema.NullOr(Schema.String)
const schema = Schema.Struct({ isin: Schema.Literal('FR0010361683'), name: Schema.String, compositionDate: nullable, lastVerifiedAt: nullable,
  sourceUrl: nullable, nextAction: Schema.String, blocker: Schema.String,
  evidence: Schema.Struct({ weightUnit: Schema.optional(Schema.NullOr(Schema.Literal('percent', 'fraction'))), sha256: nullable }),
  inspection: Schema.optional(Schema.Struct({ reportedRowCount: Schema.Number, benchmarkRowCount: Schema.Number,
    sourceLimits: Schema.Array(Schema.Struct({ id: Schema.String, detail: Schema.String })) })),
  rows: Schema.Array(Schema.Struct({ row: Schema.Number, name: Schema.String, isin: nullable,
    weight: Schema.optional(nullable), weightUnit: Schema.optional(nullable), sourceScope: Schema.optional(nullable) })),
})
export type AmundiPanelModel = typeof schema.Type
export interface InspectionClient { read(signal: AbortSignal): Promise<AmundiPanelModel> }
// The provider-plus-panel uses the same validated versioned financial boundary.
export const inspectionClientVersion = 'portfolio-financial/1' as const
export function createInspectionClient(request: typeof fetch = fetch): InspectionClient {
  const client = createFinancialClient(request)
  return { async read(signal) { return Schema.decodeUnknownSync(schema)(await client.fund('FR0010361683', signal)) } }
}
export function AmundiPanel({ client }: { client: InspectionClient }) {
  const [data, setData] = useState<AmundiPanelModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError(null)
    void client.read(controller.signal).then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(() => { if (!controller.signal.aborted) setError('Saved Amundi inspection unavailable. Check Development or retry.') })
    return () => controller.abort()
  }, [client, retry])
  return <section className="panel history-view"><h2>Amundi saved source inspection</h2>
    <p className="notice warning">Inspection only. Substitute-basket weights are not economic exposure. INDEX_TOP10 is a partial benchmark. No monetary value is calculated here.</p>
    <a href="#/fund/FR0010361683">Inspect fund evidence and separate exposure →</a>
    {error ? <p role="alert" className="notice error">{error}</p> : !data ? <p role="status">Loading saved inspection…</p> : !data.inspection ? <p>No accepted inspection saved. {data.nextAction}</p> : <>
      <h3>{data.name}</h3><p>{data.inspection.reportedRowCount} substitute-basket rows · {data.inspection.benchmarkRowCount} partial benchmark rows</p>
      <p>Composition: {data.compositionDate ?? 'Unknown'} · Source check: {data.lastVerifiedAt ?? 'Unknown'}</p>
      <p>Weight unit: {data.evidence.weightUnit ?? 'Unknown'} · <strong>Next: {data.nextAction}</strong></p>
      <p>{data.blocker}</p>
      {data.inspection.sourceLimits.map(limit => <p className="notice" key={limit.id}>{limit.detail}</p>)}
      <details><summary>Source reference</summary><p>{data.sourceUrl ?? 'Not recorded'}</p><p>SHA-256: {data.evidence.sha256 ?? 'Not recorded'}</p></details>
      <div className="history-positions">{data.rows.map((row, index) => <article className="history-position" key={`${row.sourceScope}-${row.row}-${index}`}><h3>{row.name}</h3><p>{row.isin ?? 'No ISIN'} · {row.sourceScope ?? 'Unknown scope'}</p><p>Reported weight: {row.weight ?? 'Unknown'} {row.weightUnit ?? ''}</p></article>)}</div>
    </>}
    <button className="secondary" onClick={() => setRetry(value => value + 1)}>Reload saved inspection</button>
  </section>
}
