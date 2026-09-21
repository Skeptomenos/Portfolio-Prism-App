import React, { useEffect, useState } from 'react'
import { NqseUncertainty } from './NqseUncertainty'
import { nqseIsin } from './nqse-sensitivity'
import { Decimal } from 'decimal.js'
import type { Exposure } from '../contracts/financial'
import type { FinancialClient, ExposureCommands } from './views/financial-client'
import { entityHref, readRoute, ReturnLink, useRouteValue } from './navigation'
const money = (v: string | null, c: string | null) =>
  v === null ? 'Unknown' : `${new Decimal(v).toFixed(2)} ${c ?? ''}`
const pct = (v: string | null) => (v === null ? 'Unknown' : `${new Decimal(v).toFixed(2)}%`)

const rememberedSections = new Map<string, string>()
export function CompanyExposure({
  securityIsin,
  fundIsin,
  client,
  commands,
}: {
  client: Pick<FinancialClient, 'exposure'>
  commands: ExposureCommands
  securityIsin?: string
  fundIsin?: string
}) {
  const [data, setData] = useState<Exposure | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useRouteValue('exposureFilter', '')
  const [section, setSection] = useRouteValue(
    'section',
    securityIsin ? (rememberedSections.get(securityIsin) ?? 'investment') : 'investment'
  )
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const next = await client.exposure(controller.signal)
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
  }, [client])
  async function refresh() {
    setSubmitting(true)
    setError(null)
    try {
      await commands.refresh()
    } catch {
      setError(
        'Refresh could not start. Wait for any running refresh, then retry. The pilot ETF must be in your saved holdings.'
      )
    } finally {
      setSubmitting(false)
    }
  }
  const originFund = readRoute().params.get('originFund')
  const sourceHash = readRoute().params.get('sourceHash')
  const sources = data?.compositions ?? (data?.composition ? [data.composition] : [])
  const relevantSources = sources.filter((source) => !fundIsin || source.fundIsin === fundIsin)
  const composition =
    relevantSources.find((source) => source.fundIsin === originFund) ?? relevantSources[0]
  const fullSource = relevantSources.some((source) => source.scope === 'full-holdings')
  const allocationEstimate = relevantSources.some(
    (source) => source.measure === 'issuer-reported-allocation-estimate'
  )
  const rows =
    data?.rows.filter(
      (c) =>
        (!securityIsin || c.isin === securityIsin) &&
        (!fundIsin ||
          c.contributions.some((r) => r.kind === 'etf' && r.positionIsin === fundIsin)) &&
        `${c.name} ${c.isin}`.toLowerCase().includes((securityIsin ? '' : filter).toLowerCase())
    ) ?? []
  return (
    <section className="panel holdings company-exposure" aria-labelledby="exposure-title">
      {securityIsin && (
        <>
          <ReturnLink />
          <nav className="detail-tabs" aria-label="Security sections">
            {['investment', 'business', 'connections'].map((item) => (
              <button
                className="secondary"
                aria-pressed={section === item}
                key={item}
                onClick={() => {
                  rememberedSections.set(securityIsin, item)
                  setSection(item)
                }}
              >
                {item === 'investment'
                  ? 'Your investment'
                  : item === 'business'
                    ? 'The business'
                    : 'Connections'}
              </button>
            ))}
          </nav>
        </>
      )}
      <div className="section-title">
        <h2 id="exposure-title">
          {securityIsin
            ? (rows[0]?.name ?? 'Security identity')
            : fundIsin
              ? fullSource
                ? 'Included allocation from this ETF'
                : 'Separate calculation: saved top-ten pilot'
              : 'Known security exposure'}
        </h2>
        <span className="badge">
          Exact ISIN ·{' '}
          {allocationEstimate
            ? 'issuer allocation estimate'
            : fullSource
              ? 'saved full-holdings source'
              : composition
                ? 'partial pilot'
                : 'saved holdings'}
        </span>
      </div>
      {securityIsin && section !== 'investment' ? (
        <p className="notice">
          {section === 'business'
            ? 'Company fundamentals are unavailable. A verified security-to-company relationship and dated financial sources are required.'
            : 'Researched company connections are unavailable. Source rows do not establish business relationships.'}
        </p>
      ) : (
        <>
          <p className="muted">
            Saved values · partial coverage. Missing exposure is unknown, not zero.
          </p>
          {loadError && (
            <p role="alert" className="notice error">
              {loadError}
            </p>
          )}
          {!securityIsin && (
            <label>
              Find a security or ISIN
              <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </label>
          )}
          <div className="exposure-list">
            {rows.map((c) => (
              <details
                className="company-card"
                open={!!securityIsin || !!fundIsin}
                key={`${c.isin}:${c.currency}`}
              >
                <summary>
                  {securityIsin ? (
                    <strong>Known investment</strong>
                  ) : (
                    <a href={entityHref(`/security/${c.isin}`)}>{c.name}</a>
                  )}{' '}
                  {!fundIsin && (
                    <span>
                      {money(
                        c.contributions.every((r) => r.value === null) ? null : c.knownTotal,
                        c.currency
                      )}{' '}
                      known ·{' '}
                      {pct(
                        c.contributions.every((r) => r.value === null) ? null : c.percentOfPriced
                      )}{' '}
                      of priced {c.currency ?? 'currency'}
                    </span>
                  )}
                </summary>
                {fundIsin && (
                  <p className="notice">
                    This fund contributes{' '}
                    {money(
                      c.contributions
                        .filter((item) => item.kind === 'etf' && item.positionIsin === fundIsin)
                        .some((item) => item.value === null)
                        ? null
                        : c.contributions
                            .filter((item) => item.kind === 'etf' && item.positionIsin === fundIsin)
                            .reduce((sum, item) => sum.add(item.value ?? '0'), new Decimal(0))
                            .toFixed(),
                      c.currency
                    )}{' '}
                    from the{' '}
                    {fullSource ? 'saved issuer allocation estimate' : 'saved top-ten composition'}.{' '}
                    <a
                      href={entityHref(
                        `/security/${c.isin}?section=investment&originFund=${fundIsin}&sourceHash=${composition?.sha256 ?? ''}`
                      )}
                    >
                      Follow into combined security exposure
                    </a>
                  </p>
                )}
                {securityIsin &&
                  originFund &&
                  sourceHash !==
                    sources.find((source) => source.fundIsin === originFund)?.sha256 && (
                    <p role="alert" className="notice">
                      The saved composition changed. The original contribution is not highlighted;
                      inspect the current source below.
                    </p>
                  )}
                {!fundIsin && (
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
                )}
                <div className="table-scroll">
                  <table className="contribution-table">
                    <thead>
                      <tr>
                        <th>Contribution</th>
                        <th>Saved position</th>
                        <th>Weight</th>
                        <th>Known value</th>
                        <th>Valuation evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.contributions
                        .filter(
                          (r) => !fundIsin || (r.kind === 'etf' && r.positionIsin === fundIsin)
                        )
                        .map((r, i) => (
                          <React.Fragment key={i}>
                          <tr
                            className={
                              originFund === r.positionIsin &&
                              sourceHash === (r.source?.sha256 ?? composition?.sha256)
                                ? 'selected-contribution'
                                : ''
                            }
                          >
                            <td>
                              {r.kind === 'direct' ? (
                                'Direct shares'
                              ) : (
                                <a href={entityHref(`/fund/${r.positionIsin}`)}>
                                  {r.positionName?.trim() ||
                                    sources.find((source) => source.fundIsin === r.positionIsin)
                                      ?.fundName ||
                                    r.positionIsin}
                                </a>
                              )}
                            </td>
                            <td className="numeric" data-label="Saved position">
                              {money(r.positionValue, c.currency)}
                            </td>
                            <td className="numeric" data-label="Weight">
                              {pct(r.weightPercent)}
                            </td>
                            <td className="numeric" data-label="Known value">
                              {money(r.value, c.currency)}
                              {r.source?.estimateLimitation && r.positionIsin !== nqseIsin && <small>{r.source.estimateLimitation.qualifier}</small>}
                            </td>
                            <td className="evidence-cell">
                              <details className="contribution-evidence">
                                <summary>
                                  {r.quoteAt?.slice(0, 10) ?? 'Date unknown'} ·{' '}
                                  {r.value === null
                                    ? 'unvalued'
                                    : r.quality
                                        .replace('Quote older than 24h', 'stale quote')
                                        .replace(
                                          'quote quality code not interpreted',
                                          'quality unchecked'
                                        )}
                                  {r.source?.stale ? ' · composition stale' : ''}
                                </summary>
                                <dl>
                                  <dt>Position</dt>
                                  <dd>
                                    {r.positionName || r.positionIsin} · {r.positionIsin}
                                  </dd>
                                  <dt>Account</dt>
                                  <dd>{r.account}</dd>
                                  <dt>Quote timestamp</dt>
                                  <dd>{r.quoteAt ?? 'Unknown'}</dd>
                                  <dt>Quote age</dt>
                                  <dd>
                                    {r.quoteAt && Number.isFinite(Date.parse(r.quoteAt))
                                      ? `${Math.max(0, Math.floor((Date.now() - Date.parse(r.quoteAt)) / 86400000))} days at viewing`
                                      : 'Unknown'}
                                  </dd>
                                  <dt>Valuation quality</dt>
                                  <dd>{r.quality}</dd>
                                  <dt>Exact saved position / weight / attributed value</dt>
                                  <dd>
                                    {r.positionValue ?? 'Unknown'} {c.currency} / {r.weightPercent}%
                                    / {r.value ?? 'Unknown'} {c.currency}
                                  </dd>
                                  {r.source && (
                                    <>
                                      <dt>Composition date</dt>
                                      <dd>
                                        {r.source.asOf ?? 'Unknown'}
                                        {r.source.stale ? ' · stale' : ''}
                                      </dd>
                                      <dt>Source</dt>
                                      <dd>
                                        <a href={r.source.url} target="_blank" rel="noreferrer">
                                          {r.source.measure}
                                        </a>
                                      </dd>
                                      <dt>SHA-256</dt>
                                      <dd className="mono">{r.source.sha256}</dd>
                                      <dt>Retrieved</dt>
                                      <dd>{r.source.retrievedAt}</dd>
                                      {r.source.estimateLimitation && <><dt>Next evidence</dt><dd>{r.source.estimateLimitation.nextAction}</dd></>}
                                    </>
                                  )}
                                </dl>
                              </details>
                            </td>
                          </tr>
                          {r.kind === 'etf' && r.positionIsin === nqseIsin && r.source?.estimateLimitation && <tr className="uncertainty-row"><td colSpan={5}>
                            <small>{r.source.estimateLimitation.qualifier}</small>
                            <NqseUncertainty amount={r.value} currency={c.currency} scope="ETF contribution" compact />
                          </td></tr>}
                          </React.Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
                <details className="calculation-notes">
                  <summary>Calculation and saved-data context</summary>
                  <p>{c.isin} · Exact security ISIN match; no name or ticker matching.</p>
                  <p>
                    Indirect value = ETF position value × weight ÷ 100. Each ETF contribution
                    retains its own composition date and hash above. Positions imported:{' '}
                    {data?.holdingsAt ?? 'Unknown'}. Displayed numbers are rounded; evidence retains
                    exact values.
                  </p>
                </details>
              </details>
            ))}
          </div>
          {data?.issuerGroups
            ?.filter(
              (group) =>
                (!securityIsin || group.members.some((member) => member.isin === securityIsin)) &&
                (!fundIsin ||
                  group.members.some((member) =>
                    member.contributions.some((item) => item.positionIsin === fundIsin)
                  )) &&
                (securityIsin ||
                  !filter ||
                  `${group.name} ${group.members.map((member) => member.isin).join(' ')}`
                    .toLowerCase()
                    .includes(filter.toLowerCase()))
            )
            .map((group) => (
              <article className="notice issuer-group" key={`${group.issuerId}:${group.currency}`}>
                <h3>{group.name} · verified equity classes</h3>
                <p>
                  <strong>{money(group.knownTotal, group.currency)} known combined value</strong> ·
                  direct {money(group.direct, group.currency)} · indirect{' '}
                  {money(group.indirect, group.currency)}
                </p>
                <p>
                  This is a regrouping of the security amounts shown here, already included in portfolio
                  coverage. {group.unknownContributions} contributions have unknown values. Other
                  holdings and unsupported funds can add exposure.
                </p>
                <ul>
                  {group.members.map((member) => (
                    <li key={member.isin}>
                      <a href={entityHref(`/security/${member.isin}`)}>
                        {member.name} · {member.isin}
                      </a>{' '}
                      ·{' '}
                      {money(
                        member.contributions.every((item) => item.value === null)
                          ? null
                          : member.knownTotal,
                        member.currency
                      )}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Verified issuer relationship</summary>
                  <p>{group.evidence.scope}</p>
                  <p>
                    <a href={group.evidence.issuerSource.url} target="_blank" rel="noreferrer">
                      SEC {group.evidence.issuerSource.document}
                    </a>{' '}
                    · {group.issuerId} · reviewed {group.evidence.reviewedAt}
                  </p>
                  {group.evidence.securities.map((security) => (
                    <p key={security.isin}>
                      <a href={security.source} target="_blank" rel="noreferrer">
                        {security.shareClass}: {security.isin}
                      </a>
                      <small className="mono">Retained source SHA-256: {security.sha256}</small>
                    </p>
                  ))}
                  <small>
                    Relationship record: {group.evidence.version}. Further share-class and issuer
                    mappings need primary evidence.
                  </small>
                </details>
              </article>
            ))}
          <p>
            This view groups direct shares and supported ETF contributions by exact security ISIN.
            It is not a canonical company-exposure result. Values use saved broker bids. Missing
            exposure is unknown, not zero.
          </p>
          {!fullSource && (
            <div className="actions">
              <button
                disabled={submitting || data?.refreshing || !data?.pilotOwned}
                onClick={() => void refresh()}
              >
                {submitting || data?.refreshing
                  ? 'Refreshing composition…'
                  : 'Refresh ETF composition'}
              </button>
            </div>
          )}
          {fullSource && (
            <p className="muted">
              Saved issuer source. The top-ten fallback refresh does not update this source and is
              not offered here. <a href="#/data">Refresh issuer holdings and inspect per-fund outcomes.</a>
            </p>
          )}
          {!data && <p role="status">Loading security exposure…</p>}
          {data && !sources.length && !data.pilotOwned && (
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
          {data?.warning && (
            <p role="alert" className="notice error">
              {data.warning}
            </p>
          )}
          {Object.entries(data?.sourceAttempts ?? {})
            .filter(
              ([isin, attempt]) =>
                attempt.status === 'failed' && !sources.some((source) => source.fundIsin === isin)
            )
            .map(([isin, attempt]) => (
              <p key={isin} role="alert" className="notice error">
                {isin}: latest source import failed. No source admitted for this fund; inspect its
                retained evidence and retry. Diagnostic: {attempt.id}
              </p>
            ))}
          {data?.refreshFailed && (
            <p role="alert" className="notice error">
              Latest {fullSource ? 'top-ten fallback' : 'composition'} refresh failed (
              {data.attempt?.code}).{' '}
              {fullSource
                ? 'This fallback attempt does not refresh the selected issuer dataset.'
                : composition
                  ? 'Last successful composition retained; refresh is stale.'
                  : 'No successful composition is available.'}{' '}
              Check the source, then retry. Diagnostic reference: {data.attempt?.id}
            </p>
          )}
          {relevantSources.length ? (
            relevantSources.map((composition) => {
              const fullSource = composition.scope === 'full-holdings'
              const allocationEstimate =
                composition.measure === 'issuer-reported-allocation-estimate'
              const localUse = composition.sourceChecks?.find((check) => check.id === 'local-use')
              const accounting = composition.sourceAccounting
              const stale =
                !composition.asOf || Date.now() - Date.parse(composition.asOf) > 30 * 86400000
              return (
                <details
                  className="notice"
                  key={composition.fundIsin}
                  open={relevantSources.length === 1}
                >
                  <summary>
                    {composition.fundName} · {composition.asOf ?? 'Unknown date'} ·{' '}
                    {stale ? 'stale' : 'saved source'}
                  </summary>
                  <p className="mono">{composition.fundIsin}</p>
                  {data?.sourceAttempts?.[composition.fundIsin]?.status === 'failed' && (
                    <p role="alert">
                      Latest source update failed; previous valid source retained. Review Data & connections for the cause and next action. Diagnostic:{' '}
                      {data.sourceAttempts[composition.fundIsin].id}
                    </p>
                  )}
                  <p>
                    <a href={composition.sourceUrl} target="_blank" rel="noreferrer">
                      Source:{' '}
                      {fullSource ? 'issuer full-holdings dataset' : 'justETF top ten holdings'}
                    </a>{' '}
                    · Composition date: {composition.asOf ?? 'Unknown'} · Retrieved:{' '}
                    {composition.retrievedAt}
                  </p>
                  {allocationEstimate && (
                    <p>
                      Issuer-reported allocation estimate: saved ETF value × compatible equity
                      Weight (%) ÷ 100 from the whole published portfolio. Included in the known
                      security subtotals; not an illustrative preview and not exact
                      accounting-NAV or economic reconciliation. A full-holdings source does not
                      mean complete company coverage.
                    </p>
                  )}
                  {fullSource && (
                    <p className="source-local-use">
                      Private-use finding — {localUse?.state ?? 'not recorded'}:{' '}
                      {localUse?.detail ?? 'No local-use finding supplied.'} This operational
                      finding is separate from technical calculation compatibility; it is not
                      permission to redistribute.
                    </p>
                  )}
                  <p>
                    {stale ? 'Stale composition: date unknown or older than 30 days. ' : ''}
                    Disclosed: {composition.disclosedPercent}% · Identified equity:{' '}
                    {composition.identifiedPercent}% · Undisclosed: {composition.missingPercent}%.{' '}
                    {fullSource
                      ? 'Weights use the whole published portfolio. Source rounding and non-equity portions remain visible.'
                      : 'Weights are percentages of the fund.'}{' '}
                    No normalization or second currency conversion.
                  </p>
                  {fullSource && accounting && (
                    <div className="source-accounting">
                      <p>
                        Source accounting: {accounting.sourceRows} rows · {accounting.equityRows}{' '}
                        equity · {accounting.nonEquityRows} non-equity. Reported total:{' '}
                        {accounting.reportedPercent}% · non-equity: {accounting.nonEquityPercent}%.{' '}
                        {accounting.unresolvedEquityRows} equity rows lack resolved security
                        identity. Non-equity rows are not included in company allocation; the
                        remainder is not rescaled.
                      </p>
                      <details>
                        <summary>Reported asset classes</summary>
                        {accounting.byAssetClass.map((group) => (
                          <p key={group.assetClass}>
                            {group.assetClass}: {group.rows} rows · {group.weightPercent}% reported
                            weight
                          </p>
                        ))}
                      </details>
                    </div>
                  )}
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
                </details>
              )
            })
          ) : (
            <p className="notice">
              No validated ETF composition saved. Direct holdings remain visible. Use Refresh ETF
              composition to retrieve the pilot source.
            </p>
          )}
          {!fundIsin && !securityIsin && data?.directStockCoverage && (
            <details>
              <summary>
                Direct stock identifier coverage ({data.directStockCoverage.length} positions,
                including unvalued)
              </summary>
              <p>
                Exact security matches against selected sources for currently held positive ETF
                positions. Saved sources for sold or absent funds do not count. Related
                listings/classes need separate evidence; unmatched does not mean absent from every
                ETF.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Direct stock</th>
                      <th>Saved value</th>
                      <th>Matching held ETFs</th>
                      <th>Finding and next action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.directStockCoverage.map((stock) => (
                      <tr key={`${stock.account}:${stock.isin}:${stock.currency}`}>
                        <td>
                          <a href={entityHref(`/security/${stock.isin}`)}>{stock.name}</a>
                          <small>{stock.isin}</small>
                        </td>
                        <td>
                          {money(stock.value, stock.currency)}
                          <small>{stock.valuationStatus}</small>
                        </td>
                        <td>
                          {stock.matchedFunds.length
                            ? stock.matchedFunds.map((source) => (
                                <div key={source.fundIsin}>
                                  <a href={entityHref(`/fund/${source.fundIsin}`)}>
                                    {source.fundIsin}
                                  </a>{' '}
                                  · {source.asOf ?? 'Unknown date'}
                                </div>
                              ))
                            : 'No exact match in selected sources'}
                        </td>
                        <td>
                          {stock.finding}
                          <small>{stock.nextAction}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {!rows.length && data && (
            <p className="notice">
              No identified contribution in the selected saved calculation. Exposure is unknown;
              this does not establish absence from other funds.
            </p>
          )}
          <details className="notice">
            <summary>Portfolio-wide coverage gaps ({data?.gaps.length ?? 0})</summary>
            <p>
              These gaps do not change with the security filter. ETF amounts are portfolio value not
              yet assigned—not exposure to the selected security. Illustrative row values are
              excluded from all totals.
            </p>
            {data?.gaps.map((g, i) => (
              <p key={i}>
                <strong>
                  {g.sourceDetail ? (
                    <a href={entityHref(`/fund/${g.sourceDetail}`)}>{g.name}</a>
                  ) : (
                    g.name
                  )}
                </strong>{' '}
                · {g.isin} · {money(g.value, g.currency)} not assigned — {g.reason}
                <small>Account: {g.account}</small>
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  )
}
