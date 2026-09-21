import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TradeRepublicBroker } from '../server/broker'
import { PortfolioService } from '../server/service'
import { SnapshotStore } from '../server/store'
import { extractData, catalog, type DataSource } from '../server/explorer'
import { overview } from '../server/overview'

const dirs: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }) })
const apple = 'US0378331005', nvidia = 'US67066G1040'
const position = (isin = apple) => ({ isin, netSize: '1.234567890123456789', averageBuyIn: '10', name: 'Synthetic security', instrumentType: 'stock' })
const response = (isins: string[]) => ({ categories: [{ positions: isins.map(isin => position(isin)) }], products: [] })
const fakeVault = { getPassword: () => null, setPassword: () => {}, deleteCredential: () => true }

it('actual broker boundary commits all accounts, replaces sold holdings, rejects partial/malformed/duplicate reads, and replays authoritative empty', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-broker-lifecycle-')); dirs.push(dir)
  const path = join(dir, 'portfolio.sqlite')
  const broker = new TradeRepublicBroker(fakeVault)
  vi.spyOn(broker, 'restore').mockResolvedValue(true)
  vi.spyOn(broker, 'readData').mockImplementation(async () => {})
  const accounts = vi.spyOn(broker['client'].accountPairs, 'get').mockResolvedValue({ accounts: [{ securitiesAccountNumber: 'one' }, { securitiesAccountNumber: 'two' }] } as never)
  let values: Record<string, unknown> = { one: response([apple]), two: response([nvidia]) }
  let failSecond = false
  vi.spyOn(broker['client'].compactPortfolioByType, 'get').mockImplementation(async ({ secAccNo }) => {
    if (failSecond && secAccNo === 'two') throw Error('private raw broker failure')
    return values[secAccNo] as never
  })
  const store = new SnapshotStore(path)
  const service = new PortfolioService(broker, store)
  const sync = async () => { service.sync(); await service.settled() }
  try {
    await sync(); expect(store.latest()?.positions).toHaveLength(2)
    expect(store.latest()?.positions[0]).toMatchObject({ account: createHash('sha256').update('one').digest('hex').slice(0, 16), quantity: '1.234567890123456789' })
    await sync(); expect(store.latest()?.positions).toHaveLength(2)
    // The first account is empty, but the second fails: no replacement may commit.
    values.one = response([]); failSecond = true
    const before = store.latest()
    await sync(); expect(store.latest()).toEqual(before)
    expect(service.status().lastPortfolioAttempt?.event).toBe('failed')
    expect(JSON.stringify(service.diagnostics())).not.toContain('private raw broker')
    failSecond = false
    values.two = response([nvidia, nvidia]); await sync(); expect(store.latest()).toEqual(before)
    values.two = { categories: [] , products: {} }; await sync(); expect(store.latest()).toEqual(before)
    values.two = { categories: [{ positions: null }] }; await sync(); expect(store.latest()).toEqual(before)
    accounts.mockResolvedValueOnce({ accounts: [] } as never); await sync(); expect(store.latest()).toEqual(before)
    values.two = response([nvidia]); await sync()
    expect(store.latest()?.positions.map(p => p.isin)).toEqual([nvidia])
    values.two = response([]); await sync(); expect(store.latest()?.positions).toEqual([])
  } finally { await service.close() }
  const reopened = new SnapshotStore(path)
  expect(reopened.latest()?.positions).toEqual([])
  expect(reopened.quantityObservations()).toEqual([])
  reopened.close()
})

