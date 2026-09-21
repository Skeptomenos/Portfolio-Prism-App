import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { validIsin } from './composition'
import {
  ProviderError,
  type ProviderContext,
  type ProviderManifest,
  type ProviderRequest,
  type SourceArtifact,
} from './composition-provider'

export const compositionInspectionContractVersion = 'composition-inspection/1' as const

export type InspectionScope = 'substitute-basket' | 'partial-benchmark'

export interface InspectionRow {
  sourceRow: number
  scope: InspectionScope
  name: string | null
  isin: string | null
  ticker: string | null
  assetClass: string | null
  weight: string
  weightUnit: 'fraction'
  quantity: string | null
  currency: string | null
  sector: string | null
  country: string | null
}

export interface InspectionSourceLimits {
  id: string
  detail: string
}

export interface InspectionEvidence {
  format: 'composition-inspection-evidence/1'
  providerId: string
  providerVersion: string
  contractVersion: typeof compositionInspectionContractVersion
  fundIsin: string
  publicationDate: string
  sourceUrl: string
  request: ProviderRequest
  artifact: SourceArtifact
}

export interface InspectionObservation {
  format: 'composition-inspection/1'
  providerId: string
  providerVersion: string
  contractVersion: typeof compositionInspectionContractVersion
  fundIsin: string
  fundName: string
  asOf: string
  retrievedAt: string
  sourceUrl: string
  responseSha256: string
  requestSha256: string
  responseBytes: number
  totalReportedRows: number
  rows: InspectionRow[]
  benchmarkRows: InspectionRow[]
  replicationMethod: string | null
  benchmarkName: string | null
  benchmarkTicker: string | null
  swapCounterparties: string | null
  sourceLimits: InspectionSourceLimits[]
}

export type InspectionAcquisitionResult =
  | { state: 'observation'; evidence: InspectionEvidence }
  | { state: 'partial' | 'empty'; diagnostic: ConstructorParameters<typeof ProviderError>[0] }

export interface InspectionProvider {
  manifest: ProviderManifest
  acquire: (fundIsin: string, context: ProviderContext) => Promise<InspectionAcquisitionResult>
  decode: (evidence: InspectionEvidence) => InspectionObservation
}

export function inspectionManifest(
  manifest: Omit<ProviderManifest, 'contractVersion'>
): ProviderManifest & { contractVersion: typeof compositionInspectionContractVersion } {
  return { ...manifest, contractVersion: compositionInspectionContractVersion }
}

const fail = (code: ConstructorParameters<typeof ProviderError>[0]): never => {
  throw new ProviderError(code)
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value.trim() || null
  return String(value)
}

function date(value: unknown): string {
  const token = text(value)
  if (!token || !/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(token)) return fail('date')
  const result = token.includes('-') ? token : `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6)}`
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result)
    return fail('date')
  return result
}

function decimalToken(value: unknown, required = true): string | null {
  if (value === null || value === undefined || value === '') {
    if (required) return fail('format')
    return null
  }
  const token = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null
  if (token === null || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token))
    return fail('format')
  const number = new Decimal(token)
  if (!number.isFinite()) return fail('format')
  return token
}

function sourceArtifact(evidence: InspectionEvidence): Uint8Array {
  if (
    typeof evidence.artifact.body !== 'string' ||
    typeof evidence.artifact.contentType !== 'string' ||
    !Number.isSafeInteger(evidence.artifact.bytes) ||
    typeof evidence.artifact.sha256 !== 'string'
  )
    return fail('format')
  let bytes: Buffer
  try {
    bytes = Buffer.from(evidence.artifact.body, 'base64')
  } catch {
    return fail('format')
  }
  if (
    bytes.toString('base64') !== evidence.artifact.body ||
    bytes.length !== evidence.artifact.bytes ||
    bytes.length === 0 ||
    bytes.length > 3_000_000 ||
    evidence.artifact.contentType.toLowerCase() !== 'application/json' ||
    createHash('sha256').update(bytes).digest('hex') !== evidence.artifact.sha256
  )
    return fail('format')
  return bytes
}

