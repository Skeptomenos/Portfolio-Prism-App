import { expect, it } from 'vitest'
import { extractData, catalog, type DataSource, type ExplorerTransport } from '../server/explorer'
const isin = 'XF000BTC0017'
const time = Date.parse('2026-09-01T12:00:00Z')
const source = (id: string, payload: DataSource['payload']): DataSource => ({ ...catalog.find(s => s.id === id)!, status: 'success', payload, fetchedAt: new Date(time).toISOString() })
const metadata = (active = true) => ({ isin, typeId: 'crypto', legalTypeId: 'CRYPTO', priceFactor: 1, listings: [{ slug: 'BHS', active, currencyId: 'EUR' }, { slug: 'B2C', active, currencyId: 'EUR' }] })
async function run(ticker: ExplorerTransport['read'], previous: DataSource[] = [], active = true, excluded: readonly string[] = []) {
 const saved: DataSource[] = [], calls: string[] = []
 await extractData({ read: async (id,args,signal) => {
  if (id === 'accountPairs') return { accounts: [{ securitiesAccountNumber: 'synthetic' }] }
  if (id === 'compactPortfolioByType') return { categories: [{ positions: [{ isin, instrumentType: 'crypto' }] }] }
  if (id === 'instrument') return metadata(active)
  if (id === 'ticker') { calls.push(String(args.id)); return ticker(id,args,signal) }
  return []
 } },previous,s=>saved.push(s),new AbortController().signal,'valuation',()=>{},excluded)
 return { quotes: saved.find(s=>s.id==='quotes')!,calls }
}
it('uses only exact active listings and a bounded same-currency fallback',async()=>{
 const result = await run(async(_id,args)=> { if (args.id === `${isin}.BHS`) throw Error('private'); return { bid: { price: '12345.6789',time } } })
 expect(result.calls).toEqual([`${isin}.BHS`,`${isin}.B2C`])
 expect(result.quotes).toMatchObject({status:'success',payload:[{isin,venue:'B2C',currency:'EUR',quote:{bid:{price:'12345.6789',time}},attempts:[{venue:'BHS',error:{category:'unexpected'}}]}]})
 expect(JSON.stringify(result.quotes)).not.toContain('private')
})
it('retains the original quote venue, date and price if both reads fail',async()=>{
 const old = source('quotes',[{isin,venue:'B2C',receivedAt:'2026-09-01T12:00:01Z',quote:{bid:{price:'11111.1111',time}}}])
 const result = await run(async()=>{throw Error('unavailable')},[old])
 expect(result.quotes).toMatchObject({status:'partial',payload:[{isin,venue:'B2C',retained:true,receivedAt:'2026-09-01T12:00:01Z',quote:{bid:{price:'11111.1111',time}}}]})
 expect(result.calls).toHaveLength(2)
})
it('does not probe inactive or guessed venues and preserves unusable old evidence',async()=>{
 const old = source('quotes',[{isin,venue:'LSX',quote:{bid:{price:'0.5',time}}}])
 const result = await run(async()=>{throw Error('must not request')},[old],false)
 expect(result.calls).toEqual([])
 expect(result.quotes).toMatchObject({status:'partial',payload:[{isin,venue:'LSX',retained:true,selectionReason:expect.stringContaining('all-listings-inactive')}]})
})

it('skips excluded quote investigation while retaining holdings and original quote evidence', async () => {
 const old = source('quotes', [{ isin, venue: 'BHS', quote: { bid: { price: '123.456', time } } }])
 const result = await run(async () => { throw Error('must not request') }, [old], true, [isin])
 expect(result.calls).toEqual([])
 expect(result.quotes.payload).toMatchObject([{ isin, venue: 'BHS', quote: { bid: { price: '123.456', time } }, investigation: 'excluded' }])
})

it('does not carry historical request errors into an excluded attempt or later repeat', async () => {
 const old = source('quotes', [{ isin, venue: 'BHS', quote: { bid: { price: '123.456', time } }, error: { category: 'timeout' }, attempts: [{ venue: 'BHS', error: { category: 'timeout' } }] }])
 const first = await run(async () => { throw Error('must not request') }, [old], true, [isin])
 const repeat = await run(async () => { throw Error('must not request') }, [first.quotes], true, [isin])
 for (const result of [first, repeat]) {
  expect(result.calls).toEqual([])
  expect(result.quotes.status).toBe('success')
  expect(result.quotes.payload).toMatchObject([{ isin, investigation: 'excluded', retained: true, quote: { bid: { price: '123.456', time } } }])
  expect(result.quotes.payload).not.toMatchObject([{ error: expect.anything() }])
 }
})
