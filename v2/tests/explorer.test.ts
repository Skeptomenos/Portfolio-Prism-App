import { it, expect } from 'vitest'
import { TRAuthError } from 'trade-republic-sdk'
import {
  catalog,
  extractData,
  sanitizePayload,
  type DataSource,
  type ExplorerTransport,
} from '../server/explorer'
import { SnapshotStore } from '../server/store'
const signal = () => new AbortController().signal
const quiet = () => {}
const source = (id: string, payload: DataSource['payload']): DataSource => ({
  ...catalog.find((s) => s.id === id)!,
  status: 'success',
  payload,
  fetchedAt: '2026-01-01T00:00:00Z',
})
it('removes credentials and capability URLs recursively while preserving financial fields', () => {
  expect(
    sanitizePayload({
      quantity: '1e-8',
      account: 'synthetic',
      nested: { accessToken: 'SECRET', url: 'https://example.com/doc?access=SECRET' },
      pin: '1234',
    })
  ).toEqual({
    quantity: '1e-8',
    account: 'synthetic',
    nested: {
      accessToken: '[credential omitted]',
      url: '[URL omitted: may grant access to a private document]',
    },
    pin: '[credential omitted]',
  })
})
it('does not mutate prior history on later page failure, and persists source evidence', async () => {
  const old = source('timelineTransactions', { items: [{ id: 'old' }], nextCursor: 'next' })
  const initial = JSON.stringify(old),
    saved: DataSource[] = []
  let calls = 0
  const transport: ExplorerTransport = {
    read: async (id) => {
      if (id === 'timelineTransactions') {
        if (calls++ === 0) return { items: [{ id: 'new' }], cursors: { after: 'later' } }
        throw Error('private provider message')
      }
      return { sections: [] }
    },
  }
  await extractData(transport, [old], (s) => saved.push(s), signal(), 'continue', quiet)
  expect(JSON.stringify(old)).toBe(initial)
  expect(saved[0]).toMatchObject({
    status: 'failed',
    payload: old.payload,
    fetchedAt: old.fetchedAt,
  })
  expect(JSON.stringify(saved)).not.toContain('private provider message')
})
it('continues past individual detail failures and retains per-item outcomes', async () => {
  const saved: DataSource[] = []
  await extractData(
    {
      read: async (id, args) => {
        if (id === 'timelineTransactions')
          return { items: [{ id: 'bad' }, { id: 'good' }], cursors: {} }
        if (args.id === 'bad') throw Error('private')
        return { id: 'good', sections: [] }
      },
    },
    [],
    (s) => saved.push(s),
    signal(),
    'continue',
    quiet
  )
  const details = saved.find((s) => s.id === 'timelineDetails')!
  expect(details.status).toBe('partial')
  expect(JSON.stringify(details.payload)).toContain('good')
  expect(JSON.stringify(details.payload)).toContain('unexpected')
})
it('stops extraction on authentication rejection after saving safe failure evidence', async () => {
  let calls = 0
  const saved: DataSource[] = []
  await expect(
    extractData(
      {
        read: async () => {
          calls++
          throw new TRAuthError('secret')
        },
      },
      [],
      (s) => saved.push(s),
      signal(),
      'refresh',
      quiet
    )
  ).rejects.toBeInstanceOf(TRAuthError)
  expect(calls).toBe(1)
  expect(saved[0].error?.category).toBe('authentication')
})
it('does not save a late result after cancellation', async () => {
  const controller = new AbortController()
  const saved: DataSource[] = []
  await expect(
    extractData(
      {
        read: async () => {
          controller.abort()
          return { private: 'late' }
        },
      },
      [],
      (s) => saved.push(s),
      controller.signal,
      'refresh',
      quiet
    )
  ).rejects.toThrow()
  expect(saved).toEqual([])
})
it('marks bounded history as partial and continues without duplicate events', async () => {
  const saved: DataSource[] = []
  let pages = 0
  const transport: ExplorerTransport = {
    read: async (id) =>
      id === 'timelineTransactions'
        ? { items: [{ id: 'repeated' }], cursors: { after: `page-${++pages}` } }
        : { sections: [] },
  }
  await extractData(transport, [], (s) => saved.push(s), signal(), 'continue', quiet)
  expect(pages).toBe(10)
  expect(saved[0].status).toBe('partial')
  expect(saved[0].payload).toEqual({ items: [{ id: 'repeated' }], nextCursor: 'page-10' })
})
it('stores source snapshots separately from holdings and filters diagnostic source identifiers', () => {
  const store = new SnapshotStore(':memory:')
  store.saveSource(source('cash', [{ amount: 123, currencyId: 'EUR' }]))
  expect(store.sources().find((s) => s.id === 'cash')?.payload).toEqual([
    { amount: 123, currencyId: 'EUR' },
  ])
  expect(store.latest()).toBeNull()
  store.recordDiagnostic({
    attemptId: 'synthetic',
    sourceId: 'PRIVATE_ACCOUNT_ID',
    operation: 'sync',
    stage: 'data_extraction',
    event: 'failed',
    at: 'now',
    durationMs: 0,
    category: 'unexpected',
  })
  expect(store.diagnostics()[0].sourceId).toBeUndefined()
  store.close()
})

