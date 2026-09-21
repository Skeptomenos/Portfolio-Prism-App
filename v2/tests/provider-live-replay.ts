/** Explicit acceptance utility. Use only an isolated SQLite backup; never the user's live database. */
import { writeFile } from 'node:fs/promises'
import { SnapshotStore } from '../server/store'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { overview } from '../server/overview'
import { exposure } from '../server/exposure'

const [database, output, mode] = process.argv.slice(2)
if (!database || !output || !['refresh', 'offline'].includes(mode)) throw Error('Usage: provider-live-replay.ts COPIED_DB NEW_REPORT refresh|offline')
const store = new SnapshotStore(database)
const selected = () => store.selectedCompositions()
const view = () => exposure(overview(store.latest(), store.sources(), Date.now(), store.quantityObservations()), selected(), null)
const before = view()
const host = new ProviderRefreshService(store)
if (mode === 'refresh') {
  if (!host.refresh()) throw Error('No supported held funds available for refresh')
  await host.settled()
}
const after = view(), attempts = host.status(), count = store.providerCompositionCount()
await host.close(); store.close()
const restarted = new SnapshotStore(database)
const replay = exposure(overview(restarted.latest(), restarted.sources(), Date.now(), restarted.quantityObservations()), restarted.selectedCompositions(), null)
if (JSON.stringify(after) !== JSON.stringify(replay)) throw Error('Offline restart changed exposure')
restarted.close()
await writeFile(output, JSON.stringify({ before, after, attempts, count, restartEqual: true }, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ report: output, mode, count, restartEqual: true, sources: after.compositions.map(s => ({ isin: s.fundIsin, asOf: s.asOf, hash: s.sha256, rows: s.sourceRows?.length })), attempts: attempts.attempts }, null, 2))
