import { expect,it } from 'vitest'
import { decodeConnections } from '../contracts/connections'
import { boundedOperation } from '../server/bounded-operation'
it('rejects malformed connection status and strips unrequested private fields', () => {
  expect(() => decodeConnections({connections:[{id:'x',connected:'yes'}]})).toThrow()
  const decoded = decodeConnections({connections:[{id:'id',providerId:'provider',providerVersion:'1',enabled:true,available:true,connected:false,phase:'disconnected',error:null,active:false,savedHoldingsAt:null,password:'not-public'}]})
  expect(JSON.stringify(decoded)).not.toContain('not-public')
})
it('bounds a connector that ignores cancellation', async () => {
  const controller = new AbortController()
  const work = boundedOperation(new Promise<void>(() => {}),controller.signal)
  controller.abort()
  await expect(work).rejects.toThrow()
})
