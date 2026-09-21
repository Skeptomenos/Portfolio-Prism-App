import { describe, expect, it } from 'vitest'
import { BrowserViewRegistry, type BrowserViewModule } from '../web/views/registry'
import { historyPlugin, wikiPlugin, amundiPluginMetadata, contributionMixPlugin } from '../web/views/plugin-metadata'
import { bundledPluginDescriptors, createPluginRegistry } from '../server/plugin-registry'
import { inspectionEvidence } from './inspection-fixture'

const moduleFor = (metadata = historyPlugin, viewId = metadata.contributions.views[0].id): BrowserViewModule => ({ metadata, viewId, render: () => null })
describe('registered browser contributions', () => {
  it('uses the same Amundi identity and view metadata as its provider descriptor', () => {
    const backend = bundledPluginDescriptors.find(item => item.id === amundiPluginMetadata.id)!
    expect(backend.contributions.inspection).toBeDefined()
    expect(backend.contributions.views).toBe(amundiPluginMetadata.contributions.views)
    expect(backend.contributions.views[0].serverEntrypoint).not.toBe(backend.contributions.views[0].browserEntrypoint)
  })
  it('rejects duplicate and shell-colliding routes and isolates incompatible views', () => {
    expect(() => new BrowserViewRegistry([moduleFor(), moduleFor()])).toThrow('Duplicate')
    expect(() => new BrowserViewRegistry([moduleFor()], ['history'])).toThrow('Duplicate')
    const registry = new BrowserViewRegistry([moduleFor({ ...historyPlugin, compatibility: { hostVersion: 'other/1' } }), moduleFor(wikiPlugin)])
    registry.activate(new AbortController().signal)
    expect(registry.route('history')?.state).toBe('incompatible')
    expect(registry.route('wiki')?.state).toBe('active')
  })
  it('isolates failed and disabled views while preserving unrelated routes', () => {
    const registry = new BrowserViewRegistry([{ ...moduleFor(), activate: () => { throw new Error('fixture') } }, moduleFor(wikiPlugin)])
    registry.activate(new AbortController().signal)
    expect(registry.route('history')?.state).toBe('failed')
    expect(registry.route('wiki')?.state).toBe('active')
    registry.disable('portfolio-history')
    expect(registry.route('history')?.state).toBe('disabled')
    expect(registry.route('wiki')?.state).toBe('active')
  })
  it('supports view-only backend registration without changing provider decoding', () => {
    const registry = createPluginRegistry(bundledPluginDescriptors)
    registry.disable(historyPlugin.id)
    expect(registry.capabilityForFund('FR0010361683')?.kind).toBe('inspection')
    registry.disable(amundiPluginMetadata.id)
    expect(registry.capabilityForFund('FR0010361683')).toBeNull()
    expect(registry.decodeInspectionEvidence(inspectionEvidence()).rows).toHaveLength(3)
    expect(registry.state(wikiPlugin.id)).toBe('active')
  })
})

it('registers an analytics-only capability and rejects duplicate or incompatible analytics metadata', () => {
  const analysisOnly = { ...contributionMixPlugin, contributions: { ...contributionMixPlugin.contributions, views: [] } }
  expect(createPluginRegistry([analysisOnly]).state(analysisOnly.id)).toBe('active')
  expect(() => createPluginRegistry([analysisOnly, { ...analysisOnly, id: 'another-analysis-plugin' }])).toThrow()
  expect(() => createPluginRegistry([{ ...analysisOnly, contributions: { views: [], analytics: [{ ...analysisOnly.contributions.analytics![0], methodVersion: 'invalid' }] } }])).toThrow()
})
