import { nqseIsin } from './nqse-sensitivity'
import React, { useEffect, useState } from 'react'
import { Decimal } from 'decimal.js'
import type { CoverageReport } from '../contracts/financial'
import type { FinancialClient } from './views/financial-client'
import { entityHref } from './navigation'

export const coverageMoney = (value: string, currency: string) => {
  const amount = new Decimal(value)
  return `${amount.gt(0) && amount.toFixed(2) === '0.00' ? '<0.01' : amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${currency}`
}
export const coveragePercent = (value: string | null) => {
  if (value === null) return 'Unavailable'
  const decimal = new Decimal(value)
  if (decimal.lt(100) && decimal.toFixed(2) === '100.00') return '<100%'
  if (decimal.gt(0) && decimal.toFixed(2) === '0.00') return '<0.01%'
  return `${decimal.toFixed(2)}%`
}
const date = (value: string | null) => value ? value.slice(0, 10) : 'Unknown'
const dates = (range: { earliest: string | null; latest: string | null }) =>
  date(range.earliest) === date(range.latest) ? date(range.earliest) : `${date(range.earliest)} – ${date(range.latest)}`

export function useCoverage(enabled: boolean, client: Pick<FinancialClient, 'coverage'>) {
  const [report, setReport] = useState<CoverageReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout>
    let generation = 0
    let disposed = false
    let controller: AbortController | null = null
    async function poll(expected: number) {
      if (disposed || expected !== generation) return
      controller?.abort()
      controller = new AbortController()
      try {
        const next = await client.coverage(controller.signal)
        if (!disposed && expected === generation && !controller.signal.aborted) { setReport(next); setError(null) }
      } catch {
        if (!disposed && expected === generation && !controller.signal.aborted) setError('Coverage could not refresh. Saved figures keep their original dates. Check the local service; retrying automatically.')
      } finally {
        if (!disposed && expected === generation && !controller.signal.aborted) timer = setTimeout(() => void poll(expected), 5000)
      }
    }
    const changed = () => {
      generation += 1
      clearTimeout(timer)
      controller?.abort()
      void poll(generation)
    }
    window.addEventListener('prism-investigations-changed', changed)
    void poll(generation)
    return () => {
      disposed = true
      generation += 1
      controller?.abort()
      clearTimeout(timer)
      window.removeEventListener('prism-investigations-changed', changed)
    }
  }, [enabled, client])
  return { report, error }
}

export function AllocationBar({ percent, label, nonCompanyPercent = null }: {
  percent: string | null
  label: string
  nonCompanyPercent?: string | null
}) {
  if (percent === null || new Decimal(percent).lt(0) || new Decimal(percent).gt(100)) return null
  return <div className="allocation-bar" role="img" aria-label={label}>
    <span className="allocation-included" style={{ width: `${percent}%` }} />
    {nonCompanyPercent !== null && new Decimal(nonCompanyPercent).gte(0) && new Decimal(nonCompanyPercent).lte(100) &&
      <span style={{ width: `${nonCompanyPercent}%`, height: '100%', flexShrink: 0, background: 'var(--muted)' }} />}
  </div>
}

