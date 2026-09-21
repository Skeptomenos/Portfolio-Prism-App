/** Reusable Vitest suite for a contributor's composition provider. Test-only host access. */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPluginRegistry, type PluginDescriptor } from '../../server/plugin-registry'
import { ProviderError, type ProviderContext, type ProviderEvidence, type ProviderErrorCode } from '../server'
import { SnapshotStore } from '../../server/store'
import { ProviderRefreshService } from '../../server/provider-refresh-service'
export interface CompositionConformance {
  plugin: PluginDescriptor
  evidence: () => ProviderEvidence
  context: (signal: AbortSignal) => ProviderContext
  rejected: readonly { name: string; evidence: () => ProviderEvidence; code: ProviderErrorCode }[]
}
export function compositionConformance(fixture: CompositionConformance) {
  const { plugin } = fixture
  if (!plugin.contributions.composition) throw new Error('Composition conformance requires a composition capability')
  describe(`${plugin.id} contributor conformance`, () => {
    it('acquires through the granted context and decodes through core admission', async () => {
      const provider = plugin.contributions.composition!
      const evidence = fixture.evidence()
      const acquired = await provider.acquire(evidence.fundIsin, fixture.context(new AbortController().signal))
      expect(acquired.state).toBe('publication')
      if (acquired.state !== 'publication') throw Error('Publication required')
      expect(createPluginRegistry([plugin]).decodeProviderEvidence(acquired.evidence)).toEqual(createPluginRegistry([plugin]).decodeProviderEvidence(evidence))
    })
    for (const rejected of fixture.rejected) it(`rejects ${rejected.name}`, () => {
      expect(() => createPluginRegistry([plugin]).decodeProviderEvidence(rejected.evidence()))
        .toThrowError(expect.objectContaining({ code: rejected.code }))
    })
    it('honors pre-cancelled acquisition and propagates granted transport failure', async () => {
      const provider = plugin.contributions.composition!, evidence = fixture.evidence()
      const controller = new AbortController(); controller.abort()
      await expect(provider.acquire(evidence.fundIsin, fixture.context(controller.signal))).rejects.toThrow()
      await expect(provider.acquire(evidence.fundIsin, { signal: new AbortController().signal,
        get: async () => { throw new ProviderError('http', 503) }, post: async () => { throw new ProviderError('http', 503) } }))
        .rejects.toThrowError(expect.objectContaining({ code: 'http' }))
    })
    it('rejects duplicate registration and isolates activation failure', () => {
      expect(() => createPluginRegistry([plugin, plugin])).toThrowError(expect.objectContaining({ code: 'duplicate' }))
      const registry = createPluginRegistry([{ ...plugin, activate: () => { throw Error('Synthetic activation fault') } }])
      registry.activate(new AbortController().signal)
      expect(registry.state(plugin.id)).toBe('failed')
      expect(registry.capabilityForFund(fixture.evidence().fundIsin)).toBeNull()
      expect(registry.decodeProviderEvidence(fixture.evidence()).rows.length).toBeGreaterThan(0)
      expect(registry.diagnostics()[0].code).toBe('activation')
    })
    it('persists, reopens, disables and recovers; compatible plugin upgrades retain the decoder', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'prism-conformance-')), path = join(dir, 'portfolio.sqlite')
      const evidence = fixture.evidence(), registry = createPluginRegistry([plugin])
      let store = new SnapshotStore(path, registry)
      let host: ProviderRefreshService | undefined
      try {
        store.save({ fetchedAt: '2026-09-21T12:00:00Z', positions: [{ account: 'synthetic', isin: evidence.fundIsin,
          name: 'Conformance fund', quantity: '1', averageBuyIn: '1', instrumentType: 'fund' }] })
        host = new ProviderRefreshService(store, registry, fixture.context)
        expect(host.refresh()).toBe(true); await host.settled()
        const selected = store.selectedCompositions()
        expect(selected).toHaveLength(1)
        const run = store.history.runs().items[0]
        const history = store.history.run(run.id)!
        expect(history.checkpoints.length).toBeGreaterThan(0)
        await host.close(); store.close()
        const upgraded = createPluginRegistry([{ ...plugin, version: '1.0.1' }])
        store = new SnapshotStore(path, upgraded)
        expect(store.selectedCompositions()).toEqual(selected)
        expect(store.history.run(run.id)).toEqual(history)
        upgraded.disable(plugin.id)
        host = new ProviderRefreshService(store, upgraded, fixture.context)
        expect(host.refresh()).toBe(false)
        expect(store.selectedCompositions()).toEqual(selected)
        upgraded.enable(plugin.id); expect(host.refresh()).toBe(true); await host.settled()
        expect(store.selectedCompositions()).toEqual(selected)
        await host.close(); store.close()
        // Existing host requires exact provider/parser version. An incompatible decoder
        // yields a visible replay warning, preserves rows on disk and permits restoration.
        const incompatible = createPluginRegistry([{ ...plugin, contributions: { ...plugin.contributions,
          composition: { ...plugin.contributions.composition!, manifest: { ...plugin.contributions.composition!.manifest, parserVersion: 'incompatible/2' } } } }])
        store = new SnapshotStore(path, incompatible)
        expect(store.selectedCompositions()).toEqual([])
        expect(store.allocationWarnings[evidence.fundIsin]).toBeTruthy()
        expect(store.providerCompositionCount()).toBe(1)
        expect(store.history.run(run.id)).toEqual(history)
        store.close(); store = new SnapshotStore(path, registry)
        expect(store.selectedCompositions()).toEqual(selected)
      } finally { await host?.close(); store.close(); rmSync(dir, { recursive: true, force: true }) }
    })
  })
}
