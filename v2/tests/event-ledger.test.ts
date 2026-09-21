import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { SnapshotStore } from '../server/store'
import { tradeRepublicEvents } from '../server/trade-republic-events'
import { eventHash, reconcileEvents } from '../server/event-ledger'
import { catalog, type DataSource } from '../server/explorer'
import type { BrokerEventBatch } from '../server/broker-events'
import type { LedgerEvent, SavedEvent } from '../contracts/events'
import type { ConnectionInputs } from '../server/connection-store'

const at='2026-09-20T12:00:00Z'
const source=(id:string,payload:DataSource['payload']):DataSource=>({...catalog.find(s=>s.id===id)!,status:'success',fetchedAt:at,payload})
const wire=(id='one',overrides:Record<string,unknown>={})=>({id,eventType:'TRADING_SAVINGSPLAN_EXECUTED',status:'EXECUTED',timestamp:'2026-09-15T12:00:00.123+0000',cashAccountNumber:'synthetic-cash',subtitle:null,amount:{value:-12.34,currency:'EUR',fractionDigits:2},hidden:false,deleted:false,...overrides})
const details=(id='one',total='€12.34')=>({id,response:{id,sections:[{type:'header',action:{type:'instrumentDetail',payload:'US0378331005'},data:{status:'executed'}},{type:'table',data:[{title:'Transaction',detail:{text:'0.123456 × €99.96',displayValue:{text:'€99.96',prefix:'0.123456 × '}}},{title:'Total',detail:{displayValue:{text:total}}},{title:'Fee',detail:{text:'Free'}}]}]}})
const sources=(items:unknown[],ds:unknown[]=[])=>[
  source('timelineTransactions',{items,nextCursor:null} as DataSource['payload']),source('timelineDetails',{items:ds,remaining:items.length-ds.length} as DataSource['payload']),
  source('accountPairs',{accounts:[{cashAccountNumber:'synthetic-cash',securitiesAccountNumber:'synthetic-securities'}]}),
]
const batch=(items:unknown[]=[wire()],ds:unknown[]=[details()])=>tradeRepublicEvents(sources(items,ds))!

