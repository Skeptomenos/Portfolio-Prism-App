import { BrokerFailure } from '../server/broker-contract'
import { describe, it, expect, vi } from 'vitest'
import { TRAuthError } from 'trade-republic-sdk'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnapshotStore } from '../server/store'
import { PortfolioService } from '../server/service'
import { decodeSnapshot, type Snapshot } from '../server/model'
import type { Broker } from '../server/broker'
import { catalog } from '../server/explorer'

const sample = (): Snapshot => ({
  fetchedAt: '2026-09-06T12:00:00Z',
  positions: [
    {
      account: 'test',
      isin: 'US0378331005',
      name: 'Apple',
      quantity: '1.234567890123456789',
      instrumentType: 'stock',
      averageBuyIn: '123.45',
    },
  ],
})
class FakeBroker implements Broker {
  fetchCount = 0
  value = sample()
  fail = false
  authFail = false
  deleteFail = false
  delayed = false
  restoreAvailable = true
  authenticate(_input: import('../server/broker-contract').AuthInput, _signal: AbortSignal, pending: (state: 'awaiting-approval') => void) {
    pending('awaiting-approval')
    return Promise.resolve()
  }
  restore() {
    return Promise.resolve(this.restoreAvailable)
  }
  async fetch(signal: AbortSignal) {
    this.fetchCount += 1
    if (this.delayed)
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      )
    if (this.authFail) throw new BrokerFailure({ category: 'authentication' })
    if (this.fail) throw new Error('sensitive raw provider payload')
    return this.value
  }
  logout() {
    if (this.deleteFail) throw new Error('keychain locked')
  }
  close() {}
  warning() {
    return null
  }
}

describe('persisted broker snapshots', () => {
  it('expands scientific quantities and buy-in exactly and persists them across reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prism-decimals-'))
    const path = join(dir, 'test.sqlite')
    let store = new SnapshotStore(path)
    try {
      const good = sample()
      const decoded = decodeSnapshot({
        ...good,
        positions: [
          { ...good.positions[0], quantity: '1.234567890123456789e-7', averageBuyIn: '1.23E+2' },
        ],
      })
      store.save(decoded)
      store.close()
      store = new SnapshotStore(path)
      expect(store.latest()?.positions[0]).toMatchObject({
        quantity: '0.0000001234567890123456789',
        averageBuyIn: '123',
      })
      for (const quantity of ['NaN', 'Infinity', '1e999', '0x10', '1e', '']) {
        expect(() =>
          decodeSnapshot({ ...good, positions: [{ ...good.positions[0], quantity }] })
        ).toThrow()
      }
    } finally {
      store.close()
      rmSync(dir, { recursive: true })
    }
  })

  it('preserves exact quantity strings across reopen, replaces sold positions and accepts explicit empty snapshots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prism-v2-test-'))
    let store = new SnapshotStore(join(dir, 'test.sqlite'))
    try {
      store.save(sample())
      store.close()
      store = new SnapshotStore(join(dir, 'test.sqlite'))
      expect(store.latest()?.positions[0].quantity).toBe('1.234567890123456789')
      store.save({ fetchedAt: '2026-09-06T13:00:00Z', positions: [] })
      expect(store.latest()?.positions).toEqual([])
    } finally {
      store.close()
      rmSync(dir, { recursive: true })
    }
  })
  it('rejects malformed or duplicate snapshots without replacing the last successful import', () => {
    const store = new SnapshotStore(':memory:')
    try {
      const good = sample()
      store.save(good)
      expect(() =>
        store.save({ ...good, positions: [good.positions[0], good.positions[0]] })
      ).toThrow()
      expect(() =>
        decodeSnapshot({ ...good, positions: [{ ...good.positions[0], quantity: 'NaN' }] })
      ).toThrow()
      expect(store.latest()).toEqual(good)
    } finally {
      store.close()
    }
  })
})

