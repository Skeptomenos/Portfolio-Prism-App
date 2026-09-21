/** Private copied-data acceptance. Never run against the primary DB or an active writer.
 * No network/authentication. `exercise` deliberately changes inputs on a disposable copy. */
import { writeFile } from 'node:fs/promises'
import { SnapshotStore } from '../server/store'
import { PortfolioService } from '../server/service'
import type { Broker } from '../server/broker'
import { overview } from '../server/overview'
import { exposure } from '../server/exposure'
import { Decimal } from 'decimal.js'

const [database, output, mode = 'offline'] = process.argv.slice(2)
if (!database || !output || !['offline', 'exercise'].includes(mode)) throw Error('Usage: history-replay.ts PRIVATE_COPIED_DB NEW_REPORT [offline|exercise]')
let store = new SnapshotStore(database)
const baseline = store.history.runs().items.find(run => run.trigger === 'migration')?.latestCheckpoint
if (!baseline) throw Error('A migrated saved-data fixture is required')
const frozen = store.history.checkpoint(baseline.id)!
const initial = store.history.replay(baseline.id)
const current = overview(store.latest(), store.sources(), Date.parse(baseline.recordedAt), store.quantityObservations())
if (JSON.stringify(current) !== JSON.stringify(initial.valuations)) throw Error('Normalized observation changed saved valuation')
const expected = exposure(current, store.selectedCompositions(), store.compositionAttempt(), false, Date.parse(baseline.recordedAt))
if (JSON.stringify(expected) !== JSON.stringify(initial.result)) throw Error('History changed exposure or provenance')
const scenarios: string[] = ['migration', 'current-exposure-equivalence']
if (mode === 'exercise') {
  const original = store.latest()!, savedSources = store.sources()
  let next = original
  let failed = false, cancel = false, partial = false
  const broker: Broker = {
    authenticate: async () => {}, restore: async () => true, fetch: async () => { if (failed) throw Error('controlled failure'); return next }, logout() {}, close() {}, warning: () => null,
    readData: async (_sources, save, signal) => {
      for (const source of savedSources.filter(s => ['quotes', 'cash', 'instrumentDetails'].includes(s.id))) {
        save(partial ? { ...source, status: 'partial' } : source)
        if (cancel) { service.cancel(); signal.throwIfAborted() }
      }
    },
  }
  const service = new PortfolioService(broker, store)
  const sync = async () => { if (!service.sync()) throw Error('Sync rejected'); await service.settled() }
  await sync(); scenarios.push('unchanged-saved-input-sync')
  next = { ...original, fetchedAt: new Date().toISOString(), positions: original.positions.map((p, index) => index ? p : { ...p, quantity: new Decimal(p.quantity).add(1).toFixed() }) }
  await sync(); scenarios.push('controlled-differing-sync')
  partial = true; await sync(); partial = false; scenarios.push('partial')
  failed = true; await sync(); failed = false; scenarios.push('failure')
  cancel = true; await sync(); scenarios.push('cancel-after-holdings')
  const interrupted = store.history.start('broker-sync'); store.history.capture(interrupted, 'holdings')
  await service.close()
  store = new SnapshotStore(database)
  if (store.history.run(interrupted)?.run.status !== 'interrupted') throw Error('Restart did not mark interrupted run')
  scenarios.push('interrupted')
}
const before = JSON.stringify(store.history.checkpoint(baseline.id))
if (before !== JSON.stringify(frozen)) throw Error('Old checkpoint changed after later inputs')
const all = store.history.runs(100).items.flatMap(run => store.history.run(run.id)!.checkpoints)
for (const checkpoint of all) store.history.replay(checkpoint.id)
store.close(); store = new SnapshotStore(database)
if (JSON.stringify(store.history.checkpoint(baseline.id)) !== before) throw Error('Reopen changed old checkpoint')
for (const checkpoint of all) store.history.replay(checkpoint.id)
const runs = store.history.runs(100)
store.close()
await writeFile(output, JSON.stringify({ mode, scenarios, allCheckpointReplay: true, exactReopen: true, runs, baseline: initial, restartEqual: true, before: initial.result, after: initial.result }, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ mode, scenarios, checkpoints: all.length, allCheckpointReplay: true, exactReopen: true, report: output }))
