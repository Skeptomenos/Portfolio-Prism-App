import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseIusaCandidate, qualifyIusa, iusaParserVersion } from '../server/iusa-qualification'
import { iusaEvidenceFiles, qualifyIusaEvidence, type IusaEvidenceBundle } from '../server/iusa-evidence'
import { iusaComposition } from '../server/iusa-composition'
import { SnapshotStore } from '../server/store'
import { exposure } from '../server/exposure'
import type { ValuedPosition } from '../server/overview'

const at = '2026-09-11T12:00:00Z'
// Synthetic provider-shaped records; no issuer table or private portfolio is committed.
export function issuerFixture() {
  const point = (value: unknown) => ({ value })
  return JSON.stringify({ productId: 251900, portfolioType: 'ISHARES_FUND_DATA', currencyCode: 'USD',
    fundName: 'iShares Core S&P 500 UCITS ETF USD (Dist)', pageScopeData: { portfolioId: '251900', ticker: 'IUSA' },
    componentsByNameMap: { holdings: { containersByNameMap: { all: { fullName: 'holdings.all', dataPointsByNameMap: {
      asOfDate: point(20260909), issueName: point(['Synthetic equity A', 'Synthetic equity B', 'Cash', 'Collateral', 'Future']),
      isin: point(['US0378331005', 'US46625H1005', null, null, null]), ticker: point(['A', 'B', 'USD', 'COLL', 'FUT']),
      assetClass: point(['Equity', 'Equity', 'Cash', 'Cash Collateral and Margins', 'Futures']),
      holdingPercent: { value: ['60.00000', '39.00000', '0.90000', '0.10000', '0.00000'], label: 'Weight (%)', fullName: 'holdings.all.holdingPercent' },
      marketValue: point(['600', '390', '9', '1', '0']), notionalValue: point(['600', '390', '9', '1', '17']),
      marketCurrencyCode: point(['USD', 'USD', 'USD', 'USD', 'USD']), dateList: point([20260909, 20260908]),
    } } } } } })
}
const bytes = (s: string) => Buffer.from(s)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
export function bundle(raw = issuerFixture()): IusaEvidenceBundle {
  const captures = iusaEvidenceFiles.map(name => ({ name, body: bytes(raw).toString('base64'), receipt: JSON.stringify({
    url: 'https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data?appSubType=ISHARES&appType=PRODUCT_PAGE&component=holdings.all&locale=en_GB&portfolioId=251900&targetSite=ishares-uk&userType=individual&excludeContent=true&asOfDate=20260909&includeConfig=true',
    retrievedAt: at, status: 200, bytes: bytes(raw).length, sha256: sha(raw),
  }) }))
  return { parserVersion: iusaParserVersion, captures, manifest: JSON.stringify({ files: captures.flatMap(c => [
    { file: c.name, sha256: sha(raw) }, { file: `${c.name}.receipt.json`, sha256: sha(c.receipt) },
  ]) }) }
}
it('keeps original decimal tokens and every non-equity row, independently of NAV', () => {
  const raw = issuerFixture().replace('"600"', '600.123456789012345678901')
  const c = parseIusaCandidate(bytes(raw), at)
  expect(c.rows[0].marketValue).toBe('600.123456789012345678901')
  expect(c.rows[0].weightPercent).toBe('60.00000')
  expect(c.accounting).toMatchObject({ sourceRows: 5, equityRows: 2, nonEquityRows: 3, equityPercent: '99', nonEquityPercent: '1' })
  expect(c.rows[4]).toMatchObject({ weightPercent: '0.00000', notionalValue: '17', equityIdentity: 'not-equity' })
})
it('fails wrong identity, changed scope/units, misaligned rows, malformed/future dates, nonnumeric and oversized content', () => {
  const raw = issuerFixture()
  for (const bad of [raw.replace('251900', '999999'), raw.replace('holdings.all"', 'holdings.index"'), raw.replace('Weight (%)','Weight'), raw.replace('"Synthetic equity B",',''), raw.replace('20260909','20260231'), raw.replace('20260909','20270909'), raw.replace('"60.00000"','"NaN"'), 'x'.repeat(3_000_001)])
    expect(qualifyIusa(bytes(bad), at).eligibleForMonetaryExposure).toBe(false)
})
it('requires canonical repeat agreement, preserves unresolved IDs, and separates technical readiness from rights', () => {
  const raw = issuerFixture()
  expect(qualifyIusa(bytes(raw), at).state).toBe('open')
  const drift = raw.replace('39.00000','38.00000')
  expect(qualifyIusa(bytes(raw), at, { bytes: bytes(drift), retrievedAt: at }).state).toBe('failed')
  const badId = raw.replace('US0378331005','US0378331006')
  expect(qualifyIusa(bytes(badId), at, { bytes: bytes(badId), retrievedAt: at }).candidate?.rows).toHaveLength(5)
  const ready = qualifyIusaEvidence(bundle())
  expect(ready.eligibleForMonetaryExposure).toBe(true)
  expect(ready.checks.find(c => c.id === 'local-use')?.state).toBe('pending')
  const altered = bundle(); altered.captures[0].body = bytes(drift).toString('base64')
  expect(qualifyIusaEvidence(altered).state).toBe('failed')
  const wrongVersion = { ...bundle(), parserVersion: 'unknown' } as unknown as IusaEvidenceBundle
  expect(qualifyIusaEvidence(wrongVersion).state).toBe('failed')
})
function pilotFixture() {
  // Retained recovery source is intentionally distinguishable from issuer rows.
  const ids = ['US67066G1040','US0378331005','US5949181045','US0231351067','US02079K3059','US11135F1012','US02079K1079','US30303M1027','US5951121038','US46625H1005']
  return `<h1 data-testid="etf-profile-header_etf-name">iShares Core S&amp;P 500 UCITS ETF USD (Dist)</h1><span data-testid="etf-profile-header_isin-value">IE0031442068</span><h3 data-testid="hl_etf-holdings_top-holdings_header">Top 10 Holdings</h3><span data-testid="tl_etf-holdings_top-holdings_weight">10%</span><table data-testid="etf-holdings_top-holdings_table">${ids.map(id => `<tr><td><a href="/en/stock-profiles/${id}">Synthetic</a></td><td><span data-testid="tl_etf-holdings_top-holdings_value_percentage">1%</span></td></tr>`).join('')}</table><div data-testid="tl_etf-holdings_reference-date">As of 01/09/2026</div>`
}
it('atomically replaces the pilot, deduplicates reimport, rejects conflict and corruption, and replays after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-iusa-')), path = join(dir, 'p.sqlite')
  let store = new SnapshotStore(path)
  try {
    store.saveComposition(pilotFixture(), at, { at, id: 'pilot', status: 'success', code: null })
    const old = store.compositionEvidence()
    store.saveIusaAllocation(bundle(), at)
    store.saveIusaAllocation(bundle(), at)
    expect(store.iusaAllocationCount()).toBe(1)
    expect(store.composition()?.rows).toHaveLength(2)
    expect(store.composition()?.scope).toBe('full-holdings')
    expect(store.compositionEvidence()).toEqual(old)
    expect(() => store.saveIusaAllocation(bundle(issuerFixture().replace('39.00000','38.00000')), at)).toThrow()
    const corrupt = bundle(); corrupt.captures[0].body = 'not-valid'
    expect(() => store.saveIusaAllocation(corrupt, at)).toThrow()
    const selected = store.composition()
    store.close(); store = new SnapshotStore(path)
    expect(store.composition()).toEqual(selected)
    expect(store.iusaAllocationCount()).toBe(1)
    expect(store.pilotComposition()?.scope).toBe('top-ten')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})
