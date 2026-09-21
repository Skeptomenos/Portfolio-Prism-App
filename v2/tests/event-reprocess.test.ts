import { it,expect,vi } from 'vitest'
import { SnapshotStore } from '../server/store'
import { PortfolioService } from '../server/service'
import { normalizeRetainedTradeRepublicEvents,tradeRepublicEvents } from '../server/trade-republic-events'
import { catalog,type DataSource,type Json } from '../server/explorer'
import type { Broker } from '../server/broker-contract'
const at='2026-09-20T12:00:00Z'
const source=(id:string,payload:Json):DataSource=>({...catalog.find(s=>s.id===id)!,status:'success',fetchedAt:at,attemptedAt:at,payload})
const state=()=>[
 source('timelineTransactions',{items:[{id:'round-up',eventType:'SPARE_CHANGE_AGGREGATE',status:'EXECUTED',timestamp:at,subtitle:'Round up',cashAccountNumber:null,amount:{value:-2,currency:'EUR',fractionDigits:2}}],nextCursor:'older-page'}),
 source('timelineDetails',{items:[{id:'round-up',response:{id:'round-up',sections:[{type:'header',action:{type:'instrumentDetail',payload:'US0378331005'},data:{status:'executed'}},{type:'table',data:[{title:'Round up',detail:{text:'Completed',functionalStyle:'EXECUTED'}},{title:'Accrued',detail:{displayValue:{text:'€2.00'}}},{title:'Total',detail:{displayValue:{text:'€2.00'}}},{title:'Transaction',detail:{displayValue:{text:'€100',prefix:'0.02 x '}}}]}]}}]})
]
function fixture(){
 const store=new SnapshotStore(':memory:'),batch=tradeRepublicEvents(state())!
 store.ledger.save(store.connections.defaultId,{...batch,events:batch.events.map(({event,evidence})=>({evidence,event:{...event,parserVersion:'trade-republic-events/1',status:'unresolved',kind:'unknown',cash:[],securities:[]}}))})
 const forbidden=vi.fn(()=>{throw Error('Network/auth forbidden')})
 const broker:Broker={authenticate:forbidden,restore:forbidden,fetch:forbidden,readEvents:forbidden,logout:forbidden,close:forbidden,warning:()=>null,normalizeRetainedEvents:normalizeRetainedTradeRepublicEvents}
 return {store,broker,forbidden}
}
it('reprocesses offline without acquisition/auth, preserves provenance/history and repeats idempotently',async()=>{
 const {store,broker,forbidden}=fixture(),service=new PortfolioService(broker,store)
 try{
  const id=store.connections.defaultId,coverage=store.ledger.coverage(id),retained=store.ledger.state(id),runs=store.history.runs()
  expect(service.status().connected).toBe(false)
  expect(service.reprocessEvents()).toBe(true);expect(service.reprocessEvents()).toBe(false)
  await service.settled()
  expect(store.ledger.events()[0]).toMatchObject({sourceId:'round-up',status:'executed',revisionCount:2,accountId:null,cash:[{amount:'-2'}],securities:[{quantity:'0.02',accountId:null}]})
  const saved=store.ledger.events()
  expect(store.ledger.coverage(id)).toEqual(coverage);expect(store.ledger.state(id)).toEqual(retained);expect(store.history.runs()).toEqual(runs)
  expect(service.diagnostics()[0]).toMatchObject({terminal:true,event:'partial',operation:'extraction'})
  expect(service.reprocessEvents()).toBe(true);await service.settled();expect(store.ledger.events()).toEqual(saved)
  expect(forbidden).not.toHaveBeenCalled()
 }finally{store.close()}
})
it('rejects unsupported adapters and malformed retained state without changing selected versions',async()=>{
 const {store,broker,forbidden}=fixture()
 try{
  const saved=store.ledger.events()
  expect(new PortfolioService({...broker,normalizeRetainedEvents:undefined},store).reprocessEvents()).toBe(false)
  const service=new PortfolioService({...broker,normalizeRetainedEvents:()=>normalizeRetainedTradeRepublicEvents({broken:true})},store)
  expect(service.reprocessEvents()).toBe(true);await service.settled()
  expect(service.diagnostics()[0]).toMatchObject({terminal:true,event:'failed'})
  expect(store.ledger.events()).toEqual(saved);expect(forbidden).not.toHaveBeenCalled()
 }finally{store.close()}
})
it('core rejects altered dates, coverage, cursors or event identities atomically',async()=>{
 for(const change of ['date','coverage','cursor','ids']){
  const {store,broker}=fixture()
  try{
   const saved=store.ledger.events(),retained=store.ledger.state(store.connections.defaultId)
   const service=new PortfolioService({...broker,normalizeRetainedEvents:input=>{
    const batch=normalizeRetainedTradeRepublicEvents(input)!
    return change==='date'?{...batch,observedAt:'2026-09-21T12:00:00Z'}:change==='coverage'?{...batch,coverage:{...batch.coverage,detailsPending:999}}:change==='cursor'?{...batch,state:[]}: {...batch,events:[]}
   }},store)
   expect(service.reprocessEvents()).toBe(true);await service.settled()
   expect(service.diagnostics()[0].event).toBe('failed');expect(store.ledger.events()).toEqual(saved);expect(store.ledger.state(store.connections.defaultId)).toEqual(retained)
  }finally{store.close()}
 }
})
it('adapter refuses corrupt identities, dates and timeline containers',()=>{
 for(const input of [null,{},[],[{id:'timelineTransactions',status:'success',fetchedAt:'yesterday',payload:{items:[]}}],[{id:'timelineTransactions',status:'success',fetchedAt:at,payload:{items:'broken'}}], [...state(),state()[0]]])expect(()=>normalizeRetainedTradeRepublicEvents(input as Json)).toThrow()
})

it('protects the offline endpoint and correlates its terminal outcome without network access',async()=>{
 const {createServer}=await import('node:http'),{api}=await import('../server/http')
 const {store,broker,forbidden}=fixture(),service=new PortfolioService(broker,store)
 let origin=''
 const server=createServer((req,res)=>{void api(req,res,service,origin)})
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 origin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
 try{
  const url=`${origin}/api/events/reprocess`
  expect((await fetch(url,{method:'POST'})).status).toBe(403)
  expect((await fetch(url,{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json','X-Prism-Client':'1'},body:'{}'})).status).toBe(403)
  const response=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Prism-Client':'1'},body:'{}'})
  expect(response.status).toBe(202);const body=await response.json();await service.settled()
  expect(service.diagnostics().find(d=>d.attemptId===body.attemptId&&d.terminal)).toMatchObject({event:'partial'})
  expect(forbidden).not.toHaveBeenCalled()
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close()}
})
