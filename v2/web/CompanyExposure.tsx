import React, { useEffect, useState } from 'react'
import { Decimal } from 'decimal.js'
import type { PortfolioService } from '../server/service'
type Exposure = ReturnType<PortfolioService['exposure']>
const money = (v: string | null, c: string | null) =>
  v === null ? 'Unknown' : `${new Decimal(v).toFixed(2)} ${c ?? ''}`
const pct = (v: string | null) => (v === null ? 'Unknown' : `${new Decimal(v).toFixed(2)}%`)

export function CompanyExposure() {
  const [data, setData] = useState<Exposure | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const r = await fetch('/api/exposure', { signal: controller.signal })
        if (!r.ok) throw Error()
        const next: Exposure = await r.json()
        if (!controller.signal.aborted) {
          setData(next)
          setLoadError(null)
        }
      } catch {
        if (!controller.signal.aborted)
          setLoadError(
            'Cannot refresh company exposure. Displayed results are from the previous load. Check the local service and reload.'
          )
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [])
  async function refresh() {
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/composition/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Prism-Client': '1' },
        body: '{}',
      })
      if (!r.ok) throw Error()
    } catch {
      setError(
        'Refresh could not start. Wait for any running refresh, then retry. The pilot ETF must be in your saved holdings.'
      )
    } finally {
      setSubmitting(false)
    }
  }
  const composition = data?.composition
  const rows =
    data?.rows.filter((c) => `${c.name} ${c.isin}`.toLowerCase().includes(filter.toLowerCase())) ??
    []
  return (
    <section className="panel holdings company-exposure" aria-labelledby="exposure-title">
      <div className="section-title">
        <h2 id="exposure-title">Company exposure</h2>
        <span className="badge">One ETF · partial coverage</span>
      </div>
      <p>
        See direct shares and the known contribution through iShares Core S&amp;P 500 UCITS ETF USD
        (Dist), IE0031442068. Values use saved broker bids. Missing exposure is unknown, not zero.
      </p>
      <div className="actions">
        <button
          disabled={submitting || data?.refreshing || !data?.pilotOwned}
          onClick={() => void refresh()}
        >
          {submitting || data?.refreshing ? 'Refreshing composition…' : 'Refresh ETF composition'}
        </button>
      </div>
      {!data && <p role="status">Loading company exposure…</p>}
      {data && !data.pilotOwned && (
        <p className="notice">
          The pilot ETF is not in your saved holdings. Import your portfolio to calculate its
          contribution.
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loadError && (
        <p role="alert" className="notice error">
          {loadError}
        </p>
      )}
      {data?.warning && (
        <p role="alert" className="notice error">
          {data.warning}
        </p>
      )}
      {data?.refreshFailed && (
        <p role="alert" className="notice error">
          Latest composition refresh failed ({data.attempt?.code}).{' '}
          {composition
            ? 'Last successful composition retained; refresh is stale.'
            : 'No successful composition is available.'}{' '}
          Check the source, then retry. Diagnostic reference: {data.attempt?.id}
        </p>
      )}
      {composition ? (
        <div className="notice">
          <p>
            <a href={composition.sourceUrl} target="_blank" rel="noreferrer">
              Source: justETF top ten holdings
            </a>{' '}
            · Composition date: {composition.asOf ?? 'Unknown'} · Retrieved:{' '}
            {composition.retrievedAt}
          </p>
          <p>
            {data?.stale ? 'Stale composition: date unknown or older than 30 days. ' : ''}Disclosed:{' '}
            {composition.disclosedPercent}% · Identified equity: {composition.identifiedPercent}% ·
            Undisclosed: {composition.missingPercent}%. Weights are percentages of the fund. No
            normalization or second currency conversion.
          </p>
          <details>
            <summary>Source evidence and unresolved rows</summary>
            <p>
              Fund: {composition.fundName} · {composition.fundIsin}
            </p>
            <p className="mono">SHA-256: {composition.sha256}</p>
            <p>
              Raw source evidence is saved locally for offline replay.{' '}
              <a href={composition.termsUrl} target="_blank" rel="noreferrer">
                Source terms
              </a>
              ; redistribution rights are not established.
            </p>
            {composition.rows
              .filter((r) => r.issue)
              .map((r, i) => (
                <p key={i}>
                  {r.name}: {r.weightPercent}% — {r.issue}
                </p>
              ))}
          </details>
        </div>
      ) : (
        <p className="notice">
          No validated ETF composition saved. Direct holdings remain visible. Use Refresh ETF
          composition to retrieve the pilot source.
        </p>
      )}
      <div className="grid">
        {data?.coverage.map((c) => (
          <article className="panel" key={c.currency}>
            <h3>{c.currency} coverage</h3>
            <p>
              Known company value: {money(c.knownCompanyValue, c.currency)} ({pct(c.knownPercent)})
            </p>
            <p>Unresolved priced value: {money(c.unresolvedValue, c.currency)}</p>
            <p>
              Denominator: {money(c.pricedSecurities, c.currency)} in priced securities. Excludes
              cash and all unvalued positions.
            </p>
          </article>
        ))}
      </div>
      <p>
        {data?.missingValuations ?? 0} positions have unknown valuations. Company figures are known
        subtotals; other ETFs and undisclosed constituents can add further exposure. Different share
        classes and listings remain separate until their relationship is verified.
      </p>
      <label>
        Find a company or ISIN
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      <div className="exposure-list">
        {rows.map((c) => (
          <details className="company-card" key={`${c.isin}:${c.currency}`}>
            <summary>
              <strong>{c.name}</strong>{' '}
              <span>
                {money(
                  c.contributions.every((r) => r.value === null) ? null : c.knownTotal,
                  c.currency
                )}{' '}
                known ·{' '}
                {pct(c.contributions.every((r) => r.value === null) ? null : c.percentOfPriced)} of
                priced {c.currency ?? 'currency'}
              </span>
            </summary>
            <p className="mono">
              {c.isin} · Exact security ISIN match; no name or ticker matching.
            </p>
            <p>
              Known direct:{' '}
              {money(
                c.contributions.some((r) => r.kind === 'direct' && r.value === null)
                  ? null
                  : c.direct,
                c.currency
              )}{' '}
              · Known indirect:{' '}
              {money(
                c.contributions.some((r) => r.kind === 'etf' && r.value === null)
                  ? null
                  : c.indirect,
                c.currency
              )}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Contribution</th>
                    <th>Position value</th>
                    <th>Weight</th>
                    <th>Known value</th>
                    <th>Valuation evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {c.contributions.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.kind === 'direct' ? 'Direct shares' : 'Via ETF'}
                        <small>{r.positionIsin}</small>
                      </td>
                      <td>{money(r.positionValue, c.currency)}</td>
                      <td>{r.weightPercent}%</td>
                      <td>{money(r.value, c.currency)}</td>
                      <td>
                        {r.quoteAt ?? 'Unknown date'}
                        <small>{r.quality}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Indirect value = ETF position value × weight ÷ 100. Composition date:{' '}
              {composition?.asOf ?? 'Unknown'}. Positions imported: {data?.holdingsAt ?? 'Unknown'}.
            </p>
          </details>
        ))}
      </div>
      {!rows.length && data && <p>No matching company contributions.</p>}
      <details className="notice">
        <summary>Coverage gaps ({data?.gaps.length ?? 0})</summary>
        {data?.gaps.map((g, i) => (
          <p key={i}>
            <strong>{g.name}</strong> · {g.isin} · {money(g.value, g.currency)} unresolved —{' '}
            {g.reason}
          </p>
        ))}
      </details>
    </section>
  )
}
