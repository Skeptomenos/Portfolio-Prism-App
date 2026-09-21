/** Offline acceptance on a disposable SQLite-consistent copy; no broker/credentials. */
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
import { SnapshotStore } from '../server/store'
import { Decimal } from 'decimal.js'
const [path, report] = process.argv.slice(2)
if (!path || !report || path.includes('.portfolio-prism-v2/')) throw Error('Provide a disposable copied database and new private report')
const db = new DatabaseSync(path)
const retained = () => db.prepare('SELECT id,sha256,manifest_sha256 FROM history_checkpoints ORDER BY seq').all()
const before = retained()
const D = Decimal.clone({ precision: 256 })
let store = new SnapshotStore(path)
const values = store.overview()
const decisions = JSON.stringify(store.investigationReport())
const replayAll = () => {
  for (const row of before) {
    const replay = store.history.replay(String(row.id))
    for (const group of replay.result.coverage) {
      assert(new D(group.knownCompanyValue).add(group.unresolvedValue).add(group.nonCompanyValue ?? '0').eq(group.pricedSecurities), 'checkpoint conservation')
    }
  }
}
replayAll()
store.close(); store = new SnapshotStore(path)
replayAll()
assert.deepEqual(store.overview(), values)
assert.equal(JSON.stringify(store.investigationReport()), decisions)
assert.deepEqual(retained(), before)
assert.equal(values.rows.find(r => r.isin === 'CA87320M2004')?.value, null)
store.close(); db.close()
const result = { checkpoints: before.length, exactHashesPreserved: true, replayAndReopen: true, decimalConservation: true, taatUnknown: true, decisionsPreserved: true }
writeFileSync(report, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 })
console.log(result)
