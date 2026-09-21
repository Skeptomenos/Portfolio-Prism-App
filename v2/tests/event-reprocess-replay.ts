import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SnapshotStore } from '../server/store'
import { normalizeRetainedTradeRepublicEvents } from '../server/trade-republic-events'
import { PortfolioService } from '../server/service'
import type { Broker } from '../server/broker-contract'
const [path,reportPath]=process.argv.slice(2)
if(!path||!reportPath||resolve(path)===resolve(process.env.HOME??'', '.portfolio-prism-v2/portfolio.sqlite'))throw Error('Use an explicit disposable SQLite-consistent copy and report path')
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const original=new DatabaseSync(path,{readOnly:true})
const tables=original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'ledger_%' AND name != 'diagnostics' ORDER BY name").all().map(r=>String(r.name))
const tableHashes=(db:DatabaseSync)=>Object.fromEntries(tables.map(t=>[t,hash(db.prepare(`SELECT * FROM "${t.replaceAll('"','""')}" ORDER BY rowid`).all())]))
const before=tableHashes(original),version=original.prepare('PRAGMA user_version').get()?.user_version
if(original.prepare("SELECT count(*) AS n FROM history_runs WHERE status='running'").get()?.n!==0)throw Error('Copy contains an active operation; obtain a quiescent copy')
const checkpointIds=original.prepare('SELECT id FROM history_checkpoints ORDER BY seq').all().map(r=>String(r.id));original.close()
let store=new SnapshotStore(path)
const checkpoints=checkpointIds.map(id=>store.history.checkpoint(id))
if(checkpoints.some(c=>c?.replay.state!=='available'))throw Error('Original checkpoint replay unavailable')
const numericalReplays=checkpointIds.map(id=>hash(store.history.replay(id)))
const overview=hash(store.overview(0))
const connectionId=store.connections.defaultId
const priorEvents=store.ledger.events(),priorState=store.ledger.state(connectionId),priorCoverage=store.ledger.coverage(connectionId)
const priorVersions=originalVersions(path)
function originalVersions(path:string){const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare('SELECT * FROM ledger_event_versions ORDER BY seq').all()}finally{db.close()}}
let forbiddenCalls=0
const forbidden=()=>{forbiddenCalls++;throw Error('Broker/auth access forbidden')}
const broker:Broker={authenticate:forbidden,restore:forbidden,fetch:forbidden,readEvents:forbidden,logout:forbidden,close:forbidden,warning:()=>null,normalizeRetainedEvents:normalizeRetainedTradeRepublicEvents}
const service=new PortfolioService(broker,store)
if(!service.reprocessEvents())throw Error('Reprocessing not accepted')
await service.settled()
if(service.diagnostics()[0]?.event!=='partial')throw Error('Expected honest partial completion')
if(forbiddenCalls)throw Error('Network/auth was touched')
if(hash(store.ledger.state(connectionId))!==hash(priorState)||hash(store.ledger.coverage(connectionId))!==hash(priorCoverage))throw Error('Source provenance changed')
if(hash(store.ledger.events().map(e=>e.sourceId).sort())!==hash(priorEvents.map(e=>e.sourceId).sort()))throw Error('Event identities changed')
if(hash(originalVersions(path).slice(0,priorVersions.length))!==hash(priorVersions))throw Error('Old ledger versions changed')
const once=hash(store.ledger.events())
if(!service.reprocessEvents())throw Error('Repeat not accepted')
await service.settled()
if(hash(store.ledger.events())!==once)throw Error('Repeat was not idempotent')
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
const report={offlineCommand:true,forbiddenCalls,sourceProvenanceUnchanged:true,priorVersionsPreserved:priorVersions.length,idempotent:true,schemaBefore:version,schemaAfter:schema,originalTablesUnchanged:tables.length,checkpointsUnchanged:checkpointIds.length,numericallyReplayedBeforeAndAfter:checkpointIds.length,offlineLedgerEqual:true,events:first.events.length,executed:first.events.filter(e=>e.status==='executed').length,nonEconomic:first.events.filter(e=>e.status==='non-economic').length,unresolved:first.events.filter(e=>e.status==='unresolved').length,quantityLegs:first.events.flatMap(e=>e.securities).length,mappedQuantityLegs:first.events.flatMap(e=>e.securities).filter(s=>s.accountId).length,reconciliationRows:first.reconciliation.rows.length,coverage:first.connections.map(c=>c.coverage),roundUps:first.events.filter(e=>e.sourceType==='SPARE_CHANGE_AGGREGATE'&&e.status==='executed').length,openGate:'Statement completeness, account attribution and coordinator activation remain open.'}
writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600})
console.log(JSON.stringify(report))