const source = (id: string, payload: DataSource['payload']): DataSource => ({ ...catalog.find(s => s.id === id)!, status: 'success', payload, fetchedAt: '2026-09-06T12:00:00Z' })
it('individual quote and instrument failures retain usable values, original dates and visible failure state across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-quote-retention-')); dirs.push(dir)
  const path = join(dir, 'portfolio.sqlite'), time = Date.parse('2026-09-06T12:00:00Z')
  let store = new SnapshotStore(path)
  const snapshot = { fetchedAt: '2026-09-06T11:00:00Z', positions: [{ account: 'one', isin: apple, name: 'Apple', quantity: '2', averageBuyIn: '10', instrumentType: 'stock' }] }
  store.save(snapshot)
  store.saveSource(source('instrumentDetails', [{ isin: apple, response: { isin: apple, priceFactor: 1, listings: [{ slug: 'LSX', active: true, currencyId: 'EUR' }] } }]))
  store.saveSource(source('quotes', [{ isin: apple, venue: 'LSX', receivedAt: '2026-09-06T12:00:00Z', quote: { bid: { price: '100.12345678', time } } }]))
  let fails = true
  const read = async (id: string) => {
    if (id === 'accountPairs') return { accounts: [{ securitiesAccountNumber: 'one' }] }
    if (id === 'compactPortfolioByType') return response([apple])
    if (id === 'instrument' || id === 'ticker') {
      if (fails) throw Error('private downstream failure')
      return id === 'instrument' ? { isin: apple, priceFactor: 1, listings: [{ slug: 'LSX', active: true, currencyId: 'EUR' }] } : { bid: { price: '110', time: time + 1000 } }
    }
    return []
  }
  try {
    await extractData({ read }, store.sources(), s => store.saveSource(s), new AbortController().signal, 'valuation', () => {})
    const result = overview(snapshot, store.sources(), time + 2000)
    expect(result.rows[0].value).toBe('200.24691356')
    expect(result.rows[0].quality).toContain('latest source refresh failed')
    expect(result.rows[0].quoteAt).toBe('2026-09-06T12:00:00.000Z')
    expect(store.sources().find(s => s.id === 'quotes')?.status).toBe('partial')
    expect(JSON.stringify(store.sources())).not.toContain('private downstream')
    store.close(); store = new SnapshotStore(path)
    expect(overview(store.latest(), store.sources(), time + 2000)).toEqual(result)
    // A changed quantity cannot reuse an older quote, even though that quote was retained.
    store.save({ ...snapshot, fetchedAt: '2026-09-06T12:01:00Z', positions: [{ ...snapshot.positions[0], quantity: '3' }] })
    expect(overview(store.latest(), store.sources(), time + 120000, store.quantityObservations()).rows[0].value).toBeNull()
    fails = false
    await extractData({ read }, store.sources(), s => store.saveSource(s), new AbortController().signal, 'valuation', () => {})
    expect(store.sources().find(s => s.id === 'quotes')?.status).toBe('success')
    expect(overview(snapshot, store.sources(), time + 2000).rows[0]).toMatchObject({ value: '220', quoteAt: '2026-09-06T12:00:01.000Z' })
  } finally { store.close() }
})

it.each(['instrument', 'ticker'] as const)('first import keeps successful rows when one %s read fails, including after restart and retry', async failingTopic => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-first-import-')); dirs.push(dir)
  const path = join(dir, 'portfolio.sqlite'), time = Date.parse('2026-09-06T12:00:00Z')
  const microsoft = 'US5949181045', isins = [apple, nvidia, microsoft]
  let store = new SnapshotStore(path), fails = true
  store.save({ fetchedAt: '2026-09-06T11:00:00Z', positions: isins.map(isin => ({ account: 'one', isin, name: 'Synthetic', quantity: '2', averageBuyIn: '10', instrumentType: 'stock' })) })
  const reads: string[] = []
  const read = async (id: string, args: Record<string, string | boolean>) => {
    if (id === 'accountPairs') return { accounts: [{ securitiesAccountNumber: 'one' }] }
    if (id === 'compactPortfolioByType') return response(isins)
    if (id === 'instrument' || id === 'ticker') {
      reads.push(`${id}:${args.id}`)
      if (fails && id === failingTopic && String(args.id).startsWith(nvidia)) throw Error('private downstream failure')
      return id === 'instrument'
        ? { isin: args.id, priceFactor: 1, listings: [{ slug: 'LSX', active: true, currencyId: 'EUR' }] }
        : { bid: { price: '100', time } }
    }
    return []
  }
  const refresh = () => extractData({ read }, store.sources(), s => store.saveSource(s), new AbortController().signal, 'valuation', () => {})
  try {
    await refresh()
    const failedSource = store.sources().find(s => s.id === (failingTopic === 'ticker' ? 'quotes' : 'instrumentDetails'))!
    expect(failedSource.status).toBe('partial')
    expect(failedSource.payload).toHaveLength(3)
    expect(failedSource.payload).toEqual(expect.arrayContaining([expect.objectContaining({ isin: nvidia, error: { category: 'unexpected' } })]))
    expect(reads).toContain(`ticker:${microsoft}.LSX`)
    const result = overview(store.latest(), store.sources(), time + 1000, store.quantityObservations())
    expect(result.rows.map(row => row.value)).toEqual(['200', null, '200'])
    expect(JSON.stringify(store.sources())).not.toContain('private downstream')
    store.close(); store = new SnapshotStore(path)
    expect(overview(store.latest(), store.sources(), time + 1000, store.quantityObservations())).toEqual(result)
    fails = false
    await refresh()
    expect(store.sources().find(s => s.id === failedSource.id)?.status).toBe('success')
    expect(overview(store.latest(), store.sources(), time + 1000, store.quantityObservations()).rows.map(row => row.value)).toEqual(['200', '200', '200'])
  } finally { store.close() }
})