it('normalizes observed major units, exact decimal text and explicit account links without inventing costs',()=>{
  const b=batch(),e=b.events[0].event
  expect(e.cash).toEqual([{currency:'EUR',amount:'-12.34'}])
  expect(e.securities).toEqual([{accountId:createHash('sha256').update('synthetic-securities').digest('hex').slice(0,16),isin:'US0378331005',quantity:'0.123456',precision:'reported-display'}])
  expect(e).toMatchObject({status:'executed',kind:'buy',fee:'0',tax:null,gross:null,tradeAt:null,settlementAt:null})
  expect(b.coverage.historyComplete).toBe(false)
  expect(JSON.stringify(b.events[0].evidence)).not.toContain('synthetic-cash')
})
it('keeps same-amount distinct trades and does not book pending, cancelled or deleted events',()=>{
  const b=batch([wire('a'),wire('b'),wire('pending',{status:'PENDING'}),wire('cancelled',{status:'CANCELED'}),wire('deleted',{deleted:true})],[details('a'),details('b')])
  expect(b.events.filter(e=>e.event.status==='executed')).toHaveLength(2)
  expect(b.events.slice(2).every(e=>!e.event.cash.length&&!e.event.securities.length)).toBe(true)
})
it('preserves unsupported quantities, precision, accounts and contradictory details as gaps',()=>{
  const b=batch([wire('no-detail',{cashAccountNumber:null}),wire('unsafe',{amount:{value:1.001,currency:'EUR',fractionDigits:2}}),wire('mismatch')],[details('mismatch','€99.99')])
  expect(b.events[0].event).toMatchObject({status:'executed',accountId:null,securities:[]})
  expect(b.events[1].event.status).toBe('unresolved')
  expect(b.events[2].event).toMatchObject({status:'unresolved',cash:[]})
})
it('does not use stale details for a revised timeline event',()=>{
  const d={...details(),timelineFingerprint:eventHash(wire('one',{amount:{value:-10,currency:'EUR',fractionDigits:2}}))}
  expect(batch([wire()],[d]).events[0].event.securities).toEqual([])
})
it('retains A-B-A source revisions, deduplicates evidence and isolates connection identities',()=>{
  const s=new SnapshotStore(':memory:'),id=s.connections.defaultId
  try{
    const a=batch(),b=batch([wire('one',{status:'CANCELED'})])
    s.ledger.save(id,a);s.ledger.save(id,a);expect(s.ledger.events()[0].revisionCount).toBe(1)
    s.ledger.save(id,b);expect(s.ledger.events()[0].status).toBe('non-economic')
    s.ledger.save(id,a);expect(s.ledger.events()[0]).toMatchObject({status:'executed',revisionCount:2})
    const second=s.connections.add('trade-republic','1.0.0').id;s.ledger.save(second,a)
    expect(s.ledger.events()).toHaveLength(2)
    expect(()=>s.ledger.save(id,{...a,events:[...a.events,...a.events]})).toThrow('Ambiguous')
    expect(s.ledger.events()).toHaveLength(2)
  }finally{s.close()}
})
function neutral(sourceId:string,changes:Partial<LedgerEvent>={}):BrokerEventBatch['events'][number]{
  const evidence={synthetic:sourceId}
  return {evidence,event:{sourceId,sourceType:'synthetic',accountId:'cash-a',occurredAt:'2026-09-15T12:00:00Z',tradeAt:null,settlementAt:null,status:'executed',kind:'buy',reportedCash:null,cash:[],securities:[],gross:null,fee:null,tax:null,componentsCurrency:null,componentsIncludedInCash:false,transferReference:null,reversesSourceId:null,gaps:[],evidenceHash:eventHash(evidence),parserVersion:'synthetic/1',...changes}}
}
const saved=(events:ReturnType<typeof neutral>[]):SavedEvent[]=>events.map((e,i)=>({...e.event,connectionId:'connection',providerId:'synthetic',versionId:i+1,revisionCount:1,observedAt:at}))
const inputs=(opening:string,closing:string):ConnectionInputs[]=>[{connection:{id:'connection',providerId:'synthetic',providerVersion:'1',enabled:true,restore:false},snapshot:null,observations:[],quantities:[],holdingsHistory:[
  {fetchedAt:'2026-09-01T00:00:00Z',positions:[{account:'securities',isin:'US0378331005',name:'Synthetic',quantity:opening,instrumentType:'stock',averageBuyIn:'0'}]},
  {fetchedAt:'2026-09-20T00:00:00Z',positions:[{account:'securities',isin:'US0378331005',name:'Synthetic',quantity:closing,instrumentType:'stock',averageBuyIn:'0'}]},
]}]
const leg=(quantity:string)=>({accountId:'securities',isin:'US0378331005',quantity,precision:'exact' as const})
it('reconciles round trips, a split and in-kind delivery from explicit legs; never from deltas',()=>{
  const events=saved([neutral('buy',{securities:[leg('0.1234567890123456789')]}),neutral('sell',{kind:'sell',securities:[leg('-0.1234567890123456789')]}),neutral('split',{kind:'corporate-action',securities:[leg('10')]}),neutral('delivery',{kind:'delivery',securities:[leg('0.5')]})])
  expect(reconcileEvents(events,inputs('10','20.5')).rows[0]).toMatchObject({movement:'10.5',difference:'0',state:'matched-with-gaps'})
  expect(reconcileEvents([],inputs('10','20.5')).rows[0]).toMatchObject({movement:'0',difference:'10.5',state:'difference'})
})
it('uses booked cash exactly once, preserves settlement delay and explicit reversal legs',()=>{
  const events=saved([neutral('purchase',{cash:[{currency:'EUR',amount:'-11'}],fee:'1',componentsCurrency:'EUR',componentsIncludedInCash:true,settlementAt:'2026-09-21T00:00:00Z'}),neutral('deposit',{kind:'deposit',cash:[{currency:'EUR',amount:'50.1234567890123456789'}],settlementAt:'2026-09-15T00:00:00Z'}),neutral('reversal',{kind:'corporate-action',cash:[{currency:'EUR',amount:'-50.1234567890123456789'}],settlementAt:'2026-09-16T00:00:00Z',reversesSourceId:'deposit'})])
  const cash=[{connectionId:'connection',accountId:'cash-a',currency:'EUR',amount:'100',observedAt:'2026-09-01T00:00:00Z'},{connectionId:'connection',accountId:'cash-a',currency:'EUR',amount:'100',observedAt:'2026-09-20T00:00:00Z'}]
  expect(reconcileEvents(events,[],cash).rows[0]).toMatchObject({movement:'0',difference:'0'})
  cash[1]={...cash[1],observedAt:'2026-09-22T00:00:00Z',amount:'89'}
  expect(reconcileEvents(events,[],cash).rows[0]).toMatchObject({movement:'-11',difference:'0'})
})
it('pairs transfers only with an explicit shared reference and excludes them from external additions',()=>{
  const s=new SnapshotStore(':memory:'),id=s.connections.defaultId
  try{
    const b=batch();const events=[neutral('out',{kind:'withdrawal',transferReference:'transfer-1',cash:[{currency:'EUR',amount:'-10'}]}),neutral('in',{kind:'deposit',accountId:'cash-b',transferReference:'transfer-1',cash:[{currency:'EUR',amount:'10'}]}),neutral('unpaired',{kind:'deposit',cash:[{currency:'EUR',amount:'10'}]})]
    s.ledger.save(id,{...b,events})
    expect(s.ledger.read(s.connectionInputs()).totals[0]).toMatchObject({cashAdded:'10',cashWithdrawn:'0',internalTransfers:1})
  }finally{s.close()}
})

