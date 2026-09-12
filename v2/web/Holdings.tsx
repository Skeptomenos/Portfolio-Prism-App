import React, { useEffect, useState } from 'react'
import { Decimal } from 'decimal.js'
import type { overview, ValuedPosition } from '../server/overview'
type Overview = ReturnType<typeof overview>
const money = (v: string | null, c: string | null) =>
  v === null ? '—' : `${new Decimal(v).toFixed(2)} ${c ?? ''}`
export function Holdings({ revision }: { revision?: string }) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(false)
  const [sort, setSort] = useState<{ key: keyof ValuedPosition; desc: boolean }>({
    key: 'value',
    desc: true,
  })
  useEffect(() => {
    const c = new AbortController()
    void fetch('/api/overview', { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw Error()
        setData(await r.json())
        setError(false)
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true)
      })
    return () => c.abort()
  }, [revision])
  const rows = [...(data?.rows ?? [])].sort((a, b) => {
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
  return (
    <section className="panel holdings">
      <div className="section-title">
        <h2>Your holdings</h2>
        <span className="badge">
          {data
            ? `${data.pricedCount}/${data.rows.length - data.zeroCount} nonzero positions valued`
            : 'Loading'}
        </span>
      </div>
      <p>
        Broker facts: quantity, average buy-in, listing currency and LSX bid quote. Prism calculates
        quantity × bid for positive stock/fund positions with confirmed identity, a price factor of
        1 and a quote at or after the quantity observation. These are estimates using the latest
        saved quotes, not guaranteed execution prices.
      </p>
      {error && (
        <p role="alert">
          Could not refresh the overview. Any displayed values are from the previous load.
        </p>
      )}
      <div className="grid">
        {data?.totals.map((t) => (
          <article key={t.currency} className="summary panel">
            <p className="eyebrow">{t.currency} · PRICED SECURITIES SUBTOTAL</p>
            <h2>{money(t.securities, t.currency)}</h2>
            <p>
              {t.pricedCount} positions · {t.olderQuotes} quotes older than 24h
            </p>
            <p>
              Broker cash: {money(t.cash, t.currency)}
              {t.cashStale ? ' · refresh failed/unavailable' : ''}
              <br />
              Cash as retrieved: {t.cashAt ? new Date(t.cashAt).toLocaleString() : 'Unavailable'}
            </p>
          </article>
        ))}
      </div>
      <p className="notice">
        {data?.missingCount ?? 0} positions have no supported valuation. Their value is unknown, not
        zero. Percentages below are shares of priced securities in the same currency, excluding cash
        and unvalued positions. Negative quantities are retained but unsupported.{' '}
        {data?.zeroCount ?? 0} zero-quantity rows make no contribution and need no quote. Currencies
        are never added together or converted implicitly.
      </p>
      <p>
        Positions imported:{' '}
        {data?.holdingsAt ? new Date(data.holdingsAt).toLocaleString() : 'Not imported'} · Quotes
        retrieved:{' '}
        {data?.quoteRetrievedAt
          ? new Date(data.quoteRetrievedAt).toLocaleString()
          : 'Not retrieved'}
      </p>
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
                  aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    className="sort-button"
                    onClick={() =>
                      setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === 'value' }))
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
                <td>{p.name}</td>
                <td>{money(p.value, p.currency)}</td>
                <td>{p.weight === null ? '—' : new Decimal(p.weight).toFixed(2) + '%'}</td>
                <td>
                  {p.price === null ? '—' : `${p.price} ${p.currency}`}
                  <small style={{ display: 'block' }}>
                    {p.venue} · {p.quoteAt ? new Date(p.quoteAt).toLocaleString() : 'No timestamp'}
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
      {!rows.length && <p>No saved positions yet.</p>}

      <p>
        ¹ Average buy-in is shown as supplied. Its cost-currency convention has not been reconciled,
        so profit/loss is not calculated yet. Quote currency comes from the matching broker listing,
        not the fund’s base currency or name.
      </p>
    </section>
  )
}
