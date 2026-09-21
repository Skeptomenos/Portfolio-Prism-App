import React, { useEffect, useState } from 'react'
import { Decimal } from 'decimal.js'
import type { Overview, ValuedPosition } from '../contracts/financial'
import type { FinancialClient, ExposureCommands } from './views/financial-client'
import { entityHref, useRouteValue } from './navigation'
import { CompanyExposure } from './CompanyExposure'
const money = (v: string | null, c: string | null) =>
  v === null ? '—' : `${new Decimal(v).toFixed(2)} ${c ?? ''}`
export function Holdings({
  revision,
  connection,
  client,
  commands,
}: {
  client: Pick<FinancialClient, 'overview' | 'exposure'>
  commands: ExposureCommands
  revision?: string
  connection?: React.ReactNode
}) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(false)
  const [query, setQuery] = useRouteValue('q', '')
  const [mode, setMode] = useRouteValue('mode', 'bought')
  const [sortText, setSortText] = useRouteValue('holdingSort', 'value:desc')
  const sortKeys = [
    'name',
    'value',
    'weight',
    'price',
    'quantity',
    'averageBuyIn',
    'isin',
    'instrumentType',
    'quality',
  ]
  const sort = {
    key: (sortKeys.includes(sortText.split(':')[0])
      ? sortText.split(':')[0]
      : 'value') as keyof ValuedPosition,
    desc: sortText.endsWith(':desc'),
  }
  useEffect(() => {
    const c = new AbortController()
    void client.overview(c.signal)
      .then((next) => {
        if (c.signal.aborted) return
        setData(next)
        setError(false)
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true)
      })
    return () => c.abort()
  }, [revision, client])
  const rows = [...(data?.rows ?? [])]
    .filter((row) => `${row.name} ${row.isin}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const x = a[sort.key],
        y = b[sort.key]
      if (x === null) return y === null ? 0 : 1
      if (y === null) return -1
      if (
        ['value', 'price', 'weight', 'averageBuyIn'].includes(sort.key) &&
        a.currency !== b.currency
      )
        return (a.currency ?? 'ZZZ').localeCompare(b.currency ?? 'ZZZ')
      const cmp = ['value', 'price', 'weight', 'quantity', 'averageBuyIn'].includes(sort.key)
        ? new Decimal(x).cmp(y)
        : x.localeCompare(y)
      return sort.desc ? -cmp : cmp
    })
  const pricedCryptoCurrencies = new Set(
    (data?.rows ?? [])
      .filter((row) => row.instrumentType.toLowerCase() === 'crypto' && row.valuationStatus === 'priced')
      .map((row) => row.currency)
      .filter((currency): currency is string => currency !== null),
  )
  const hasPricedCrypto = pricedCryptoCurrencies.size > 0
  return (
    <section className="panel holdings">
      <div className="section-title">
        <h2>Valued so far</h2>
        <span className="badge">
          {data
            ? `${data.pricedCount}/${data.rows.length - data.zeroCount} nonzero positions valued`
            : 'Loading'}
        </span>
      </div>
      <div className="portfolio-totals">
        {data?.totals.map((total) => (
          <div key={total.currency}>
            <strong>{money(total.securities, total.currency)}</strong>
            <span>
                {pricedCryptoCurrencies.has(total.currency) ? 'Priced assets' : 'Priced securities'} · cash {money(total.cash, total.currency)} shown separately
            </span>
          </div>
        ))}
      </div>
      <p className="compact-coverage">
        {data?.missingCount ?? '—'} positions unvalued · {data?.zeroCount ?? '—'} zero-quantity
        rows. Imported{' '}
        {data?.holdingsAt ? new Date(data.holdingsAt).toLocaleDateString() : 'not yet'}. Composition
        dates vary.
      </p>
      {connection}
      <div className="detail-tabs" aria-label="Portfolio lens">
        <button
          className="secondary"
          aria-pressed={mode === 'bought'}
          onClick={() => setMode('bought')}
        >
          What you bought
        </button>
        <button
          className="secondary"
          aria-pressed={mode === 'inside'}
          onClick={() => setMode('inside')}
        >
          Known securities inside
        </button>
      </div>
      {mode === 'inside' ? (
        <>
          <p>
            Canonical company aggregation is unavailable. The saved partial pilot groups exact
            security ISINs.
          </p>
          <CompanyExposure client={client} commands={commands} />
        </>
      ) : (
        <>
          <label className="holdings-filter">
            Find an investment
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or ISIN"
            />
          </label>
          {error && (
            <p role="alert">
              Could not refresh holdings. Any displayed values are from the previous load.
            </p>
          )}
          <details className="valuation-details">
            <summary>Valuation dates, coverage and calculation</summary>
            <p>
              Broker facts: quantity, average buy-in, listing currency and saved venue bid quote. Prism
              {hasPricedCrypto
                ? ' calculates quantity × bid for positive supported positions with confirmed identity, a price factor of 1 and a quote at or after the quantity observation. These are estimates using the latest saved quotes, not guaranteed execution prices. Priced crypto remains separate from company exposure.'
                : ' calculates quantity × bid for positive stock/fund positions with confirmed identity, a price factor of 1 and a quote at or after the quantity observation. These are estimates using the latest saved quotes, not guaranteed execution prices.'}
            </p>
            {error && (
              <p role="alert">
                Could not refresh the overview. Any displayed values are from the previous load.
              </p>
            )}
            <div className="grid">
              {data?.totals.map((t) => (
                <article key={t.currency} className="summary panel">
                  <p className="eyebrow">{t.currency} · {pricedCryptoCurrencies.has(t.currency) ? 'PRICED ASSETS' : 'PRICED SECURITIES'} SUBTOTAL</p>
                  <h2>{money(t.securities, t.currency)}</h2>
                  <p>
                    {t.pricedCount} positions · {t.olderQuotes} quotes older than 24h
                  </p>
                  <p>
                    Broker cash: {money(t.cash, t.currency)}
                    {t.cashStale ? ' · refresh failed/unavailable' : ''}
                    <br />
                    Cash as retrieved:{' '}
                    {t.cashAt ? new Date(t.cashAt).toLocaleString() : 'Unavailable'}
                  </p>
                </article>
              ))}
            </div>
            <p className="notice">
              {data?.missingCount ?? 0} positions have no supported valuation. Their value is
              unknown, not zero. Percentages below are shares of priced securities in the same
              currency, excluding cash and unvalued positions. Negative quantities are retained but
              unsupported. {data?.zeroCount ?? 0} zero-quantity rows make no contribution and need
              no quote. Currencies are never added together or converted implicitly.
            </p>
            <p>
              Positions imported:{' '}
              {data?.holdingsAt ? new Date(data.holdingsAt).toLocaleString() : 'Not imported'} ·
              Quotes retrieved:{' '}
              {data?.quoteRetrievedAt
                ? new Date(data.quoteRetrievedAt).toLocaleString()
                : 'Not retrieved'}
            </p>
          </details>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(
                    [
                      ['name', 'Investment'],
                      ['value', 'Estimated value'],
                      ['weight', 'Share of priced currency group'],
                      ['price', 'Broker bid'],
                      ['quantity', 'Quantity'],
                      ['averageBuyIn', 'Average buy-in¹'],
                      ['isin', 'ISIN'],
                      ['instrumentType', 'Type'],
                      ['quality', 'Data quality'],
                    ] as const
                  ).map(([key, title]) => (
                    <th
                      key={key}
                      aria-sort={
                        sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'
                      }
                    >
                      <button
                        className="sort-button"
                        onClick={() =>
                          setSortText(
                            `${key}:${sort.key === key ? (sort.desc ? 'asc' : 'desc') : key === 'value' ? 'desc' : 'asc'}`
                          )
                        }
                      >
                        {title}
                        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={`${p.account}:${p.isin}`}>
                    <td>
                      <a
                        href={entityHref(
                          p.instrumentType.toLowerCase() === 'fund'
                            ? `/fund/${p.isin}`
                            : `/security/${p.isin}`
                        )}
                      >
                        {p.name}
                      </a>
                      <small>
                        {p.instrumentType} · {p.quality}
                      </small>
                    </td>
                    <td>{money(p.value, p.currency)}</td>
                    <td>{p.weight === null ? '—' : new Decimal(p.weight).toFixed(2) + '%'}</td>
                    <td>
                      {p.price === null ? '—' : `${p.price} ${p.currency}`}
                      <small style={{ display: 'block' }}>
                        {p.venue} ·{' '}
                        {p.quoteAt ? new Date(p.quoteAt).toLocaleString() : 'No timestamp'}
                      </small>
                    </td>
                    <td>{p.quantity}</td>
                    <td>{p.averageBuyIn}</td>
                    <td className="mono">{p.isin}</td>
                    <td>{p.instrumentType}</td>
                    <td>{p.quality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p>{query ? 'No matching saved investments.' : 'No saved positions yet.'}</p>
          )}

          <p>
            ¹ Average buy-in is shown as supplied. Its cost-currency convention has not been
            reconciled, so profit/loss is not calculated yet. Quote currency comes from the matching
            broker listing, not the fund’s base currency or name.
          </p>
        </>
      )}
    </section>
  )
}
