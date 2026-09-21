import React, { useEffect, useState } from 'react'
import { CoverageSummary, type AnalysisSnapshot, type FinancialClient, type BrowserViewModule } from '../../sdk/browser'
import { exampleFundIsin, exampleMetadata } from './metadata'
/** Only the scoped financial reader is supplied; no provider, store or fixture import. */
export function SyntheticSourcePanel({ client }: { client: Pick<FinancialClient, 'analysis'> }) {
  const [saved, setSaved] = useState<AnalysisSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void client.analysis(controller.signal).then(value => {
      if (!controller.signal.aborted) { setSaved(value); setError(null) }
    }).catch(() => { if (!controller.signal.aborted) setError('Source panel could not load. Saved figures keep their original dates. Check the local service and retry.') })
    return () => controller.abort()
  }, [client, revision])
  const source = saved?.data.exposure.compositions.find(item => item.fundIsin === exampleFundIsin)
  const rows = saved?.data.exposure.rows.filter(row => row.contributions.some(item => item.kind === 'etf' && item.positionIsin === exampleFundIsin)) ?? []
  return <>
    <CoverageSummary report={saved?.data.coverage ?? null} error={error} />
    <section className="panel" aria-labelledby="synthetic-title">
      <h2 id="synthetic-title">Saved source contributions</h2>
      <p>Synthetic contributor example. Fictional holdings; no real issuer or investment result.</p>
      <button onClick={() => setRevision(value => value + 1)}>Reload saved figures</button>
      {!saved && !error && <p role="status">Loading saved data…</p>}
      {saved && <>
        <p>Fund: {exampleFundIsin}. Source date: {source?.asOf ?? 'Unknown'}.</p>
        {!source && <p>No accepted source is available. Inspect provider diagnostics before interpreting exposure.</p>}
        {rows.map(row => <article key={`${row.isin}:${row.currency}`}><h3>{row.name}</h3><p>{row.isin}</p>
          {row.contributions.filter(item => item.kind === 'etf' && item.positionIsin === exampleFundIsin).map((item, index) =>
            <p key={index}>Supported value: {item.value === null ? 'Unknown' : item.value} {row.currency ?? ''}</p>)}
        </article>)}
        <p>These are core-calculated contributions. Missing prices remain unknown. Resolve gaps in the coverage summary.</p>
        <details><summary>Source evidence</summary><p style={{ overflowWrap: 'anywhere' }}>Source hash: {source?.sha256 ?? 'Unknown'}</p>
          <p>Retrieved: {source?.retrievedAt ?? 'Unknown'}</p><p style={{ overflowWrap: 'anywhere' }}>Input content ID: {saved.snapshot.id}</p>
          <p>Live projection identity, not a historical checkpoint or a performance return.</p></details>
      </>}
    </section>
  </>
}
export function exampleView(client: Pick<FinancialClient, 'analysis'>): BrowserViewModule {
  return { metadata: exampleMetadata, viewId: 'synthetic-source-panel', render: () => <SyntheticSourcePanel client={client} /> }
}
