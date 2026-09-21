import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CoverageSummary, coveragePercent, coverageMoney } from '../web/CoverageSummary'
const report = {
  totals: [{ currency: 'EUR', pricedSecurities: '100', knownCompanyValue: '100', unresolvedValue: '0', knownPercent: '100', state: 'allocated', nonCompanyValue: null }],
  positionCount: 2, unvalued: 1, companyGrouping: 'partial', reconciliation: 'pending',
  quoteDates: { earliest: '2026-09-01', latest: '2026-09-01' }, compositionDates: { earliest: '2026-09-02', latest: '2026-09-02' },
  staleQuotes: 1, staleCompositions: 0, refreshFailed: false, warning: null, gaps: [], holdingsAt: '2026-09-01',
}
it('shows partial exposure, unvalued positions, scope and old quotes even at 100% priced allocation', () => {
  const html=renderToStaticMarkup(React.createElement(CoverageSummary,{report,error:null}))
  expect(html).toContain('100.00%')
  expect(html).toContain('Partial exposure')
  expect(html).toContain('positions unvalued')
  expect(html).toContain('older than 24h')
  expect(html).toContain('excludes cash and unvalued positions')
  expect(html.indexOf('Company grouping:')).toBeLessThan(html.indexOf('<details'))
  expect(html.indexOf('Quotes')).toBeLessThan(html.indexOf('<details'))
})
it('does not turn a tiny nonzero remainder into a complete rounded percentage', () => {
  expect(coveragePercent('99.999999')).toBe('<100%')
  expect(coveragePercent('0.000001')).toBe('<0.01%')
  expect(coveragePercent(null)).toBe('Unavailable')
  expect(coverageMoney('0.000001','EUR')).toBe('<0.01 EUR')
})
it('shows first-load failure without inventing amounts, and retains last-success figures with a refresh warning', () => {
  const missing=renderToStaticMarkup(React.createElement(CoverageSummary,{report:null,error:'Coverage unavailable'}))
  expect(missing).toContain('role="alert"')
  expect(missing).not.toContain('0.00')
  const retained=renderToStaticMarkup(React.createElement(CoverageSummary,{report:{...report,refreshFailed:true},error:'Could not refresh'}))
  expect(retained).toContain('100.00 EUR')
  expect(retained).toContain('Could not refresh')
  expect(retained).toContain('Latest refresh needs attention')
})
it('renders no successful bar for an empty or incompatible denominator', () => {
  for(const state of ['unavailable','incompatible']) {
    const value={...report,totals:[{...report.totals[0],state,knownPercent:null}]}
    expect(renderToStaticMarkup(React.createElement(CoverageSummary,{report:value,error:null}))).not.toContain('role="img"')
  }
})
