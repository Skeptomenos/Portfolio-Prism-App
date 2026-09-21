import { expect, it } from 'vitest'
import { Decimal } from 'decimal.js'
import { coverageReport } from '../server/coverage-report'
import { developmentProgress } from '../server/development'
import { exposure } from '../server/exposure'
import type { Composition } from '../server/composition'
import type { overview, ValuedPosition } from '../server/overview'
import { SnapshotStore } from '../server/store'
import { providerEvidence } from './provider-fixture'
import { inspectionEvidence } from './inspection-fixture'
import { issuerReadiness, iusaDetail } from '../server/iusa-readiness'

const at = '2026-09-20T12:00:00Z'
const fund = 'IE0031442068', stock = 'US67066G1040'
it('preserves the NQSE limitation through saved-source selection, coverage, detail and contributions', () => {
  const store = new SnapshotStore(':memory:')
  try {
    const isin = 'IE00BYVQ9F29'
    store.saveProviderEvidence(providerEvidence(isin, '2026-09-10', ['99', '1']), {
      id: 'nqse', at, providerId: 'ishares-bundled', status: 'success', code: null, outcome: 'updated', resolution: 'saved',
    })
    const selected = store.selectedCompositions()
    const data = input([position(isin, '100')])
    const progress = issuerReadiness(data.progress, selected, null)
    const result = exposure(data.valuations, selected, null)
    const coverage = coverageReport(data.valuations, result, progress, { failed: false, warning: null })
    const limitation = selected[0].estimateLimitation!
    expect(limitation.qualifier).toContain('class hedge adjustment unknown, not included in the numerical remainder')
    expect(limitation.nextAction).toContain('same-date attributable-underlying / class-NAV ratio')
    expect(coverage.funds[0].reason).toContain(limitation.qualifier)
    expect(coverage.funds[0].evidenceAction).toBe(limitation.nextAction)
    expect(coverage.funds[0].values[0]).toMatchObject({ included: '99', unassigned: '1' })
    const detail = iusaDetail({ ...data.progress.funds[0], rows: [], rowPage: { total: 0, identifiers: 0, reportedWeights: 0 } }, progress, selected[0])
    expect(detail.blocker).toContain(limitation.qualifier)
    expect(detail.nextAction).toBe(limitation.nextAction)
    expect(result.rows.flatMap(row => row.contributions).every(row => row.source?.estimateLimitation?.qualifier === limitation.qualifier)).toBe(true)
  } finally { store.close() }
})
function position(isin: string, value: string | null, currency = 'EUR', account = 'one'): ValuedPosition {
  return { isin, name: 'Synthetic ' + isin, quantity: '1', account, averageBuyIn: '1',
    instrumentType: isin === stock ? 'stock' : 'fund', currency, value, price: value,
    quoteAt: value === null ? null : at, quality: 'Synthetic', weight: null, venue: 'TEST',
    quantityObservedAt: at, valuationStatus: value === null ? 'unavailable' : 'priced' }
}
function input(rows: ValuedPosition[], weight = '90', selected = true) {
  const valuations: ReturnType<typeof overview> = {
    rows, holdingsAt: at, quoteRetrievedAt: at, pricedCount: rows.filter(row => row.value !== null).length,
    missingCount: rows.filter(row => row.value === null).length, zeroCount: 0,
    totals: [...new Set(rows.map(row => row.currency!))].map(currency => ({
      currency, securities: rows.filter(row => row.currency === currency).reduce((total, row) => total.add(row.value ?? '0'), new Decimal(0)).toFixed(),
      cash: '20', pricedCount: rows.filter(row => row.currency === currency && row.value !== null).length,
      cashAt: at, cashStale: false, olderQuotes: 0,
    })),
  }
  const source: Composition = { fundIsin: fund, fundName: 'Synthetic fund', scope: 'full-holdings',
    sourceUrl: 'https://example.invalid/source', termsUrl: 'https://example.invalid/terms',
    asOf: at.slice(0,10), retrievedAt: at, sha256: 'synthetic', parserVersion: 1,
    weightUnit: 'percent', disclosedPercent: '100', identifiedPercent: weight, missingPercent: '0',
    rows: [{ name: 'Synthetic security', isin: stock, weightPercent: weight, issue: null }] }
  const result = exposure(valuations, selected ? [source] : [], null, false, Date.parse(at))
  const progress = developmentProgress({ fetchedAt: at, positions: rows }, [], null, null, null, 'disconnected')
  progress.funds = progress.funds.map(row => ({...row, validated: true, acquisitionState: 'acquired'}))
  return { valuations, result, progress }
}
function project(data: ReturnType<typeof input>, failed = false, now = Date.parse(at)) {
  return coverageReport(data.valuations, data.result, data.progress, { failed, warning: null }, now)
}