it('refresh merges new history with older records and retains the prior continuation cursor', async () => {
  const old = source('timelineTransactions', {
    items: [{ id: 'old', title: 'before' }, { id: 'older' }],
    nextCursor: 'older-cursor',
  })
  const saved: DataSource[] = []
  await extractData(
    {
      read: async (id) => {
        if (id === 'timelineTransactions')
          return {
            items: [{ id: 'new' }, { id: 'old', title: 'updated' }],
            cursors: { after: 'head-cursor' },
          }
        return {}
      },
    },
    [old],
    (s) => saved.push(s),
    signal(),
    'refresh',
    quiet
  )
  expect(saved.find((s) => s.id === 'timelineTransactions')?.payload).toEqual({
    items: [{ id: 'old', title: 'updated' }, { id: 'older' }, { id: 'new' }],
    nextCursor: 'older-cursor',
  })
  expect(old.payload).toEqual({
    items: [{ id: 'old', title: 'before' }, { id: 'older' }],
    nextCursor: 'older-cursor',
  })
})

it('persists extracted records across database reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'prism-source-test-')),
    path = join(dir, 'db.sqlite')
  let store = new SnapshotStore(path)
  try {
    store.saveSource(source('cash', [{ amount: 42, currencyId: 'EUR' }]))
    store.close()
    store = new SnapshotStore(path)
    expect(store.sources().find((s) => s.id === 'cash')?.payload).toEqual([
      { amount: 42, currencyId: 'EUR' },
    ])
  } finally {
    store.close()
    rmSync(dir, { recursive: true })
  }
})

it('bounds an evidence batch to one timeline page and twenty details, then resumes', async () => {
  const sources = new Map<string, DataSource>()
  const calls: { id: string; args: Record<string, string | boolean> }[] = []
  const transport: ExplorerTransport = { read: async (id, args) => {
    calls.push({ id, args })
    if (id === 'timelineTransactions') return {
      items: Array.from({ length: 25 }, (_, n) => ({ id: `event-${args.after ? n + 25 : n}` })),
      cursors: args.after ? {} : { after: 'older' },
    }
    return { sections: [] }
  } }
  const run = () => extractData(transport, [...sources.values()], s => sources.set(s.id, s), signal(), 'history-batch', quiet)
  await run()
  expect(calls.filter(c => c.id === 'timelineTransactions')).toEqual([{ id: 'timelineTransactions', args: {} }])
  expect(calls.filter(c => c.id === 'timelineDetailV2')).toHaveLength(20)
  expect(new Set(calls.map(c => c.id))).toEqual(new Set(['timelineTransactions', 'timelineDetailV2']))
  expect(sources.get('timelineTransactions')?.payload).toMatchObject({ nextCursor: 'older' })
  expect(sources.get('timelineDetails')).toMatchObject({ status: 'partial', payload: { remaining: 5 } })
  calls.length = 0
  await run()
  expect(calls.filter(c => c.id === 'timelineTransactions')).toEqual([{ id: 'timelineTransactions', args: { after: 'older' } }])
  expect(calls.filter(c => c.id === 'timelineDetailV2')).toHaveLength(20)
  expect(sources.get('timelineDetails')?.payload).toMatchObject({ remaining: 10 })
  calls.length = 0
  await run()
  expect(calls.filter(c => c.id === 'timelineTransactions')).toHaveLength(0)
  expect(calls.filter(c => c.id === 'timelineDetailV2')).toHaveLength(10)
})

