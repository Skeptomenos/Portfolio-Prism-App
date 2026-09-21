import { brokerContractVersion, type BrokerProvider } from './broker-contract'
import { tradeRepublicProvider } from './broker'
import { admitComposition, validateProviderEvidence } from './composition-admission'
import type { Composition } from './composition'
import {
  compositionContractVersion,
  ProviderError,
  type CompositionProvider,
  type ProviderEvidence,
  type ProviderManifest,
} from './composition-provider'
import {
  compositionInspectionContractVersion,
  validateInspectionEvidence,
  type InspectionEvidence,
  type InspectionObservation,
  type InspectionProvider,
} from './composition-inspection'
import { amundiProvider } from './amundi-provider'
import { isharesProvider } from './ishares-provider'

import { pluginHostVersion, viewContributionContractVersion, amundiPluginMetadata, eventsPlugin, historyPlugin, wikiPlugin, financialPlugin, contributionMixPlugin, type AnalyticsContribution, type ViewContribution } from '../web/views/plugin-metadata'
export { pluginHostVersion, viewContributionContractVersion, type ViewContribution } from '../web/views/plugin-metadata'

export interface PluginActivationContext {
  pluginId: string
  signal: AbortSignal
}

export interface PluginDescriptor {
  id: string
  version: string
  compatibility: { hostVersion: string }
  contributions: {
    broker?: BrokerProvider
    composition?: CompositionProvider
    inspection?: InspectionProvider
    views: readonly ViewContribution[]
    analytics?: readonly AnalyticsContribution[]
  }
  activate?: (context: PluginActivationContext) => void
  deactivate?: (context: PluginActivationContext) => void
}

export type PluginLifecycleState = 'active' | 'failed' | 'disabled'

export interface PluginDiagnostic {
  pluginId: string
  state: 'failed' | 'disabled'
  code: 'activation' | 'duplicate' | 'version'
  detail: string
}

export interface PluginCapabilityEntry {
  plugin: PluginDescriptor
  kind: 'composition' | 'inspection'
  provider: CompositionProvider | InspectionProvider
}

const versionToken = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const idToken = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const fail = (code: ConstructorParameters<typeof ProviderError>[0]): never => {
  throw new ProviderError(code)
}

function validateManifest(manifest: ProviderManifest, kind: PluginCapabilityEntry['kind']): void {
  if (!idToken.test(manifest.id) || !versionToken.test(manifest.version) || !manifest.parserVersion.trim())
    fail('version')
  if (kind === 'composition' && manifest.contractVersion !== compositionContractVersion) fail('version')
  if (kind === 'inspection' && manifest.contractVersion !== compositionInspectionContractVersion) fail('version')
  if (manifest.capabilities.discovery !== 'direct-http' || !manifest.capabilities.funds.length)
    fail('format')
  if (new Set(manifest.capabilities.funds).size !== manifest.capabilities.funds.length) fail('duplicate')
  for (const fund of manifest.capabilities.funds) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(fund)) fail('identity')
  }
  if (
    manifest.sourceConstraints.access !== 'public-no-credentials' ||
    manifest.sourceConstraints.retention !== 'unsettled-private-use' ||
    !/^https:\/\//.test(manifest.sourceConstraints.termsUrl)
  ) fail('format')
}

function validateDescriptor(descriptor: PluginDescriptor): void {
  if (
    !idToken.test(descriptor.id) ||
    !versionToken.test(descriptor.version) ||
    descriptor.compatibility.hostVersion !== pluginHostVersion
  )
    fail('version')
  const { broker, composition, inspection, views } = descriptor.contributions
  if (!broker && !composition && !inspection && !views.length && !descriptor.contributions.analytics?.length) fail('format')
  if (broker && (!idToken.test(broker.id) || !versionToken.test(broker.version) || broker.contractVersion !== brokerContractVersion ||
    new Set(broker.auth.fields.map(f => f.id)).size !== broker.auth.fields.length || broker.auth.fields.some(f => !idToken.test(f.id) || !Number.isInteger(f.maxLength) || f.maxLength < 1 || f.maxLength > 1024))) fail('version')
  if (composition) validateManifest(composition.manifest, 'composition')
  if (inspection) validateManifest(inspection.manifest, 'inspection')
  const analyticsIds = new Set<string>()
  for (const analysis of descriptor.contributions.analytics ?? []) {
    if (analyticsIds.has(analysis.id)) fail('duplicate')
    if (!idToken.test(analysis.id) || analysis.contractVersion !== 'analytics/1' ||
      analysis.inputContract !== 'portfolio-financial/1' || !versionToken.test(analysis.methodVersion)) fail('version')
    analyticsIds.add(analysis.id)
  }
  const viewIds = new Set<string>()
  for (const view of views) {
    if (
      !idToken.test(view.id) ||
      view.contractVersion !== viewContributionContractVersion ||
      !view.serverEntrypoint.trim() ||
      !view.browserEntrypoint.trim() ||
      !view.readModel.trim() ||
      !view.commands.every(command => command.trim()) ||
      viewIds.has(view.id)
    )
      fail(viewIds.has(view.id) ? 'duplicate' : 'version')
    viewIds.add(view.id)
  }
}

