import { expect,it } from 'vitest'
import { PortfolioService } from '../server/service'
import { SnapshotStore } from '../server/store'
import { BrokerFailure, type Broker, type BrokerObserver } from '../server/broker-contract'
import { BrokerConnections } from '../server/broker-connections'
import { createPluginRegistry, bundledPluginDescriptors } from '../server/plugin-registry'
import { syntheticPlugin, memoryVaults, syntheticTime } from './synthetic-broker'
import { scopedVault, inCredentialScope } from '../server/credential-scope'
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve=r }); return {promise,resolve} }
const snapshot = {fetchedAt:syntheticTime,positions:[]}
const idle: Broker = {authenticate:async()=>{},restore:async()=>false,fetch:async()=>snapshot,logout(){},close(){},warning:()=>null}

for (const kind of ['authenticate','restore'] as const) it(`does not revive the default session after late ${kind}, cancellation and logout`,async()=>{
 const late=deferred(), store=new SnapshotStore(':memory:')
 const broker:Broker={...idle,[kind]:async(...args:unknown[])=>{await late.promise; if(kind==='authenticate') (args[2] as (s:string)=>void)('awaiting-approval'); return true}}
 const service=new PortfolioService(broker,store)
 if(kind==='authenticate') service.login('+49123456789','1234'); else service.restore()
 service.cancel(); await service.settled(); service.logout()
 late.resolve(); await new Promise(r=>setTimeout(r,0))
 expect(service.status()).toMatchObject({connected:false,phase:'disconnected',automaticRefresh:{sessionRestoreEnabled:false}})
 expect(store.latest()).toBeNull()
 await service.close()
})
it('rejects an old default authentication callback while a replacement operation runs',async()=>{
 const first=deferred(), second=deferred(); let calls=0
 const store=new SnapshotStore(':memory:')
 const broker:Broker={...idle,authenticate:async(_input,_signal,state)=>{await (++calls===1?first:second).promise;state('awaiting-approval')}}
 const service=new PortfolioService(broker,store)
 service.login('+49123456789','1234');service.cancel();await service.settled()
 service.login('+49123456789','1234');first.resolve();await new Promise(r=>setTimeout(r,0))
 expect(service.status().phase).toBe('connecting')
 service.cancel();await service.settled();second.resolve();await service.close()
})
for(const action of ['logout','cancel','disable'] as const) it(`revokes late connector vault writes after ${action}, even during a new login`,async()=>{
 const late=deferred(), newer=deferred(), vaults=memoryVaults();let calls=0, denied=0
 const plugin=syntheticPlugin(), original=plugin.contributions.broker!
 plugin.contributions.broker={...original,create:context=>{
  const broker=original.create(context)
  return {...broker,authenticate:async()=>{await (++calls===1?late:newer).promise;try{context.vault.setPassword('fixture-late')}catch{denied++}}}
 }}
 const store=new SnapshotStore(':memory:',createPluginRegistry([...bundledPluginDescriptors,plugin]))
 const primary={status:()=>({connected:false,phase:'disconnected',error:null,activeOperation:null}),authenticate:()=>false,sync:()=>false,restore:()=>false,cancel(){},logout:()=>true,settled:async()=>{}}
 const host=new BrokerConnections(store,primary,vaults.factory), c=host.add(original.id)
 host.authenticate(c.id,{'access-code':'fixture-only'})
 if(action==='logout') await host.logout(c.id)
 else if(action==='disable') await host.enable(c.id,false)
 else {host.cancel(c.id);await host.settled(c.id)}
 if(action==='disable') await host.enable(c.id,true)
 host.authenticate(c.id,{'access-code':'fixture-only'})
 late.resolve();await new Promise(r=>setTimeout(r,0))
 expect(denied).toBe(1);expect(vaults.values.size).toBe(0)
 host.cancel(c.id);await host.settled(c.id);newer.resolve();await new Promise(r=>setTimeout(r,0))
 expect(denied).toBe(2);expect(vaults.values.size).toBe(0)
 await host.close();store.close()
})
it('uses the same revocable vault boundary for the default connection factory',async()=>{
 const late=deferred(), vaults=memoryVaults(), vault=scopedVault(vaults.factory('trade-republic','default'));let denied=false
 const store=new SnapshotStore(':memory:'),service=new PortfolioService(()=>({...idle,authenticate:async()=>{await late.promise;try{vault.setPassword('late')}catch{denied=true}}}),store)
 service.login('+49123456789','1234');service.cancel();await service.settled();service.logout();late.resolve();await new Promise(r=>setTimeout(r,0))
 expect(denied).toBe(true);expect(vaults.values.size).toBe(0);await service.close()
})
it('allowlists runtime diagnostics from exceptions and observer events',async()=>{
 let observer:BrokerObserver=()=>{}
 const store=new SnapshotStore(':memory:'), service=new PortfolioService({...idle,observe:value=>{observer=value},authenticate:async()=>{
  observer({stage:'RAW_SECRET',event:'RAW_SECRET',category:'RAW_SECRET',durationMs:Infinity,httpStatus:999,networkCode:'RAW_SECRET'} as never)
  throw new BrokerFailure({category:'connection',networkCode:'RAW_SECRET',httpStatus:999})
 }},store)
 service.login('+49123456789','1234');await service.settled()
 const events=service.diagnostics();expect(JSON.stringify(events)).not.toContain('RAW_SECRET')
 expect(events[0]).toMatchObject({category:'connection'})
 expect(events.every(e=>!e.networkCode && !e.httpStatus && Number.isFinite(e.durationMs))).toBe(true)
 await service.close()
})
it('restores before syncing with a replacement default broker after cancellation',async()=>{
 const waiting=deferred();let instances=0,restores=0,unauthenticatedFetches=0
 const store=new SnapshotStore(':memory:')
 const service=new PortfolioService(()=>{
  const instance=++instances;let connected=false,reads=0
  return {...idle,authenticate:async()=>{connected=true},restore:async()=>{restores++;connected=true;return true},fetch:async()=>{
   if(!connected){unauthenticatedFetches++;throw new BrokerFailure({category:'authentication'})}
   if(instance===1 && ++reads===2) await waiting.promise
   return snapshot
  }}
 },store)
 service.login('+49123456789','1234');await service.settled()
 service.sync();service.cancel();await service.settled()
 expect(service.status()).toMatchObject({connected:false,phase:'disconnected'})
 service.sync();await service.settled()
 expect(restores).toBe(1);expect(unauthenticatedFetches).toBe(0)
 waiting.resolve();await service.close()
})
it('rejects legacy default acquisition when its connector is disabled or version-incompatible',async()=>{
 let calls=0
 const registry=createPluginRegistry(bundledPluginDescriptors),store=new SnapshotStore(':memory:',registry)
 const service=new PortfolioService({...idle,restore:async()=>{calls++;return true},fetch:async()=>{calls++;return snapshot}},store)
 registry.disable('trade-republic-broker')
 expect(service.restore()).toBe(false);expect(service.sync()).toBe(false);expect(calls).toBe(0)
 registry.enable('trade-republic-broker')
 // Simulate a saved connection requiring an unavailable installed version.
 const provider=registry.brokerProvider('trade-republic')!
 const savedVersion=provider.version;provider.version='2.0.0'
 try {expect(service.restore()).toBe(false);expect(calls).toBe(0)} finally {provider.version=savedVersion}
 await service.close()
})
