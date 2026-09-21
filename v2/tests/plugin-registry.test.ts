import { describe, expect, it } from 'vitest'
import { amundiProvider } from '../server/amundi-provider'
import { ProviderError, type CompositionProvider } from '../server/composition-provider'
import { isharesProvider } from '../server/ishares-provider'
import { createPluginRegistry, pluginHostVersion, type PluginDescriptor } from '../server/plugin-registry'
import { inspectionEvidence } from './inspection-fixture'
import { providerEvidence } from './provider-fixture'

const descriptor = (overrides: Partial<PluginDescriptor> = {}): PluginDescriptor => ({
  id: 'synthetic-inspection-plugin',
  version: '1.0.0',
  compatibility: { hostVersion: pluginHostVersion },
  contributions: { inspection: amundiProvider, views: [] },
  ...overrides,
})

const syntheticProvider: CompositionProvider = {
  ...isharesProvider,
  manifest: { ...isharesProvider.manifest, id: 'synthetic-provider' },
}

describe('shared plugin registry', () => {
  it('rejects duplicate plugin and contribution identities or incompatible host versions', () => {
    expect(() => createPluginRegistry([descriptor(), descriptor({ id: 'second-plugin' })])).toThrowError(expect.objectContaining({ code: 'duplicate' }))
    expect(() => createPluginRegistry([
      descriptor({ id: 'first-plugin', contributions: { inspection: amundiProvider, views: [{ id: 'shared-view', contractVersion: 'view/1', serverEntrypoint: './server/a', browserEntrypoint: './web/a', readModel: 'A', commands: [] }] } }),
      descriptor({ id: 'second-plugin', contributions: { inspection: amundiProvider, views: [{ id: 'shared-view', contractVersion: 'view/1', serverEntrypoint: './server/b', browserEntrypoint: './web/b', readModel: 'B', commands: [] }] } }),
    ])).toThrowError(expect.objectContaining({ code: 'duplicate' }))
    expect(() => createPluginRegistry([descriptor({ compatibility: { hostVersion: 'other-host/1' } })])).toThrowError(expect.objectContaining({ code: 'version' }))
  })

  it('records activation failure, skips new acquisition, but preserves historical replay decoding', () => {
    const registry = createPluginRegistry([descriptor({ activate: () => { throw new Error('missing host setup') } })])
    registry.activate(new AbortController().signal)
    expect(registry.state('synthetic-inspection-plugin')).toBe('failed')
    expect(registry.capabilityForFund('FR0010361683')).toBeNull()
    expect(registry.capabilityForFund('FR0010361683', true)?.kind).toBe('inspection')
    expect(registry.diagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ pluginId: 'synthetic-inspection-plugin', code: 'activation' }),
    ]))
    expect(registry.decodeInspectionEvidence(inspectionEvidence()).rows).toHaveLength(3)
  })

  it('disables acquisition without deleting the registered decoder', () => {
    const registry = createPluginRegistry([descriptor()])
    registry.disable('synthetic-inspection-plugin')
    expect(registry.state('synthetic-inspection-plugin')).toBe('disabled')
    expect(registry.capabilityForFund('FR0010361683')).toBeNull()
    expect(() => registry.decodeInspectionEvidence(inspectionEvidence())).not.toThrow()
    expect(() => registry.disable('unknown-plugin')).toThrowError(expect.objectContaining({ code: 'identity' }))
    expect(() => registry.enable('unknown-plugin')).toThrowError(expect.objectContaining({ code: 'identity' }))
  })

  it('keeps registry validation failures typed', () => {
    expect(() => createPluginRegistry([descriptor({ version: 'not-semver' })])).toThrowError(expect.objectContaining({ code: 'version' }))
    expect(() => createPluginRegistry([descriptor({ contributions: { inspection: { ...amundiProvider, manifest: { ...amundiProvider.manifest, capabilities: { ...amundiProvider.manifest.capabilities, funds: ['not-an-isin'] } } }, views: [] } })])).toThrowError(expect.objectContaining({ code: 'identity' }))
    expect(new ProviderError('activation').code).toBe('activation')
  })

  it('registers and decodes an independently named synthetic composition provider', () => {
    const registry = createPluginRegistry([{
      id: 'synthetic-composition-plugin',
      version: '1.0.0',
      compatibility: { hostVersion: pluginHostVersion },
      contributions: { composition: syntheticProvider, views: [] },
    }])
    const evidence = providerEvidence()
    evidence.providerId = 'synthetic-provider'
    expect(registry.decodeProviderEvidence(evidence)).toMatchObject({ fundIsin: evidence.fundIsin, scope: 'full-holdings' })
  })
})