describe('connection and sync lifecycle', () => {
  it('reports saved holdings and partial valuation after a later source failure, then resets for another attempt', async () => {
    const broker = new FakeBroker()
    const store = new SnapshotStore(':memory:')
    store.save(sample())
    broker.value = {
      ...sample(),
      fetchedAt: '2026-09-06T13:00:00Z',
      positions: [{ ...sample().positions[0], quantity: '20' }],
    }
    const readData: NonNullable<Broker['readData']> = async (_previous, save) => {
      save({
        ...catalog.find((s) => s.id === 'instrumentDetails')!,
        status: 'success',
        fetchedAt: broker.value.fetchedAt,
        payload: [],
      })
      throw new Error('sensitive raw provider payload')
    }
    const service = new PortfolioService(Object.assign(broker, { readData }), store)
    service.restore()
    await service.settled()
    expect(service.status().snapshot?.positions[0].quantity).toBe('20')
    expect(service.status().error).toContain('Holdings saved')
    expect(service.status().error).toContain('Valuation refresh failed')
    expect(service.status().error).not.toContain('unchanged')
    expect(service.status().error).not.toContain('sensitive')
    expect(service.status().outcome).toEqual({
      holdings: { snapshotId: 2, fetchedAt: broker.value.fetchedAt },
      valuation: 'failed',
      events: 'not-requested',
      sources: [{ id: 'instrumentDetails', status: 'success' }],
    })
    broker.fail = true
    service.sync()
    await service.settled()
    expect(service.status().error).toContain('last saved holdings are unchanged')
    expect(service.status().error).not.toContain('Holdings saved')
    await service.close()
  })

  it('persists partial source outcomes even when the source reader returns without throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prism-partial-outcome-'))
    const path = join(dir, 'portfolio.sqlite')
    const broker = new FakeBroker()
    const readData: NonNullable<Broker['readData']> = async (_previous, save) => {
      for (const id of ['instrumentDetails', 'quotes', 'cash'])
        save({
          ...catalog.find((s) => s.id === id)!,
          status: id === 'quotes' ? 'partial' : 'success',
        })
    }
    const service = new PortfolioService(
      Object.assign(broker, { readData }),
      new SnapshotStore(path)
    )
    service.restore()
    await service.settled()
    expect(service.status().error).toContain('Valuation refresh partial')
    expect(service.status().lastDiagnostic?.event).toBe('partial')
    expect(service.coverage().refreshFailed).toBe(true)
    const outcome = service.status().outcome
    expect(outcome).toMatchObject({ holdings: { snapshotId: 1 }, valuation: 'partial' })
    service.logout()
    await service.close()
    const reopened = new PortfolioService(new FakeBroker(), new SnapshotStore(path))
    expect(reopened.status().outcome).toEqual(outcome)
    expect(reopened.coverage().refreshFailed).toBe(true)
    reopened.restore()
    await reopened.settled()
    expect(reopened.status().phase).toBe('disconnected')
    expect(reopened.status().outcome).toEqual(outcome)
    expect(reopened.status().snapshot).toEqual(sample())
    await reopened.close()
    rmSync(dir, { recursive: true })
  })

  it('reports cancellation after the holdings commit without claiming it was rolled back', async () => {
    const broker = new FakeBroker()
    let extractionStarted!: () => void
    const started = new Promise<void>((resolve) => {
      extractionStarted = resolve
    })
    const readData: NonNullable<Broker['readData']> = async (_previous, _save, signal) => {
      extractionStarted()
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })
    }
    const service = new PortfolioService(
      Object.assign(broker, { readData }),
      new SnapshotStore(':memory:')
    )
    service.restore()
    await started
    service.cancel()
    await service.settled()
    expect(service.status().snapshot).toEqual(sample())
    expect(service.status().error).toContain('Holdings saved')
    expect(service.status().error).toContain('Valuation refresh cancelled')
    expect(service.status().error).not.toContain('unchanged')
    expect(service.status().lastDiagnostic?.event).toBe('cancelled')
    await service.close()
  })

  it('imports after login and retains the previous snapshot on failure without exposing raw errors', async () => {
    const broker = new FakeBroker()
    const store = new SnapshotStore(':memory:')
    const service = new PortfolioService(broker, store)
    expect(service.login('+49123456789', '1234')).toBe(true)
    expect(service.login('+49123456789', '1234')).toBe(false)
    await service.settled()
    expect(broker.fetchCount).toBe(1)
    const successfulAt = service.status().lastSuccessfulSyncAt
    expect(successfulAt).toBeTruthy()
    expect(service.status().automaticRefresh.enabled).toBe(false)
    expect(service.status().snapshot).toEqual(sample())
    broker.fail = true
    service.sync()
    await service.settled()
    expect(service.status().snapshot).toEqual(sample())
    expect(service.status().error).toContain('last saved holdings')
    expect(service.status().lastSuccessfulSyncAt).toBe(successfulAt)
    expect(service.status().lastPortfolioAttempt?.event).toBe('failed')
    expect(JSON.stringify(service.status())).not.toContain('sensitive')
    await service.close()
  })
  it('serializes imports and allows cancellation without changing saved positions', async () => {
    const broker = new FakeBroker()
    const store = new SnapshotStore(':memory:')
    store.save(sample())
    const service = new PortfolioService(broker, store)
    broker.delayed = true
    expect(service.restore()).toBe(true)
    expect(service.sync()).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(service.status()).toMatchObject({
      connected: true,
      activeOperation: 'portfolio',
      phase: 'syncing',
    })
    service.cancel()
    await service.settled()
    expect(service.status().snapshot).toEqual(sample())
    expect(service.status().phase).toBe('connected')
    await service.close()
  })
})

