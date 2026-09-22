import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnapshotStore } from '../server/store'
import { BrokerConnections } from '../server/broker-connections'
import { bundledPluginDescriptors, createPluginRegistry } from '../server/plugin-registry'
import { syntheticPlugin, memoryVaults, syntheticTime, type SyntheticControl } from './synthetic-broker'
import { connectionRequest } from '../server/connection-http'
import { admitHoldings } from '../server/broker-holdings'
import { overview } from '../server/overview'
import { Decimal } from 'decimal.js'

const primary = { status: () => ({ connected:false, phase:'disconnected', error:null, activeOperation:null }), authenticate: () => false, sync: () => false, restore: () => false, cancel() {}, logout: () => true, settled: async () => {} }
const setup = (path = ':memory:') => {
  const controls = new Map<string,SyntheticControl>(), vaults = memoryVaults()
  const registry = createPluginRegistry([...bundledPluginDescriptors,syntheticPlugin(controls)])
  const store = new SnapshotStore(path,registry), host = new BrokerConnections(store,primary,vaults.factory)
  return { controls,vaults,registry,store,host }
}
const connect = async (host: BrokerConnections) => { const c = host.add('synthetic-ledger'); expect(host.authenticate(c.id,{'access-code':'fixture-only'})).toBe(true); await host.settled(c.id); return c }

describe('provider-neutral connections', () => {
  it('registers TR and a distinct ledger adapter, values exact decimal currencies, restarts and replays independently of plugin activation', async () => {
    const path = join(mkdtempSync(join(tmpdir(),'prism-connections-')),'portfolio.sqlite')
    const { store,host,registry } = setup(path)
    expect(host.providers().map(p => p.id)).toEqual(['trade-republic','synthetic-ledger'])
    store.save({ fetchedAt:syntheticTime, positions:[{ account:'same-account',isin:'US0378331005',name:'Apple',quantity:'3',averageBuyIn:'0',instrumentType:'stock' }] })
    const baseline = overview(store.latest(),store.sources(),Date.parse(syntheticTime),store.quantityObservations())
    const c = await connect(host)
    const checkpoint = store.history.runs().items[0].latestCheckpoint!
    const replayAt = Date.parse(checkpoint.recordedAt)
    const value = store.overview(replayAt)
    expect(value.rows[0]).toEqual(baseline.rows[0]) // USD quote must not value TR position.
    expect(value.rows[1].account).toBe(`${c.id}:same-account`)
    expect(value.totals[0]).toMatchObject({ currency:'USD',securities:'26234567665123456.76625',cash:'10000000000000000.01' })
    expect(store.history.replay(checkpoint.id).valuations.totals).toEqual(value.totals)
    registry.disable('synthetic-ledger-plugin')
    expect(() => host.sync(c.id)).toThrow()
    expect(store.history.replay(checkpoint.id).detail.replay.state).toBe('available')
    await host.close(); store.close()
    const reopened = setup(path)
    expect(reopened.store.overview(replayAt)).toEqual(value)
    expect(reopened.store.history.replay(checkpoint.id).valuations.totals).toEqual(value.totals)
    await reopened.host.close(); reopened.store.close()
  })
  it('isolates credentials, partial/malformed account snapshots, failure, disable and cancellation from other connections and history', async () => {
    const { host,store,controls,vaults } = setup()
    const a = await connect(host), b = await connect(host)
    expect(vaults.values.size).toBe(2)
    const saved = store.connections.inputs(a), other = store.connections.inputs(b)
    for (const fault of [{partial:true},{malformed:true},{reject:true}]) {
      controls.set(a.id,fault); host.sync(a.id); await host.settled(a.id)
      expect(store.connections.inputs(a)).toEqual(saved)
      expect(store.connections.inputs(b)).toEqual(other)
    }
    controls.set(a.id,{ wait:true }); host.sync(a.id)
    await host.enable(a.id,false)
    expect(store.connections.inputs(b)).toEqual(other)
    expect(store.connections.inputs(a).snapshot).toEqual(saved.snapshot)
    expect(store.history.runs().items[0].status).toBe('cancelled')
    expect(host.list().find(c => c.id === a.id)?.enabled).toBe(false)
    await host.logout(a.id)
    expect(vaults.values.size).toBe(1)
    expect(vaults.values.has(`synthetic-ledger:${b.id}`)).toBe(true)
    const events = store.diagnostics().filter(d => d.connectionId === a.id)
    expect(events.length).toBeGreaterThan(0)
    expect(events.every(d => d.providerId === 'synthetic-ledger')).toBe(true)
    expect(JSON.stringify(events)).not.toContain('fixture-only')
    await host.close(); store.close()
  })
  it('preserves committed holdings after a valuation failure and only an authoritative empty snapshot clears its own connection', async () => {
    const { host,store,controls } = setup(), a = await connect(host), b = await connect(host)
    controls.set(a.id,{quantity:'4.25',failValuation:true}); host.sync(a.id); await host.settled(a.id)
    expect(store.connections.inputs(a).snapshot!.positions[0].quantity).toBe('4.25')
    expect(store.history.runs().items[0]).toMatchObject({status:'failed',checkpointCount:1})
    controls.set(a.id,{empty:true}); host.sync(a.id); await host.settled(a.id)
    expect(store.connections.inputs(a).snapshot!.positions).toEqual([])
    expect(store.connections.inputs(b).snapshot!.positions).toHaveLength(1)
    expect(() => admitHoldings({snapshot:{fetchedAt:syntheticTime,positions:[]},completeness:'complete',accounts:['same-account']})).toThrow()
    await host.close(); store.close()
  })
  it('rejects unregistered, incompatible and unexpected auth inputs and exposes no credentials in connection read models', async () => {
    const { host,store } = setup(), c = host.add('synthetic-ledger')
    expect(() => host.add('arbitrary-url')).toThrow()
    expect(() => host.authenticate(c.id,{phone:'+49123456789',pin:'1234'})).toThrow()
    expect(() => host.authenticate(c.id,{'access-code':'x'.repeat(65)})).toThrow()
    await expect(connectionRequest('POST',`/api/connections/${c.id}/sync`,{unexpected:true},host)).rejects.toThrow()
    expect(await connectionRequest('GET','/api/connections',null,host)).toMatchObject({status:200})
    await host.close(); store.close()
  })
})

