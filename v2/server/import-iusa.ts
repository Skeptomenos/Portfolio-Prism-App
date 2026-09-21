// Explicit import of retained private evidence. No network/broker access.
import { randomUUID } from 'node:crypto'
import { loadIusaEvidence } from './iusa-evidence'
import { iusaComposition } from './iusa-composition'
import { SnapshotStore } from './store'
const [directory, database] = process.argv.slice(2)
if (!directory || !database || process.argv.length !== 4) throw Error('Usage: tsx server/import-iusa.ts PRIVATE_EVIDENCE_DIR COPIED_PRIVATE_DB')
const attemptId = randomUUID()
let stage = 'qualification'
let store: SnapshotStore | null = null
try {
  const bundle = loadIusaEvidence(directory)
  // Fail before opening/migrating storage when the source is not technically eligible.
  const qualified = iusaComposition(bundle)
  stage = 'persistence'
  store = new SnapshotStore(database)
  store.saveIusaAllocation(bundle, new Date().toISOString())
  console.log(JSON.stringify({ attemptId, status: 'success', source: qualified.sourceParserVersion, date: qualified.asOf,
    sha256: qualified.sha256, equityRows: qualified.rows.length, scope: qualified.scope,
    measure: qualified.measure, retainedVersions: store.iusaAllocationCount(),
    rights: 'Unsettled private reuse permission; no unattended retrieval or redistribution licence established' }))
} catch {
  console.error(JSON.stringify({ attemptId, status: 'failed', stage,
    resolution: stage === 'qualification' ? 'Run qualify-iusa.ts and inspect the criterion-level private report. Database was not opened.' : 'Check the copied database and source conflict; preserve the last-good backup before retrying.' }))
  process.exitCode = 1
} finally { store?.close() }