export function CoverageSummary({ report, error, compact = false }: {
  report: CoverageReport | null; error: string | null; compact?: boolean
}) {
  if (!report) return <section className="panel coverage-summary" aria-label="Portfolio coverage">
    <h2>Portfolio coverage</h2>
    <p role={error ? 'alert' : 'status'}>{error ?? 'Loading coverage and remaining gaps…'}</p>
  </section>
  return <section className={`panel coverage-summary ${compact ? 'coverage-compact' : ''}`} aria-labelledby="coverage-title">
    <div className="coverage-heading">
      <h2 id="coverage-title">Portfolio coverage</h2>
      <span className="state-chip open">{report.positionCount ? 'Partial exposure' : 'Coverage unavailable'}</span>
    </div>
    {error && <p role="alert" className="coverage-alert">{error}</p>}
    {!report.totals.length && <p>No priced securities yet. Import positions and resolve their valuations.</p>}
    {report.totals.map(total => {
      const hasNonCompany = total.nonCompanyValue !== null && new Decimal(total.nonCompanyValue).gt(0)
      const nonCompanyPercent = hasNonCompany && new Decimal(total.pricedSecurities).gt(0)
        ? new Decimal(total.nonCompanyValue!).div(total.pricedSecurities).mul(100).toFixed() : null
      const accountingLabel = `${total.currency}: ${coverageMoney(total.knownCompanyValue, total.currency)} allocated to securities; ${hasNonCompany ? `${coverageMoney(total.nonCompanyValue!, total.currency)} non-company crypto; ` : ''}${coverageMoney(total.unresolvedValue, total.currency)} unassigned`
      return <div className="coverage-currency" key={total.currency}>
      <div className="coverage-numbers">
        <div className="coverage-headline">
          <strong>{total.state === 'incompatible' ? 'Unavailable' : coveragePercent(total.knownPercent)}</strong>
          <span>{total.currency} {hasNonCompany ? 'priced assets allocated to securities' : 'priced securities allocated'}</span>
        </div>
        <div className="coverage-ratio">
          <strong>{coverageMoney(total.knownCompanyValue, total.currency)}</strong>
          <span>of {coverageMoney(total.pricedSecurities, total.currency)}</span>
          <span className="coverage-remainder"><b>{coverageMoney(total.unresolvedValue, total.currency)}</b> unassigned</span>
        </div>
      </div>
      {total.state !== 'unavailable' && total.state !== 'incompatible' && <AllocationBar percent={total.knownPercent}
        nonCompanyPercent={nonCompanyPercent} label={hasNonCompany ? accountingLabel : `${coveragePercent(total.knownPercent)} allocated; ${coverageMoney(total.unresolvedValue, total.currency)} unassigned`} />}
      {total.state === 'incompatible' && <p role="alert">Allocation cannot share a 0–100% basis. Inspect source accounting.</p>}
      {hasNonCompany && <div className="coverage-non-company">
        <span><b>{coverageMoney(total.nonCompanyValue!, total.currency)}</b> non-company crypto value</span>
      </div>}
    </div>
    })}
    <div className="coverage-signals">
      <span><b>{report.unvalued}</b> positions unvalued</span>
      <span>Company grouping: <b>{report.companyGrouping}</b></span>
      <span>Broker reconciliation: <b>{report.reconciliation}</b></span>
    </div>
    <div className="coverage-dates">
      <span>Quotes <b>{dates(report.quoteDates)}</b>{report.staleQuotes > 0 && <em> · {report.staleQuotes} older than 24h</em>}</span>
      <span>ETF compositions used <b>{dates(report.compositionDates)}</b>{report.staleCompositions > 0 && <em> · {report.staleCompositions} stale</em>}</span>
    </div>
    {(report.refreshFailed || report.warning) && <p className="coverage-alert" role="alert">Latest refresh needs attention. Last saved inputs remain in use. <a href="#/data">Review refresh</a>{report.warning && <span> {report.warning}</span>}</p>}
    <div className="coverage-footer">
      {(report.manualValuations ?? 0) > 0 && <span>{report.manualValuations} positions use user-provided manual price fallback; not broker-verified.</span>}
      <span>Whole portfolio · direct + ETF. {report.totals.some(total => total.nonCompanyValue !== null && new Decimal(total.nonCompanyValue).gt(0)) ? 'Includes non-company crypto. ' : ''}Excludes cash and unvalued positions.</span>
      <details id="coverage-gaps" className="coverage-gap-list">
        <summary>View {report.gaps.length} gaps and next actions</summary>
        <p>Unassigned value may contain non-equity assets and unresolved exposure. It is not all missing company investment. Values use saved broker bids and supported issuer allocations.</p>
        {report.gaps.map((gap, index) => <div className="coverage-gap" key={`${gap.account}-${gap.isin}-${index}`}>
          <div><strong>{gap.fund ? <a href={entityHref('/fund/' + gap.isin)}>{gap.name}</a> : gap.name}</strong><span>{gap.value === null ? 'Value unknown' : coverageMoney(gap.value, gap.currency ?? '')}</span></div>
          <b>{gap.nextAction}</b><p>{gap.reason}</p>
        </div>)}
        <div className="coverage-gap"><strong>Company grouping · {report.companyGrouping}</strong><p>Next: verify security-to-company relationships, including share classes and depositary receipts, against primary identity evidence. Exact security matches remain included.</p></div>
        <div className="coverage-gap"><strong>Broker reconciliation · pending</strong><p>Next: compare positions, quantities and the saved bid valuation method with fresh broker evidence. Snapshot: {date(report.holdingsAt)}.</p></div>
      </details>
    </div>
  </section>
}

