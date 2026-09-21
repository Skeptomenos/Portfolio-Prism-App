import { it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { api } from '../server/http'
import { financialFixture } from './fixtures/financial'
it('validates same-origin investigation commands and reports atomic storage failures without private input', async () => {
 const { store, service } = financialFixture()
 let origin = ''
 const server = createServer((req,res) => void api(req,res,service,origin))
 await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
 origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
 const url = origin + '/api/investigations'
 const headers = { Origin: origin, 'Content-Type':'application/json','X-Prism-Client':'1' }
 const command = {action:'decide',scope:{connectionId:store.connections.defaultId,account:'eur',isin:'US67066G1040'},state:'excluded',reason:'Synthetic decision'}
 try {
  expect((await fetch(url)).status).toBe(200)
  expect((await fetch(url,{method:'POST',body:JSON.stringify(command)})).status).toBe(403)
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({...command,quantity:'99'})})).status).toBe(400)
  expect(store.investigations.snapshot().decisions).toHaveLength(0)
  const saved = await fetch(url,{method:'POST',headers,body:JSON.stringify(command)})
  expect(saved.status).toBe(200)
  expect((await saved.json()).counts.excluded).toBe(1)
  const before=JSON.stringify(store.investigations.snapshot())
  const spy=vi.spyOn(store.history,'capture').mockImplementation(()=>{throw Error('PRIVATE-STORAGE-MARKER')})
  const failed=await fetch(url,{method:'POST',headers,body:JSON.stringify({...command,state:'open'})})
  expect(failed.status).toBe(500)
  expect(await failed.text()).not.toContain('PRIVATE-STORAGE-MARKER')
  expect(JSON.stringify(store.investigations.snapshot())).toBe(before)
  spy.mockRestore()
 } finally { await new Promise<void>(resolve=>server.close(()=>resolve()));await service.close() }
})
