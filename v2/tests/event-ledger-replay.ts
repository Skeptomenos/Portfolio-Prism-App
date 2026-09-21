import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SnapshotStore } from '../server/store'
import { tradeRepublicEvents } from '../server/trade-republic-events'
const [path,reportPath]=process.argv.slice(2)
if(!path||!reportPath||resolve(path)===resolve(process.env.HOME??'', '.portfolio-prism-v2/portfolio.sqlite'))throw Error('Use an explicit disposable SQLite-consistent copy and report path')
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const original=new DatabaseSync(path,{readOnly:true})
const tables=original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'ledger_%' ORDER BY name").all().map(r=>String(r.name))
const tableHashes=(db:DatabaseSync)=>Object.fromEntries(tables.map(t=>[t,hash(db.prepare(`SELECT * FROM "${t.replaceAll('"','""')}" ORDER BY rowid`).all())]))
const before=tableHashes(original),version=original.prepare('PRAGMA user_version').get()?.user_version
if(original.prepare("SELECT count(*) AS n FROM history_runs WHERE status='running'").get()?.n!==0)throw Error('Copy contains an active operation; obtain a quiescent copy')
const checkpointIds=original.prepare('SELECT id FROM history_checkpoints ORDER BY seq').all().map(r=>String(r.id));original.close()
let store=new SnapshotStore(path)
const checkpoints=checkpointIds.map(id=>store.history.checkpoint(id))
if(checkpoints.some(c=>c?.replay.state!=='available'))throw Error('Original checkpoint replay unavailable')
const numericalReplays=checkpointIds.map(id=>hash(store.history.replay(id)))
const overview=hash(store.overview(0)),batch=tradeRepublicEvents(store.sources(),store.retainedCashEvidence())
if(!batch)throw Error('No saved timeline evidence on this private copy')
store.ledger.save(store.connections.defaultId,batch)
const first=store.ledger.read(store.connectionInputs())
store.close();store=new SnapshotStore(path)
const second=store.ledger.read(store.connectionInputs())
if(hash(first)!==hash(second))throw Error('Ledger changed across offline reopen')
if(hash(store.overview(0))!==overview)throw Error('Current exposure inputs changed')
if(hash(checkpointIds.map(id=>store.history.checkpoint(id)))!==hash(checkpoints))throw Error('Old checkpoints changed')
if(hash(checkpointIds.map(id=>hash(store.history.replay(id))))!==hash(numericalReplays))throw Error('Numerical checkpoint replay changed')
store.close()
const after=new DatabaseSync(path,{readOnly:true})
if(hash(tableHashes(after))!==hash(before))throw Error('An original table changed')
const schema=after.prepare('PRAGMA user_version').get()?.user_version;after.close()
const report={schemaBefore:version,schemaAfter:schema,originalTablesUnchanged:tables.length,checkpointsUnchanged:checkpointIds.length,numericallyReplayedBeforeAndAfter:checkpointIds.length,offlineLedgerEqual:true,events:first.events.length,executed:first.events.filter(e=>e.status==='executed').length,nonEconomic:first.events.filter(e=>e.status==='non-economic').length,unresolved:first.events.filter(e=>e.status==='unresolved').length,quantityLegs:first.events.flatMap(e=>e.securities).length,mappedQuantityLegs:first.events.flatMap(e=>e.securities).filter(s=>s.accountId).length,reconciliationRows:first.reconciliation.rows.length,coverage:first.connections.map(c=>c.coverage),openGate:'Independent statement-period and live new-endpoint acceptance remain open.'}
writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600})
console.log(JSON.stringify(report))
