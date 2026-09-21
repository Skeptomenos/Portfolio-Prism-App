import { Schema } from 'effect'
import { compositionContractVersion, compositionPolicyVersion, ProviderError, checkedDate,
  type CompositionProvider, type PluginDescriptor, type ProviderEvidence } from '../../sdk/server'
import { exampleFundIsin, exampleMetadata } from './metadata'
export const exampleUrl = 'https://example.invalid/prism/holdings.json'
const Publication = Schema.Struct({ fundIsin: Schema.String, date: Schema.String,
  completeness: Schema.Literal('complete', 'partial', 'empty'), weightUnit: Schema.Literal('percent'),
  rows: Schema.Array(Schema.Struct({ isin: Schema.String, name: Schema.String, weightPercent: Schema.String })) })
export const exampleProvider: CompositionProvider = {
  manifest: { id: 'synthetic-source', version: '1.0.0', parserVersion: 'synthetic-json/1',
    contractVersion: compositionContractVersion, capabilities: { discovery: 'direct-http', funds: [exampleFundIsin] },
    sourceConstraints: { access: 'public-no-credentials', retention: 'unsettled-private-use', termsUrl: 'https://example.invalid/terms' } },
  async acquire(fundIsin, context) {
    context.signal.throwIfAborted()
    if (fundIsin !== exampleFundIsin) throw new ProviderError('identity')
    const artifact = await context.get(exampleUrl, 'holdings', 'json')
    context.signal.throwIfAborted()
    const publication = decodePublication(artifact.body)
    const evidence: ProviderEvidence = { policyVersion: compositionPolicyVersion, format: 'composition-evidence/1',
      providerId: exampleProvider.manifest.id, providerVersion: exampleProvider.manifest.version,
      contractVersion: compositionContractVersion, parserVersion: exampleProvider.manifest.parserVersion,
      fundIsin, publicationDate: checkedDate(publication.date), artifacts: [artifact] }
    return { state: 'publication', evidence }
  },
  decode(evidence) {
    const artifact = evidence.artifacts.find(item => item.role === 'holdings')
    if (!artifact || artifact.url !== exampleUrl) throw new ProviderError('format')
    const publication = decodePublication(artifact.body)
    if (publication.fundIsin !== evidence.fundIsin) throw new ProviderError('identity')
    if (checkedDate(publication.date) !== evidence.publicationDate) throw new ProviderError('date')
    return { fundIsin: publication.fundIsin, fundName: 'Synthetic contributor fund', asOf: publication.date,
      retrievedAt: artifact.retrievedAt, sourceUrl: artifact.url, termsUrl: exampleProvider.manifest.sourceConstraints.termsUrl,
      sha256: artifact.sha256, parserVersion: evidence.parserVersion, completeness: publication.completeness,
      weightUnit: publication.weightUnit, weightBasis: 'whole-published-holdings', measure: 'issuer-reported-allocation-estimate',
      rows: publication.rows.map((row, index) => ({ ...row, sourceRow: index + 1, ticker: null, assetClass: 'Equity',
        marketValue: '0', notionalValue: '0', currency: 'EUR', exchange: null, country: null,
        identifierPresence: 'present', equityIdentity: 'unresolved' })),
      evidenceChecks: [{ id: 'synthetic-publication', state: 'passed', detail: 'Fictional complete fixture with explicit percent units; no real source qualification.', evidence: [artifact.sha256] }] }
  },
}
function decodePublication(body: string) {
  try { return Schema.decodeUnknownSync(Publication)(JSON.parse(Buffer.from(body, 'base64').toString('utf8'))) }
  catch { throw new ProviderError('format') }
}
export const examplePlugin: PluginDescriptor = { ...exampleMetadata,
  contributions: { ...exampleMetadata.contributions, composition: exampleProvider } }