function row(
  raw: unknown,
  scope: InspectionScope,
  sourceRow: number,
  expectedDate: string
): InspectionRow {
  const value = asRecord(raw)
  const characteristics = asRecord(value.compositionCharacteristics)
  if (date(characteristics.date) !== expectedDate) return fail('date')
  const topLevelWeight = decimalToken(value.weight)
  const characteristicWeight = decimalToken(characteristics.weight, false)
  if (characteristicWeight !== null && new Decimal(characteristicWeight).cmp(topLevelWeight!) !== 0)
    return fail('conflict')
  const isin = text(characteristics.isin)
  const assetClass = text(characteristics.type)
  if (isin !== null && !validIsin(isin)) return fail('identity')
  if (assetClass?.toUpperCase().includes('EQUITY') && (!isin || !validIsin(isin))) return fail('identity')
  return {
    sourceRow,
    scope,
    name: text(characteristics.name),
    isin,
    ticker: text(characteristics.bbg),
    assetClass,
    weight: topLevelWeight!,
    weightUnit: 'fraction',
    quantity: decimalToken(characteristics.quantity, false),
    currency: text(characteristics.currency),
    sector: text(characteristics.sector),
    country: text(characteristics.countryOfRisk),
  }
}

function breakdownRow(
  raw: unknown,
  sourceRow: number,
  expectedDate: string
): InspectionRow {
  const value = asRecord(raw)
  const properties = asRecord(value.additionalProperties)
  const adjustedWeight = value.adjustedWeight ?? value.weight
  return row(
    {
      weight: adjustedWeight,
      compositionCharacteristics: {
        date: expectedDate.replaceAll('-', ''),
        name: properties.aggregationName ?? value.aggregationName,
        isin: properties.isin,
        bbg: properties.bbg,
        type: properties.type ?? 'EQUITY_ORDINARY',
        quantity: properties.quantity,
        currency: properties.currency,
        sector: properties.sector,
        countryOfRisk: properties.countryOfRisk,
      },
    },
    'partial-benchmark',
    sourceRow,
    expectedDate
  )
}

function productFor(evidence: InspectionEvidence, bytes: Uint8Array): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    return fail('format')
  }
  const products = asArray(asRecord(value).products)
  if (products.length !== 1) return fail(products.length === 0 ? 'empty' : 'format')
  const product = asRecord(products[0])
  if (String(product.productId) !== evidence.fundIsin) return fail('identity')
  return product
}

function checkRequest(evidence: InspectionEvidence): void {
  if (
    evidence.request.method !== 'POST' ||
    evidence.request.url !== evidence.sourceUrl ||
    typeof evidence.request.body !== 'string' ||
    evidence.request.body.length > 64_000 ||
    createHash('sha256').update(evidence.request.body).digest('hex') !== evidence.request.sha256
  )
    fail('format')
  try {
    const request = asRecord(JSON.parse(evidence.request.body))
    const products = asArray(request.productIds)
    const context = asRecord(request.context)
    if (products.length !== 1 || String(products[0]) !== evidence.fundIsin ||
        context.countryCode !== 'DEU' || context.languageCode !== 'de' || context.userProfileName !== 'RETAIL')
      fail('identity')
    const composition = asRecord(request.composition)
    const fields = asArray(composition.compositionFields)
    if (!fields.includes('date') || !fields.includes('isin') || !fields.includes('weight')) fail('format')
  } catch (error) {
    if (error instanceof ProviderError) throw error
    fail('format')
  }
}

export function validateInspectionEvidence(
  evidence: InspectionEvidence,
  provider: InspectionProvider
): void {
  const manifest = provider.manifest
  if (
    evidence.format !== 'composition-inspection-evidence/1' ||
    evidence.contractVersion !== compositionInspectionContractVersion ||
    evidence.providerId !== manifest.id ||
    evidence.providerVersion !== manifest.version ||
    manifest.contractVersion !== compositionInspectionContractVersion ||
    !validIsin(evidence.fundIsin) ||
    !manifest.capabilities.funds.includes(evidence.fundIsin)
  )
    fail('version')
  date(evidence.publicationDate)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(evidence.artifact.retrievedAt) || !Number.isFinite(Date.parse(evidence.artifact.retrievedAt)) ||
      Date.parse(evidence.publicationDate) > Date.parse(evidence.artifact.retrievedAt))
    fail('date')
  let url: URL | null = null
  try {
    url = new URL(evidence.sourceUrl)
  } catch {
    fail('format')
  }
  const validUrl = url
  if (!validUrl) throw new ProviderError('format')
  if (validUrl.protocol !== 'https:' || validUrl.username || validUrl.password || validUrl.hash) fail('format')
  sourceArtifact(evidence)
  if (
    evidence.artifact.url !== evidence.sourceUrl ||
    evidence.artifact.request?.method !== evidence.request.method ||
    evidence.artifact.request?.url !== evidence.request.url ||
    evidence.artifact.request?.sha256 !== evidence.request.sha256 ||
    evidence.artifact.request?.body !== evidence.request.body
  )
    fail('format')
  checkRequest(evidence)
}