it('shows reconnect after authentication rejection and preserves holdings', async () => {
  const broker = new FakeBroker()
  const service = new PortfolioService(broker, new SnapshotStore(':memory:'))
  service.login('+49123456789', '1234')
  await service.settled()
  broker.authFail = true
  service.sync()
  await service.settled()
  expect(service.status().phase).toBe('disconnected')
  expect(service.status().connected).toBe(false)
  expect(service.status().lastPortfolioAttempt?.category).toBe('authentication')
  expect(service.status().snapshot).toEqual(sample())
  await service.close()
})
it('disables automatic restore across restart even when credential deletion fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-v2-logout-'))
  const path = join(dir, 'test.sqlite')
  const broker = new FakeBroker()
  const service = new PortfolioService(broker, new SnapshotStore(path))
  service.login('+49123456789', '1234')
  await service.settled()
  broker.deleteFail = true
  expect(service.logout()).toBe(true)
  expect(service.status().phase).toBe('disconnected')
  expect(service.status().error).toContain('could not be removed')
  await service.close()
  const reopened = new PortfolioService(new FakeBroker(), new SnapshotStore(path))
  reopened.restore()
  await reopened.settled()
  expect(reopened.status().phase).toBe('disconnected')
  expect(reopened.status().snapshot).toEqual(sample())
  await reopened.close()
  rmSync(dir, { recursive: true })
})

// Independent regression: cancellation at each persisted boundary, using a fresh SQLite file.
it('keeps successful portfolio sync separate from extraction, partial valuation and restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-sync-status-'))
  const path = join(dir, 'portfolio.sqlite')
  const broker = new FakeBroker()
  let partial = false
  const readData: NonNullable<Broker['readData']> = async (_previous, save, _signal, mode) => {
    for (const id of ['instrumentDetails', 'quotes', 'cash'])
      save({
        ...catalog.find((s) => s.id === id)!,
        status: partial && id === 'quotes' ? 'partial' : 'success',
      })
    if (mode !== 'valuation') expect(service.status().activeOperation).toBe('extraction')
  }
  const service = new PortfolioService(
    Object.assign(broker, { readData }),
    new SnapshotStore(path),
    null,
    true
  )
  expect(service.status().lastSuccessfulSyncAt).toBeNull()
  service.login('+49123456789', '1234')
  await service.settled()
  const completed = service.status().lastPortfolioAttempt
  const successfulAt = service.status().lastSuccessfulSyncAt
  expect(successfulAt).toBeTruthy()
  expect(service.status().automaticRefresh).toEqual({
    enabled: true,
    intervalMinutes: 15,
    sessionRestoreEnabled: true,
  })
  service.extract('refresh')
  await service.settled()
  expect(service.status().lastDiagnostic?.operation).toBe('extraction')
  expect(service.status().lastPortfolioAttempt).toEqual(completed)
  partial = true
  service.sync()
  await service.settled()
  expect(service.status().lastPortfolioAttempt?.event).toBe('partial')
  expect(service.status().lastSuccessfulSyncAt).toBe(successfulAt)
  await service.close()
  const reopened = new PortfolioService(new FakeBroker(), new SnapshotStore(path))
  expect(reopened.status().lastSuccessfulSyncAt).toBe(successfulAt)
  expect(reopened.status().lastPortfolioAttempt?.event).toBe('partial')
  expect(reopened.status().snapshot).toEqual(sample())
  await reopened.close()
  rmSync(dir, { recursive: true })
})

