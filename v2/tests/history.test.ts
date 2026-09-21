import { afterEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { SnapshotStore } from '../server/store'
import { PortfolioService } from '../server/service'
import type { Broker } from '../server/broker'
import { api } from '../server/http'
import { catalog, type DataSource } from '../server/explorer'
import { overview } from '../server/overview'
import { exposure } from '../server/exposure'
import { createCompositionRegistry, createPluginRegistry } from '../server/plugin-registry'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { isharesProvider } from '../server/ishares-provider'
import { providerEvidence as validEvidence } from './provider-fixture'
import { fixtureAt } from './issuer-fixture'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }) })
const path = () => { const dir = mkdtempSync(join(tmpdir(), 'prism-history-')); dirs.push(dir); return join(dir, 'portfolio.sqlite') }
const isin = 'US0378331005', t = '2026-09-20T10:00:00.000Z', now = Date.parse(t) + 1000
const snapshot = (quantity = '2', fetchedAt = t) => ({ fetchedAt, positions: [{ account: 'account-one', isin, name: 'Synthetic', instrumentType: 'stock', quantity, averageBuyIn: '10' }] })
const source = (id: string, payload: DataSource['payload'], status: DataSource['status'] = 'success'): DataSource => ({ ...catalog.find(s => s.id === id)!, payload, status, fetchedAt: t })
const sources = (price = '100.1234567890123456789') => [
  source('instrumentDetails', [{ isin, response: { isin, priceFactor: 1, listings: [{ slug: 'LSX', currencyId: 'EUR', active: true }], token: 'DO-NOT-RETAIN', privateDocumentUrl: 'https://private.test/signed' } }]),
  source('quotes', [{ isin, venue: 'LSX', quote: { bid: { price, time: Date.parse(t) + 1 } } }]),
  source('cash', [{ accountNumber: 'cash-one', currencyId: 'EUR', amount: 12.25 }]),
]
const broker = (fetch: Broker['fetch'] = async () => snapshot()): Broker => ({ authenticate: async () => {}, restore: async () => true, fetch, logout() {}, close() {}, warning: () => null })

it('retains exact old results, neutral allowlisted observations, deduplicated inputs and decimal accounting across differing/unchanged syncs and offline reopen', () => {
  const dbPath = path(); let store = new SnapshotStore(dbPath)
  store.save(snapshot()); for (const s of sources()) store.saveSource(s)
  const run = store.history.start('broker-sync'), id = randomUUID()
  const first = store.history.capture(run, 'valuation', id, now)!
  expect(first.checkpoint.currencies[0]).toMatchObject({ pricedSecurities: '200.2469135780246913578', includedSecurityValue: '200.2469135780246913578', coveragePercent: '100', cashValue: '12.25' })
  expect(store.history.capture(run, 'valuation', id, now)).toEqual(first)
  const same = store.history.capture(run, 'valuation', undefined, now)!
  expect(same.inputs).toEqual(first.inputs)
  expect(store.history.run(run)?.checkpoints).toHaveLength(2)
  const oldResult = store.history.replay(id)
  expect(oldResult.valuations).toEqual(overview(store.latest(), store.sources(), now, store.quantityObservations()))
  expect(oldResult.result).toEqual(exposure(oldResult.valuations, [], null, false, now))
  store.history.finish(run, 'succeeded')
  store.save(snapshot('3', '2026-09-20T10:01:00Z'))
  const secondRun = store.history.start('broker-sync')
  const second = store.history.capture(secondRun, 'holdings', undefined, now + 120000)!
  expect(second.positions[0].value).toBeNull() // earlier quote cannot value changed units
  expect(second.checkpoint.valuationState).toBe('unavailable')
  store.history.finish(secondRun, 'partial')
  store.close(); store = new SnapshotStore(dbPath)
  expect(store.history.checkpoint(id)).toEqual(first)
  expect(store.history.replay(id)).toEqual(oldResult)
  const db = new DatabaseSync(dbPath)
  const bodies = JSON.stringify(db.prepare('SELECT payload FROM history_blobs').all())
  expect(bodies).not.toContain('DO-NOT-RETAIN'); expect(bodies).not.toContain('private.test')
  expect(db.prepare("SELECT COUNT(*) n FROM history_observations WHERE kind='holdings'").get()?.n).toBe(2)
  db.close(); store.close()
})