it('retries failed detail reads in a bounded evidence batch', async () => {
  const saved: DataSource[] = []
  const reads: string[] = []
  await extractData({ read: async (id, args) => {
    reads.push(`${id}:${args.id}`)
    return { sections: [] }
  } }, [
    source('timelineTransactions', { items: [{ id: 'retry' }, { id: 'saved' }], nextCursor: null }),
    source('timelineDetails', { items: [{ id: 'retry', error: { category: 'network' } }, { id: 'saved', response: { sections: [] } }], remaining: 0 }),
  ], s => saved.push(s), signal(), 'history-batch', quiet)
  expect(reads).toEqual(['timelineDetailV2:retry'])
  expect(saved.find(s => s.id === 'timelineDetails')).toMatchObject({ status: 'success', payload: { remaining: 0 } })
})

it('resumes a bounded recent gap independently of the older backfill cursor', async()=>{
  const sources=new Map<string,DataSource>([['timelineTransactions',source('timelineTransactions',{items:[{id:'old'}],nextCursor:'older'})]])
  const calls:string[]=[]
  const run=()=>extractData({read:async(id,args)=>{
    calls.push(`${id}:${args.after??args.id??'head'}`)
    if(id==='timelineTransactions')return args.after==='recent-gap'?{items:[{id:'old'}],cursors:{after:'past-overlap'}}:{items:[{id:'new'}],cursors:{after:'recent-gap'}}
    return {sections:[]}
  }},[...sources.values()],s=>sources.set(s.id,s),signal(),'history-recent',quiet)
  await run()
  expect(sources.get('timelineTransactions')?.payload).toMatchObject({nextCursor:'older',recentCursor:'recent-gap'})
  await run()
  expect(calls.filter(c=>c.startsWith('timelineTransactions:'))).toEqual(['timelineTransactions:head','timelineTransactions:recent-gap'])
  expect(sources.get('timelineTransactions')?.payload).toMatchObject({nextCursor:'older',recentCursor:null})
})
it('refreshes details for a revised event and retains compatible good detail on a failed refresh',async()=>{
  const sources=new Map<string,DataSource>()
  let revision=1,fail=false
  const run=()=>extractData({read:async(id)=>{
    if(id==='timelineTransactions')return {items:[{id:'event',revision}],cursors:{}}
    if(fail)throw Error('private detail error')
    return {revision}
  }},[...sources.values()],s=>sources.set(s.id,s),signal(),'history-recent',quiet)
  await run();fail=true;await run()
  expect(sources.get('timelineDetails')?.payload).toMatchObject({items:[{id:'event',response:{revision:1},retained:true,error:{category:'unexpected'}}]})
  revision=2;await run()
  const payload=sources.get('timelineDetails')!.payload as {items:Record<string,unknown>[]}
  expect(payload.items[0].response).toBeUndefined()
  fail=false;await run()
  expect(sources.get('timelineDetails')?.payload).toMatchObject({items:[{id:'event',response:{revision:2}}]})
})

it('keeps the last successful timeline cutoff when a recent read fails and an empty detail batch does no work',async()=>{
  const sources=new Map<string,DataSource>([
    ['timelineTransactions',source('timelineTransactions',{items:[],nextCursor:null})],
    ['timelineDetails',source('timelineDetails',{items:[],remaining:0})],
  ])
  let fail=true
  const run=()=>extractData({read:async()=>{if(fail)throw Error('private failure');return {items:[],cursors:{}}}},[...sources.values()],s=>sources.set(s.id,s),signal(),'history-recent',quiet)
  await run()
  expect(sources.get('timelineTransactions')).toMatchObject({status:'failed',fetchedAt:'2026-01-01T00:00:00Z'})
  expect(sources.get('timelineDetails')?.fetchedAt).toBe('2026-01-01T00:00:00Z')
  const {tradeRepublicEvents}=await import('../server/trade-republic-events')
  expect(tradeRepublicEvents([...sources.values()])?.coverage).toMatchObject({acquisition:'failed',timelineObservedAt:'2026-01-01T00:00:00Z',observedAt:'2026-01-01T00:00:00Z'})
  fail=false;await run()
  expect(tradeRepublicEvents([...sources.values()])?.coverage.acquisition).toBe('partial')
  expect(sources.get('timelineTransactions')?.fetchedAt).not.toBe('2026-01-01T00:00:00Z')
})
