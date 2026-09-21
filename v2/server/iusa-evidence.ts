import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { qualifyIusa, iusaParserVersion, iusaReviewVersion, type IusaQualification } from './iusa-qualification'

export const iusaEvidenceFiles = [
  'IE0031442068-holdings-20260909-cli-repeat.json',
  'IE0031442068-holdings-20260909-http.json',
] as const
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const boundedRead = (path: string, limit: number): Buffer => {
  if (statSync(path).size > limit) throw Error('size')
  const bytes = readFileSync(path)
  if (bytes.byteLength > limit) throw Error('size')
  return bytes
}

// Fixed retained files, not a client-supplied path/URL or network acquisition endpoint.
export interface IusaEvidenceBundle {
  parserVersion: typeof iusaParserVersion
  manifest: string
  captures: { name: string; body: string; receipt: string }[]
}
export function loadIusaEvidence(directory: string): IusaEvidenceBundle {
  return { parserVersion: iusaParserVersion,
    manifest: boundedRead(join(directory, 'manifest-2026-09-11.json'), 1_000_000).toString('utf8'),
    captures: iusaEvidenceFiles.map(name => ({ name,
      body: boundedRead(join(directory, name), 3_000_000).toString('base64'),
      receipt: boundedRead(join(directory, `${name}.receipt.json`), 20_000).toString('utf8') })) }
}
export function qualifyRetainedIusa(directory: string): IusaQualification {
  try { return qualifyIusaEvidence(loadIusaEvidence(directory)) } catch { return invalidEvidence() }
}
function invalidEvidence(): IusaQualification {
  return { parserVersion: iusaParserVersion, reviewVersion: iusaReviewVersion, state: 'failed', eligibleForMonetaryExposure: false, candidate: null,
    checks: [{ id: 'retained-provenance', state: 'failed', detail: 'Retained IUSA body, manifest or companion receipt is missing, changed or unbound. Restore the original evidence; the selected composition is unchanged.', evidence: [] }] }
}
export function qualifyIusaEvidence(bundle: IusaEvidenceBundle): IusaQualification {
  try {
    if (bundle.parserVersion !== iusaParserVersion || Buffer.byteLength(JSON.stringify(bundle)) > 10_000_000 || bundle.captures.length !== 2) throw Error('version or size')
    const manifest = JSON.parse(bundle.manifest)
    if (!Array.isArray(manifest.files)) throw Error('manifest')
    const entries = new Map<string, string>()
    for (const entry of manifest.files) {
      if (typeof entry.file !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('manifest')
      if (entries.has(entry.file) && entries.get(entry.file) !== entry.sha256) throw Error('manifest')
      entries.set(entry.file, entry.sha256)
    }
    const readVerified = (name: string, limit: number) => {
      const capture = bundle.captures.find(c => c.name === name || `${c.name}.receipt.json` === name)
      if (!capture) throw Error('capture')
      const bytes = name.endsWith('.receipt.json') ? Buffer.from(capture.receipt) : Buffer.from(capture.body, 'base64')
      if (bytes.byteLength > limit) throw Error('size')
      if (entries.get(name) !== hash(bytes)) throw Error('manifest')
      return bytes
    }
    const captures = iusaEvidenceFiles.map(name => {
      const bytes = readVerified(name, 3_000_000)
      const receipt = JSON.parse(readVerified(`${name}.receipt.json`, 20_000).toString('utf8'))
      const url = new URL(receipt.url)
      const expected: Record<string, string> = {
        appSubType: 'ISHARES', appType: 'PRODUCT_PAGE', component: 'holdings.all', locale: 'en_GB',
        portfolioId: '251900', targetSite: 'ishares-uk', userType: 'individual', excludeContent: 'true',
        asOfDate: '20260909', includeConfig: 'true',
      }
      if (url.origin !== 'https://www.ishares.com' || url.username || url.password || url.hash ||
          url.pathname !== '/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data' ||
          [...url.searchParams].length !== Object.keys(expected).length ||
          Object.entries(expected).some(([k,v]) => url.searchParams.get(k) !== v) ||
          receipt.status !== 200 || receipt.bytes !== bytes.byteLength || receipt.sha256 !== hash(bytes) ||
          typeof receipt.retrievedAt !== 'string') throw Error('receipt')
      return { bytes, retrievedAt: receipt.retrievedAt }
    })
    const report = qualifyIusa(captures[0].bytes, captures[0].retrievedAt, captures[1])
    if (report.candidate && report.candidate.asOf !== '2026-09-09') throw Error('receipt date')
    report.checks.unshift({ id: 'retained-provenance', state: 'passed', detail: 'Both original bodies and independent receipts match the retained manifest. Exact allowlisted fund/date requests are bound to their byte hashes.', evidence: captures.map(c => hash(c.bytes)) })
    return report
  } catch {
    return invalidEvidence()
  }
}
