// Browser-safe descriptor metadata shared with backend registration. Entrypoints are
// documentation/compatibility identifiers, never dynamic import paths.
export const pluginHostVersion = 'portfolio-prism-host/1' as const
export const viewContributionContractVersion = 'view/1' as const
export interface ViewContribution {
  id: string
  contractVersion: typeof viewContributionContractVersion
  serverEntrypoint: string
  browserEntrypoint: string
  readModel: string
  commands: readonly string[]
  route?: { id: string; label: string; eyebrow: string; needsService: boolean; order?: number; coverage?: boolean }
}
export interface AnalyticsContribution {
  id: string
  contractVersion: 'analytics/1'
  inputContract: 'portfolio-financial/1'
  methodVersion: string
}
export interface ViewPluginMetadata {
  id: string
  version: string
  compatibility: { hostVersion: string }
  contributions: { views: readonly ViewContribution[]; analytics?: readonly AnalyticsContribution[] }
}
export const historyPlugin: ViewPluginMetadata = {
  id: 'history-bundled-plugin', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: { views: [{ id: 'portfolio-history', contractVersion: 'view/1', serverEntrypoint: './server/http', browserEntrypoint: './web/views/History',
    readModel: 'portfolio-history/1', commands: ['history.read'], route: { id: 'history', label: 'History', eyebrow: 'SAVED PORTFOLIO CHECKPOINTS', needsService: true } }] },
}
export const wikiPlugin: ViewPluginMetadata = {
  id: 'wiki-bundled-plugin', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: { views: [{ id: 'project-wiki', contractVersion: 'view/1', serverEntrypoint: './wiki-assets', browserEntrypoint: './web/Wiki',
    readModel: 'wiki-pages/1', commands: [], route: { id: 'wiki', label: 'Wiki', eyebrow: 'HOW PRISM WORKS', needsService: false } }] },
}
export const amundiPluginMetadata: ViewPluginMetadata = {
  id: 'amundi-bundled-plugin', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: { views: [{ id: 'amundi-development-inspection', contractVersion: 'view/1', serverEntrypoint: './server/financial-read-model', browserEntrypoint: './web/views/AmundiPanel',
    readModel: 'portfolio-financial/1', commands: [], route: { id: 'amundi-inspection', label: 'Amundi source', eyebrow: 'SAVED INSPECTION · OUTSIDE EXPOSURE', needsService: true } }] },
}

export const financialPlugin: ViewPluginMetadata = {
  id: 'financial-bundled-plugin', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: { views: [
    { id: 'portfolio', contractVersion: 'view/1', serverEntrypoint: './server/financial-read-model', browserEntrypoint: './web/Holdings', readModel: 'portfolio-financial/1', commands: ['composition.refresh'], route: { id: 'portfolio', label: 'Portfolio', eyebrow: 'YOUR PORTFOLIO', needsService: true, order: 10, coverage: true } },
    { id: 'breakdown', contractVersion: 'view/1', serverEntrypoint: './server/financial-read-model', browserEntrypoint: './web/CompanyExposure', readModel: 'portfolio-financial/1', commands: ['composition.refresh'], route: { id: 'breakdown', label: 'Breakdown', eyebrow: 'KNOWN SECURITY EXPOSURE', needsService: true, order: 20, coverage: true } },
    { id: 'explore', contractVersion: 'view/1', serverEntrypoint: './server/financial-read-model', browserEntrypoint: './web/views/Explore', readModel: 'portfolio-financial/1', commands: [], route: { id: 'explore', label: 'Explore', eyebrow: 'SOURCE RELATIONSHIPS', needsService: false, order: 30 } },
    { id: 'development', contractVersion: 'view/1', serverEntrypoint: './server/financial-read-model', browserEntrypoint: './web/DevelopmentProgress', readModel: 'portfolio-financial/1', commands: ['composition.refresh'], route: { id: 'development', label: 'Development', eyebrow: 'EVIDENCE-GATED DELIVERY', needsService: true, order: 40, coverage: true } },
  ] },
}
export const contributionMixPlugin: ViewPluginMetadata = {
  id: 'contribution-mix-plugin', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: {
    analytics: [{ id: 'contribution-mix', contractVersion: 'analytics/1', inputContract: 'portfolio-financial/1', methodVersion: '1.0.0' }],
    views: [{ id: 'contribution-mix-view', contractVersion: 'view/1', serverEntrypoint: './server/financial-read-model', browserEntrypoint: './web/views/ContributionMix', readModel: 'portfolio-financial/1', commands: [], route: { id: 'contribution-mix', label: 'Contribution mix', eyebrow: 'DIRECT AND ETF SOURCES', needsService: true } }],
  },
}

export const eventsPlugin: ViewPluginMetadata = {
  id: 'events-bundled-plugin', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: { views: [{ id: 'portfolio-events', contractVersion: 'view/1', serverEntrypoint: './server/event-ledger', browserEntrypoint: './web/views/Events',
    readModel: 'portfolio-events/1', commands: ['events.backfill','events.reprocess'], route: { id: 'events', label: 'Transactions', eyebrow: 'EVIDENCED ACTIVITY & CASH FLOWS', needsService: true } }] },
}
