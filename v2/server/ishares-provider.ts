import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { issuerProfile, issuerProfiles } from './issuer-profiles'
import { parseColumnarIssuerCandidate, type IssuerCandidate, type IssuerProfile } from './iusa-qualification'
import { parseLegacyIssuerCandidate } from './issuer-legacy'
import { compositionContractVersion, compositionPolicyVersion, ProviderError, type CompositionCandidate, type CompositionProvider, type ProviderEvidence, type SourceArtifact, type SourceCheck } from './composition-provider'

const D = Decimal.clone({ precision: 256 })
const providerId = 'ishares-bundled'
const providerVersion = '1.0.0'
const parserVersion = 'ishares-composition/1'
const termsUrl = 'https://www.ishares.com/uk/individual/en/compliance/terms-and-conditions'
const profiles = Object.freeze(Object.values(issuerProfiles))
const fail = (code: ConstructorParameters<typeof ProviderError>[0]): never => { throw new ProviderError(code) }

export const isharesProviderManifest = {
  id: providerId,
  version: providerVersion,
  contractVersion: compositionContractVersion,
  parserVersion,
  capabilities: { discovery: 'direct-http' as const, funds: profiles.map(profile => profile.fundIsin) as readonly string[] },
  sourceConstraints: { access: 'public-no-credentials' as const, retention: 'unsettled-private-use' as const, termsUrl },
}

function bytes(artifact: SourceArtifact): Buffer {
  const value = Buffer.from(artifact.body, 'base64')
  if (value.toString('base64') !== artifact.body || value.length !== artifact.bytes || createHash('sha256').update(value).digest('hex') !== artifact.sha256) fail('format')
  return value
}

function text(artifact: SourceArtifact): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes(artifact)) } catch { return fail('format') }
}
function requiredArtifact(artifacts: SourceArtifact[], role: string): SourceArtifact {
  const artifact = artifacts.find(item => item.role === role)
  if (!artifact) return fail('partial')
  return artifact
}

function escaped(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function discoverDate(page: string, retrievedAt: string, profile: IssuerProfile): string {
  let token: unknown
  if (profile.sourceKind === 'columnar') {
    const configs = [...page.matchAll(/componentprops="([^"]*)"/g)].map(match => {
      try { return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&#34;', '"').replaceAll('&amp;', '&')) } catch { return null }
    }).filter(config => config?.componentId === 'holdings' && config.initAsOfDates !== undefined)
    if (configs.length !== 1) return fail('discovery')
    const config = configs[0]
    if (String(config.context?.productId) !== profile.productId || config.context?.ticker !== profile.ticker || config.initSelectedTab !== 'all') return fail('identity')
    token = config.initAsOfDates?.all
  } else {
    const sections = [...page.matchAll(/<div[^>]*id="allHoldingsTab"[^>]*>([\s\S]*?)<\/select>/g)]
    if (sections.length !== 1) return fail('discovery')
    const options = [...sections[0][1].matchAll(/<option\b([^>]*)>/g)].filter(match => /\bselected(?:\s|=|$)/.test(match[1]))
    if (options.length !== 1) return fail('discovery')
    token = /\bvalue="(\d{8})"/.exec(options[0][1])?.[1]
  }
  if (typeof token !== 'string' || !/^\d{8}$/.test(token)) return fail('date')
  const date = `${token.slice(0,4)}-${token.slice(4,6)}-${token.slice(6)}`
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || Date.parse(date) > Date.parse(retrievedAt)) return fail('date')
  return date
}

function productPageUrl(profile: IssuerProfile): string { return profile.sourceKind === 'legacy' ? `${profile.productUrl}?siteEntryPassthrough=true&switchLocale=y` : profile.productUrl }
function columnarUrl(profile: IssuerProfile, asOf: string): string {
  const params = new URLSearchParams({ appSubType: 'ISHARES', appType: 'PRODUCT_PAGE', component: 'holdings.all', locale: 'en_GB', portfolioId: profile.productId, targetSite: 'ishares-uk', userType: 'individual', excludeContent: 'true', asOfDate: asOf.replaceAll('-', ''), includeConfig: 'true' })
  return `https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data?${params}`
}
function legacyUrl(profile: IssuerProfile, query: string): string { return `${profile.productUrl}/1478358465952.ajax?${query}` }

function verifyPage(profile: IssuerProfile, page: string): void {
  const normalized = page.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('®', '')
  if (!new RegExp(escaped(profile.fundIsin), 'i').test(normalized) || !new RegExp(`(?:portfolioId|productId)[^\\d]{0,30}${escaped(profile.productId)}`, 'i').test(normalized) || !normalized.toLowerCase().includes(profile.fundName.toLowerCase()) || (profile.shareClassName && !normalized.toLowerCase().includes(profile.shareClassName.toLowerCase()))) fail('identity')
}

