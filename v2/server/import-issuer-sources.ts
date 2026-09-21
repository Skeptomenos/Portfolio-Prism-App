// Explicit retained-file import. No broker or provider network requests.
import { randomUUID } from 'node:crypto'
import { loadIssuerEvidence } from './issuer-evidence'
import { issuerProfiles } from './issuer-profiles'
import { SnapshotStore } from './store'
const [directory, database, ...requested] = process.argv.slice(2)
if (!directory || !database) throw Error('Usage: tsx server/import-issuer-sources.ts PRIVATE_EVIDENCE_DIR COPIED_PRIVATE_DB [ISIN ...]')
const funds = requested.length ? requested : Object.keys(issuerProfiles)
if (new Set(funds).size !== funds.length || funds.some(isin => !issuerProfiles[isin])) throw Error('Unsupported or duplicate fund selection')
const store = new SnapshotStore(database)
try {
  for (const isin of funds) {
    const at = new Date().toISOString(), id = randomUUID()
    try {
      const source = store.saveIssuerAllocation(loadIssuerEvidence(directory, isin), at)
      console.log(JSON.stringify({ isin, status: 'success', date: source.asOf, sha256: source.sha256,
        equityRows: source.rows.length, measure: source.measure, identifiedPercent: source.identifiedPercent }))
    } catch {
      store.recordIssuerAttempt(isin, { id, at, status: 'failed', code: 'retained-import-failed' })
      console.error(JSON.stringify({ isin, status: 'failed', id, resolution: 'Check retained source manifest, receipts and qualification. Other sources and last-good data remain selected.' }))
      process.exitCode = 2
    }
  }
} finally { store.close() }