it('projects exact-ISIN equity only, without FX or equity normalization, preserving currency and monetary remainder', () => {
  const p = (isin: string, value: string, currency: string): ValuedPosition => ({ isin, value, currency, account: 'synthetic', name: 'Synthetic', quantity: '1', instrumentType: isin === 'IE0031442068' ? 'fund' : 'stock', averageBuyIn: '1', price: value, quoteAt: at, venue: 'TEST', quality: 'Synthetic', weight: null, quantityObservedAt: at, valuationStatus: 'priced' })
  const view = exposure({ rows: [p('IE0031442068','123.456789','EUR'),p('US0378331005','10','EUR'),p('US0378331005','5','USD')],
    totals: [{ currency:'EUR',securities:'133.456789', cash:null, pricedCount:2,cashAt:null,cashStale:true,olderQuotes:0 },{ currency:'USD',securities:'5',cash:null,pricedCount:1,cashAt:null,cashStale:true,olderQuotes:0 }],
    pricedCount:3,zeroCount:0,missingCount:0,holdingsAt:at,quoteRetrievedAt:at }, iusaComposition(bundle()), null)
  expect(view.rows.find(r => r.isin === 'US0378331005' && r.currency === 'EUR')).toMatchObject({ indirect:'74.0740734',direct:'10',knownTotal:'84.0740734' })
  expect(view.coverage[0].unresolvedValue).toBe('1.23456789')
  expect(view.rows).toHaveLength(3)
  expect(view.rows.find(r => r.currency === 'USD')?.indirect).toBe('0')
  expect(view.gaps[0].reason).toContain('not NAV')
})

