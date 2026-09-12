import React, { useEffect, useState } from 'react'
import type { DataSource, Json } from '../server/explorer'
import type { Snapshot } from '../server/model'

const label = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')
function DataValue({ value }: { value: Json }) {
  const [limit, setLimit] = useState(30)
  if (value === null) return <span className="muted">Not supplied (null)</span>
  if (typeof value !== 'object') return <span className="data-value">{String(value)}</span>
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i + 1), v] as const)
    : Object.entries(value)
  if (!entries.length)
    return (
      <span className="muted">
        {Array.isArray(value) ? 'Empty list returned' : 'Empty object returned'}
      </span>
    )
  return (
    <div className="data-tree">
      {entries.slice(0, limit).map(([key, val]) => (
        <div className="data-field" key={key}>
          {val !== null && typeof val === 'object' ? (
            <details>
              <summary>
                {label(key)}{' '}
                <small>
                  {Array.isArray(val) ? `${val.length} items` : `${Object.keys(val).length} fields`}
                </small>
              </summary>
              <DataValue value={val} />
            </details>
          ) : (
            <>
              <strong>{label(key)}</strong>
              <DataValue value={val} />
            </>
          )}
        </div>
      ))}
      {entries.length > limit && (
        <button className="secondary" onClick={() => setLimit((n) => n + 50)}>
          Show 50 more ({entries.length - limit} remaining)
        </button>
      )}
    </div>
  )
}
export function DataExplorer({
  busy,
  connected,
  revision,
  snapshot,
  action,
}: {
  busy: boolean
  connected: boolean
  revision?: string
  snapshot?: Snapshot | null
  action: (path: string) => Promise<void>
}) {
  const [sources, setSources] = useState<DataSource[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/data', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw Error()
        setSources((await res.json()).sources)
        setError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [revision])
  const visible = sources.filter((s) =>
    `${s.title} ${s.id} ${s.note}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      <section className="panel holdings explorer">
        <p className="eyebrow">TRADE REPUBLIC · SOURCE DATA</p>
        <div className="section-title">
          <h2>Explore what your broker knows</h2>
          <span className="badge">
            {sources.filter((s) => s.status === 'success').length} / {sources.length} sources
            retrieved
          </span>
        </div>
        <p>
          This is a read-only inventory of the supported account data and held-instrument public
          data. Each card shows broker fields, scope and retrieval evidence. Success means a
          response was received, not that every field is understood or the broker exposes its full
          history.
        </p>
        <div className="actions">
          <button disabled={busy || !connected} onClick={() => void action('extract')}>
            Extract broker data
          </button>
          <button
            className="secondary"
            disabled={busy || !connected}
            onClick={() => void action('history/continue')}
          >
            Continue history & details
          </button>
        </div>
        <p role="status">
          {busy
            ? 'An operation is running. Results appear source by source; you can cancel above.'
            : 'Saved source data remains available after restart. Extraction continues through history batches until complete or cancelled; use Continue to resume. Use extraction to refresh this inventory; automatic holdings refresh does not refresh these records.'}
        </p>
        <label>
          Find a data source
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cash, taxes, transactions, quotes…"
          />
        </label>
        {error && <p role="alert">Could not load the local data explorer. Reload to retry.</p>}
        <div className="source-list">
          {visible.map((source) => (
            <details className="source-card" key={source.id}>
              <summary>
                <span>{source.title}</span>
                <span className={`badge ${source.status === 'failed' ? 'error' : ''}`}>
                  {source.status.replace('-', ' ')}
                </span>
              </summary>
              <p>{source.note}</p>
              <p>
                <strong>Coverage:</strong> {source.coverage}
              </p>
              <p>
                <strong>Source:</strong> Trade Republic via read-only adapter ·{' '}
                <code>{source.id}</code>
              </p>
              <p>
                Last attempt:{' '}
                {source.attemptedAt
                  ? new Date(source.attemptedAt).toLocaleString()
                  : 'Not attempted'}
                <br />
                Saved response:{' '}
                {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString() : 'None'}
              </p>
              {source.error && (
                <p role="status" className="notice error">
                  Retrieval failed: {source.error.category}
                  {source.error.httpStatus ? ` · HTTP ${source.error.httpStatus}` : ''}.{' '}
                  {source.payload
                    ? 'Previous response retained; it may be stale.'
                    : 'No response saved.'}{' '}
                  See local diagnostics for this source. Retry extraction.
                </p>
              )}
              {source.payload !== undefined && <DataValue value={source.payload} />}
            </details>
          ))}
        </div>
        <p>
          Private records stay in the local database. Authentication material and URLs that may
          grant document access are omitted. Document contents are not downloaded. This inventory
          does not claim to cover every undocumented broker endpoint.
        </p>
      </section>
    </>
  )
}
