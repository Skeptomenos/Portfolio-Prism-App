import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { amundiProvider } from '../server/amundi-provider'
import { ProviderError, type ProviderContext } from '../server/composition-provider'
import { createPluginRegistry, bundledPluginRegistry, pluginHostVersion } from '../server/plugin-registry'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { SnapshotStore } from '../server/store'
import { inspectionEvidence } from './inspection-fixture'

const fund = 'FR0010361683'

function contextForInspection(): (signal: AbortSignal) => ProviderContext {
  return signal => ({
    signal,
    get: async () => { throw new Error('Amundi inspection must use POST') },
    post: async () => inspectionEvidence().artifact,
  })
}

function holding(store: SnapshotStore): void {
  store.save({
    fetchedAt: '2026-09-17T12:00:00.000Z',
    positions: [{ account: 'a', isin: fund, name: 'Amundi synthetic fund', quantity: '1', instrumentType: 'fund', averageBuyIn: '1' }],
  })
}

describe('inspection provider host integration', () => {
  it('exposes metadata-only revisions as a conflict and preserves the last good observation', async () => {
    const store = new SnapshotStore(':memory:')
    holding(store)
    const original = inspectionEvidence()
    store.saveInspectionEvidence(original, {
      id: 'accepted', at: '2026-09-17T12:00:00.000Z', providerId: 'amundi-bundled', status: 'success', code: null, outcome: 'updated', resolution: 'saved',
    })
    const body = JSON.parse(Buffer.from(original.artifact.body, 'base64').toString('utf8'))
    body.products[0].characteristics.REPLICATION_METHODOLOGY = 'Changed replication methodology'
    const bytes = Buffer.from(JSON.stringify(body))
    const host = new ProviderRefreshService(store, bundledPluginRegistry, signal => ({
      signal,
      get: async () => { throw new Error('Unexpected GET') },
      post: async () => ({ ...original.artifact, body: bytes.toString('base64'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }),
    }))
    host.refresh()
    await host.settled()
    expect(host.status().attempts[fund]).toMatchObject({ status: 'failed', code: 'conflict', outcome: 'failed' })
    expect(store.selectedInspections()[0].replicationMethod).toBe('Indirect (Unfunded swap)')
    expect(store.selectedInspections()[0].responseSha256).toBe(original.artifact.sha256)
    await host.close()
    store.close()
  })

  it('acquires Amundi through the shared registry and does not make it a composition', async () => {
    const store = new SnapshotStore(':memory:')
    holding(store)
    const host = new ProviderRefreshService(store, bundledPluginRegistry, contextForInspection())
    expect(host.refresh()).toBe(true)
    await host.settled()
    expect(host.status().attempts[fund]).toMatchObject({ status: 'success', outcome: 'updated', providerId: 'amundi-bundled' })
    expect(store.selectedInspections()).toHaveLength(1)
    expect(store.selectedCompositions()).toEqual([])
    await host.close()
    store.close()
  })

  it('records a typed activation failure without deleting or inventing inspection data', async () => {
    const registry = createPluginRegistry([{
      id: 'amundi-failing-plugin',
      version: '1.0.0',
      compatibility: { hostVersion: pluginHostVersion },
      contributions: { inspection: amundiProvider, views: [] },
      activate: () => { throw new Error('test activation failure') },
    }])
    const store = new SnapshotStore(':memory:', registry)
    holding(store)
    const host = new ProviderRefreshService(store, registry, contextForInspection())
    expect(host.refresh()).toBe(true)
    await host.settled()
    expect(host.status().attempts[fund]).toMatchObject({ status: 'failed', code: 'activation', outcome: 'failed' })
    expect(store.selectedInspections()).toEqual([])
    await host.close()
    store.close()
  })

  it('retains the last accepted inspection after a later source failure', async () => {
    const store = new SnapshotStore(':memory:')
    holding(store)
    store.saveInspectionEvidence(inspectionEvidence(), {
      id: 'accepted', at: '2026-09-17T12:00:00.000Z', providerId: 'amundi-bundled', status: 'success', code: null, outcome: 'updated', resolution: 'saved',
    })
    const host = new ProviderRefreshService(store, bundledPluginRegistry, signal => ({
      signal,
      get: async () => { throw new ProviderError('format') },
      post: async () => { throw new ProviderError('http', 503) },
    }))
    expect(host.refresh()).toBe(true)
    await host.settled()
    expect(host.status().attempts[fund]).toMatchObject({ status: 'failed', code: 'http', httpStatus: 503 })
    expect(store.selectedInspections()[0].asOf).toBe('2026-09-16')
    await host.close()
    store.close()
  })
})