it('removes only uniquely evidenced full reversals from category totals',()=>{
  const s=new SnapshotStore(':memory:'),id=s.connections.defaultId
  try{
    const deposit=neutral('deposit',{kind:'deposit',cash:[{currency:'EUR',amount:'10'}]})
    const reversal=neutral('reverse',{kind:'corporate-action',reversesSourceId:'deposit',cash:[{currency:'EUR',amount:'-10'}]})
    s.ledger.save(id,{...batch(),events:[deposit,reversal]})
    expect(s.ledger.read(s.connectionInputs()).totals[0]).toMatchObject({currency:'EUR',cashAdded:'0',netCashMovement:'0'})
    s.ledger.save(id,{...batch(),events:[neutral('second-reverse',{kind:'corporate-action',reversesSourceId:'deposit',cash:[{currency:'EUR',amount:'-10'}]})]})
    expect(s.ledger.read(s.connectionInputs()).totals[0].netCashMovement).toBe('-10')
  }finally{s.close()}
})

it.each(['different-event',null])('does not attach same-amount detail with response identity %s',responseId=>{
  const detail=details();detail.response.id=responseId as unknown as string
  const e=batch([wire()],[detail]).events[0].event
  expect(e).toMatchObject({status:'executed',cash:[{amount:'-12.34',currency:'EUR'}],securities:[],fee:null,tax:null})
  expect(e.gaps.some(g=>g.includes('identity'))).toBe(true)
})
it('does not choose between duplicate detail wrappers for the same source event',()=>{
  const e=batch([wire()],[details(),details()]).events[0].event
  expect(e.securities).toEqual([])
  expect(e.fee).toBeNull()
  expect(e.gaps.some(g=>g.includes('Duplicate detail'))).toBe(true)
})

