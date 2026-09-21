import { pluginHostVersion, type ViewPluginMetadata } from '../../sdk/contracts'
// Existing checksum-valid identifiers, fictional amounts/names. Never a real issuer publication.
export const exampleFundIsin = 'IE0031442068'
export const exampleMetadata: ViewPluginMetadata = {
  id: 'synthetic-source-example', version: '1.0.0', compatibility: { hostVersion: pluginHostVersion },
  contributions: { views: [{ id: 'synthetic-source-panel', contractVersion: 'view/1',
    serverEntrypoint: './examples/synthetic-source/server', browserEntrypoint: './examples/synthetic-source/browser',
    readModel: 'portfolio-financial/1', commands: [], route: { id: 'synthetic-source', label: 'Synthetic source',
      eyebrow: 'CONTRIBUTOR EXAMPLE', needsService: true, coverage: true } }] },
}