it('keeps currency/unknown/zero/negative semantics and cash separate from security coverage', () => {
  const store = new SnapshotStore(':memory:')
  store.save({ fetchedAt: t, positions: [...snapshot().positions, { ...snapshot().positions[0], account: 'other', isin: 'US67066G1040' }, { ...snapshot().positions[0], account: 'zero', quantity: '0' }, { ...snapshot().positions[0], account: 'negative', quantity: '-1' }] })
  for (const s of sources()) store.saveSource(s)
  store.saveSource(source('cash', [{ accountNumber: 'usd', currencyId: 'USD', amount: 55 }, { accountNumber: 'eur', currencyId: 'EUR', amount: 12.25 }], 'partial'))
  const run = store.history.start('broker-sync'), detail = store.history.capture(run, 'valuation', undefined, now)!
  expect(detail.checkpoint).toMatchObject({ pricedPositionCount: 1, unvaluedPositionCount: 2, zeroPositionCount: 1, valuationState: 'partial' })
  expect(detail.checkpoint.currencies.find(c => c.currency === 'EUR')).toMatchObject({ coveragePercent: '100', cashState: 'partial' })
  expect(detail.checkpoint.currencies.find(c => c.currency === 'USD')).toMatchObject({ pricedSecurities: '0', cashValue: '55', coveragePercent: null, allocationState: 'unavailable' })
  expect(detail.positions.find(p => p.isin === 'US67066G1040')?.currency).toBeNull()
  store.close()
})

it('journals failures before holdings, partial valuations, cancellation after commit and interrupted restart independently of diagnostic pruning', async () => {
  const dbPath = path(); const store = new SnapshotStore(dbPath)
  const b = broker(async () => { throw Error('RAW PRIVATE ERROR') }); const service = new PortfolioService(b, store)
  service.sync(); await service.settled()
  expect(store.history.runs().items[0]).toMatchObject({ status: 'failed', checkpointCount: 0 })
  b.fetch = async () => snapshot()
  b.readData = async (_saved, save) => { save(source('quotes', [], 'partial')) }
  service.sync(); await service.settled()
  expect(store.history.runs().items[0]).toMatchObject({ status: 'partial', checkpointCount: 2 })
  b.readData = async (_saved, save, signal) => { save(sources()[0]); service.cancel(); signal.throwIfAborted() }
  service.sync(); await service.settled()
  expect(store.history.runs().items[0]).toMatchObject({ status: 'cancelled', checkpointCount: 2 })
  const unfinished = store.history.start('broker-sync'); const checkpoint = store.history.capture(unfinished, 'holdings')!
  expect(JSON.stringify(store.history.runs())).not.toContain('RAW PRIVATE')
  await service.close()
  const db = new DatabaseSync(dbPath); db.exec('DELETE FROM diagnostics'); db.close()
  const reopened = new SnapshotStore(dbPath)
  expect(reopened.history.run(unfinished)?.run).toMatchObject({ status: 'interrupted', checkpointCount: 1 })
  expect(reopened.history.checkpoint(checkpoint.checkpoint.id)).toEqual(checkpoint)
  expect(reopened.history.runs().items).toHaveLength(4)
  reopened.close()
})

it('migrates surviving observations only, makes a WAL-consistent backup and restores it without changing old holdings', () => {
  const dbPath = path(); const original = new SnapshotStore(dbPath)
  original.save(snapshot()); for (const s of sources()) original.saveSource(s)
  original.close()
  const legacy = new DatabaseSync(dbPath)
  legacy.exec('DROP TABLE history_checks; DROP TABLE history_checkpoints; DROP TABLE history_runs; DROP TABLE history_observations; DROP TABLE history_blobs; DROP TABLE history_meta; PRAGMA user_version=10; PRAGMA journal_mode=WAL;')
  legacy.prepare('INSERT INTO snapshots(fetched_at,payload) VALUES (?,?)').run(t, JSON.stringify(snapshot('3')))
  // Keep the WAL connection open during migration to exercise online-consistent backup.
  const migrated = new SnapshotStore(dbPath)
  expect(migrated.history.runs().items[0]).toMatchObject({ trigger: 'migration', status: 'partial', checkpointCount: 1 })
  expect(migrated.history.runs().items[0].latestCheckpoint?.notices.some(n => n.code === 'migration-baseline')).toBe(true)
  const dataset = migrated.history.datasetId
  migrated.close(); legacy.close()
  const backupPath = join(dbPath, '..', readdirSync(join(dbPath, '..')).find(f => f.includes('.pre-history-'))!)
  const backup = new DatabaseSync(backupPath)
  expect(backup.prepare('PRAGMA user_version').get()?.user_version).toBe(10)
  expect(backup.prepare('SELECT COUNT(*) n FROM snapshots').get()?.n).toBe(2)
  backup.close()
  const reopened = new SnapshotStore(dbPath); expect(reopened.history.datasetId).toBe(dataset); expect(reopened.history.runs().items).toHaveLength(1); reopened.close()
  const restored = new SnapshotStore(backupPath); expect(restored.latest()?.positions[0].quantity).toBe('3'); restored.close()
})

