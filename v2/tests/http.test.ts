import { describe, it, expect, vi } from 'vitest'
import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { api } from '../server/http'
import { PortfolioService } from '../server/service'
import { SnapshotStore } from '../server/store'
import type { Broker } from '../server/broker'

const broker: Broker = {
  authenticate: async () => {},
  restore: async () => false,
  fetch: async () => ({ fetchedAt: new Date().toISOString(), positions: [] }),
  logout() {},
  close() {},
  warning: () => null,
}
describe('local HTTP boundary', () => {
  it('rejects foreign origins, rebound hosts, missing mutation headers and invalid login input', async () => {
    const service = new PortfolioService(broker, new SnapshotStore(':memory:'))
    let origin = ''
    const server = createServer((req, res) => {
      void api(req, res, service, origin)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      expect((await fetch(`${origin}/api/status`)).status).toBe(200)
      expect((await fetch(`${origin}/api/data`)).status).toBe(200)
      expect((await fetch(`${origin}/api/exposure`)).status).toBe(200)
      expect(
        (await fetch(`${origin}/api/exposure`, { headers: { Origin: 'https://evil.example' } }))
          .status
      ).toBe(403)
      expect((await fetch(`${origin}/api/composition/refresh`, { method: 'POST' })).status).toBe(
        403
      )
      expect(
        (await fetch(`${origin}/api/overview`, { headers: { Origin: 'https://evil.example' } }))
          .status
      ).toBe(403)
      expect(
        (await fetch(`${origin}/api/data`, { headers: { Origin: 'https://evil.example' } })).status
      ).toBe(403)
      expect((await fetch(`${origin}/api/extract`, { method: 'POST' })).status).toBe(403)
      expect((await fetch(`${origin}/api/history/batch`, { method: 'POST' })).status).toBe(403)
      expect(
        (await fetch(`${origin}/api/status`, { headers: { Origin: 'https://evil.example' } }))
          .status
      ).toBe(403)
      const badHostStatus = await new Promise<number | undefined>((resolve) => {
        const req = request(
          `${origin}/api/status`,
          { headers: { Host: 'evil.example' } },
          (res) => {
            res.resume()
            resolve(res.statusCode)
          }
        )
        req.end()
      })
      expect(badHostStatus).toBe(403)
      expect((await fetch(`${origin}/api/sync`, { method: 'POST' })).status).toBe(403)
      const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Prism-Client': '1' }
      const invalid = await fetch(`${origin}/api/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: 'invalid', pin: 'secret' }),
      })
      expect(invalid.status).toBe(400)
      expect(await invalid.text()).not.toContain('secret')
      expect(
        (await fetch(`${origin}/api/sync`, { method: 'POST', headers, body: '{}' })).status
      ).toBe(202)
      await service.settled()
      const extract = vi.spyOn(service, 'extract').mockReturnValue(true)
      expect((await fetch(`${origin}/api/history/batch`, { method: 'POST', headers, body: '{}' })).status).toBe(202)
      expect(extract).toHaveBeenCalledExactlyOnceWith('history-batch')
      extract.mockRestore()
    } finally {
      await service.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

it('returns the accepted history attempt reference even when the batch finishes immediately',async()=>{
  const store=new SnapshotStore(':memory:')
  const service=new PortfolioService({...broker,readEvents:async()=>{}},store)
  service.authenticate({phone:'+49123456789',pin:'1234'});await service.settled()
  let origin=''
  const server=createServer((req,res)=>{void api(req,res,service,origin)})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try{
    const response=await fetch(`${origin}/api/events/backfill`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Prism-Client':'1'},body:'{}'})
    expect(response.status).toBe(202)
    const body=await response.json();expect(body.accepted).toBe(true)
    await service.settled()
    expect(service.diagnostics().find(d=>d.attemptId===body.attemptId&&d.terminal)).toMatchObject({operation:'extraction',event:'succeeded'})
    const prior=service.diagnostics()
    const diagnosticRead=vi.spyOn(service,'diagnostics').mockReturnValue(prior)
    const unobservable=await fetch(`${origin}/api/events/backfill`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Prism-Client':'1'},body:'{}'})
    expect(await unobservable.json()).toEqual({accepted:true,attemptId:null})
    diagnosticRead.mockRestore();await service.settled()
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close()}
})