it('accounts for multiple accounts and currencies using the actual contribution amounts without adding cash', () => {
  const data = input([position(fund,'100'), position(fund,'50','EUR','two'), position(stock,'20'), position(fund,'200','USD')])
  const before = JSON.stringify(data.result)
  const report = project(data)
  expect(report.totals.map(row => [row.currency,row.pricedSecurities,row.knownCompanyValue,row.unresolvedValue])).toEqual([
    ['EUR','170','155','15'], ['USD','200','180','20'],
  ])
  expect(report.funds[0].values).toMatchObject([{currency:'EUR',priced:'150',included:'135',unassigned:'15'}, {currency:'USD',priced:'200',included:'180',unassigned:'20'}])
  expect(report.totals.every(row => row.nonCompanyValue === null)).toBe(true)
  expect(JSON.stringify(data.result)).toBe(before)
})
it('keeps unvalued positions and partial company grouping visible when priced allocation reaches 100%', () => {
  const report = project(input([position(fund,'100'),position(stock,null)],'100'))
  expect(report.totals[0]).toMatchObject({state:'allocated',knownPercent:'100',unresolvedValue:'0'})
  expect(report.unvalued).toBe(1)
  expect(report.companyGrouping).toBe('partial')
  expect(report.gaps).toHaveLength(1)
  expect(report.gaps[0]).toMatchObject({value:null,nextAction:'Resolve the missing valuation'})
  expect(report.funds[0].nextAction).toBe('Keep source data current')
})
it('labels checked but unused data as integration pending without increasing coverage', () => {
  const report = project(input([position(fund,'100')],'90',false))
  expect(report.counts).toMatchObject({held:1,saved:1,checked:1,used:0})
  expect(report.funds[0]).toMatchObject({state:'integration-pending',nextAction:'Integrate the checked data'})
  expect(report.totals[0]).toMatchObject({knownCompanyValue:'0',unresolvedValue:'100'})
})
it('distinguishes failed source checks from checks that have not started', () => {
  const data = input([position(fund,'100')],'90',false)
  data.progress.funds[0] = {...data.progress.funds[0], validated: false, qualificationState: 'failed', acquisitionState: 'rejected'}
  const report = project(data)
  expect(report.funds[0]).toMatchObject({state:'checks-failed',nextAction:'Resolve the failed source checks'})
  expect(report.counts).toMatchObject({saved:0,checked:0,used:0})
  expect(report.totals[0]).toMatchObject({knownCompanyValue:'0',unresolvedValue:'100'})
})
it('keeps tiny remainders partial and zero or empty denominators unavailable', () => {
  const tiny = project(input([position(fund,'100')],'99.999999'))
  expect(tiny.totals[0]).toMatchObject({state:'partial',unresolvedValue:'0.000001'})
  const unknown = project(input([position(fund,null)]))
  expect(unknown.totals[0]).toMatchObject({state:'unavailable',knownPercent:null})
  expect(unknown.funds[0].values).toEqual([])
  expect(project(input([])).totals).toEqual([])
})
it('retains original amounts and dates through refresh failure, staleness and replay', () => {
  const data=input([position(fund,'100')])
  const report=project(data,true,Date.parse(at)+40*86400000)
  expect(report).toMatchObject({refreshFailed:true,staleQuotes:1,staleCompositions:1,quoteDates:{earliest:at},compositionDates:{earliest:'2026-09-20'}})
  expect(report.totals).toEqual(project(data).totals)
  expect(project(JSON.parse(JSON.stringify(data)),true,Date.parse(at)+40*86400000)).toEqual(report)
})
it('excludes zero-quantity funds from held progress and rejects an incompatible over-allocation bar', () => {
  const data=input([{...position(fund,'0'),quantity:'0',valuationStatus:'zero'}])
  expect(project(data).counts).toMatchObject({held:0,saved:0,used:0})
  const invalid=project(input([position(fund,'100')],'101'))
  expect(invalid.totals[0].state).toBe('incompatible')
})

it('keeps mixed persisted composition and inspection progress consistent without admitting basket exposure', () => {
  const store = new SnapshotStore(':memory:')
  try {
    const attempt = { id: 'mixed', at, providerId: 'ishares-bundled', status: 'success' as const, code: null, outcome: 'updated' as const, resolution: 'saved' }
    store.saveProviderEvidence(providerEvidence(fund, '2026-09-10', ['99', '1']), attempt)
    store.saveInspectionEvidence(inspectionEvidence(), { ...attempt, providerId: 'amundi-bundled' })
    const rows = [position(fund, '100'), position('FR0010361683', '50')]
    const data = input(rows)
    const selected = store.selectedCompositions()
    const raw = developmentProgress({ fetchedAt: at, positions: rows }, [], null, null, null, 'disconnected', Date.parse(at), store.selectedInspections())
    expect(raw.counts.acquiredFunds).toBe(1)
    const progress = issuerReadiness(raw, selected, null)
    expect(progress.counts).toMatchObject({ acquiredFunds: 2, qualifiedFunds: 1, usedFunds: 1 })
    const acquired = progress.stages.find(stage => stage.id === 'acquisition')!
    expect(acquired.summary).toContain('2/2 ETFs have saved source observations; 0 have none')
    expect(acquired.summary).toContain('do not establish full economic composition')
    expect(acquired.checks[0].detail).toContain(String(progress.counts.acquiredRows))
    const inspection = progress.funds.find(item => item.isin === 'FR0010361683')!
    expect(inspection.evidence).toMatchObject({ rowCount: 3, identifierRowCount: 2, isinRowCount: 2, weightRowCount: 3 })
    expect(inspection.inspection?.benchmarkRowCount).toBe(1)
    const result = exposure(data.valuations, selected, null)
    const report = coverageReport(data.valuations, result, progress, { failed: false, warning: null })
    expect(report.funds.find(item => item.isin === 'FR0010361683')).toMatchObject({ state: 'inspection-only', nextAction: 'Obtain economic exposure data', used: false, values: [{ included: '0', unassigned: '50' }] })
    expect(result.rows.flatMap(row => row.contributions).some(row => row.positionIsin === 'FR0010361683')).toBe(false)
  } finally { store.close() }
})