it.each(['before-commit', 'after-commit', 'after-source'] as const)(
  'retains and reports the committed boundary across restart: %s',
  async (boundary) => {
    const dir = mkdtempSync(join(tmpdir(), 'prism-cancel-boundary-'))
    const path = join(dir, 'portfolio.sqlite')
    const store = new SnapshotStore(path)
    store.save(sample())
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const wait = async (signal: AbortSignal) => {
      entered()
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      )
    }
    const broker = new FakeBroker()
    broker.value = {
      ...sample(),
      fetchedAt: '2026-09-06T13:00:00Z',
      positions: [{ ...sample().positions[0], quantity: '20' }],
    }
    const readData: NonNullable<Broker['readData']> = async (_old, save, signal) => {
      if (boundary === 'after-source')
        save({
          ...catalog.find((s) => s.id === 'cash')!,
          status: 'success',
          fetchedAt: broker.value.fetchedAt,
          payload: [],
        })
      await wait(signal)
    }
    if (boundary === 'before-commit')
      broker.fetch = async (signal) => {
        await wait(signal)
        return broker.value
      }
    const service = new PortfolioService(Object.assign(broker, { readData }), store)
    service.restore()
    await started
    service.cancel()
    await service.settled()
    const status = service.status()
    expect(status.snapshot?.positions[0].quantity).toBe(
      boundary === 'before-commit' ? sample().positions[0].quantity : '20'
    )
    expect(status.error).toContain(
      boundary === 'before-commit'
        ? 'last saved holdings are unchanged'
        : 'Valuation refresh cancelled'
    )
    expect(status.outcome?.sources).toEqual(
      boundary === 'after-source' ? [{ id: 'cash', status: 'success' }] : []
    )
    expect(status.lastDiagnostic?.event).toBe('cancelled')
    await service.close()
    const reopened = new PortfolioService(new FakeBroker(), new SnapshotStore(path))
    expect(reopened.status().snapshot).toEqual(status.snapshot)
    expect(reopened.status().outcome).toEqual(status.outcome)
    if (boundary === 'after-source')
      expect(reopened.sources().find((s) => s.id === 'cash')?.status).toBe('success')
    await reopened.close()
    rmSync(dir, { recursive: true })
  }
)

it.each([true, false])('new holdings trigger composition acquisition after commit only when automatic work is enabled: %s', async enabled => {
  const broker = new FakeBroker()
  broker.value = { ...sample(), positions: [{ ...sample().positions[0], isin: 'IE0031442068', instrumentType: 'fund' }] }
  const store = new SnapshotStore(':memory:')
  const service = new PortfolioService(broker, store, null, enabled)
  const refresh = vi.spyOn(service.issuerRefresh, 'refresh').mockImplementation(automatic => {
    expect(automatic).toBe(true)
    expect(store.latest()?.positions[0].isin).toBe('IE0031442068')
    return true
  })
  try {
    service.restore(); await service.settled()
    expect(refresh).toHaveBeenCalledTimes(enabled ? 1 : 0)
  } finally { await service.close() }
})

it('does not automatically loop a bounded history batch while more evidence remains', async () => {
  const modes: string[] = []
  const readData: NonNullable<Broker['readData']> = async (_previous, save, _signal, mode) => {
    modes.push(mode)
    if (mode === 'valuation') return
    save({ ...catalog.find(s => s.id === 'timelineTransactions')!, status: 'partial', payload: { items: [], nextCursor: 'more' } })
    save({ ...catalog.find(s => s.id === 'timelineDetails')!, status: 'partial', payload: { items: [], remaining: 100 } })
  }
  const service = new PortfolioService(Object.assign(new FakeBroker(), { readData }), new SnapshotStore(':memory:'))
  try {
    expect(service.extract('history-batch')).toBe(false)
    service.login('+49123456789', '1234')
    await service.settled()
    modes.length = 0
    expect(service.extract('history-batch')).toBe(true)
    await service.settled()
    expect(modes).toEqual(['history-batch'])
    expect(service.status().lastDiagnostic?.operation).toBe('extraction')
  } finally { await service.close() }
})

it('reports failed event acquisition after preserving the saved ledger and recovers on retry',async()=>{
  let failed=true
  const readEvents:NonNullable<Broker['readEvents']>=async(_previous,save)=>{
    save({contractVersion:'broker-events/1',observedAt:'2026-09-01T00:00:00Z',events:[],state:[],coverage:{observedAt:'2026-09-01T00:00:00Z',timelineObservedAt:'2026-09-01T00:00:00Z',lastAttemptAt:'2026-09-21T12:00:00Z',acquisition:failed?'failed':'partial',olderAvailable:false,detailsPending:0,failedDetails:0,recentGap:false,historyComplete:false}})
  }
  const store=new SnapshotStore(':memory:'),service=new PortfolioService(Object.assign(new FakeBroker(),{readEvents}),store)
  try{
    service.login('+49123456789','1234');await service.settled()
    expect(service.status().lastDiagnostic?.event).toBe('failed')
    expect(store.ledger.coverage(store.connections.defaultId)).toMatchObject({acquisition:'failed',timelineObservedAt:'2026-09-01T00:00:00Z'})
    expect(service.status().snapshot).toEqual(sample())
    expect(service.coverage().refreshIssues).toEqual(expect.arrayContaining([expect.objectContaining({ scope: 'events', status: 'failed' })]))
    failed=false;service.backfillEvents();await service.settled()
    expect(service.status().lastDiagnostic?.event).toBe('succeeded')
    expect(store.ledger.coverage(store.connections.defaultId)?.acquisition).toBe('partial')
    expect(service.coverage().refreshIssues.some(issue => issue.scope === 'events')).toBe(false)
    expect(service.status().lastEventAttempt?.outcome?.events).toBe('success')
  }finally{await service.close()}
})