it('rejects a materially incomplete weight total and signed equity even when rows repeat', () => {
  for (const raw of [issuerFixture().replace('39.00000', '0.00000'), issuerFixture().replace('60.00000', '-1.00000').replace('39.00000', '100.00000')]) {
    expect(qualifyIusaEvidence(bundle(raw)).state).toBe('failed')
  }
})
it('replays an older valid issuer version when the newest stored bundle is corrupt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-iusa-recovery-')), path = join(dir, 'p.sqlite')
  let store = new SnapshotStore(path)
  try {
    store.saveComposition(pilotFixture(), at, { at, id: 'pilot', status: 'success', code: null })
    const original = store.saveIusaAllocation(bundle(), at)
    store.close()
    const db = new DatabaseSync(path)
    db.prepare('INSERT INTO iusa_allocations VALUES (?,?,?,?)').run('corrupt-newer', '2026-09-10', '{}', at)
    db.close()
    store = new SnapshotStore(path)
    expect(store.composition()?.sha256).toBe(original.sha256)
    expect(store.issuerWarning).toContain('failed replay validation')
    store.saveComposition(pilotFixture(), at, { at, id: 'refresh', status: 'success', code: null })
    expect(store.composition()?.scope).toBe('full-holdings')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

// Cross-view regression: source identifiers describe all retained rows, independently
// of the narrower equity set admitted to monetary allocation.
it('keeps register/detail counts and context aligned and labels only selected actual contributions included', async () => {
  const { developmentProgress } = await import('../server/development')
  const { iusaReadiness, iusaDetail } = await import('../server/iusa-readiness')
  const { illustrativeValues } = await import('../server/illustrative-values')
  const selected = iusaComposition(bundle())
  const base = developmentProgress(null, [], null, null, null, 'disconnected')
  const fund: import('../server/development').DevelopmentFund = {
    isin: selected.fundIsin, name: 'Synthetic IUSA', provider: 'Synthetic', source: 'Synthetic', sourceUrl: null,
    compositionDate: null, lastVerifiedAt: null, acquisitionState: 'missing', qualificationState: 'open',
    validated: false, usedInCalculation: false, calculationSource: null, blocker: '', nextAction: '', identityNote: '',
    evidence: { fileName: null, format: null, bytes: null, sha256: null, manifestVerified: false, identityVerified: false,
      sourceUrl: null, compositionDate: null, lastVerifiedAt: null, rowCount: null, equityRowCount: null,
      identifierRowCount: null, tickerRowCount: null, weightRowCount: null, nonEquityRowCount: null, error: null },
  }
  const progress = iusaReadiness({ ...base, funds: [fund] }, selected, null)
  const detail = iusaDetail({ ...fund, rows: [], rowPage: { total: 0, identifiers: 0, reportedWeights: 0 } }, progress, selected)
  expect(progress.counts.identifiedRows).toBe(5)
  expect(progress.counts.identifiedRows).toBe(progress.funds.reduce((sum, f) => sum + (f.evidence.identifierRowCount ?? 0), 0))
  expect(detail.evidence.identifierRowCount).toBe(detail.rowPage.identifiers)
  expect(detail.evidence.tickerRowCount).toBe(5)
  expect(detail.rows[4].availableIdentifiers).toEqual(['Ticker'])
  expect(detail.rows[0].exchange).toBe(selected.sourceRows![0].exchange)
  expect(detail.rows[0].country).toBe(selected.sourceRows![0].country)
  const position: ValuedPosition = { isin: selected.fundIsin, value: '100', currency: 'EUR', account: 'a', name: 'Synthetic',
    quantity: '1', instrumentType: 'fund', averageBuyIn: '1', price: '100', quoteAt: at, venue: 'TEST', quality: 'Synthetic',
    weight: null, quantityObservedAt: at, valuationStatus: 'priced' }
  const valuation = { rows: [position], totals: [], pricedCount: 1, zeroCount: 0, missingCount: 0, holdingsAt: at, quoteRetrievedAt: at }
  const included = illustrativeValues(detail, detail.rows, valuation, selected)
  expect(included.kind).toBe('selected-allocation')
  expect(included.rows[0]).toMatchObject({ state: 'included', value: '60' })
  expect(included.rows[4]).toMatchObject({ state: 'unavailable', value: null })
  for (const changed of [
    { ...detail, compositionDate: '2026-09-08' },
    { ...detail, evidence: { ...detail.evidence, sha256: 'wrong' } },
    { ...detail, usedInCalculation: false },
    { ...detail, isin: 'IE00B4L5Y983' },
  ]) expect(illustrativeValues(changed, detail.rows, valuation, selected).rows.some(row => row.state === 'included')).toBe(false)
  const wrongRows = [{ ...detail.rows[0], isin: 'US5949181045' }, { ...detail.rows[1], weightPercent: '1' }]
  expect(illustrativeValues(detail, wrongRows, valuation, selected).rows.every(row => row.state !== 'included')).toBe(true)
  const multiCurrency = { ...valuation, rows: [position, { ...position, account: 'b', currency: 'USD' }] }
  expect(illustrativeValues(detail, detail.rows, multiCurrency, selected).rows.some(row => row.state === 'included')).toBe(false)
})