function descriptorForProvider(
  provider: CompositionProvider
): PluginDescriptor {
  return {
    id: provider.manifest.id,
    version: provider.manifest.version,
    compatibility: { hostVersion: pluginHostVersion },
    contributions: { composition: provider, views: [] },
  }
}

export class PluginRegistry {
  private readonly states = new Map<string, PluginLifecycleState>()
  private readonly activated = new Set<string>()
  private readonly diagnosticsValue: PluginDiagnostic[] = []
  private readonly descriptorsById: ReadonlyMap<string, PluginDescriptor>

  constructor(readonly descriptors: readonly PluginDescriptor[]) {
    const pluginIds = new Set<string>()
    const contributionIds = new Set<string>()
    const fundIds = new Set<string>()
    for (const descriptor of descriptors) {
      if (pluginIds.has(descriptor.id)) fail('duplicate')
      validateDescriptor(descriptor)
      pluginIds.add(descriptor.id)
      const contributions = [
        descriptor.contributions.composition,
        descriptor.contributions.inspection,
      ].filter((value): value is CompositionProvider | InspectionProvider => Boolean(value))
      for (const contribution of contributions) {
        if (contributionIds.has(contribution.manifest.id)) fail('duplicate')
        contributionIds.add(contribution.manifest.id)
        for (const fund of contribution.manifest.capabilities.funds) {
          if (fundIds.has(fund)) fail('duplicate')
          fundIds.add(fund)
        }
      }
      const broker = descriptor.contributions.broker
      if (broker) { if (contributionIds.has(broker.id)) fail('duplicate'); contributionIds.add(broker.id) }
      for (const view of [...descriptor.contributions.views, ...(descriptor.contributions.analytics ?? [])]) {
        if (contributionIds.has(view.id)) fail('duplicate')
        contributionIds.add(view.id)
      }
      this.states.set(descriptor.id, 'active')
    }
    this.descriptorsById = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]))
  }

  state(pluginId: string): PluginLifecycleState | null {
    return this.states.get(pluginId) ?? null
  }

  diagnostics(): readonly PluginDiagnostic[] {
    return [...this.diagnosticsValue]
  }

  activate(signal: AbortSignal): void {
    for (const descriptor of this.descriptors) {
      if (this.states.get(descriptor.id) !== 'active' || this.activated.has(descriptor.id)) continue
      if (!descriptor.activate) {
        this.activated.add(descriptor.id)
        continue
      }
      try {
        signal.throwIfAborted()
        descriptor.activate({ pluginId: descriptor.id, signal })
        this.activated.add(descriptor.id)
      } catch (error) {
        this.states.set(descriptor.id, 'failed')
        this.diagnosticsValue.push({
          pluginId: descriptor.id,
          state: 'failed',
          code: 'activation',
          detail: error instanceof Error ? error.message : 'Plugin activation failed.',
        })
      }
    }
  }

  disable(pluginId: string, signal = new AbortController().signal): void {
    const descriptor = this.descriptorsById.get(pluginId)
    if (!descriptor) throw new ProviderError('identity')
    if (this.states.get(pluginId) === 'active') {
      try {
        descriptor.deactivate?.({ pluginId, signal })
      } catch (error) {
        this.diagnosticsValue.push({
          pluginId,
          state: 'disabled',
          code: 'activation',
          detail: error instanceof Error ? error.message : 'Plugin deactivation failed.',
        })
      }
    }
    this.states.set(pluginId, 'disabled')
    this.diagnosticsValue.push({ pluginId, state: 'disabled', code: 'activation', detail: 'Plugin disabled.' })
  }

  enable(pluginId: string): void {
    if (!this.descriptorsById.has(pluginId)) throw new ProviderError('identity')
    this.states.set(pluginId, 'active')
    this.activated.delete(pluginId)
  }

  brokerProvider(id: string, includeInactive = false): BrokerProvider | null {
    return this.descriptors.find(d => d.contributions.broker?.id === id && (includeInactive || this.states.get(d.id) === 'active'))?.contributions.broker ?? null
  }
  brokerProviders() { return this.descriptors.filter(d => this.states.get(d.id) === 'active').flatMap(d => d.contributions.broker ? [d.contributions.broker] : []) }

  capabilityForFund(fundIsin: string, includeInactive = false): PluginCapabilityEntry | null {
    for (const descriptor of this.descriptors) {
      const state = this.states.get(descriptor.id)
      if (!includeInactive && state !== 'active') continue
      const composition = descriptor.contributions.composition
      if (composition?.manifest.capabilities.funds.includes(fundIsin))
        return { plugin: descriptor, kind: 'composition', provider: composition }
      const inspection = descriptor.contributions.inspection
      if (inspection?.manifest.capabilities.funds.includes(fundIsin))
        return { plugin: descriptor, kind: 'inspection', provider: inspection }
    }
    return null
  }

  supportedFunds(includeInactive = false): readonly string[] {
    const funds = new Set<string>()
    for (const descriptor of this.descriptors) {
      const state = this.states.get(descriptor.id)
      if (!includeInactive && state !== 'active') continue
      for (const fund of descriptor.contributions.composition?.manifest.capabilities.funds ?? []) funds.add(fund)
      for (const fund of descriptor.contributions.inspection?.manifest.capabilities.funds ?? []) funds.add(fund)
    }
    return [...funds]
  }

  decodeProviderEvidence(evidence: ProviderEvidence): Composition {
    const provider = this.descriptors
      .map(descriptor => descriptor.contributions.composition)
      .find(candidate => candidate?.manifest.id === evidence.providerId)
    if (!provider) throw new ProviderError('version')
    try {
      validateProviderEvidence(evidence, provider)
      return admitComposition(provider.decode(evidence), evidence)
    } catch (error) {
      if (error instanceof ProviderError) throw error
      throw new ProviderError('format')
    }
  }

  decodeInspectionEvidence(evidence: InspectionEvidence): InspectionObservation {
    const provider = this.descriptors
      .map(descriptor => descriptor.contributions.inspection)
      .find(candidate => candidate?.manifest.id === evidence.providerId)
    if (!provider) throw new ProviderError('version')
    try {
      validateInspectionEvidence(evidence, provider)
      return provider.decode(evidence)
    } catch (error) {
      if (error instanceof ProviderError) throw error
      throw new ProviderError('format')
    }
  }

  compositionProviders(includeInactive = false): readonly CompositionProvider[] {
    return this.descriptors
      .filter(descriptor => includeInactive || this.states.get(descriptor.id) === 'active')
      .map(descriptor => descriptor.contributions.composition)
      .filter((provider): provider is CompositionProvider => Boolean(provider))
  }

  inspectionProviders(includeInactive = false): readonly InspectionProvider[] {
    return this.descriptors
      .filter(descriptor => includeInactive || this.states.get(descriptor.id) === 'active')
      .map(descriptor => descriptor.contributions.inspection)
      .filter((provider): provider is InspectionProvider => Boolean(provider))
  }
}

