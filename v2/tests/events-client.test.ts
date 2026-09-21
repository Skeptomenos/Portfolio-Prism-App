import { it,expect,vi } from 'vitest'
import { createEventsClient } from '../web/views/events-client'
const zero={contractVersion:'portfolio-events/1',events:[],connections:[],totals:[{currency:'EUR',purchases:'0',sales:'0',cashAdded:'0',cashWithdrawn:'0',income:'0',spending:'0',internalTransfers:0,netCashMovement:'0'}],reconciliation:{from:null,to:null,rows:[],gaps:[]},gaps:[]}
const signal=()=>new AbortController().signal
it('retains supported zero amounts and rejects incompatible or malformed financial responses',async()=>{
  let body:unknown=zero
  const client=createEventsClient(async()=>new Response(JSON.stringify(body),{status:200}))
  expect((await client.read(signal())).totals[0].netCashMovement).toBe('0')
  body={...zero,contractVersion:'other/1'};await expect(client.read(signal())).rejects.toThrow('incompatible')
  body={...zero,totals:[{...zero.totals[0],netCashMovement:'NaN'}]};await expect(client.read(signal())).rejects.toThrow('incompatible')
})
it('uses only the fixed bounded mutation with required headers and surfaces unavailable connections',async()=>{
  let status=202
  const calls:{url:unknown;init:RequestInit|undefined}[]=[]
  const client=createEventsClient(async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({accepted:true,attemptId:'batch-one'}),{status})})
  await client.backfill(signal())
  expect(calls[0]).toMatchObject({url:'/api/events/backfill',init:{method:'POST',body:'{}',headers:{'X-Prism-Client':'1','Content-Type':'application/json'}}})
  status=409;await expect(client.backfill(signal())).rejects.toThrow('Connect on Portfolio')
})

it('correlates even immediate completion and ignores unrelated terminal operations',async()=>{
  vi.useFakeTimers()
  try{
    let reads=0
    const client=createEventsClient(async()=>new Response(JSON.stringify({events:++reads===1?[{attemptId:'other',event:'succeeded',terminal:true}]:[{attemptId:'mine',event:'partial',terminal:true}]})))
    const pending=client.completion('mine',signal())
    await vi.advanceTimersByTimeAsync(1000)
    expect(await pending).toBe('partial');expect(reads).toBe(2)
    for(const event of ['succeeded','failed','cancelled']){
      const immediate=createEventsClient(async()=>new Response(JSON.stringify({events:[{attemptId:'mine',event,terminal:true}]})))
      expect(await immediate.completion('mine',signal())).toBe(event)
    }
  }finally{vi.useRealTimers()}
})
it('stops observation on abort without further requests',async()=>{
  vi.useFakeTimers()
  try{
    const request=vi.fn(async()=>new Response(JSON.stringify({events:[]}))),controller=new AbortController()
    const pending=createEventsClient(request).completion('mine',controller.signal)
    const rejected=expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(0);controller.abort();await rejected
    await vi.advanceTimersByTimeAsync(5000);expect(request).toHaveBeenCalledTimes(1)
  }finally{vi.useRealTimers()}
})
it('bounds missing-terminal observation and reports unavailable diagnostics',async()=>{
  vi.useFakeTimers()
  try{
    const request=vi.fn(async()=>new Response(JSON.stringify({events:[]})))
    const pending=createEventsClient(request).completion('missing',signal())
    const rejected=expect(pending).rejects.toThrow('Completion is not confirmed')
    await vi.advanceTimersByTimeAsync(190_000);await rejected
    expect(request).toHaveBeenCalledTimes(190)
    await expect(createEventsClient(async()=>new Response('{}',{status:503})).completion('missing',signal())).rejects.toThrow('Completion status is unavailable')
  }finally{vi.useRealTimers()}
})

it('does not observe an accepted batch without a valid completion reference',async()=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({accepted:true,attemptId:null}),{status:202}))
  await expect(createEventsClient(request).backfill(signal())).rejects.toThrow('was accepted')
  expect(request).toHaveBeenCalledTimes(1)
})
