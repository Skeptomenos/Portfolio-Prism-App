/** Controlled fault acceptance on an explicit private SQLite copy. No broker or source network access. */
import { writeFile, access } from 'node:fs/promises'
import { SnapshotStore } from '../server/store'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { ProviderError } from '../server/composition-provider'
import { isharesProvider } from '../server/ishares-provider'
import { overview } from '../server/overview'
import { exposure } from '../server/exposure'
import assert from 'node:assert/strict'

const [database, output] = process.argv.slice(2)
if (!database || !output) throw Error('Usage: operational-recovery.ts COPIED_DB NEW_REPORT.json')
await access(database)
try { await access(output); throw Error('Report already exists') } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
let store = new SnapshotStore(database)
const now = Date.now()
const view = () => exposure(overview(store.latest(), store.sources(), now, store.quantityObservations()), store.selectedCompositions(), null)
const before = view(), count = store.providerCompositionCount()
assert(before.compositions.length > 0, 'Saved sources required')
const failed = new ProviderRefreshService(store, [isharesProvider], signal => ({ signal, get: async () => { throw new ProviderError('http', 503) } }))
assert(failed.refresh()); await failed.settled()
assert.deepEqual(view(), before)
const failedAttempts = failed.status().attempts
assert(Object.values(failedAttempts).every(a => a.code === 'http' && a.httpStatus === 503))
await failed.close()
let entered!: () => void
const started = new Promise<void>(resolve => { entered = resolve })
let requests = 0
const cancelled = new ProviderRefreshService(store, [isharesProvider], signal => ({ signal, get: async () => {
  requests++; entered()
  return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
} }))
assert(cancelled.refresh()); await started
cancelled.refresh(true); cancelled.cancel(); await cancelled.settled()
assert.equal(requests, 1, 'Cancel must discard queued automatic work')
assert.deepEqual(view(), before)
assert.equal(store.providerCompositionCount(), count)
const cancellation = Object.values(cancelled.status().attempts).find(a => a.code === 'cancelled')
assert(cancellation)
await cancelled.close(); store.close(); store = new SnapshotStore(database)
assert.deepEqual(view(), before)
assert.equal(store.providerCompositionCount(), count)
assert.deepEqual(Object.values(store.providerAttempts()).find(a => a.code === 'cancelled'), cancellation)
store.close()
const result = { sourcesPreserved: before.compositions.length, recordCount: count, failurePreserved: true, cancellationPreserved: true, cancelledRequests: requests, restartEqual: true, safeFailureCodes: Object.values(failedAttempts).map(a => a.code), cancellationCode: cancellation.code }
await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify(result, null, 2))
