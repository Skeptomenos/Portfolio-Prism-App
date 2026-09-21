import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { validIsin, type Composition } from './composition'
import { compositionContractVersion, compositionPolicyVersion, ProviderError, type CompositionCandidate, type CompositionProvider, type ProviderEvidence, type SourceAccounting, type SourceRow } from './composition-provider'
const D = Decimal.clone({ precision: 256 })
const fail = (code: ConstructorParameters<typeof ProviderError>[0]): never => { throw new ProviderError(code) }
export const sourceHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export function checkedDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) return fail('date')
  return value
}
export function validateProviderEvidence(evidence: ProviderEvidence, provider: CompositionProvider) {
  const manifest = provider.manifest
  if (evidence.policyVersion !== compositionPolicyVersion || evidence.format !== 'composition-evidence/1' || evidence.contractVersion !== compositionContractVersion ||
      manifest.contractVersion !== compositionContractVersion || evidence.providerId !== manifest.id ||
      evidence.providerVersion !== manifest.version || evidence.parserVersion !== manifest.parserVersion) fail('version')
  if (!validIsin(evidence.fundIsin) || !manifest.capabilities.funds.includes(evidence.fundIsin)) fail('identity')
  checkedDate(evidence.publicationDate)
  if (!Array.isArray(evidence.artifacts) || !evidence.artifacts.length || evidence.artifacts.length > 8 || Buffer.byteLength(JSON.stringify(evidence)) > 32_000_000) fail('size')
  const roles = new Set<string>()
  for (const artifact of evidence.artifacts) {
    if (typeof artifact.role !== 'string' || roles.has(artifact.role)) fail('duplicate')
    roles.add(artifact.role)
    if (typeof artifact.body !== 'string' || artifact.status !== 200) fail('format')
    const bytes = Buffer.from(artifact.body, 'base64')
    if (bytes.toString('base64') !== artifact.body || bytes.length !== artifact.bytes || bytes.length > (artifact.role === 'page' ? 5_000_000 : 3_000_000) || bytes.length === 0 || sourceHash(bytes) !== artifact.sha256) fail('format')
    if (typeof artifact.retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(artifact.retrievedAt) || !Number.isFinite(Date.parse(artifact.retrievedAt)) || Date.parse(evidence.publicationDate) > Date.parse(artifact.retrievedAt)) fail('date')
    const url = new URL(artifact.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('format')
  }
}
function decimal(value: unknown) {
  if (typeof value !== 'string' || value.length > 128 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return fail('format')
  const exponent = /[eE]([+-]?\d+)$/.exec(value)
  if (exponent && Math.abs(Number(exponent[1])) > 100) return fail('format')
  const number = new D(value)
  if (!number.isFinite() || number.abs().gt('1e100')) return fail('format')
  return number
}
function accounting(rows: SourceRow[]): SourceAccounting {
  const sum = (list: SourceRow[], key: 'weightPercent' | 'marketValue' | 'notionalValue') => list.reduce((total,row) => total.add(row[key]), new D(0)).toFixed()
  const equity = rows.filter(row => row.assetClass === 'Equity'), other = rows.filter(row => row.assetClass !== 'Equity')
  return { sourceRows: rows.length, equityRows: equity.length, nonEquityRows: other.length,
    validEquityIsins: equity.filter(row => row.isin && validIsin(row.isin)).length, unresolvedEquityRows: equity.filter(row => !row.isin || !validIsin(row.isin)).length,
    reportedPercent: sum(rows,'weightPercent'), equityPercent: sum(equity,'weightPercent'), nonEquityPercent: sum(other,'weightPercent'),
    marketValue: sum(rows,'marketValue'), notionalValue: sum(rows,'notionalValue'),
    byAssetClass: [...new Set(rows.map(row => row.assetClass))].map(assetClass => {
      const group = rows.filter(row => row.assetClass === assetClass)
      return { assetClass, rows: group.length, weightPercent: sum(group,'weightPercent'), marketValue: sum(group,'marketValue'), notionalValue: sum(group,'notionalValue') }
    }) }
}
export function admitComposition(candidate: CompositionCandidate, evidence: ProviderEvidence): Composition {
  if (candidate.fundIsin !== evidence.fundIsin || !candidate.fundName?.trim()) fail('identity')
  if (checkedDate(candidate.asOf) !== evidence.publicationDate || !evidence.artifacts.some(artifact => artifact.sha256 === candidate.sha256 && artifact.retrievedAt === candidate.retrievedAt)) fail('date')
  if (candidate.parserVersion !== evidence.parserVersion) fail('version')
  if (candidate.completeness !== 'complete' || !Array.isArray(candidate.rows) || !candidate.rows.length) fail('partial')
  if (candidate.rows.length > 5000) fail('size')
  if (candidate.weightUnit !== 'percent' || candidate.weightBasis !== 'whole-published-holdings' || candidate.measure !== 'issuer-reported-allocation-estimate') fail('units')
  if (!candidate.evidenceChecks.length || candidate.evidenceChecks.some(check => check.state !== 'passed')) fail('partial')
  const ids = new Set<string>(), rowNumbers = new Set<number>()
  const rows = candidate.rows.map(row => {
    if (!Number.isSafeInteger(row.sourceRow) || row.sourceRow < 1 || rowNumbers.has(row.sourceRow)) return fail('duplicate')
    rowNumbers.add(row.sourceRow)
    if (typeof row.name !== 'string' || !row.name.trim() || typeof row.assetClass !== 'string' || !row.assetClass.trim() || !/^[A-Z]{3}$/.test(row.currency)) return fail('format')
    const weight = decimal(row.weightPercent); decimal(row.marketValue); decimal(row.notionalValue)
    if (weight.abs().gt(100) || (row.assetClass === 'Equity' && weight.lt(0))) return fail('weights')
    if (row.assetClass === 'Equity') {
      if (!row.isin || !validIsin(row.isin)) return fail('identity')
      if (ids.has(row.isin)) return fail('duplicate')
      ids.add(row.isin)
    }
    // Admission owns identity classification; a provider cannot label an invalid ID accepted.
    return { ...row, identifierPresence: row.isin ? 'present' as const : 'missing' as const,
      equityIdentity: row.assetClass === 'Equity' ? 'valid-isin' as const : 'not-equity' as const }
  })
  const totals = accounting(rows)
  if (!totals.equityRows || new D(totals.reportedPercent).sub(100).abs().gt('0.005') || new D(totals.equityPercent).gt(100)) fail('weights')
  return { fundIsin: candidate.fundIsin, fundName: candidate.fundName, asOf: candidate.asOf, retrievedAt: candidate.retrievedAt,
    sourceUrl: candidate.sourceUrl, termsUrl: candidate.termsUrl, sha256: candidate.sha256, parserVersion: 1,
    sourceParserVersion: candidate.parserVersion, weightUnit: 'percent', scope: 'full-holdings', measure: candidate.measure,
    estimateLimitation: candidate.estimateLimitation,
    provider: { id: evidence.providerId, version: evidence.providerVersion, contractVersion: evidence.contractVersion, policyVersion: evidence.policyVersion },
    rows: rows.filter(row => row.assetClass === 'Equity').map(row => ({ name: row.name, isin: row.isin, weightPercent: row.weightPercent, issue: null })),
    sourceRows: rows, sourceAccounting: totals, disclosedPercent: totals.reportedPercent, identifiedPercent: totals.equityPercent, missingPercent: '0',
    sourceChecks: [...candidate.evidenceChecks,
      { id: 'core-admission', state: 'passed', detail: 'Core validates exact identity/date, percent units, whole-table basis, unique equity ISINs and original signed accounting. No normalization or second FX conversion.', evidence: [candidate.sha256] },
      { id: 'local-use', state: 'pending', detail: 'Private automated retrieval, retention/replay and derived display permission remains unsettled. Public access and technical admission do not establish a reuse licence.', evidence: [candidate.termsUrl] }] }
}