function checkRows(candidate: IssuerCandidate, evidence: ProviderEvidence): SourceCheck[] {
  const reported = new D(candidate.accounting.reportedPercent)
  const equity = candidate.rows.filter(row => row.assetClass === 'Equity')
  const ids = equity.map(row => row.isin).filter((value): value is string => Boolean(value))
  return [
    { id: 'source-format', state: 'passed', detail: 'Exact iShares holdings scope, row alignment and source fields validated by the profile parser.', evidence: [candidate.sha256] },
    { id: 'fund-identity', state: 'passed', detail: 'Product page and holdings response identify the requested fund and share class.', evidence: [evidence.artifacts[0].url, evidence.artifacts[1].sha256] },
    { id: 'publication-date', state: candidate.asOf === evidence.publicationDate ? 'passed' : 'failed', detail: 'The selected holdings date is bound to the source response, not the NAV or retrieval date.', evidence: [evidence.publicationDate, candidate.asOf] },
    { id: 'weight-accounting', state: reported.sub(100).abs().lte('0.005') && new D(candidate.accounting.equityPercent).lte(100) ? 'passed' : 'failed', detail: 'Original signed whole-published-holdings weights are retained without normalization.', evidence: [candidate.sha256] },
    { id: 'security-identifiers', state: candidate.accounting.unresolvedEquityRows === 0 && new Set(ids).size === ids.length ? 'passed' : 'failed', detail: 'Every equity row must have a valid unique security ISIN for core admission.', evidence: [candidate.sha256] },
    { id: 'non-equity-scope', state: 'passed', detail: 'Signed non-equity rows remain in source accounting and are not admitted as ordinary equity.', evidence: [candidate.sha256] },
  ]
}

function toCandidate(evidence: ProviderEvidence, profile: IssuerProfile): CompositionCandidate {
  const pageArtifact = requiredArtifact(evidence.artifacts, 'page')
  const holdingsArtifact = requiredArtifact(evidence.artifacts, 'holdings')
  verifyPage(profile, text(pageArtifact))
  const discovered = discoverDate(text(pageArtifact), pageArtifact.retrievedAt, profile)
  if (discovered !== evidence.publicationDate) fail('date')
  const expectedPage = productPageUrl(profile)
  if (pageArtifact.url !== expectedPage) fail('identity')
  const expectedHoldings = profile.sourceKind === 'columnar' ? columnarUrl(profile, evidence.publicationDate) : legacyUrl(profile, 'tab=all&fileType=json')
  if (holdingsArtifact.url !== expectedHoldings) fail('identity')
  if (profile.sourceKind === 'legacy' && requiredArtifact(evidence.artifacts, 'csv').url !== legacyUrl(profile, 'fileType=csv&fileName=EXXT_holdings&dataType=fund')) fail('identity')
  if (evidence.artifacts.length !== (profile.sourceKind === 'legacy' ? 3 : 2)) fail('format')
  let parsed: IssuerCandidate | undefined
  try {
    parsed = profile.sourceKind === 'columnar'
      ? parseColumnarIssuerCandidate(bytes(holdingsArtifact), holdingsArtifact.retrievedAt, profile)
      : parseLegacyIssuerCandidate(bytes(holdingsArtifact), holdingsArtifact.retrievedAt, { ...profile, expectedAsOf: evidence.publicationDate }, bytes(requiredArtifact(evidence.artifacts, 'csv')), bytes(pageArtifact))
  } catch (error) {
    if (error instanceof ProviderError) throw error
    fail('format')
  }
  const decoded: IssuerCandidate = parsed ?? fail('format')
  if (decoded.fundIsin !== evidence.fundIsin || decoded.asOf !== evidence.publicationDate) fail(decoded.fundIsin !== evidence.fundIsin ? 'identity' : 'date')
  const checks = checkRows(decoded, evidence)
  if (checks.some(check => check.state !== 'passed')) fail('partial')
  return {
    fundIsin: profile.fundIsin, fundName: profile.shareClassName ?? profile.fundName, asOf: decoded.asOf, retrievedAt: holdingsArtifact.retrievedAt,
    sourceUrl: profile.productUrl, termsUrl: profile.termsUrl, sha256: decoded.sha256, parserVersion,
    completeness: 'complete', weightUnit: 'percent', weightBasis: 'whole-published-holdings', measure: 'issuer-reported-allocation-estimate',
    rows: decoded.rows, evidenceChecks: checks,
    estimateLimitation: profile.estimateLimitation,
  }
}

export const isharesProvider: CompositionProvider = {
  manifest: isharesProviderManifest,
  async acquire(fundIsin, context) {
    const profile = issuerProfile(fundIsin)
    if (!profile) return { state: 'partial', diagnostic: 'identity' }
    try {
      const page = await context.get(productPageUrl(profile), 'page', 'html')
      const retrievedAt = page.retrievedAt
      const pageText = text(page)
      verifyPage(profile, pageText)
      const publicationDate = discoverDate(pageText, retrievedAt, profile)
      const holdingsUrl = profile.sourceKind === 'columnar' ? columnarUrl(profile, publicationDate) : legacyUrl(profile, 'tab=all&fileType=json')
      const holdings = await context.get(holdingsUrl, 'holdings', 'json')
      const artifacts = [page, holdings]
      if (profile.sourceKind === 'legacy') artifacts.push(await context.get(legacyUrl(profile, 'fileType=csv&fileName=EXXT_holdings&dataType=fund'), 'csv', 'csv'))
      const evidence: ProviderEvidence = { format: 'composition-evidence/1', providerId, providerVersion, contractVersion: compositionContractVersion, parserVersion, policyVersion: compositionPolicyVersion, fundIsin, publicationDate, artifacts }
      toCandidate(evidence, profile)
      return { state: 'publication', evidence }
    } catch (error) {
      throw error
    }
  },
  decode(evidence) {
    const profile = issuerProfile(evidence.fundIsin)
    if (!profile) fail('identity')
    return toCandidate(evidence, profile)
  },
}

export default isharesProvider