export function decodeInspection(
  evidence: InspectionEvidence,
  provider: InspectionProvider
): InspectionObservation {
  validateInspectionEvidence(evidence, provider)
  const bytes = sourceArtifact(evidence)
  const product = productFor(evidence, bytes)
  const characteristics = asRecord(product.characteristics)
  if (String(characteristics.ISIN) !== evidence.fundIsin) return fail('identity')
  const asOf = date(characteristics.POSITION_AS_OF_DATE)
  if (asOf !== evidence.publicationDate) return fail('date')
  const breakdownDate = characteristics.FUND_BREAKDOWNS_AS_OF_DATE
  if (breakdownDate !== undefined && date(breakdownDate) !== asOf) return fail('date')
  const composition = asRecord(product.composition)
  const total = Number(composition.totalNumberOfInstruments)
  const compositionData = asArray(composition.compositionData)
  if (!Number.isSafeInteger(total) || total < 0) return fail('format')
  if (total === 0 || compositionData.length === 0) return fail('empty')
  if (total !== compositionData.length) return fail('partial')
  const rows = compositionData.map((item, index) => row(item, 'substitute-basket', index + 1, asOf))
  const equityIsins = rows.filter(item => item.assetClass?.toUpperCase().includes('EQUITY')).map(item => item.isin)
  if (new Set(equityIsins).size !== equityIsins.length) return fail('duplicate')
  const breakdowns = asArray(product.breakDowns)
  const benchmark = breakdowns.find(item => asRecord(item).aggregationField === 'INDEX_TOP10')
  const benchmarkData = benchmark ? asArray(asRecord(benchmark).breakDownData) : []
  const benchmarkRows = benchmarkData.map((item, index) => breakdownRow(item, index + 1, asOf))
  if (benchmark && benchmarkRows.length === 0) return fail('partial')
  return {
    format: 'composition-inspection/1',
    providerId: evidence.providerId,
    providerVersion: evidence.providerVersion,
    contractVersion: evidence.contractVersion,
    fundIsin: evidence.fundIsin,
    fundName: text(characteristics.SHARE_MARKETING_NAME) ?? text(characteristics.FUND_FUND_NAME) ?? evidence.fundIsin,
    asOf,
    retrievedAt: evidence.artifact.retrievedAt,
    sourceUrl: evidence.sourceUrl,
    responseSha256: evidence.artifact.sha256,
    requestSha256: evidence.request.sha256,
    responseBytes: evidence.artifact.bytes,
    totalReportedRows: total,
    rows,
    benchmarkRows,
    replicationMethod: text(characteristics.REPLICATION_METHODOLOGY) ?? text(characteristics.REPLICATION_METHOD),
    benchmarkName: text(characteristics.BENCHMARK_NAME),
    benchmarkTicker: text(characteristics.BENCHMARK_TICKER) ?? text(characteristics.INDEX_BLOOMBERG_TICKER),
    swapCounterparties: text(characteristics.FUND_SWAP_COUNTERPART),
    sourceLimits: [
      { id: 'substitute-basket', detail: 'The reported basket is the fund\'s substitute holdings. It is inspection evidence, not economic company exposure.' },
      { id: 'partial-benchmark', detail: benchmarkRows.length ? `${benchmarkRows.length} INDEX_TOP10 rows are a partial benchmark view, not a complete economic composition.` : 'The source did not provide a complete benchmark constituent list.' },
      { id: 'synthetic-economics', detail: 'The source reports an indirect unfunded swap. Counterparty names and benchmark identity do not establish a dated swap allocation ratio.' },
      { id: 'source-use', detail: 'Automated retention and reuse permission remain unsettled.' },
    ],
  }
}

export function inspectionFingerprint(observation: InspectionObservation): string {
  return JSON.stringify({
    fundIsin: observation.fundIsin,
    asOf: observation.asOf,
    fundName: observation.fundName,
    replicationMethod: observation.replicationMethod,
    benchmarkName: observation.benchmarkName,
    benchmarkTicker: observation.benchmarkTicker,
    swapCounterparties: observation.swapCounterparties,
    sourceLimits: observation.sourceLimits,
    rows: observation.rows,
    benchmarkRows: observation.benchmarkRows,
  })
}