export function EtfCoverageTable({ report }: { report: CoverageReport | null }) {
  if (!report) return <p role="status">Loading ETF coverage…</p>
  const labels: Record<string, string> = { included: 'Included', pilot: 'Top-ten only',
    'integration-pending': 'Ready · not integrated', missing: 'Missing data',
    'underlying-only': 'Hedge unresolved', 'inspection-only': 'Inspection only', 'checks-pending': 'Checks pending', 'checks-failed': 'Checks failed' }
  const funds = [...report.funds].sort((a, b) => {
    if (!a.values.length || !b.values.length) return a.values.length - b.values.length
    return a.values[0].currency.localeCompare(b.values[0].currency) || new Decimal(b.values[0].unassigned).cmp(a.values[0].unassigned)
  })
  return <section className="panel etf-coverage" aria-labelledby="funds-title">
    <div className="section-title"><h2 id="funds-title">Your ETF data</h2><span className="badge">{report.counts.held} held ETFs</span></div>
    <ol className="etf-stage-counts" aria-label="ETF data progress">
      <li><strong>{report.counts.saved}<small>/{report.counts.held}</small></strong><span>Data saved</span></li>
      <li><strong>{report.counts.checked}<small>/{report.counts.held}</small></strong><span>Checked</span></li>
      <li><strong>{report.counts.used}<small>/{report.counts.held}</small></strong><span>Used in exposure</span></li>
    </ol>
    {report.counts.underlyingOnly > 0 && <p className="etf-matrix-note">{report.counts.underlyingOnly} saved dataset covers the shared underlying only; the held class still needs checks.</p>}
    <div className="table-scroll etf-matrix-scroll"><table className="etf-matrix">
      <caption>Largest unassigned amounts first within each currency; unknown values first. ETF progress is separate from portfolio coverage.</caption>
      <thead><tr><th>ETF</th><th>Saved / checked / used</th><th>Included allocation</th><th>Unassigned</th><th>Next action</th></tr></thead>
      <tbody>{funds.map(fund => <tr key={fund.isin}>
        <td data-label="ETF"><a href={entityHref('/fund/' + fund.isin)}>{fund.name}</a><small>{fund.provider} · {fund.compositionDate ?? 'Date unknown'}</small>{fund.isin === nqseIsin && fund.used && <small className="uncertainty-signal">Hedge adjustment: size unknown · <a href={entityHref('/fund/' + fund.isin)}>Explore impact</a></small>}</td>
        <td data-label="Saved / checked / used"><span className={`state-chip ${fund.used ? 'ready' : 'open'}`}>{labels[fund.state]}</span><small>{fund.saved ? 'Saved' : 'Missing'} / {fund.checked ? 'Checked' : fund.state === 'checks-failed' ? 'Failed' : 'Pending'} / {fund.used ? 'Used' : 'Unused'}</small></td>
        <td data-label="Included allocation">{fund.values.map(value => <div className="fund-allocation-value" key={value.currency}>
          <strong>{coverageMoney(value.included, value.currency)}</strong><small>{coveragePercent(value.percent)} of priced fund value</small>
          <AllocationBar percent={value.percent} label={`${fund.name}: ${coveragePercent(value.percent)} of priced ${value.currency} value included`} />
        </div>)}{!fund.values.length && <span>Value unknown</span>}</td>
        <td data-label="Unassigned">{fund.values.map(value => <strong className="fund-unassigned" key={value.currency}>{coverageMoney(value.unassigned, value.currency)}</strong>)}{fund.unvalued > 0 && <small>{fund.unvalued} unvalued position(s)</small>}</td>
        <td data-label="Next action"><details className="fund-gap-detail"><summary>{fund.nextAction}</summary><p>{fund.reason}</p><p>{fund.evidenceAction}</p>
          <p>{fund.rowCount?.toLocaleString() ?? 'Unknown'} source rows · Quotes: {dates(fund.quoteDates)}</p>
          {fund.sourceUrl && <a href={fund.sourceUrl} target="_blank" rel="noreferrer">Source evidence</a>}
          <p><a href={entityHref('/fund/' + fund.isin)}>Inspect fund and holdings</a></p>
        </details></td>
      </tr>)}</tbody>
    </table></div>
    {!funds.length && <p>No held ETFs in the saved portfolio.</p>}
  </section>
}
