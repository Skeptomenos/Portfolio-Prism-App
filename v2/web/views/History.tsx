import React, { useEffect, useState } from 'react'
import type { HistoryCheckpointDetail, HistoryCheckpointSummary, HistoryNotice, HistoryRunDetail, HistoryRunsPage } from '../../contracts/history'
import type { HistoryClient } from './history-client'
import { AllocationBar, coverageMoney, coveragePercent } from '../CoverageSummary'

const stamp = (value: string | null) => value ?? 'Unknown'
const amount = (value: string | null, currency: string | null) => value === null ? 'Unknown' : coverageMoney(value, currency ?? '(currency unknown)')
const exactAmount = (value: string | null, currency: string | null) => value === null ? 'Unknown' : `${value} ${currency ?? '(currency unknown)'}`
const checkpointHref = (id: string) => `#/history?checkpoint=${encodeURIComponent(id)}`
const runHref = (id: string) => `#/history?run=${encodeURIComponent(id)}`

function Notices({ notices }: { notices: readonly HistoryNotice[] }) {
  return <>{notices.map((notice, index) => <p className={`notice ${notice.severity}`} key={`${notice.code}-${index}`}>
    {notice.message} {notice.nextAction && <strong>Next: {notice.nextAction}</strong>}
    {notice.diagnosticId && <small>Diagnostic: {notice.diagnosticId}</small>}
  </p>)}</>
}

function Summary({ checkpoint: c }: { checkpoint: HistoryCheckpointSummary }) {
  return <section className="panel history-summary" aria-label="Saved checkpoint coverage">
    <div className="section-title"><h2>As recorded then</h2><span className="badge">Valuation {c.valuationState}</span></div>
    <p>Saved {c.recordedAt} · {c.reason}</p>
    <p><strong>{c.pricedPositionCount} priced · {c.unvaluedPositionCount} unvalued · {c.zeroPositionCount} zero positions</strong></p>
    {c.currencies.length === 0 && <p>No supported currency totals. Missing value is unknown.</p>}
    <div className="history-currencies">{c.currencies.map(row => <section key={row.currency} className="history-currency" aria-label={`${row.currency} saved allocation`}>
      <h3>{row.currency} · Priced-securities allocation</h3>
      <strong>{coveragePercent(row.coveragePercent)} · {row.allocationState}</strong>
      <p>Included {amount(row.includedSecurityValue, row.currency)} / priced {amount(row.pricedSecurities, row.currency)}</p>
      {['allocated', 'partial'].includes(row.allocationState) && <AllocationBar percent={row.coveragePercent} label={`${row.currency} priced-securities allocation: ${coveragePercent(row.coveragePercent)}; unassigned ${amount(row.unassignedValue, row.currency)}. Excludes unvalued positions and cash.`} />}
      <p>Unassigned {amount(row.unassignedValue, row.currency)} · Non-company {amount(row.nonCompanyValue, row.currency)}</p>
      <p><strong>Separate cash: {amount(row.cashValue, row.currency)}</strong> · {row.cashState}</p>
      <details className="history-exact-values"><summary>Exact saved values · {row.currency}</summary>
        <dl className="history-facts">
          <div><dt>Allocation percent</dt><dd>{row.coveragePercent ?? 'Unknown'}</dd></div>
          <div><dt>Included</dt><dd>{exactAmount(row.includedSecurityValue, row.currency)}</dd></div>
          <div><dt>Priced securities</dt><dd>{exactAmount(row.pricedSecurities, row.currency)}</dd></div>
          <div><dt>Unassigned</dt><dd>{exactAmount(row.unassignedValue, row.currency)}</dd></div>
          <div><dt>Non-company</dt><dd>{exactAmount(row.nonCompanyValue, row.currency)}</dd></div>
          <div><dt>Separate cash</dt><dd>{exactAmount(row.cashValue, row.currency)}</dd></div>
        </dl>
      </details>
    </section>)}</div>
    <p>Company grouping {c.companyGrouping} · Broker reconciliation {c.reconciliation}. Priced allocation excludes cash and unvalued positions.</p>
    <dl className="history-facts">
      <div><dt>Holdings observed</dt><dd>{stamp(c.holdingsObservedAt)}</dd></div>
      <div><dt>Quote dates</dt><dd>{stamp(c.quoteDates.min)} → {stamp(c.quoteDates.max)}</dd></div>
      <div><dt>Composition dates</dt><dd>{stamp(c.compositionDates.min)} → {stamp(c.compositionDates.max)}</dd></div>
    </dl>
    <Notices notices={c.notices} />
  </section>
}

