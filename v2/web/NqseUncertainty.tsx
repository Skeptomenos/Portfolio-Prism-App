import React, { useId, useState } from 'react'
import { Decimal } from 'decimal.js'
import { historicalHedgePercent, nqseHistoricalHedge, sensitivityAmount } from './nqse-sensitivity'

export function NqseUncertainty({ amount, currency, scope, compact = false }: {
  amount: string | null; currency: string | null; scope: string; compact?: boolean
}) {
  const [percent, setPercent] = useState('1')
  const inputId = useId()
  const impact = sensitivityAmount(amount, percent)
  const money = (value: string) => {
    const d = new Decimal(value)
    return `${d.gt(0) && d.lt('0.01') ? '<0.01' : d.toFixed(2)} ${currency ?? ''}`.trim()
  }
  const h = nqseHistoricalHedge
  const content = <div className="uncertainty-body">
    <div className="uncertainty-facts">
      <div><span>Current error margin</span><strong>Unknown</strong><small>Outside the numerical remainder</small></div>
      <div><span>Historical hedge / class value</span><strong>≈{new Decimal(historicalHedgePercent()).toFixed(2)}%</strong><small>{h.date} · one observation</small></div>
    </div>
    <p>The historical figure measures the currency hedge balance, not today&apos;s allocation error or a maximum. Other class balances can also matter.</p>
    <div className="uncertainty-scenario">
      <label htmlFor={inputId}>What if the {scope} differs by (%)?</label>
      <input id={inputId} type="number" inputMode="decimal" min="0" max="100" step="0.1" value={percent} onChange={event => setPercent(event.target.value)} />
      <output htmlFor={inputId} aria-live="polite">{amount === null || !currency ? 'Impact unavailable: saved value missing' : impact === null ? 'Enter a percentage from 0 to 100' : `Change: ±${money(impact)}`}</output>
    </div>
    <p className="uncertainty-disclaimer">Illustrative input, not a measured error range. This changes no portfolio totals. {amount !== null && currency && <>Applied only to this {scope}: {money(amount)}.</>}</p>
    <details><summary>Source and missing data</summary>
      <p><a href={h.source} target="_blank" rel="noreferrer">iShares interim report · {h.date}</a> · {h.pages}.</p>
      <p>EUR-class forward gains $17.934m minus losses $0.022m, converted at 0.8406 EUR/USD and divided by €1,749.942m class NAV. Rounded report inputs give historical context only.</p>
      <p>Next: obtain same-date weights for your EUR-hedged class, or its attributable underlying value divided by class NAV. The saved composition and quote dates still apply to the estimate.</p>
    </details>
  </div>
  return compact ? <details className="nqse-uncertainty compact"><summary>Hedge adjustment unknown · explore impact</summary>{content}</details>
    : <section className="nqse-uncertainty" aria-label="Currency hedge uncertainty"><h3>How approximate is this allocation?</h3>{content}</section>
}
