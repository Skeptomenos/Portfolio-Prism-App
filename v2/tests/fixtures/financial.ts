import { SnapshotStore } from '../../server/store'
import { PortfolioService } from '../../server/service'
import type { Broker } from '../../server/broker'
import { catalog, type DataSource } from '../../server/explorer'
import { providerEvidence } from '../provider-fixture'
import { inspectionEvidence } from '../inspection-fixture'
export function financialFixture(path = ':memory:') {
  const store = new SnapshotStore(path)
  const at = '2026-09-20T10:00:00Z'
  const positions = [
    { account: 'eur', isin: 'US0378331005', name: 'Synthetic stock', instrumentType: 'stock', quantity: '2.000000000000000001', averageBuyIn: '1' },
    { account: 'usd', isin: 'US0378331005', name: 'Synthetic stock', instrumentType: 'stock', quantity: '1', averageBuyIn: '1' },
    { account: 'eur', isin: 'IE00B4L5Y983', name: 'Synthetic World ETF', instrumentType: 'fund', quantity: '1', averageBuyIn: '1' },
    { account: 'eur', isin: 'FR0010361683', name: 'Synthetic Amundi', instrumentType: 'fund', quantity: '1', averageBuyIn: '1' },
    { account: 'eur', isin: 'US67066G1040', name: 'Synthetic unknown', instrumentType: 'stock', quantity: '1', averageBuyIn: '1' },
  ]
  const snapshot = { fetchedAt: at, positions }; store.save(snapshot)
  const source = (id: string, payload: DataSource['payload']) => store.saveSource({ ...catalog.find(item => item.id === id)!, status: 'success', fetchedAt: at, payload })
  source('instrumentDetails', positions.slice(0, 4).map(item => ({ isin: item.isin, response: { isin: item.isin,
    priceFactor: 1, listings: [{ slug: 'TEST', currencyId: 'EUR', active: true }], credentials: 'PRIVATE-MARKER' } })))
  source('quotes', positions.slice(0, 4).map(item => ({ isin: item.isin, venue: 'TEST', quote: { bid: { price: '100.1234567890123456789', time: Date.parse(at) + 1 } } })))
  source('cash', [{ accountNumber: 'eur', currencyId: 'EUR', amount: 12.5 }, { accountNumber: 'usd', currencyId: 'USD', amount: 2 }])
  store.saveProviderEvidence(providerEvidence('IE00B4L5Y983'), { id: 'source-test', at, providerId: 'ishares-bundled', status: 'success', code: null, outcome: 'updated', resolution: 'Saved' })
  store.saveInspectionEvidence(inspectionEvidence(), { id: 'inspection-test', at, providerId: 'amundi-bundled', status: 'success', code: null, outcome: 'updated', resolution: 'Saved' })
  const broker: Broker = { authenticate: async () => {}, restore: async () => false, fetch: async () => snapshot,
    logout() {}, close() {}, warning: () => null }
  const service = new PortfolioService(broker, store)
  return { service, store }
}
