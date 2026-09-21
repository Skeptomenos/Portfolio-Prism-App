import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Decimal } from 'decimal.js'
import { issuerProfile } from './issuer-profiles'
import { parseColumnarIssuerCandidate, iusaParserVersion, iusaReviewVersion, type IssuerProfile, type IusaQualification, type SourceCheck } from './iusa-qualification'
import { parseLegacyIssuerCandidate } from './issuer-legacy'

const D = Decimal.clone({ precision: 256 })
export const issuerBundleVersion = 'retained-issuer-bundle/1'
export interface IssuerBundle {
  fundIsin: string
  profile: IssuerProfile
  parserVersion: string
  captures: { name: string; body: string; receipt: string }[]
  manifests: { name: string; body: string }[]
}
interface EvidenceSpec { asOf: string; files: string[] }
// Reviewed retained publications only. Future publications need a reviewed extension.
export const issuerEvidenceSpecs: Readonly<Record<string, EvidenceSpec>> = {
  IE0031442068: { asOf: '2026-09-09', files: ['IE0031442068-holdings-20260909-cli-repeat.json', 'IE0031442068-holdings-20260909-http.json'] },
  IE00B4L5Y983: { asOf: '2026-09-10', files: ['IE00B4L5Y983-holdings-20260910-http.json', 'IE00B4L5Y983-holdings-20260910-cli-repeat.json'] },
  IE00B53SZB19: { asOf: '2026-09-10', files: ['IE00B53SZB19-holdings-20260910-public.json', 'IE00B53SZB19-holdings-20260910-cli-repeat.json'] },
  IE00BYVQ9F29: { asOf: '2026-09-10', files: ['IE00BYVQ9F29-holdings-20260910-public.json', 'IE00BYVQ9F29-holdings-20260910-cli-repeat.json'] },
  IE00B3WJKG14: { asOf: '2026-09-10', files: ['IE00B3WJKG14-holdings-20260910-v2.json', 'IE00B3WJKG14-holdings-20260910-v2-cli-repeat.json'] },
  DE000A0F5UF5: { asOf: '2026-09-10', files: ['DE000A0F5UF5-holdings-discovery-20260911.json', 'DE000A0F5UF5-holdings-discovery-repeat-20260911.json', 'DE000A0F5UF5-holdings-public-20260911.csv', 'DE000A0F5UF5-holdings-public-repeat-20260911.csv', 'EXXT-discovery-page-20260911.html'] },
}
const manifestNames = ['manifest-2026-09-11.json', 'manifest-2026-09-11-expansion.json']
const receiptName = (name: string) => name === 'EXXT-discovery-page-20260911.html' ? 'EXXT-discovery-page-20260911.receipt.json' : `${name}.receipt.json`
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const boundedRead = (path: string, limit: number) => {
  if (statSync(path).size > limit) throw Error('size')
  const bytes = readFileSync(path)
  if (bytes.byteLength > limit) throw Error('size')
  return bytes
}
export function loadIssuerEvidence(directory: string, isin: string): IssuerBundle {
  const profile = issuerProfile(isin), spec = issuerEvidenceSpecs[isin]
  if (!profile || !spec) throw Error('unsupported issuer')
  return { fundIsin: isin, profile: { ...profile }, parserVersion: issuerBundleVersion,
    manifests: manifestNames.map(name => ({ name, body: boundedRead(join(directory, name), 2_000_000).toString('utf8') })),
    captures: spec.files.map(name => ({ name, body: boundedRead(join(directory, name), 3_000_000).toString('base64'),
      receipt: boundedRead(join(directory, receiptName(name)), 100_000).toString('utf8') })) }
}
function invalidEvidence(): IusaQualification {
  return { parserVersion: iusaParserVersion, reviewVersion: iusaReviewVersion, state: 'failed', eligibleForMonetaryExposure: false, candidate: null,
    checks: [{ id: 'retained-provenance', state: 'failed', detail: 'Issuer evidence is missing, changed, malformed or unbound. Restore the original bodies, manifests and receipts. Other selected funds remain usable.', evidence: [] }] }
}
function validateRoute(rawUrl: unknown, profile: IssuerProfile, spec: EvidenceSpec, name: string) {
  if (typeof rawUrl !== 'string') throw Error('url')
  const url = new URL(rawUrl)
  if (url.origin !== 'https://www.ishares.com' || url.username || url.password || url.hash) throw Error('url')
  let path: string
  let expected: Record<string, string>
  if (profile.sourceKind === 'columnar') {
    path = '/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data'
    expected = { appSubType: 'ISHARES', appType: 'PRODUCT_PAGE', component: 'holdings.all', locale: 'en_GB', portfolioId: profile.productId,
      targetSite: 'ishares-uk', userType: 'individual', excludeContent: 'true', asOfDate: spec.asOf.replaceAll('-', ''), includeConfig: 'true' }
  } else {
    const productPath = new URL(profile.productUrl).pathname
    path = name.endsWith('.html') ? productPath : `${productPath}/1478358465952.ajax`
    expected = name.endsWith('.html') ? { siteEntryPassthrough: 'true', switchLocale: 'y' }
      : name.endsWith('.csv') ? { fileType: 'csv', fileName: 'EXXT_holdings', dataType: 'fund' } : { tab: 'all', fileType: 'json' }
  }
  if (url.pathname !== path || [...url.searchParams].length !== Object.keys(expected).length ||
      Object.entries(expected).some(([key, value]) => url.searchParams.get(key) !== value)) throw Error('url')
}
export function qualifyIssuerBundle(bundle: IssuerBundle): IusaQualification {
  try {
    if (Buffer.byteLength(JSON.stringify(bundle)) > 20_000_000 || bundle.parserVersion !== issuerBundleVersion) throw Error('version or size')
    const profile = issuerProfile(bundle.fundIsin), spec = issuerEvidenceSpecs[bundle.fundIsin]
    if (!profile || !spec || JSON.stringify(bundle.profile) !== JSON.stringify(profile)) throw Error('profile')
    if (!Array.isArray(bundle.manifests) || bundle.manifests.length !== manifestNames.length ||
        new Set(bundle.manifests.map(m => m.name)).size !== manifestNames.length ||
        bundle.manifests.some(m => !manifestNames.includes(m.name) || Buffer.byteLength(m.body) > 2_000_000)) throw Error('manifests')
    const entries = new Map<string, { bytes: number; sha256: string }>()
    for (const manifest of bundle.manifests) {
      const parsed = JSON.parse(manifest.body)
      if (!Array.isArray(parsed.files)) throw Error('manifest')
      for (const entry of parsed.files) {
        if (typeof entry.file !== 'string' || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('manifest')
        const prior = entries.get(entry.file)
        if (prior && (prior.bytes !== entry.bytes || prior.sha256 !== entry.sha256)) throw Error('manifest conflict')
        entries.set(entry.file, { bytes: entry.bytes, sha256: entry.sha256 })
      }
    }
    if (!Array.isArray(bundle.captures) || bundle.captures.length !== spec.files.length ||
        new Set(bundle.captures.map(c => c.name)).size !== spec.files.length || bundle.captures.some(c => !spec.files.includes(c.name))) throw Error('captures')
    const verified = spec.files.map(name => {
      const capture = bundle.captures.find(c => c.name === name)!
      if (typeof capture.body !== 'string' || typeof capture.receipt !== 'string') throw Error('capture')
      const bytes = Buffer.from(capture.body, 'base64'), receiptBytes = Buffer.from(capture.receipt)
      if (bytes.toString('base64') !== capture.body || bytes.byteLength > 3_000_000 || receiptBytes.byteLength > 100_000) throw Error('encoding or size')
      for (const [file, body] of [[name, bytes], [receiptName(name), receiptBytes]] as const) {
        const entry = entries.get(file)
        if (!entry || entry.bytes !== body.byteLength || entry.sha256 !== hash(body)) throw Error('manifest binding')
      }
      const receipt = JSON.parse(capture.receipt)
      validateRoute(receipt.url, profile, spec, name)
      if (receipt.status !== 200 || receipt.bytes !== bytes.byteLength || receipt.sha256 !== hash(bytes) ||
          typeof receipt.retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(receipt.retrievedAt) ||
          !Number.isFinite(Date.parse(receipt.retrievedAt)) || Date.parse(receipt.retrievedAt) < Date.parse(spec.asOf)) throw Error('receipt')
      return { bytes, retrievedAt: receipt.retrievedAt }
    })
    const parse = (index: number) => profile.sourceKind === 'columnar'
      ? parseColumnarIssuerCandidate(verified[index].bytes, verified[index].retrievedAt, profile)
      : parseLegacyIssuerCandidate(verified[index].bytes, verified[index].retrievedAt, profile, verified[index + 2].bytes, verified[4].bytes)
    const candidate = parse(0), second = parse(1)
    if (candidate.asOf !== spec.asOf || second.asOf !== spec.asOf) throw Error('publication date')
    const equity = candidate.rows.filter(row => row.assetClass === 'Equity')
    const ids = equity.filter(row => row.equityIdentity === 'valid-isin').map(row => row.isin)
    const checks: SourceCheck[] = [
      { id: 'retained-provenance', state: 'passed', detail: 'Replay rechecked body and receipt byte hashes, manifest sizes, trusted profile, version and exact issuer routes.', evidence: verified.map(c => hash(c.bytes)) },
      { id: 'source-format', state: 'passed', detail: 'Reviewed product, dated whole holdings table, explicit percentage units and aligned source rows validated.', evidence: [candidate.sha256, profile.productUrl] },
      { id: 'weight-accounting', state: new D(candidate.accounting.reportedPercent).sub(100).abs().lte('0.005') && new D(candidate.accounting.equityPercent).lte(100) ? 'passed' : 'failed', detail: 'Signed weights retained without normalization. Total must be within 0.005 percentage points of 100; admitted equity cannot exceed 100%. This is a consistency guard, not completeness or NAV proof.', evidence: [candidate.sha256] },
      { id: 'long-only-equity', state: equity.some(row => new D(row.weightPercent).lt(0)) ? 'failed' : 'passed', detail: 'Signed equity cannot enter the long-only allocation measure; non-equity remains separate.', evidence: [candidate.sha256] },
      { id: 'security-identifiers', state: candidate.accounting.unresolvedEquityRows || new Set(ids).size !== ids.length ? 'pending' : 'passed', detail: 'Every equity row needs a valid unique security ISIN. Names and tickers do not establish identity.', evidence: [candidate.sha256] },
      { id: 'bounded-repeat', state: JSON.stringify(candidate.rows) === JSON.stringify(second.rows) ? 'passed' : 'failed', detail: 'Independent retained same-date response must reproduce every canonical row.', evidence: [candidate.sha256, second.sha256] },
      { id: 'fund-value-basis', state: 'passed', detail: 'Whole published holdings allocation estimate; no accounting NAV or full economic exposure claim.', evidence: [profile.productUrl] },
      { id: 'non-equity-scope', state: 'passed', detail: 'Cash, collateral, futures and other non-equity records remain in source accounting; zero reported weight does not establish zero economic exposure.', evidence: [candidate.sha256] },
      { id: 'local-use', state: 'pending', detail: 'Private automated retention, replay and derived display permission remains unsettled. Technical readiness does not establish reuse rights or unattended retrieval.', evidence: [profile.termsUrl] },
    ]
    const technical = checks.filter(check => check.id !== 'local-use')
    const state = technical.some(check => check.state === 'failed') ? 'failed' : technical.some(check => check.state === 'pending') ? 'open' : 'ready'
    return { parserVersion: iusaParserVersion, reviewVersion: iusaReviewVersion, state, eligibleForMonetaryExposure: state === 'ready', candidate, checks }
  } catch { return invalidEvidence() }
}
export function qualifyRetainedIssuer(directory: string, isin: string): IusaQualification {
  try { return qualifyIssuerBundle(loadIssuerEvidence(directory, isin)) } catch { return invalidEvidence() }
}
