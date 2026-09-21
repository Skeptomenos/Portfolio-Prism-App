import React, { useEffect, useState } from 'react'
import { CoverageSummary, coverageMoney } from '../CoverageSummary'
import type { AnalysisSnapshot, FinancialClient } from './financial-client'
import type { ContributionMix as Mix } from './contribution-mix'
import { contributionMixMethod } from './contribution-mix'

export function ContributionMix({ client, evaluate }: {
  client: Pick<FinancialClient, 'analysis'>
  evaluate: (input: AnalysisSnapshot) => Mix
}) {
  const [saved, setSaved] = useState<{ input: AnalysisSnapshot; rows: Mix } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const input = await client.analysis(controller.signal)
        const rows = evaluate(input)
        if (!controller.signal.aborted) { setSaved({ input, rows }); setError(null) }
      } catch {
        if (!controller.signal.aborted) setError('Contribution analysis is unavailable or incompatible. Previous figures keep their original dates. Check the local service and reload.')
      } finally { if (!controller.signal.aborted) timer = setTimeout(poll, 5000) }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [client, evaluate])
  return <>
    <CoverageSummary report={saved?.input.data.coverage ?? null} error={error} />
    {saved && <section className="panel contribution-mix" aria-labelledby="mix-title">
      <h2 id="mix-title">Where included exposure comes from</h2>
      <p>Already included security value · separate currencies · excludes cash and unassigned value.</p>
      <div className="contribution-mix-currencies">{saved.rows.map(row => <article key={row.currency} aria-label={`${row.currency} contribution mix`}>
        <h3>{row.currency}</h3><dl className="contribution-mix-values">
          <div><dt>Direct stocks</dt><dd>{coverageMoney(row.direct, row.currency)}</dd></div>
          <div><dt>Through ETFs</dt><dd>{coverageMoney(row.etf, row.currency)}</dd></div>
          <div><dt>Unvalued contributions</dt><dd>{row.unknownContributions}</dd></div>
        </dl>
      </article>)}</div>
      {!saved.rows.length && <p>No priced currency group is available. Resolve the valuation gaps first.</p>}
      <p><a href="#/breakdown">Inspect direct and ETF contributions</a> · <a href="#/development">Resolve source gaps</a></p>
      <details><summary>Method and exact input</summary><p>{contributionMixMethod.meaning}</p>
        <p>{contributionMixMethod.id} · version {contributionMixMethod.version}</p>
        <p>Saved holdings observed: {saved.input.data.exposure.holdingsAt ?? 'Unknown'}. This is a live read projection, not a historical checkpoint or performance return.</p>
        <p className="mono" style={{ overflowWrap: 'anywhere' }}>Input content ID: {saved.input.snapshot.id}</p>
        {saved.rows.map(row => <p key={row.currency}>{row.currency} exact: direct {row.direct}; ETF {row.etf}.</p>)}
      </details>
    </section>}
  </>
}
