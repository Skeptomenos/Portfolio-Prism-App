import { createCompositionRegistry, bundledPluginRegistry } from './plugin-registry'
import type { CompositionProvider, ProviderEvidence } from './composition-provider'

/** Compatibility exports for existing callers. Runtime ownership is the shared registry. */
export const compositionProviders: readonly CompositionProvider[] = bundledPluginRegistry.compositionProviders()

export function validateRegistrations(providers: readonly CompositionProvider[]): void {
  createCompositionRegistry(providers)
}

export function decodeProviderEvidence(
  evidence: ProviderEvidence,
  providers: readonly CompositionProvider[] = compositionProviders
) {
  const registry = providers === compositionProviders ? bundledPluginRegistry : createCompositionRegistry(providers)
  return registry.decodeProviderEvidence(evidence)
}
