import { Schema } from 'effect'
import { financialEnvelope, AnalysisInputSchema } from '../../contracts/financial'
import type { AnalysisSnapshot } from './financial-client'
import { pluginHostVersion, type ViewPluginMetadata } from './plugin-metadata'

export interface AnalyticsModule<Result> {
  metadata: ViewPluginMetadata
  analyticsId: string
  evaluate: (input: AnalysisSnapshot['data']) => Result
}
/** Analytics consume the supported exposure/coverage input; outputs remain separate from core results. */
export class AnalyticsRegistry<Result> {
  private entries = new Map<string, { module: AnalyticsModule<Result>; state: 'active' | 'disabled' | 'incompatible' }>()
  constructor(modules: readonly AnalyticsModule<Result>[]) {
    for (const module of modules) {
      if (this.entries.has(module.analyticsId)) throw new Error('Duplicate analytics registration')
      const contribution = module.metadata.contributions.analytics?.find(item => item.id === module.analyticsId)
      const compatible = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(module.metadata.id) && /^\d+\.\d+\.\d+$/.test(module.metadata.version) && module.metadata.compatibility.hostVersion === pluginHostVersion && contribution?.contractVersion === 'analytics/1' &&
        contribution.inputContract === 'portfolio-financial/1' && /^\d+\.\d+\.\d+$/.test(contribution.methodVersion)
      this.entries.set(module.analyticsId, { module, state: compatible ? 'active' : 'incompatible' })
    }
  }
  disable(id: string) { const entry = this.entries.get(id); if (!entry) throw new Error('Unknown analysis'); entry.state = 'disabled' }
  evaluate(id: string, input: AnalysisSnapshot): Result {
    const entry = this.entries.get(id)
    if (!entry || entry.state !== 'active') throw new Error('Analysis is disabled or incompatible')
    const validated = Schema.decodeUnknownSync(financialEnvelope('analysis', AnalysisInputSchema))({
      contractVersion: 'portfolio-financial/1', resource: 'analysis', ...input,
    })
    // A detached immutable copy prevents accidental mutation of the host's canonical input.
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child) }
    }
    const detached = structuredClone(validated.data)
    freeze(detached)
    return entry.module.evaluate(detached)
  }
}