it('separates optional spending balance and event failures from required valuation', async () => {
  const broker = new FakeBroker()
  const readData: NonNullable<Broker['readData']> = async (_previous, save) => {
    for (const id of ['instrumentDetails', 'quotes', 'cash', 'availableCash'])
      save({ ...catalog.find(s => s.id === id)!, status: id === 'availableCash' ? 'failed' : 'success', payload: [] })
  }
  const readEvents: NonNullable<Broker['readEvents']> = async () => { throw new BrokerFailure({ category: 'connection' }) }
  const service = new PortfolioService(Object.assign(broker, { readData, readEvents }), new SnapshotStore(':memory:'))
  service.restore(); await service.settled()
  expect(service.status().outcome).toMatchObject({ holdings: { snapshotId: 1 }, valuation: 'success', events: 'failed' })
  expect(service.status().lastDiagnostic).toMatchObject({ event: 'failed', category: 'connection' })
  expect(service.status().lastSuccessfulSyncAt).toBeNull()
  expect(service.status().lastHoldingsCommitAt).toBe(sample().fetchedAt)
  expect(service.coverage().refreshIssues.map(i => i.scope)).toEqual(['events', 'optional'])
  await service.close()
})

it('retains a proven full success across diagnostic eviction and reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-sync-milestone-')), path = join(dir, 'portfolio.sqlite')
  const store = new SnapshotStore(path)
  const service = new PortfolioService(new FakeBroker(), store)
  service.restore(); await service.settled()
  const at = service.status().lastSuccessfulSyncAt
  expect(at).toBeTruthy()
  for (let i = 0; i < 1005; i++) store.recordDiagnostic({ attemptId: String(i), operation: 'background', stage: 'connecting', event: 'started', category: 'none', at: new Date().toISOString(), durationMs: 0 })
  expect(store.portfolioAttempts()).toHaveLength(0)
  expect(service.status().lastSuccessfulSyncAt).toBe(at)
  await service.close()
  const reopened = new PortfolioService(new FakeBroker(), new SnapshotStore(path))
  expect(reopened.status().lastSuccessfulSyncAt).toBe(at)
  expect(reopened.status().lastHoldingsCommitAt).toBe(sample().fetchedAt)
  await reopened.close(); rmSync(dir, { recursive: true })
})

it('reports an operation deadline as timeout rather than user cancellation', async () => {
  vi.useFakeTimers()
  const broker = new FakeBroker(); broker.delayed = true
  const service = new PortfolioService(broker, new SnapshotStore(':memory:'))
  try {
    service.restore()
    await vi.advanceTimersByTimeAsync(180_001)
    await service.settled()
    expect(service.status().lastDiagnostic).toMatchObject({ event: 'failed', category: 'timeout', timeoutOrigin: 'operation' })
    expect(service.status().snapshot).toBeNull()
  } finally { await service.close(); vi.useRealTimers() }
})


it('keeps pending event details partial without claiming a full refresh', async () => {
  const readEvents: NonNullable<Broker['readEvents']> = async (_previous, save) => {
    save({ contractVersion: 'broker-events/1', observedAt: '2026-09-21T12:00:00Z', events: [], state: [], coverage: { observedAt: '2026-09-21T12:00:00Z', timelineObservedAt: '2026-09-21T12:00:00Z', lastAttemptAt: '2026-09-21T12:00:00Z', acquisition: 'partial', olderAvailable: true, detailsPending: 2, failedDetails: 0, recentGap: false, historyComplete: false } })
  }
  const service = new PortfolioService(Object.assign(new FakeBroker(), { readEvents }), new SnapshotStore(':memory:'))
  service.restore(); await service.settled()
  expect(service.status().lastEventAttempt?.outcome?.events).toBe('partial')
  expect(service.status().lastPortfolioAttempt?.event).toBe('partial')
  expect(service.status().lastSuccessfulSyncAt).toBeNull()
  await service.close()
})
