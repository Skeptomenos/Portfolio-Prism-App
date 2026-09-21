/** Explicit private-copy acceptance. Adds a synthetic ledger connection without
 * network or system credentials. Never run against the primary portfolio. */
import { writeFileSync } from 'node:fs'
import { SnapshotStore } from '../server/store'
import { BrokerConnections } from '../server/broker-connections'
import { bundledPluginDescriptors, createPluginRegistry } from '../server/plugin-registry'
import { syntheticPlugin, memoryVaults, type SyntheticControl } from './synthetic-broker'
const [path,output] = process.argv.slice(2)
if (!path || !output) throw Error('Usage: broker-connection-replay.ts PRIVATE_COPIED_DB NEW_REPORT')
const controls = new Map<string,SyntheticControl>(), vaults = memoryVaults()
const registry = createPluginRegistry([...bundledPluginDescriptors,syntheticPlugin(controls)])
let store = new SnapshotStore(path,registry)
const now = Date.now(), baseline = store.overview(now), frozen: [string,string][] = []
let cursor: string | null = null
 do {
  const page = store.history.runs(100,cursor)
  for (const run of page.items) for (const cp of store.history.run(run.id)!.checkpoints) frozen.push([cp.id,JSON.stringify(store.history.checkpoint(cp.id))])
  cursor = page.nextCursor
 } while(cursor)
const host = new BrokerConnections(store,{status:()=>({connected:false,phase:'disconnected',error:null,activeOperation:null}),authenticate:()=>false,sync:()=>false,restore:()=>false,cancel(){},logout:()=>true,settled:async()=>{}},vaults.factory)
const connection = host.add('synthetic-ledger')
host.authenticate(connection.id,{'access-code':'fixture-only'}); await host.settled()
const combined = store.overview(now)
if (JSON.stringify(combined.rows.slice(0,baseline.rows.length)) !== JSON.stringify(baseline.rows)) throw Error('Unrelated connection changed')
controls.set(connection.id,{partial:true}); host.sync(connection.id); await host.settled()
if (JSON.stringify(store.overview(now)) !== JSON.stringify(combined)) throw Error('Partial holdings replaced accepted inputs')
controls.set(connection.id,{wait:true}); host.sync(connection.id); await host.enable(connection.id,false)
await host.close(); store.close()
// Missing connector after restart does not remove canonical accepted inputs.
store = new SnapshotStore(path)
if (JSON.stringify(store.overview(now)) !== JSON.stringify(combined)) throw Error('Restart changed saved results')
for (const [id,value] of frozen) {
 if (JSON.stringify(store.history.checkpoint(id)) !== value) throw Error('Old checkpoint changed')
 store.history.replay(id)
}
const runs = store.history.runs(100).items
for (const run of runs) for (const cp of store.history.run(run.id)!.checkpoints) store.history.replay(cp.id)
const report = {oldCheckpointsUnchanged:frozen.length,allReplay:true,exactRestart:true,primaryPositionsUnchanged:baseline.rows.length,combinedPositions:combined.rows.length,syntheticCurrency:combined.totals.find(t=>t.currency==='USD')?.currency,partialRejected:true,cancelled: runs.some(r=>r.status==='cancelled'),missingConnectorPreservesData:true}
store.close()
writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx',mode:0o600})
console.log(JSON.stringify(report))
