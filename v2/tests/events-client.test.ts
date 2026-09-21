import { it,expect } from 'vitest'
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
  const client=createEventsClient(async(url,init)=>{calls.push({url,init});return new Response('{}',{status})})
  await client.backfill(signal())
  expect(calls[0]).toMatchObject({url:'/api/events/backfill',init:{method:'POST',body:'{}',headers:{'X-Prism-Client':'1','Content-Type':'application/json'}}})
  status=409;await expect(client.backfill(signal())).rejects.toThrow('Connect on Portfolio')
})