it('pins pagination across new operations and validates safe HTTP errors without recomputation', async () => {
  const store = new SnapshotStore(':memory:'), service = new PortfolioService(broker(), store)
  expect(store.history.runs().items).toEqual([])
  const ids = Array.from({ length: 4 }, () => store.history.start('broker-sync'))
  const first = store.history.runs(2)
  store.history.start('broker-sync')
  expect(store.history.runs(2, first.nextCursor).items.map(r => r.id)).toEqual([ids[1], ids[0]])
  let origin = ''
  const server = createServer((req, res) => { void api(req, res, service, origin) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    for (const route of ['runs?limit=0', 'runs?limit=101', 'runs?limit=2&limit=3', 'runs?cursor=invalid', 'checkpoints/bad', 'runs/bad']) expect((await fetch(`${origin}/api/history/${route}`)).status).toBe(400)
    expect((await fetch(`${origin}/api/history/checkpoints/${randomUUID()}`)).status).toBe(404)
    expect((await fetch(`${origin}/api/history/runs/${ids[0]}`)).status).toBe(200)
    expect((await fetch(`${origin}/api/history/runs`, { headers: { Origin: 'https://evil.test' } })).status).toBe(403)
    store.save(snapshot()); const checkpoint = store.history.capture(ids[0], 'holdings')!
    const response = await fetch(`${origin}/api/history/checkpoints/${checkpoint.checkpoint.id}`)
    expect(await response.json()).toEqual(checkpoint)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(store.history.run(ids[0])?.checkpoints).toHaveLength(1)
  } finally { await service.close(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

it('freezes provider-only checkpoints, unchanged publication reuse, missing decoder and concurrent completion without reverting newer holdings', async () => {
  const dbPath = path(), store = new SnapshotStore(dbPath)
  store.save({ fetchedAt: fixtureAt, positions: [{ ...snapshot().positions[0], isin: 'IE0031442068', instrumentType: 'fund' }] })
  let release!: () => void
  const provider = { ...isharesProvider, acquire: async () => { await new Promise<void>(resolve => { release = resolve }); return { state: 'publication' as const, evidence: validEvidence() } } }
  const refresh = new ProviderRefreshService(store, [provider])
  refresh.refresh()
  await new Promise(resolve => setTimeout(resolve, 0))
  store.save({ fetchedAt: fixtureAt, positions: [{ ...snapshot('5').positions[0], isin: 'IE0031442068', instrumentType: 'fund' }] })
  const brokerRun = store.history.start('broker-sync'); store.history.capture(brokerRun, 'holdings'); store.history.finish(brokerRun, 'succeeded')
  release(); await refresh.settled()
  const issuerRun = store.history.runs().items.find(r => r.trigger === 'composition-refresh')!
  const id = issuerRun.latestCheckpoint!.id
  expect(store.history.checkpoint(id)?.positions[0].quantity).toBe('5')
  const old = store.history.replay(id)
  refresh.refresh(); await new Promise(resolve => setTimeout(resolve, 0)); release(); await refresh.settled()
  expect(store.providerCompositionCount()).toBe(1)
  expect(store.history.replay(id)).toEqual(old)
  await refresh.close(); store.close()
  const unavailable = new SnapshotStore(dbPath, createPluginRegistry([]))
  expect(unavailable.history.checkpoint(id)?.replay.state).toBe('unavailable')
  expect(unavailable.history.checkpoint(id)?.checkpoint).toEqual(old.detail.checkpoint)
  unavailable.close()
})

it('returns a frozen result with replay unavailable for a damaged manifest, and errors for a damaged result', () => {
  const dbPath = path(), store = new SnapshotStore(dbPath)
  store.save(snapshot()); const run = store.history.start('broker-sync'), detail = store.history.capture(run, 'holdings')!
  const db = new DatabaseSync(dbPath)
  db.prepare('UPDATE history_checkpoints SET manifest=? WHERE id=?').run('{}', detail.checkpoint.id)
  expect(store.history.checkpoint(detail.checkpoint.id)?.replay.state).toBe('unavailable')
  db.prepare('UPDATE history_checkpoints SET payload=? WHERE id=?').run('{}', detail.checkpoint.id)
  expect(() => store.history.checkpoint(detail.checkpoint.id)).toThrow('integrity')
  db.close(); store.close()
})

it('durably records per-source success, failure and cancellation, including providers that ignore abort', async () => {
  const store = new SnapshotStore(':memory:')
  const funds = ['IE0031442068', 'IE00B4L5Y983']
  store.save({ fetchedAt: fixtureAt, positions: funds.map(fund => ({ ...snapshot().positions[0], isin: fund, instrumentType: 'fund' })) })
  const provider = { ...isharesProvider, acquire: async (fund: string) => {
    if (fund === funds[1]) throw Error('private source failure')
    return { state: 'publication' as const, evidence: validEvidence(fund) }
  } }
  const refresh = new ProviderRefreshService(store, [provider])
  refresh.refresh(); await refresh.settled()
  expect(store.history.runs().items[0]).toMatchObject({ status: 'partial', checkpointCount: 1 })
  expect(store.history.sourceChecks(funds[0])[0]).toMatchObject({ status: 'success', outcome: 'updated' })
  expect(store.history.sourceChecks(funds[1])[0]).toMatchObject({ status: 'failed' })
  expect(JSON.stringify(store.history.sourceChecks(funds[1]))).not.toContain('private source failure')
  await refresh.close()
  let release!: () => void
  const ignored = new ProviderRefreshService(store, [{ ...isharesProvider, acquire: async (fund: string) => {
    await new Promise<void>(resolve => { release = resolve })
    return { state: 'publication' as const, evidence: validEvidence(fund, '2026-09-11') }
  } }])
  ignored.refresh(); await new Promise(resolve => setTimeout(resolve, 0)); ignored.cancel(); release(); await ignored.settled()
  expect(store.history.runs().items[0]).toMatchObject({ status: 'cancelled', checkpointCount: 0 })
  expect(store.history.sourceChecks(funds[0]).map(a => a.status)).toEqual(['failed', 'success'])
  expect(store.providerCompositionCount()).toBe(1)
  await ignored.close(); store.close()
})


it('replays retained checkpoints while acquisition is disabled, after offline reopen and after re-enable', () => {
  const dbPath = path(), registry = createCompositionRegistry([isharesProvider])
  let store = new SnapshotStore(dbPath, registry)
  const evidence = validEvidence(), pluginId = registry.descriptors[0].id
  store.save({ fetchedAt: fixtureAt, positions: [{ ...snapshot().positions[0], isin: evidence.fundIsin, instrumentType: 'fund' }] })
  store.saveProviderEvidence(evidence, { id: randomUUID(), at: fixtureAt, providerId: evidence.providerId, status: 'success', code: null, outcome: 'updated', resolution: 'Saved' })
  const run = store.history.start('composition-refresh')
  const detail = store.history.capture(run, 'composition')!
  store.history.finish(run, 'succeeded')
  const original = store.history.replay(detail.checkpoint.id)
  registry.disable(pluginId)
  expect(registry.capabilityForFund(evidence.fundIsin)).toBeNull()
  expect(registry.decodeProviderEvidence(evidence).sha256).toBe(original.result.compositions[0].sha256)
  expect(store.history.checkpoint(detail.checkpoint.id)).toEqual(detail)
  expect(store.history.replay(detail.checkpoint.id)).toEqual(original)
  store.close(); store = new SnapshotStore(dbPath, registry)
  expect(registry.state(pluginId)).toBe('disabled')
  expect(store.history.replay(detail.checkpoint.id)).toEqual(original)
  registry.enable(pluginId)
  expect(registry.capabilityForFund(evidence.fundIsin)).not.toBeNull()
  expect(store.history.replay(detail.checkpoint.id)).toEqual(original)
  store.close()
})

it.each(['version', 'parserVersion'] as const)('keeps frozen results but rejects replay when retained decoder %s is incompatible', field => {
  const dbPath = path(), store = new SnapshotStore(dbPath)
  const evidence = validEvidence()
  store.save({ fetchedAt: fixtureAt, positions: [{ ...snapshot().positions[0], isin: evidence.fundIsin, instrumentType: 'fund' }] })
  store.saveProviderEvidence(evidence, { id: randomUUID(), at: fixtureAt, providerId: evidence.providerId, status: 'success', code: null, outcome: 'updated', resolution: 'Saved' })
  const run = store.history.start('composition-refresh'), detail = store.history.capture(run, 'composition')!
  store.history.finish(run, 'succeeded'); store.close()
  const registry = createCompositionRegistry([{ ...isharesProvider, manifest: { ...isharesProvider.manifest, [field]: field === 'version' ? '2.0.0' : 'ishares-composition/2' } }])
  expect(() => registry.decodeProviderEvidence(evidence)).toThrow()
  const reopened = new SnapshotStore(dbPath, registry)
  const saved = reopened.history.checkpoint(detail.checkpoint.id)!
  expect(saved).toEqual({ ...detail, replay: { state: 'unavailable', reason: 'A recorded composition decoder is unavailable; the frozen result remains available.' } })
  expect(() => reopened.history.replay(detail.checkpoint.id)).toThrow('replay unavailable')
  reopened.close()
})

it('does not attribute old unrelated issuer failures to a later broker checkpoint, while preserving saved valuation gaps', () => {
  const store = new SnapshotStore(':memory:')
  store.save(snapshot())
  const oldRun = store.history.start('composition-refresh')
  const failed = { id: randomUUID(), at: fixtureAt, providerId: 'ishares-bundled', status: 'failed' as const, code: 'network' as const, outcome: 'failed' as const, resolution: 'Retry' }
  store.recordProviderAttempt('IE0031442068', failed)
  store.history.recordCheck(oldRun, 'IE0031442068', failed)
  store.history.finish(oldRun, 'failed')
  store.saveCompositionAttempt({ id: oldRun, at: fixtureAt, status: 'failed', code: 'http' })
  store.saveSource(source('quotes', [], 'partial'))
  const run = store.history.start('broker-sync'), saved = store.history.capture(run, 'holdings')!
  expect(saved.checkpoint.notices.map(n => n.code)).not.toContain('source-refresh-failed')
  expect(saved.checkpoint.notices.map(n => n.code)).toEqual(expect.arrayContaining(['unvalued-positions', 'saved-source-incomplete']))
  expect(saved.checkpoint.notices.map(n => n.code)).not.toContain('saved-provider-check-failed')
  expect(store.history.replay(saved.checkpoint.id).detail).toEqual(saved)
  store.close()
})

it.each([true, false])('correlates partial provider-run notices without rewriting earlier checkpoints (failure first: %s)', async failureFirst => {
  const dbPath = path(), store = new SnapshotStore(dbPath)
  const funds = ['IE0031442068', 'IE00B4L5Y983'], failedFund = funds[failureFirst ? 0 : 1]
  store.save({ fetchedAt: fixtureAt, positions: funds.map(isin => ({ ...snapshot().positions[0], isin, instrumentType: 'fund' })) })
  const refresh = new ProviderRefreshService(store, [{ ...isharesProvider, acquire: async (fund: string) => {
    if (fund === failedFund) throw Error('controlled failure')
    return { state: 'publication' as const, evidence: validEvidence(fund) }
  } }])
  refresh.refresh(); await refresh.settled()
  const run = store.history.runs().items[0], saved = store.history.checkpoint(run.latestCheckpoint!.id)!
  expect(run).toMatchObject({ status: 'partial', checkpointCount: 1 })
  expect(run.notices.map(n => n.code)).toContain('provider-incomplete')
  expect(saved.checkpoint.notices.some(n => n.code === 'source-refresh-failed')).toBe(failureFirst)
  if (failureFirst) expect(saved.checkpoint.notices.find(n => n.code === 'source-refresh-failed')?.diagnosticId).toBe(store.history.sourceChecks(failedFund)[0].id)
  const later = store.history.start('broker-sync'), next = store.history.capture(later, 'holdings')!
  expect(next.checkpoint.notices.map(n => n.code)).not.toContain('source-refresh-failed')
  expect(next.checkpoint.notices.map(n => n.code)).toContain('saved-provider-check-failed')
  expect(store.history.replay(saved.checkpoint.id).detail).toEqual(saved)
  await refresh.close(); store.close()
  const reopened = new SnapshotStore(dbPath)
  expect(reopened.history.replay(saved.checkpoint.id).detail).toEqual(saved)
  expect(reopened.history.checkpoint(next.checkpoint.id)).toEqual(next)
  reopened.close()
})