export function createPluginRegistry(descriptors: readonly PluginDescriptor[]): PluginRegistry {
  return new PluginRegistry(descriptors)
}

export function createCompositionRegistry(providers: readonly CompositionProvider[]): PluginRegistry {
  return createPluginRegistry(providers.map(descriptorForProvider))
}

const iSharesView: ViewContribution = {
  id: 'ishares-development-inspection',
  contractVersion: viewContributionContractVersion,
  serverEntrypoint: './server/financial-read-model',
  browserEntrypoint: './web/DevelopmentProgress',
  readModel: 'portfolio-financial/1',
  commands: [],
}

export const bundledPluginDescriptors: readonly PluginDescriptor[] = [
  { id: 'trade-republic-broker', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion }, contributions: { broker: tradeRepublicProvider, views: [] } },
  historyPlugin,
  eventsPlugin,
  wikiPlugin,
  financialPlugin,
  contributionMixPlugin,
  {
    id: 'ishares-bundled-plugin',
    version: '1.0.0',
    compatibility: { hostVersion: pluginHostVersion },
    contributions: { composition: isharesProvider, views: [iSharesView] },
  },
  {
    ...amundiPluginMetadata,
    contributions: { inspection: amundiProvider, views: amundiPluginMetadata.contributions.views },
  },
]

export const bundledPluginRegistry = createPluginRegistry(bundledPluginDescriptors)