it('rejects duplicate/incompatible broker registrations and prevents acquisition after activation failure',async()=>{
  const plugin=syntheticPlugin()
  expect(()=>createPluginRegistry([plugin,{...plugin,id:'other-plugin'}])).toThrow()
  expect(()=>createPluginRegistry([{...plugin,contributions:{...plugin.contributions,broker:{...plugin.contributions.broker!,contractVersion:'incompatible' as never}}}])).toThrow()
  const registry=createPluginRegistry([...bundledPluginDescriptors,{...plugin,activate:()=>{throw Error('synthetic activation failure')}}])
  const store=new SnapshotStore(':memory:',registry), host=new BrokerConnections(store,primary,memoryVaults().factory)
  const connection=host.add('synthetic-ledger')
  expect(()=>host.authenticate(connection.id,{'access-code':'fixture-only'})).toThrow()
  expect(host.list().find(c=>c.id===connection.id)?.available).toBe(false)
  expect(store.connections.inputs(connection).snapshot).toBeNull()
  await host.close();store.close()
})
it('retains an inactive connection result when its installed provider version becomes incompatible',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'prism-version-')),'portfolio.sqlite')
  const current=setup(path), connection=await connect(current.host), now=Date.parse(syntheticTime), value=current.store.overview(now)
  await current.host.close();current.store.close()
  const plugin=syntheticPlugin();plugin.contributions.broker={...plugin.contributions.broker!,version:'2.0.0'}
  const store=new SnapshotStore(path,createPluginRegistry([...bundledPluginDescriptors,plugin])),host=new BrokerConnections(store,primary,memoryVaults().factory)
  expect(()=>host.sync(connection.id)).toThrow()
  expect(store.overview(now)).toEqual(value)
  expect(host.list().find(c=>c.id===connection.id)?.available).toBe(false)
  await host.close();store.close()
})