it('uses retained H1 cash boundaries immediately without changing the original observations',()=>{
  const s=new SnapshotStore(':memory:'),id=s.connections.defaultId
  try{
    const earlier={...source('cash',[{accountNumber:'synthetic-cash',currencyId:'EUR',amount:100}]),fetchedAt:'2026-09-01T00:00:00Z'}
    const later={...source('cash',[{accountNumber:'synthetic-cash',currencyId:'EUR',amount:87.66}]),fetchedAt:'2026-09-20T00:00:00Z'}
    s.saveSource(earlier);s.saveSource(later)
    const retained=s.retainedCashEvidence(),before=JSON.stringify(retained)
    s.ledger.save(id,tradeRepublicEvents([...sources([wire()],[details()]),later],retained)!)
    const row=s.ledger.read(s.connectionInputs()).reconciliation.rows.find(r=>r.unit==='EUR')!
    expect(row).toMatchObject({opening:'100',movement:'-12.34',closing:'87.66',difference:'0',state:'matched-with-gaps'})
    expect(JSON.stringify(s.retainedCashEvidence())).toBe(before)
  }finally{s.close()}
})

it.each([{acquisition:'success'},{timelineObservedAt:'bad'},{lastAttemptAt:'2026-09-20T12:00:00'},{detailsPending:-1},{failedDetails:0.5},{detailsPending:Number.MAX_SAFE_INTEGER+1},{recentGap:'false'},{historyComplete:true}])('rejects invalid coverage before changing saved evidence: %j',invalid=>{
  const s=new SnapshotStore(':memory:'),id=s.connections.defaultId
  try{
    s.ledger.save(id,batch());const before=JSON.stringify(s.ledger.read(s.connectionInputs())),state=JSON.stringify(s.ledger.state(id))
    const bad={...batch([wire('new')],[details('new')]),coverage:{...batch().coverage,...invalid}} as BrokerEventBatch
    expect(()=>s.ledger.save(id,bad)).toThrow()
    expect(JSON.stringify(s.ledger.read(s.connectionInputs()))).toBe(before)
    expect(JSON.stringify(s.ledger.state(id))).toBe(state)
  }finally{s.close()}
})
it.each(['payload','date','identity'])('rejects retained cash tampering without repairing or importing it: %s',async kind=>{
  const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{DatabaseSync}=await import('node:sqlite')
  const dir=mkdtempSync(join(tmpdir(),'prism-cash-integrity-')),path=join(dir,'db.sqlite')
  let s=new SnapshotStore(path)
  try{
    s.saveSource(source('cash',[{accountNumber:'synthetic-cash',currencyId:'EUR',amount:100}]))
    s.close();const db=new DatabaseSync(path)
    db.exec('PRAGMA foreign_keys=OFF') // Simulate a corrupted content-addressed reference.
    const row=db.prepare("SELECT o.sha256,b.payload FROM history_observations o JOIN history_blobs b ON o.sha256=b.sha256 WHERE o.kind='cash'").get()!
    if(kind==='date')db.prepare("UPDATE history_observations SET observed_at='2026-09-01T00:00:00Z' WHERE sha256=?").run(row.sha256!)
    else{
      const payload=JSON.parse(String(row.payload))
      if(kind==='payload')payload.cash[0].amount=999
      else payload.sourceId='quotes'
      const body=JSON.stringify(payload)
      db.prepare('UPDATE history_blobs SET payload=? WHERE sha256=?').run(body,row.sha256!)
      if(kind==='identity'){
        const sha=createHash('sha256').update(body).digest('hex')
        db.prepare('UPDATE history_blobs SET sha256=? WHERE sha256=?').run(sha,row.sha256!)
        db.prepare('UPDATE history_observations SET sha256=? WHERE sha256=?').run(sha,row.sha256!)
      }
    }
    const before=JSON.stringify(db.prepare('SELECT * FROM history_blobs ORDER BY sha256').all());db.close()
    s=new SnapshotStore(path)
    expect(()=>s.retainedCashEvidence()).toThrow(/Retained cash (integrity|metadata) mismatch/)
    expect(s.ledger.events()).toEqual([])
    const verify=new DatabaseSync(path,{readOnly:true});expect(JSON.stringify(verify.prepare('SELECT * FROM history_blobs ORDER BY sha256').all())).toBe(before);verify.close()
  }finally{s.close();rmSync(dir,{recursive:true})}
})

