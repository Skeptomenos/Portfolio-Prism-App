/** Offline acceptance against an explicitly disposable SQLite-consistent copy.
 * Retains a real saved stock bid as user-provided replay evidence; never obtains or invents a market price. */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { writeFileSync, readdirSync } from 'node:fs'
import { dirname, basename, resolve } from 'node:path'
import { SnapshotStore } from '../server/store'
import { exposure } from '../server/exposure'
const [path, report] = process.argv.slice(2)
if (!path || !report || !resolve(path).includes('/test-results/') || basename(path) !== 'portfolio.sqlite') throw Error('Use a disposable test-results/portfolio.sqlite copy and new report path')
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
let db = new DatabaseSync(path)
const old = db.prepare('SELECT id,payload,sha256,manifest,manifest_sha256 FROM history_checkpoints ORDER BY seq').all()
const prior = new Map(old.map(row => [String(row.id), fingerprint(row)]))
const schema = db.prepare('PRAGMA user_version').get()!.user_version
db.close()
let store = new SnapshotStore(path)
const migrated = readdirSync(dirname(path)).some(name => name.startsWith(basename(path) + '.pre-history-'))
if (Number(schema) < 14 && !migrated) throw Error('Migration backup missing')
const replayBefore = Object.fromEntries([...prior.keys()].map(id => [id, fingerprint(store.history.replay(id))]))
const now = Date.now()
const original = store.overview(now)
const row = original.rows.find(p => p.instrumentType === 'stock' && p.valuationStatus === 'priced' && p.price && p.currency && p.quoteAt)
if (!row) throw Error('Copy needs a supported saved stock bid')
const scope = { connectionId: store.connections.defaultId, account: row.account, isin: row.isin }
const quotes = store.sources().find(s => s.id === 'quotes')!
if (!Array.isArray(quotes.payload)) throw Error('Missing quote fixture')
// Controlled missing-quote scenario on the copy only. Existing retained history remains intact.
store.saveSource({ ...quotes, payload: quotes.payload.filter(q => !(q && typeof q === 'object' && !Array.isArray(q) && q.isin === row.isin)) })
const missingSources = fingerprint(store.sources())
const excluded = store.investigationCommand({ action: 'decide', scope, state: 'excluded', reason: 'Disposable acceptance scenario' }, now)
if (store.overview(now).rows.find(p => p.account === scope.account && p.isin === scope.isin)!.value !== null || excluded.counts.excluded < 1) throw Error('Exclusion changed unknown value')
store.close();store=new SnapshotStore(path)
if (!store.excludedQuoteIsins(scope.connectionId).includes(scope.isin)) throw Error('Exclusion did not survive reopen')
store.investigationCommand({ action:'decide',scope,state:'open',reason:'Reopen acceptance investigation'},now)
const command={action:'price',scope,price:row.price!,currency:row.currency!,asOf:row.quoteAt!,source:'Saved broker bid copied for isolated manual-evidence acceptance',reason:'Controlled replay scenario, not a fresh independent market price',unit:'per-security'}
const saved=store.investigationCommand(command,now)
const candidate=store.overview(now)
const selected=candidate.rows.find(p=>p.account===scope.account&&p.isin===scope.isin)!
if(selected.value!==row.value||!selected.manualEvidence)throw Error('Manual fallback failed exact saved value')
if(fingerprint(store.sources())!==missingSources)throw Error('Manual command mutated broker sources')
const checkpointId=saved.checkpointId!
const frozen=fingerprint(store.history.replay(checkpointId))
const currentResult=exposure(candidate,store.selectedCompositions(),store.compositionAttempt(),false,now)
const contribution=currentResult.rows.flatMap(r=>r.contributions).find(c=>c.account===scope.account&&c.positionIsin===scope.isin)
if(!contribution?.manualEvidence)throw Error('Manual provenance missing from exposure')
store.close();store=new SnapshotStore(path)
if(fingerprint(store.history.replay(checkpointId))!==frozen)throw Error('Manual replay changed after reopen')
store.saveSource(quotes)
if(store.overview(now).rows.find(p=>p.account===scope.account&&p.isin===scope.isin)!.manualEvidence)throw Error('Broker did not take precedence')
const status=store.investigationReport(now).items.find(i=>i.scope.account===scope.account&&i.scope.isin===scope.isin)!.manualStatus
if(!status.includes('broker value takes precedence'))throw Error('Inactive reason missing')
store.investigationCommand({action:'revoke',scope,evidenceId:selected.manualEvidence.id,reason:'Complete controlled scenario'},now)
if(fingerprint(store.history.replay(checkpointId))!==frozen)throw Error('Revocation changed prior manual checkpoint')
for(const [id,hash] of Object.entries(replayBefore))if(fingerprint(store.history.replay(id))!==hash)throw Error('Old replay changed')
store.close();db=new DatabaseSync(path)
for(const row of db.prepare('SELECT id,payload,sha256,manifest,manifest_sha256 FROM history_checkpoints ORDER BY seq').all())if(prior.has(String(row.id))&&prior.get(String(row.id))!==fingerprint(row))throw Error('Old checkpoint bytes changed')
db.close()
writeFileSync(report,JSON.stringify({passed:true,oldCheckpoints:prior.size,priorSchema:schema,migrationBackup:migrated,scope,quantity:row.quantity,price:row.price,currency:row.currency,asOf:row.quoteAt,value:selected.value,manualCheckpoint:checkpointId,manualReplayHash:frozen,brokerPrecedence:status,contribution,coverage:currentResult.coverage},null,2),{flag:'wx',mode:0o600})
console.log(JSON.stringify({passed:true,oldCheckpoints:prior.size,migrationBackup:migrated,report}))
