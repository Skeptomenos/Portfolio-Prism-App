import type { FinancialClient, ExposureCommands } from './views/financial-client'
import React, { useEffect, useMemo, useState } from 'react'
import { Decimal } from 'decimal.js'
import { entityHref, ReturnLink, useRouteValue } from './navigation'
import { NqseUncertainty } from './NqseUncertainty'
import { nqseIsin } from './nqse-sensitivity'
import { CompanyExposure } from './CompanyExposure'
import { EtfCoverageTable } from './CoverageSummary'
import type { CoverageReport } from '../contracts/financial'
import type {
  DevelopmentFund,
  DevelopmentFundDetail,
  DevelopmentProgress as DevelopmentProgressData,
  ProgressState,
} from '../contracts/financial'

const stateLabels: Record<ProgressState, string> = {
  ready: 'Available',
  open: 'Work pending',
  blocked: 'Needs attention',
  unavailable: 'Unavailable',
  'not-admitted': 'Not included yet',
}

const acquisitionLabels: Record<DevelopmentFund['acquisitionState'], string> = {
  acquired: 'Data saved',
  missing: 'Data missing',
  'underlying-observation': 'Shared underlying only',
  rejected: 'Source checks failed',
  unreadable: 'Cannot read source',
  unbound: 'Source not verified',
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : 'Unknown'

const checkLabel = (fund: DevelopmentFund) =>
  fund.validated
    ? 'Ready for calculation'
    : fund.qualificationState === 'failed'
      ? 'Calculation checks failed'
      : fund.qualificationState === 'not-started'
        ? 'Not checked yet'
        : 'Checks pending'
const topTenOnly = (fund: DevelopmentFund) => !!fund.calculationSource?.includes('top-ten')
function IncludedPortion({ fund }: { fund: DevelopmentFund }) {
  if (!fund.usedInCalculation) return <>Not included yet</>
  return (
    <>
      {topTenOnly(fund)
        ? 'Top-ten pilot only'
        : (fund.calculationSource ?? 'Included in Breakdown')}
      {fund.calculationCoverage && (
        <small>
          {fund.calculationCoverage.identifiedPercent}% included ·{' '}
          {fund.calculationCoverage.remainingPercent}% remaining. Composition:{' '}
          {fund.calculationCoverage.compositionDate ?? 'Unknown'}.
        </small>
      )}
    </>
  )
}

function StateChip({ state }: { state: ProgressState }) {
  return <span className={`state-chip ${state}`}>{stateLabels[state]}</span>
}

function AcquisitionChip({ state }: { state: DevelopmentFund['acquisitionState'] }) {
  const className =
    state === 'acquired' ? 'ready' : state === 'underlying-observation' ? 'open' : 'blocked'
  return <span className={`state-chip ${className}`}>{acquisitionLabels[state]}</span>
}

function ConnectivityCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="connectivity-card">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function FundRows({ fund }: { fund: DevelopmentFundDetail }) {
  const [query, setQuery] = useRouteValue('filter', '')
  const [pageText, setPageText] = useRouteValue('page', '0')
  const [sort, setSort] = useRouteValue('sort', 'source')
  const page = Math.max(0, Number.parseInt(pageText, 10) || 0)
  const setPage = (value: number) => setPageText(String(value))
  const normalized = query.trim().toLowerCase()
  const rowWeight = (row: DevelopmentFundDetail['rows'][number]) => row.weight ?? row.weightPercent
  const filtered = useMemo(
    () =>
      fund.rows
        .filter((row) =>
          `${row.name} ${row.isin ?? ''} ${row.ticker ?? ''} ${row.securityType ?? ''}`
            .toLowerCase()
            .includes(normalized)
        )
        .sort((a, b) => {
          if (sort === 'name') return a.name.localeCompare(b.name)
          if (sort === 'source') return a.row - b.row
          const aWeight = rowWeight(a)
          const bWeight = rowWeight(b)
          if (aWeight === null || aWeight === undefined) return bWeight === null || bWeight === undefined ? 0 : 1
          if (bWeight === null || bWeight === undefined) return -1
          const weight = (value: string) => {
            try {
              const n = new Decimal(value)
              return n.isFinite() ? n : null
            } catch {
              return null
            }
          }
          const x = weight(aWeight),
            y = weight(bWeight)
          return x === null
            ? y === null
              ? 0
              : 1
            : y === null
              ? -1
              : x.cmp(y) * (sort === 'smallest' ? 1 : -1)
        }),
    [fund.rows, normalized, sort]
  )
  const pageSize = 50
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const rows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  return (
    <>
      <div className="section-title detail-toolbar">
        <label>
          Filter retained rows
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder="Name, ISIN, ticker or type"
          />
        </label>
        <label>
          Sort source rows
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value)
              setPage(0)
            }}
          >
            <option value="source">Source order</option>
            <option value="largest">Largest weight</option>
            <option value="smallest">Smallest weight</option>
            <option value="name">Name</option>
          </select>
        </label>
        <p className="table-meta">
          {filtered.length.toLocaleString()} of {fund.rows.length.toLocaleString()} rows · page{' '}
          {currentPage + 1} of {pageCount}
        </p>
      </div>
      <div className="table-scroll progress-detail-table">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Source name</th>
              <th>ISIN / ticker</th>
              <th>Type</th>
              <th>Reported weight {fund.evidence.weightUnit === 'fraction' ? '(fraction)' : '(%)'}</th>
              <th>{fund.inspection ? 'Monetary preview' : fund.illustrative?.kind === 'selected-allocation' ? 'Issuer allocation estimate' : 'Illustrative value using reported weight'}</th>
              <th>Source scope</th>
              <th>Exchange / country / currency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const preview = fund.illustrative?.rows.find((item) => item.row === row.row)
              return (
                <tr key={`${row.sourceScope ?? 'source'}-${row.row}-${row.isin ?? row.name}`}>
                  <td>{row.row}</td>
                  <td>
                    {!fund.inspection && row.isin && row.availableIdentifiers.includes('ISIN') ? (
                      <a href={entityHref(`/security/${row.isin}${preview?.state === 'included' ? `?section=investment&originFund=${fund.isin}&sourceHash=${fund.evidence?.sha256 ?? ''}` : ''}`)}>{row.name}</a>
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="mono">
                    {row.isin ?? 'No ISIN'}
                    <small>{row.ticker ?? 'No ticker'}</small>
                  </td>
                  <td>{row.securityType ?? 'Not supplied'}</td>
                  <td>
                    {rowWeight(row) === null || rowWeight(row) === undefined
                      ? 'Not supplied'
                      : `${rowWeight(row)}${row.weightUnit === 'fraction' ? '' : '%'}`}
                    {preview?.relativeBar !== null && preview?.relativeBar !== undefined && (
                      <span className="weight-bar" aria-hidden="true">
                        <span style={{ width: `${preview.relativeBar}%` }} />
                      </span>
                    )}
                  </td>
                  <td className="illustrative-value">
                    {fund.inspection ? (
                      <>
                        <span>Not calculated</span>
                        <small>Inspection-only source</small>
                      </>
                    ) : preview?.value != null ? (
                      <>
                        <strong>
                          {new Decimal(preview.value).toFixed(2)} {fund.illustrative?.currency}
                        </strong>
                        <small>{preview.state === 'included' ? 'Included · issuer allocation estimate' : 'Conditional · not in totals'}</small>
                      </>
                    ) : (
                      <>
                        <span>—</span>
                        <small>{preview?.reason ?? 'Preview unavailable.'}</small>
                      </>
                    )}
                  </td>
                  <td>{row.sourceScope === 'substitute-basket' ? 'Substitute basket' : row.sourceScope === 'partial-benchmark' ? 'Partial INDEX_TOP10 benchmark' : 'Economic allocation'}</td>
                  <td>
                    {row.exchange ?? 'Exchange unknown'}
                    <small>
                      {row.country ?? 'Country unknown'} · {row.currency ?? 'Currency unknown'}
                    </small>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">No retained source rows match this filter.</p>}
      <div className="actions pagination">
        <button
          className="secondary"
          disabled={currentPage === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
        >
          Previous rows
        </button>
        <button
          className="secondary"
          disabled={currentPage >= pageCount - 1}
          onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
        >
          Next rows
        </button>
      </div>
    </>
  )
}

function FundDetail({ fund, client, commands }: { fund: DevelopmentFundDetail; client: Pick<FinancialClient, 'exposure'>; commands: ExposureCommands }) {
  const preview = fund.illustrative
  const saved = ['acquired', 'underlying-observation'].includes(fund.acquisitionState)
  return (
    <section className="panel fund-detail" aria-labelledby="fund-detail-title">
      <div className="section-title">
        <div>
          <p className="eyebrow">INSIDE YOUR ETF</p>
          <h2 id="fund-detail-title">{fund.name}</h2>
          <span className="mono">{fund.isin}</span>
        </div>
        <AcquisitionChip state={fund.acquisitionState} />
      </div>
      <div className="fund-value-summary">
        <div>
          <span>Your saved ETF value</span>
          <strong>
            {preview?.positionValue != null
              ? new Decimal(preview.positionValue).toFixed(2) + ' ' + preview.currency
              : 'Combined value unavailable'}
          </strong>
          <small>{preview?.accountCount ?? '—'} account position(s) · no currency conversion</small>
          {preview?.valuationReason && <small>{preview.valuationReason}</small>}
        </div>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>
              {fund.sourceUrl ? (
                <a href={fund.sourceUrl} target="_blank" rel="noreferrer">
                  {fund.provider}
                </a>
              ) : (
                'Not recorded'
              )}
            </dd>
          </div>
          <div>
            <dt>Quote date</dt>
            <dd>{preview?.quoteDates.map(formatDate).join(', ') || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Composition date</dt>
            <dd>{fund.compositionDate ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Source entries</dt>
            <dd>{fund.inspection ? `${fund.inspection.reportedRowCount.toLocaleString()} substitute-basket rows · ${fund.inspection.benchmarkRowCount.toLocaleString()} partial benchmark rows` : `${fund.rowPage.total.toLocaleString()} · ${fund.evidence.equityRowCount ?? 'Unknown'} equity`}</dd>
          </div>
        </dl>
      </div>
      <div className="fund-next-step">
        <strong>
          {saved ? `Data saved. ${checkLabel(fund)}.` : acquisitionLabels[fund.acquisitionState]}
        </strong>
        <p>
          {fund.inspection
            ? `Next: ${fund.nextAction}`
            : fund.qualificationState === 'failed'
            ? fund.blocker
            : fund.validated
              ? fund.usedInCalculation && !topTenOnly(fund)
                ? 'Supported holdings are included in Breakdown. Keep genuine remainders and source dates visible.'
                : 'Next: connect the checked dataset to Breakdown.'
              : saved
                ? 'Next: check what the weights represent, then connect compatible rows to Breakdown. The full dataset is not included yet.'
                : fund.acquisitionState === 'missing'
                  ? 'Next: save a dated composition for this exact fund.'
                  : 'Next: repair the source issue before using these rows.'}
        </p>
        {fund.usedInCalculation && (
          <p>
            <IncludedPortion fund={fund} />
            {topTenOnly(fund) && ' This separate pilot does not use the full dataset.'}
          </p>
        )}
      </div>
      {fund.isin === nqseIsin && fund.usedInCalculation && <NqseUncertainty
        amount={preview?.positionValue != null && fund.calculationCoverage ? new Decimal(preview.positionValue).mul(fund.calculationCoverage.identifiedPercent).div(100).toFixed() : null}
        currency={preview?.currency ?? null} scope="included ETF allocation" />}
      {fund.evidence.error && (
        <p role="alert" className="notice error">
          {fund.evidence.error}
        </p>
      )}
      {fund.inspection && (
        <p className="notice warning">
          Inspection only. The substitute basket is not the fund&apos;s economic exposure. The ten INDEX_TOP10 rows are a partial benchmark view. No row is included in Breakdown and no illustrative monetary preview is calculated.
        </p>
      )}
      {!fund.inspection && <div className="illustrative-note">
        {fund.allocationReadiness?.estimateLimitation && <p>{fund.allocationReadiness.estimateLimitation.qualifier}</p>}
        <strong>{preview?.kind === 'selected-allocation' ? 'Selected issuer allocation estimates' : 'Illustrative value using reported weight'}</strong>
        <p>
          {preview?.kind === 'selected-allocation'
            ? 'Rows marked Included use the selected source and are included in Breakdown. Other rows remain unavailable or conditional. These estimates are not NAV or full economic reconciliation; use the saved quote and composition dates shown.'
            : `${preview?.reason ?? 'Saved ETF value × reported weight ÷ 100, assuming the percentage describes the whole fund.'} Conditional arithmetic only—not verified exposure or a current value. Use the quote and composition dates shown; these previews stay outside totals.`}
        </p>
      </div>}
      <details className="technical-source">
        <summary>Technical source details</summary>
        <dl className="source-facts">
          <div>
            <dt>Source</dt>
            <dd>
              {fund.sourceUrl ? (
                <a href={fund.sourceUrl} target="_blank" rel="noreferrer">
                  {fund.source}
                </a>
              ) : (
                'Not recorded'
              )}
            </dd>
          </div>
          <div>
            <dt>Last source check</dt>
            <dd>{fund.lastVerifiedAt ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Evidence file</dt>
            <dd>{fund.evidence.fileName ?? 'Not acquired'}</dd>
          </div>
          <div>
            <dt>Integrity / identity</dt>
            <dd>
              {fund.evidence.manifestVerified ? 'SHA-256 matches manifest' : 'Not verified'} ·{' '}
              {fund.evidence.identityVerified ? 'Exact product bound' : 'Identity unverified'}
            </dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd className="mono">{fund.evidence.sha256 ?? 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Security identifiers</dt>
            <dd>
              {fund.rowPage.identifiers} of {fund.rowPage.total} rows. Valid ISIN:{' '}
              {fund.evidence.isinRowCount ?? 'Unknown'}; source ticker:{' '}
              {fund.evidence.tickerRowCount ?? 'Unknown'}. Country, exchange and currency are
              context, not identifiers.
            </dd>
          </div>
          <div>
            <dt>Weight unit / basis</dt>
            <dd>
              {fund.evidence.weightUnit === 'percent' ? 'percent (%)' : fund.evidence.weightUnit === 'fraction' ? 'fraction' : 'Unavailable'} ·{' '}
              {fund.evidence.denominator ?? 'Unknown'}
            </dd>
          </div>
          <div>
            <dt>Composition / quote timestamps</dt>
            <dd>
              {fund.compositionDate ?? 'Unknown'} / {preview?.quoteDates.join(', ') || 'Unknown'}.
              Holdings saved: {preview?.holdingsAt ?? 'Unknown'}.
            </dd>
          </div>
        </dl>
        <h3>Calculation compatibility — {checkLabel(fund)}</h3>
        <p>
          {fund.inspection
            ? 'Obtain dated economic benchmark constituents and an evidenced swap allocation basis. Checking basket weights or partial benchmark rows alone cannot establish monetary exposure.'
            : 'Check whole-published-portfolio weight meaning, completeness, security identities and cash, derivative or hedge treatment.'} {fund.identityNote}
        </p>
        <h3>Separate operational checks</h3>
        <p>
          Repeatable refresh, permitted retention/reuse and NAV reconciliation are separate checks.
          A source-qualified allocation estimate does not establish exact NAV reconciliation.{' '}
          {fund.blocker}
        </p>
        {!fund.inspection && <p>
          Preview arithmetic uses unrounded saved values; multiplying the rounded headline can
          differ by a cent. Percentage weights are dimensionless: row trading currency is not
          converted again. Mixed account currencies suppress the combined preview. Cash, futures,
          FX, swaps, negative weights and unsupported hedged underlying-only data receive no monetary preview.
        </p>}
      </details>
      <p className="weight-legend">
        Reported weights retain the source unit and scope. Equity bars compare percent weights only: longest = largest equity row, not 100% coverage.
        Entries are not unique companies; {fund.evidence.nonEquityRowCount ?? 'unknown'} are
        non-equity or unspecified. Filtering does not change the scale.
      </p>
      <FundRows fund={fund} />
      {fund.usedInCalculation && <CompanyExposure client={client} commands={commands} fundIsin={fund.isin} />}
    </section>
  )
}

export function DevelopmentProgress({ fundIsin, coverage, client, commands }: { fundIsin?: string; coverage: CoverageReport | null; client: Pick<FinancialClient, 'development' | 'fund' | 'exposure'>; commands: ExposureCommands }) {
  const [data, setData] = useState<DevelopmentProgressData | null>(null)
  const [selected, setSelected] = useState<DevelopmentFundDetail | null>(null)
  const selectedIsin = fundIsin ?? null
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const selectedSourceHash = coverage?.funds.find(fund => fund.isin === selectedIsin)?.sourceHash

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const next = await client.development(controller.signal)
        if (controller.signal.aborted) return
        setData(next)
        setError(null)
      } catch {
        if (!controller.signal.aborted) setError('The development overview could not be refreshed.')
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 5000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [client])

  useEffect(() => {
    if (!selectedIsin) {
      setSelected(null)
      return
    }
    const controller = new AbortController()
    setSelected(null)
    setDetailError(null)
    void client.fund(selectedIsin, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setSelected(next)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDetailError('This ETF is unavailable in the saved evidence register.')
      })
    return () => controller.abort()
  }, [selectedIsin, selectedSourceHash, client])

  if (fundIsin)
    return (
      <>
        <ReturnLink />
        {detailError ? (
          <p role="alert" className="notice error">
            {detailError}
          </p>
        ) : selected ? (
          <FundDetail fund={selected} client={client} commands={commands} />
        ) : (
          <p role="status">Loading retained ETF evidence…</p>
        )}
      </>
    )

  if (!data && !error) return <p role="status">Loading development evidence…</p>
  if (!data)
    return (
      <section className="panel notice error" role="alert">
        {error}
      </section>
    )

  return (
    <>
      {error && (
        <p role="alert" className="notice error">
          {error} Displayed evidence remains from the previous successful load.
        </p>
      )}
      <EtfCoverageTable report={coverage} />
      <details className="panel technical-source development-evidence">
        <summary>Source evidence and connection status</summary>
        <div className="connectivity-grid">
          <ConnectivityCard label="Broker" value={data.connectivity.broker} detail={data.connectivity.savedData} />
          <ConnectivityCard label="Source check" value={data.sourceFreshness.lastVerifiedAt ?? 'Unknown'} detail={data.sourceFreshness.note} />
        </div>
        <p>{data.counts.acquiredRows.toLocaleString()} saved source entries · {data.counts.identifiedRows.toLocaleString()} with ISIN or ticker. Entries are not unique companies.</p>
        <p>Evidence manifest · {data.evidence.manifestFiles?.toLocaleString() ?? 'Unknown'} files.</p>
        {!data.evidence.configured && <p>Private retained evidence directory is not configured. Selected saved compositions remain usable.</p>}
        {data.evidence.diagnostics?.map((diagnostic, index) => <p key={index}>{diagnostic}</p>)}
      </details>
      {data.evidence.diagnostics?.length > 0 && <p role="alert" className="notice error">Some source receipts need attention. Inspect the affected ETF's source details.</p>}
      <section className="panel" aria-labelledby="stages-title">
        <div className="section-title">
          <div>
            <p className="eyebrow">WHAT STILL NEEDS TO HAPPEN</p>
            <h2 id="stages-title">From import to maintenance</h2>
          </div>
          <span className="badge">Open gates remain visible</span>
        </div>
        <div className="stage-list">
          {data.stages.map((stage) => (
            <details className="progress-stage" key={stage.id}>
              <summary>
                <span className="stage-heading">
                  <strong>{stage.title}</strong>
                  <StateChip state={stage.state} />
                </span>
                <span className="stage-summary">{stage.summary}</span>
              </summary>
              <div className="stage-body">
                <p>{stage.purpose}</p>
                <div className="check-list">
                  {stage.checks.map((check) => (
                    <div className="stage-check" key={check.label}>
                      <div>
                        <strong>{check.label}</strong>
                        <StateChip state={check.state} />
                      </div>
                      <p>{check.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