it.each(['amount','date','shape'])('rejects corrupted saved ledger cash before reconciliation: %s',async kind=>{
  const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{DatabaseSync}=await import('node:sqlite')
  const dir=mkdtempSync(join(tmpdir(),'prism-ledger-cash-integrity-')),path=join(dir,'db.sqlite')
  let s=new SnapshotStore(path)
  try{
    s.ledger.save(s.connections.defaultId,{...batch(),cashBalances:[{accountId:'cash',currency:'EUR',amount:'100',observedAt:'2026-09-01T00:00:00Z'},{accountId:'cash',currency:'EUR',amount:'100',observedAt:'2026-09-20T00:00:00Z'}]})
    s.close();const db=new DatabaseSync(path)
    const row=db.prepare('SELECT hash,payload FROM ledger_cash_observations ORDER BY observed_at DESC LIMIT 1').get()!
    if(kind==='date')db.prepare("UPDATE ledger_cash_observations SET observed_at='2026-09-19T00:00:00Z' WHERE hash=?").run(row.hash!)
    else{
      const payload=JSON.parse(String(row.payload));payload.amount=kind==='amount'?'999':999
      db.prepare('UPDATE ledger_cash_observations SET payload=?,hash=? WHERE hash=?').run(JSON.stringify(payload),kind==='shape'?eventHash(payload):row.hash!,row.hash!)
    }
    const before=JSON.stringify(db.prepare('SELECT * FROM ledger_cash_observations ORDER BY observed_at').all());db.close()
    s=new SnapshotStore(path)
    expect(()=>s.ledger.read(s.connectionInputs())).toThrow()
    const verify=new DatabaseSync(path,{readOnly:true});expect(JSON.stringify(verify.prepare('SELECT * FROM ledger_cash_observations ORDER BY observed_at').all())).toBe(before);verify.close()
  }finally{s.close();rmSync(dir,{recursive:true})}
})

it('admits only corroborated completed Round Ups independently of same-time savings purchases',()=>{
  const roundup=wire('round',{eventType:'SPARE_CHANGE_AGGREGATE',subtitle:'Round up',cashAccountNumber:null})
  const d=details('round')
  const table=d.response.sections[1].data
  if(!Array.isArray(table))throw Error('Missing synthetic table')
  table.push(...[
    {title:'Round up',detail:{text:'Completed',functionalStyle:'EXECUTED'}},
    {title:'Accrued',detail:{displayValue:{text:'€12.34'}}},
  ] as never[])
  const b=batch([roundup,wire('ordinary'),{...roundup,id:'saveback',eventType:'SAVEBACK_AGGREGATE'}],[d,details('ordinary')])
  expect(b.events[0].event).toMatchObject({status:'executed',kind:'buy',accountId:null,cash:[{amount:'-12.34'}],securities:[{accountId:null,quantity:'0.123456',precision:'reported-display'}]})
  expect(b.events[1].event.securities).toHaveLength(1)
  expect(b.events[2].event).toMatchObject({status:'unresolved',cash:[],securities:[]})
  for(const changed of [{...roundup,subtitle:'Other'},{...roundup,amount:{value:-10,currency:'EUR',fractionDigits:2}}])expect(batch([changed],[d]).events[0].event.status).toBe('unresolved')
  expect(batch([roundup],[]).events[0].event.status).toBe('unresolved')
  const store=new SnapshotStore(':memory:')
  try{
    store.ledger.save(store.connections.defaultId,b)
    store.ledger.save(store.connections.defaultId,batch([{...roundup,status:'CANCELED'}],[d]))
    expect(store.ledger.events().find(e=>e.sourceId==='round')).toMatchObject({revisionCount:2,status:'non-economic',cash:[],securities:[]})
  }finally{store.close()}
})
