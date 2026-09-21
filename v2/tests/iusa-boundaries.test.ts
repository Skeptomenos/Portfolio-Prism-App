import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseIusaCandidate } from '../server/iusa-qualification'
import { SnapshotStore } from '../server/store'
import { issuerFixture } from './iusa.test'

const at = '2026-09-11T12:00:00Z'
const bytes = (value: string) => Buffer.from(value)
const pilotFixture = () => {
  const ids = ['US67066G1040','US0378331005','US5949181045','US0231351067','US02079K3059','US11135F1012','US02079K1079','US30303M1027','US5951121038','US46625H1005']
  return `<h1 data-testid="etf-profile-header_etf-name">iShares Core S&amp;P 500 UCITS ETF USD (Dist)</h1><span data-testid="etf-profile-header_isin-value">IE0031442068</span><h3 data-testid="hl_etf-holdings_top-holdings_header">Top 10 Holdings</h3><span data-testid="tl_etf-holdings_top-holdings_weight">10%</span><table data-testid="etf-holdings_top-holdings_table">${ids.map(id => `<tr><td><a href="/en/stock-profiles/${id}">Synthetic</a></td><td><span data-testid="tl_etf-holdings_top-holdings_value_percentage">1%</span></td></tr>`).join('')}</table><div data-testid="tl_etf-holdings_reference-date">As of 01/09/2026</div>`
}

it('rejects extreme decimal exponents before Decimal arithmetic and preserves normal exponent tokens', () => {
  expect(() => parseIusaCandidate(bytes(issuerFixture().replace('"600"', '"1e-1000"')), at)).toThrow()
  expect(() => parseIusaCandidate(bytes(issuerFixture().replace('"600"', '"1e1000"')), at)).toThrow()
  const parsed = parseIusaCandidate(bytes(issuerFixture().replace('"600"', '"1e-10"')), at)
  expect(parsed.rows[0].marketValue).toBe('1e-10')
})

it('preserves issuer country, exchange and identifier presence independently of equity admission', () => {
  const raw = issuerFixture().replace(
    '"ticker":{"value":["A","B","USD","COLL","FUT"]}',
    '"ticker":{"value":["A","B","USD","COLL","FUT"]},"exchange":{"value":["XNAS","XNAS","-","-","-"]},"countryOfRisk":{"value":["US","US","-","-","-"]}'
  )
  const parsed = parseIusaCandidate(bytes(raw), at)
  expect(parsed.rows[0]).toMatchObject({ exchange: 'XNAS', country: 'US', identifierPresence: 'present', equityIdentity: 'valid-isin' })
  expect(parsed.rows[2]).toMatchObject({ exchange: null, country: null, identifierPresence: 'missing', equityIdentity: 'not-equity' })
})

it('distinguishes no issuer fallback, pilot fallback and prior issuer fallback warnings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-iusa-boundaries-'))
  const path = join(dir, 'p.sqlite')
  let store = new SnapshotStore(path)
  try {
    expect(store.composition()).toBeNull()
    expect(store.issuerWarning).toBeNull()
    store.close()
    const db = new DatabaseSync(path)
    db.prepare('INSERT INTO iusa_allocations VALUES (?,?,?,?)').run('bad', '2026-09-10', '{}', at)
    db.close()
    store = new SnapshotStore(path)
    expect(store.composition()).toBeNull()
    expect(store.issuerWarning).toContain('No valid issuer or recovery composition')
    store.close()
    const pilotPath = join(dir, 'pilot.sqlite')
    store = new SnapshotStore(pilotPath)
    store.saveComposition(pilotFixture(), at, { at, id: 'pilot', status: 'success', code: null })
    const pilotDb = new DatabaseSync(pilotPath)
    pilotDb.prepare('INSERT INTO iusa_allocations VALUES (?,?,?,?)').run('bad', '2026-09-10', '{}', at)
    pilotDb.close()
    expect(store.composition()?.scope).toBe('top-ten')
    expect(store.issuerWarning).toContain('retained top-ten pilot is used')
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
