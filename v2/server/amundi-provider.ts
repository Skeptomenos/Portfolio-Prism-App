import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  compositionInspectionContractVersion,
  decodeInspection,
  inspectionManifest,
  type InspectionEvidence,
  type InspectionProvider,
} from './composition-inspection'
import { ProviderError, type ProviderContext, type SourceArtifact } from './composition-provider'

export const amundiFundIsin = 'FR0010361683'
export const amundiSourceUrl = 'https://www.amundietf.de/mapi/ProductAPI/getProductsData'
const providerId = 'amundi-bundled'
const providerVersion = '1.0.0'
const parserVersion = 'amundi-composition-inspection/1'
const termsUrl = 'https://www.amundietf.com/legal-notice'

const requestValue = {
  context: { countryCode: 'DEU', languageCode: 'de', userProfileName: 'RETAIL' },
  productIds: [amundiFundIsin],
  characteristics: [
    'ISIN',
    'SHARE_MARKETING_NAME',
    'POSITION_AS_OF_DATE',
    'REPLICATION_METHOD',
    'REPLICATION_METHODOLOGY',
    'BENCHMARK_NAME',
    'BENCHMARK',
    'BENCHMARK_TICKER',
    'INDEX_BLOOMBERG_TICKER',
    'FUND_SWAP_COUNTERPART',
    'FUND_SWAP_DATE',
    'FUND_SWAP_DAILYVALUE',
    'COUNTERPARTY_RISK_OF_NAV',
    'FUND_BREAKDOWNS_AS_OF_DATE',
    'FUND_AUM',
    'NAV_DATE',
    'NAV',
    'FUND_FUND_NAME',
    'FUND_ISIN',
  ],
  composition: {
    compositionFields: [
      'date',
      'type',
      'bbg',
      'isin',
      'name',
      'weight',
      'quantity',
      'currency',
      'sector',
      'country',
      'countryOfRisk',
    ],
  },
  metrics: [],
  historics: [],
  breakDown: { aggregationFields: ['INDEX_TOP10', 'FUND_TOP10'] },
} as const

export const amundiRequestBody = JSON.stringify(requestValue)
export const amundiRequestSha256 = createHash('sha256').update(amundiRequestBody).digest('hex')

export const amundiProviderManifest = inspectionManifest({
  id: providerId,
  version: providerVersion,
  parserVersion,
  capabilities: { discovery: 'direct-http' as const, funds: [amundiFundIsin] as readonly string[] },
  sourceConstraints: {
    access: 'public-no-credentials' as const,
    retention: 'unsettled-private-use' as const,
    termsUrl,
  },
})

function fail(code: ConstructorParameters<typeof ProviderError>[0]): never {
  throw new ProviderError(code)
}

function publicationDate(artifact: SourceArtifact): string {
  let value: unknown
  try {
    const root = JSON.parse(Buffer.from(artifact.body, 'base64').toString('utf8')) as Record<string, unknown>
    const products = Array.isArray(root.products) ? root.products : []
    const product = products[0] as Record<string, unknown> | undefined
    const characteristics = product?.characteristics as Record<string, unknown> | undefined
    value = characteristics?.POSITION_AS_OF_DATE
  } catch {
    return fail('format')
  }
  if (typeof value !== 'string') return fail('date')
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return fail('date')
}

export const amundiProvider: InspectionProvider = {
  manifest: amundiProviderManifest,
  async acquire(fundIsin, context) {
    if (fundIsin !== amundiFundIsin) return { state: 'partial', diagnostic: 'identity' }
    if (!context.post) return { state: 'partial', diagnostic: 'access' }
    context.signal.throwIfAborted()
    const response = await context.post(amundiSourceUrl, 'amundi-details', amundiRequestBody)
    context.signal.throwIfAborted()
    if (response.url !== amundiSourceUrl || response.status !== 200) throw new ProviderError('identity')
    const request = {
      method: 'POST' as const,
      url: amundiSourceUrl,
      body: amundiRequestBody,
      sha256: amundiRequestSha256,
    }
    const evidence: InspectionEvidence = {
      format: 'composition-inspection-evidence/1',
      providerId,
      providerVersion,
      contractVersion: compositionInspectionContractVersion,
      fundIsin,
      publicationDate: publicationDate(response),
      sourceUrl: amundiSourceUrl,
      request,
      artifact: { ...response, url: amundiSourceUrl, request },
    }
    amundiProvider.decode(evidence)
    return { state: 'observation', evidence }
  },
  decode(evidence) {
    if (evidence.sourceUrl !== amundiSourceUrl) fail('identity')
    let request: unknown
    try {
      request = JSON.parse(evidence.request.body)
    } catch {
      return fail('format')
    }
    if (!isDeepStrictEqual(request, requestValue)) fail('identity')
    return decodeInspection(evidence, amundiProvider)
  },
}

export default amundiProvider
