import { it, expect, vi } from 'vitest'
import { TradeRepublicBroker, tradeRepublicProvider } from '../server/broker'
it('forwards excluded quote scopes through the real registered provider for primary and additional connections', async () => {
 const raw=vi.spyOn(TradeRepublicBroker.prototype,'readData').mockResolvedValue()
 const normalized=vi.spyOn(TradeRepublicBroker.prototype,'readObservations').mockResolvedValue()
 const vault={getPassword:vi.fn(()=>null),setPassword:vi.fn(),deleteCredential:vi.fn(()=>true)}
 const broker=tradeRepublicProvider.create({connectionId:'synthetic',vault})
 const save=vi.fn(),signal=new AbortController().signal,excluded=['US0378331005']
 try {
  await broker.readData!([],save,signal,'valuation',excluded)
  expect(raw).toHaveBeenCalledWith([],save,signal,'valuation',excluded)
  await broker.readData!([],save,signal,'refresh',excluded)
  expect(raw).toHaveBeenLastCalledWith([],save,signal,'refresh',excluded)
  await broker.readObservations!([],save,signal,excluded)
  expect(normalized).toHaveBeenCalledWith([],save,signal,excluded)
  expect(vault.getPassword).not.toHaveBeenCalled()
 } finally {raw.mockRestore();normalized.mockRestore()}
})
