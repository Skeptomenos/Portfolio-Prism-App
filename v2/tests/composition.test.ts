import { it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { acquireComposition, parseComposition, pilotIsin, validIsin } from '../server/composition'
import { CompositionService } from '../server/composition-service'
import { SnapshotStore } from '../server/store'
import { exposure } from '../server/exposure'
import type { ValuedPosition } from '../server/overview'

// Synthetic layout fixture. Provider data and real portfolios are never committed.
export function fixture() {
  const ids = [
    'US67066G1040',
    'US0378331005',
    'US5949181045',
    'US0231351067',
    'US02079K3059',
    'US11135F1012',
    'US02079K1079',
    'US30303M1027',
    'US5951121038',
    'US46625H1005',
  ]
  return `<h1 data-testid="etf-profile-header_etf-name">iShares Core S&amp;P 500 UCITS ETF USD (Dist)</h1>
  <span data-testid="etf-profile-header_isin-value">${pilotIsin}</span>
  <h3 data-testid="hl_etf-holdings_top-holdings_header">Top 10 Holdings</h3>
  <span data-testid="tl_etf-holdings_top-holdings_weight">10%</span>
  <table data-testid="etf-holdings_top-holdings_table"><tbody>${ids.map((id, i) => `<tr><td><a href="/en/stock-profiles/${id}"><span>Company ${i}</span></a></td><td><span data-testid="tl_etf-holdings_top-holdings_value_percentage">1%</span></td></tr>`).join('')}</tbody></table>
  <div data-testid="tl_etf-holdings_reference-date">As of 01/09/2026</div>`
}
const at = '2026-09-07T12:00:00Z'
const position = (
  isin = pilotIsin,
  value: string | null = '123.456789',
  currency: string | null = 'EUR'
): ValuedPosition => ({
  isin,
  value,
  currency,
  account: 'synthetic',
  name: 'Synthetic',
  quantity: '1',
  instrumentType: isin === pilotIsin ? 'fund' : 'stock',
  averageBuyIn: '1',
  price: value,
  quoteAt: at,
  venue: 'LSX',
  quality: 'Synthetic quote',
  weight: null,
  quantityObservedAt: at,
  valuationStatus: value === null ? 'unavailable' : 'priced',
})
function valued(rows: ValuedPosition[], securities = '200') {
  return {
    rows,
    totals: [
      {
        currency: 'EUR',
        securities,
        cash: null,
        pricedCount: rows.length,
        cashAt: null,
        cashStale: true,
        olderQuotes: 0,
      },
    ],
    pricedCount: rows.filter((r) => r.value !== null).length,
    zeroCount: 0,
    missingCount: rows.filter((r) => r.value === null).length,
    holdingsAt: at,
    quoteRetrievedAt: at,
  }
}
it('validates identity, date, explicit units, row count and weight totals without heuristics', () => {
  expect(validIsin('US67066G1040')).toBe(true)
  expect(validIsin('US67066G1041')).toBe(false)
  const c = parseComposition(fixture(), at)
  const fractional = parseComposition(
    fixture().replace('>1%</span>', '>0.5%</span>').replace('>10%</span>', '>9.5%</span>'),
    at
  )
  expect(fractional.rows[0].weightPercent).toBe('0.5')
  expect(fractional.missingPercent).toBe('90.5')
  expect(c).toMatchObject({
    fundIsin: pilotIsin,
    asOf: '2026-09-01',
    disclosedPercent: '10',
    identifiedPercent: '10',
    missingPercent: '90',
    weightUnit: 'percent',
  })
  expect(() => parseComposition(fixture().replace(pilotIsin, 'IE00B4L5Y983'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('(Dist)', '(Acc)'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('01/09/2026', '31/02/2026'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('01/09/2026', '01/09/2027'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('>1%</span>', '>0.01</span>'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('>1%</span>', '>101%</span>'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('>10%</span>', '>20%</span>'), at)).toThrow()
  expect(() => parseComposition(fixture().replace('US0378331005', 'US67066G1040'), at)).toThrow()
  expect(parseComposition(fixture().replace('As of 01/09/2026', 'As of -'), at).asOf).toBeNull()
  const unresolved = parseComposition(
    fixture().replace('/en/stock-profiles/US67066G1040', '/en/cash/USD'),
    at
  )
  expect(unresolved.rows[0].isin).toBeNull()
  expect(unresolved.identifiedPercent).toBe('9')
  expect(unresolved.disclosedPercent).toBe('10')
})
it('adds exact direct and indirect decimals, keeps currency/classes separate and accounts for all priced value', () => {
  const c = parseComposition(fixture(), at)
  const e = exposure(
    valued([
      position(),
      position('US67066G1040', '10'),
      position('US67066G1040', '5', 'USD'),
      { ...position('IE00B4L5Y983', '66.543211'), instrumentType: 'fund' },
    ]),
    c,
    null,
    false,
    Date.parse(at)
  )
  const precise = exposure(
    valued([position(pilotIsin, '123456789012345678901234567890.123456789')]),
    c,
    null
  )
  expect(precise.rows[0].indirect).toBe('1234567890123456789012345678.90123456789')
  const n = e.rows.find((r) => r.isin === 'US67066G1040' && r.currency === 'EUR')!
  expect(n).toMatchObject({
    direct: '10',
    indirect: '1.23456789',
    knownTotal: '11.23456789',
    percentOfPriced: '5.617283945',
  })
  expect(e.rows.filter((r) => r.isin === 'US67066G1040')).toHaveLength(2)
  expect(e.rows.filter((r) => r.isin.startsWith('US02079K'))).toHaveLength(2)
  expect(e.coverage[0]).toMatchObject({
    knownCompanyValue: '22.3456789',
    unresolvedValue: '177.6543211',
  })
  expect(e.gaps.find((g) => g.isin === pilotIsin)?.value).toBe('111.1111101')
  const missing = exposure(
    valued([position(pilotIsin, null), position('US67066G1040', null, null)]),
    c,
    null
  )
  expect(missing.gaps.every((g) => g.value === null)).toBe(true)
  expect(missing.rows.flatMap((r) => r.contributions).every((r) => r.value === null)).toBe(true)
  expect(exposure(valued([position()]), null, null).coverage[0].knownCompanyValue).toBe('0')
})
it('migrates version four without losing existing records and replays persisted raw evidence after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-composition-')),
    path = join(dir, 'p.sqlite')
  try {
    const old = new DatabaseSync(path)
    old.exec(
      'CREATE TABLE snapshots(id INTEGER PRIMARY KEY,fetched_at TEXT,payload TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value INTEGER); CREATE TABLE diagnostics(id INTEGER PRIMARY KEY,payload TEXT); CREATE TABLE data_sources(id TEXT PRIMARY KEY,payload TEXT); PRAGMA user_version=4;'
    )
    old
      .prepare('INSERT INTO snapshots VALUES (1,?,?)')
      .run(at, JSON.stringify({ fetchedAt: at, positions: [position()] }))
    old.exec("INSERT INTO settings VALUES ('auto_restore',0)")
    old.close()
    let s = new SnapshotStore(path)
    s.saveComposition(fixture(), at, { at, id: 'success', status: 'success', code: null })
    const before = exposure(valued([position()]), s.composition(), null)
    expect(() =>
      s.saveComposition(fixture().replace('01/09/2026', '01/08/2026'), at, {
        at,
        id: 'older',
        status: 'success',
        code: null,
      })
    ).toThrow()
    expect(() =>
      s.saveComposition(fixture().replace(pilotIsin, 'IE00B4L5Y983'), at, {
        at,
        id: 'bad',
        status: 'success',
        code: null,
      })
    ).toThrow()
    s.close()
    s = new SnapshotStore(path)
    expect(s.latest()?.positions[0].isin).toBe(pilotIsin)
    expect(s.autoRestoreEnabled()).toBe(false)
    expect(s.compositionEvidence()?.raw).toBe(fixture())
    expect(exposure(valued([position()]), s.composition(), null)).toEqual(before)
    s.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('automatically acquires, serializes refreshes, preserves success on failure, and excludes raw errors from diagnostics', async () => {
  const s = new SnapshotStore(':memory:')
  s.save({ fetchedAt: at, positions: [position()] })
  let calls = 0
  const service = new CompositionService(s, async () => {
    calls++
    return { raw: fixture(), composition: parseComposition(fixture(), at) }
  })
  expect(service.refresh()).toBe(true)
  expect(service.refresh()).toBe(false)
  await service.settled()
  expect(calls).toBe(1)
  expect(service.refresh(true)).toBe(false)
  const success = s.composition()
  const failed = new CompositionService(s, async () => {
    throw Error('PIN=1234 cookie=SECRET raw account payload')
  })
  failed.refresh()
  await failed.settled()
  expect(s.composition()).toEqual(success)
  expect(s.compositionAttempt()?.status).toBe('failed')
  expect(exposure(valued([position()]), success, s.compositionAttempt()).refreshFailed).toBe(true)
  expect(JSON.stringify(s.diagnostics())).not.toMatch(/SECRET|1234|payload/)
  expect(s.diagnostics()[0].attemptId).toBe(s.compositionAttempt()?.id)
  await failed.close()
  await service.close()
  s.close()
})
it('acquisition fixes host and credentials and rejects HTTP errors, oversized bodies and wrong content types', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    expect(String(input)).toBe('https://www.justetf.com/en/etf-profile.html?isin=IE0031442068')
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' })
    return new Response(fixture(), { headers: { 'Content-Type': 'text/html' } })
  }
  expect(
    (await acquireComposition(new AbortController().signal, fetcher)).composition.fundIsin
  ).toBe(pilotIsin)
  await expect(
    acquireComposition(
      new AbortController().signal,
      async () => new Response('private', { status: 403 })
    )
  ).rejects.toMatchObject({ code: 'http', httpStatus: 403 })
  await expect(
    acquireComposition(
      new AbortController().signal,
      async () => new Response('x'.repeat(2000001), { headers: { 'Content-Type': 'text/html' } })
    )
  ).rejects.toMatchObject({ code: 'size' })
  await expect(
    acquireComposition(
      new AbortController().signal,
      async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    )
  ).rejects.toMatchObject({ code: 'format' })
})
it('records shutdown cancellation and permits automatic acquisition on restart', async () => {
  const s = new SnapshotStore(':memory:')
  s.save({ fetchedAt: at, positions: [position()] })
  const pending = new CompositionService(
    s,
    async (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        })
      })
  )
  pending.refresh()
  await pending.close()
  expect(s.compositionAttempt()?.code).toBe('cancelled')
  expect(s.diagnostics()[0]).toMatchObject({ event: 'cancelled', category: 'cancelled' })
  const restarted = new CompositionService(s, async () => ({
    raw: fixture(),
    composition: parseComposition(fixture(), at),
  }))
  expect(restarted.refresh(true)).toBe(true)
  await restarted.settled()
  await restarted.close()
  s.close()
})
