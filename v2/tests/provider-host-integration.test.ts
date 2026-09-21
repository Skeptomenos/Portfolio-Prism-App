import { describe, expect, it } from 'vitest'
import { SnapshotStore } from '../server/store'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { isharesProvider } from '../server/ishares-provider'
import { ProviderError, type ProviderContext } from '../server/composition-provider'
import { providerEvidence } from './provider-fixture'

const funds = ['IE0031442068', 'IE00B4L5Y983']
function setup() {
  const store = new SnapshotStore(':memory:')
  store.save({ fetchedAt: '2026-09-11T12:00:00Z', positions: funds.map(isin => ({ isin, account: 'a', name: 'Synthetic fund', quantity: '1', instrumentType: 'fund', averageBuyIn: '1' })) })
  for (const isin of funds) store.saveProviderEvidence(providerEvidence(isin, '2026-09-09'), { id: isin, at: '2026-09-10T12:00:00Z', providerId: isharesProvider.manifest.id, status: 'success', code: null, outcome: 'updated', resolution: 'saved' })
  return store
}
function contextFor(get: ProviderContext['get']): (signal: AbortSignal) => ProviderContext {
  return signal => ({ signal, get })
}
const publications = funds.map(isin => providerEvidence(isin, '2026-09-10', ['98', '2']))
const successfulGet: ProviderContext['get'] = async url => {
  const artifact = publications.flatMap(e => e.artifacts).find(a => a.url === url)
  if (!artifact) throw new ProviderError('format')
  return structuredClone(artifact)
}

describe('registered provider host with actual core and SQLite', () => {
  it('commits one fund while failed HTTP for another retains its prior composition and diagnostic', async () => {
    const store = setup()
    const before = store.selectedCompositions()
    const service = new ProviderRefreshService(store, [isharesProvider], contextFor(async (...args) => {
      if (args[0].includes('251882')) throw new ProviderError('http', 503)
      return successfulGet(...args)
    }))
    expect(service.refresh(true)).toBe(true)
    expect(service.refresh()).toBe(false)
    await service.settled()
    const after = store.selectedCompositions()
    expect(after.find(s => s.fundIsin === funds[0])?.asOf).toBe('2026-09-10')
    expect(after.find(s => s.fundIsin === funds[1])).toEqual(before.find(s => s.fundIsin === funds[1]))
    expect(service.status().attempts[funds[1]]).toMatchObject({ code: 'http', httpStatus: 503 })
    expect(service.refresh(true)).toBe(false)
    await service.close(); store.close()
  })
  it('cancels after the first commit, preserves both last-good funds and permits an automatic retry', async () => {
    const store = setup()
    let entered!: () => void
    const secondStarted = new Promise<void>(resolve => { entered = resolve })
    const service = new ProviderRefreshService(store, [isharesProvider], signal => ({ signal, get: async (...args) => {
      if (!args[0].includes('251882')) return successfulGet(...args)
      entered()
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new ProviderError('cancelled')), { once: true }))
    } }))
    service.refresh(); await secondStarted; service.refresh(true); service.cancel(); await service.settled()
    expect(store.selectedCompositions().map(s => s.asOf)).toEqual(['2026-09-10', '2026-09-09'])
    expect(service.status().attempts[funds[1]].code).toBe('cancelled')
    const retry = new ProviderRefreshService(store, [isharesProvider], contextFor(successfulGet))
    expect(retry.refresh(true)).toBe(true); await retry.settled()
    expect(store.selectedCompositions().map(s => s.asOf)).toEqual(['2026-09-10', '2026-09-10'])
    await retry.close(); await service.close(); store.close()
  })
  it('reports a same-date revision conflict rather than storage failure and keeps accepted rows', async () => {
    const store = setup()
    const good = new ProviderRefreshService(store, [isharesProvider], contextFor(successfulGet))
    good.refresh(); await good.settled(); const before = store.selectedCompositions()
    const revision = providerEvidence(funds[0], '2026-09-10', ['97', '3'])
    const conflicting = new ProviderRefreshService(store, [isharesProvider], contextFor(async (...args) => revision.artifacts.find(a => a.url === args[0]) ?? successfulGet(...args)))
    conflicting.refresh(); await conflicting.settled()
    expect(conflicting.status().attempts[funds[0]].code).toBe('conflict')
    expect(store.selectedCompositions()).toEqual(before)
    await good.close(); await conflicting.close(); store.close()
  })
})

it('queues an automatic pass for newly imported funds while an earlier provider batch runs', async () => {
  const store = setup()
  const both = store.latest()!
  store.save({ ...both, positions: both.positions.slice(0, 1) })
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const pause = new Promise<void>(resolve => { release = resolve })
  let first = true
  const host = new ProviderRefreshService(store, [isharesProvider], contextFor(async (...args) => {
    if (first) { first = false; entered(); await pause }
    return successfulGet(...args)
  }))
  try {
    host.refresh(); await started
    store.save(both)
    host.refresh(true)
    release(); await host.settled()
    expect(store.selectedCompositions().map(s => s.asOf)).toEqual(['2026-09-10', '2026-09-10'])
    expect(store.providerCompositionCount()).toBe(4)
  } finally { release(); await host.close(); store.close() }
})