function Checkpoint({ detail }: { detail: HistoryCheckpointDetail }) {
  return <>
    <a className="return-link" href={runHref(detail.checkpoint.runId)}>← Operation and checkpoints</a>
    <Summary checkpoint={detail.checkpoint} />
    <section className="panel" aria-labelledby="saved-positions"><h2 id="saved-positions">Saved positions</h2>
      <p>Quantities are observations. They do not establish purchases, capital added or returns.</p>
      <div className="history-positions">{detail.positions.map((position, index) => <article className="history-position" key={`${position.account.connectionId}-${position.account.accountId}-${position.isin}-${index}`}>
        <h3>{position.name || position.isin}</h3><p className="mono">{position.isin}</p>
        <dl className="history-facts">
          <div><dt>Quantity</dt><dd>{position.quantity}</dd></div>
          <div><dt>Saved value</dt><dd>{amount(position.value, position.currency)}</dd></div>
          <div><dt>Unit price</dt><dd>{amount(position.unitPrice, position.currency)}</dd></div>
          <div><dt>Quote at</dt><dd>{stamp(position.quoteAt)}</dd></div>
        </dl><p>{position.valuationStatus} · {position.quality}</p>
        <details className="history-exact-values"><summary>Exact saved position values</summary>
          <dl className="history-facts"><div><dt>Quantity</dt><dd>{position.quantity}</dd></div>
            <div><dt>Saved value</dt><dd>{exactAmount(position.value, position.currency)}</dd></div>
            <div><dt>Unit price</dt><dd>{exactAmount(position.unitPrice, position.currency)}</dd></div></dl>
        </details>
        <details><summary>Account scope</summary><p>{position.account.connectionId} / {position.account.accountId}</p></details>
      </article>)}</div>
      {!detail.positions.length && <p>No positions in this checkpoint.</p>}
    </section>
    <section className="panel history-evidence" aria-labelledby="saved-sources"><h2 id="saved-sources">Saved source references</h2>
      <p>Replay {detail.replay.state}. {detail.replay.reason} Display uses the saved result; it does not fetch today’s prices.</p>
      {!detail.inputs.length && <p>No surviving source references recorded.</p>}
      {detail.inputs.map(input => <details key={input.id}><summary>{input.kind} · {input.sourceId} · Source date {stamp(input.asOf)}</summary>
        <dl className="history-facts"><div><dt>Observation</dt><dd>{input.id}</dd></div><div><dt>Observed at</dt><dd>{stamp(input.observedAt)}</dd></div>
          <div><dt>SHA-256</dt><dd>{input.sha256 ?? 'Not recorded'}</dd></div><div><dt>Parser</dt><dd>{input.parserVersion ?? 'Not recorded'}</dd></div></dl>
      </details>)}
      <details><summary>Dataset and calculation versions</summary><p>Dataset: {detail.checkpoint.datasetId} · Checkpoint: {detail.checkpoint.id}</p>
        {Object.entries(detail.versions).map(([name, version]) => <p key={name}>{name}: {version}</p>)}
      </details>
    </section>
  </>
}

type Result = { kind: 'page'; value: HistoryRunsPage } | { kind: 'run'; value: HistoryRunDetail } | { kind: 'checkpoint'; value: HistoryCheckpointDetail }
export function History({ client, params }: { client: HistoryClient; params: URLSearchParams }) {
  const checkpointId = params.get('checkpoint')
  const runId = params.get('run')
  const cursor = params.get('cursor')
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([checkpointId, runId, cursor, retry])
  const [state, setState] = useState<{ key: string; result?: Result; error?: string }>({ key: '' })
  useEffect(() => {
    const controller = new AbortController()
    const request: Promise<Result> = checkpointId
      ? client.checkpoint(checkpointId, controller.signal).then(value => ({ kind: 'checkpoint', value }))
      : runId ? client.run(runId, controller.signal).then(value => ({ kind: 'run', value }))
      : client.runs(cursor, controller.signal).then(value => ({ kind: 'page', value }))
    void request.then(result => { if (!controller.signal.aborted) setState({ key, result }) })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'History unavailable. Check the local service and retry.' }) })
    return () => controller.abort()
  }, [client, checkpointId, runId, cursor, key])
  const result = state.key === key ? state.result : undefined
  const error = state.key === key ? state.error : undefined
  return <div className="history-view">
    <nav aria-label="History navigation" className="history-toolbar"><a href="#/history">All operations</a><button className="secondary" onClick={() => setRetry(value => value + 1)}>Reload saved history</button></nav>
    {error ? <p role="alert" className="notice error">{error}</p> : !result ? <p role="status">Loading saved history…</p> : result.kind === 'checkpoint' ? <Checkpoint detail={result.value} /> : result.kind === 'run' ? <>
      <section className="panel"><h2>Operation · {result.value.run.status}</h2><p>{result.value.run.trigger} · {result.value.run.startedAt}</p><p>Finished: {stamp(result.value.run.finishedAt)}</p><Notices notices={result.value.run.notices} />
        {!result.value.checkpoints.length && <p>No checkpoint was published for this operation. Earlier saved results remain in All operations.</p>}
        <ol className="history-list">{result.value.checkpoints.map(item => <li key={item.id}><a href={checkpointHref(item.id)}>{item.recordedAt} · {item.reason}</a><span>{item.valuationState} valuation · {item.unvaluedPositionCount} unvalued</span></li>)}</ol>
      </section>
    </> : <section className="panel"><h2>Saved operations</h2><p>Open an operation, then select a frozen checkpoint. Dates describe saved evidence, not a current market value.</p>
      {!result.value.items.length && <p>No saved history yet. A supported portfolio sync creates the first checkpoint; missing earlier evidence cannot be reconstructed.</p>}
      <ol className="history-list">{result.value.items.map(run => <li key={run.id}><a href={runHref(run.id)}>{run.startedAt} · {run.trigger}</a><strong>{run.status} · {run.checkpointCount} checkpoints</strong><Notices notices={run.notices} /></li>)}</ol>
      {result.value.nextCursor && <a href={`#/history?cursor=${encodeURIComponent(result.value.nextCursor)}`}>Older operations →</a>}
    </section>}
  </div>
}
