/** Example/test host only. Core service owns valuation, storage and projection. */
import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { SnapshotStore } from '../../server/store'
import { PortfolioService } from '../../server/service'
import { ProviderRefreshService } from '../../server/provider-refresh-service'
import { createPluginRegistry } from '../../server/plugin-registry'
import { financialRead, financialRoute } from '../../server/financial-read-model'
import type { Broker } from '../../sdk/server'
import { examplePlugin } from './server'
import { exampleFundIsin } from './metadata'
import { exampleContext } from './fixture'
const unavailableBroker: Broker = { authenticate: async () => { throw Error('No broker in synthetic example') },
  restore: async () => false, fetch: async () => { throw Error('No broker in synthetic example') }, logout() {}, close() {}, warning: () => null }
export async function createExampleHost() {
  const directory = mkdtempSync(join(tmpdir(), 'prism-sdk-example-')), path = join(directory, 'portfolio.sqlite')
  const registry = createPluginRegistry([examplePlugin])
  let store = new SnapshotStore(path, registry)
  const at = '2026-09-21T10:00:00.000Z'
  const connection = store.connections.add('synthetic-example-ledger', '1.0.0')
  store.connections.saveSnapshot(connection.id, { fetchedAt: at, positions: [
    { isin: exampleFundIsin, account: 'example', name: 'Synthetic contributor fund', quantity: '10', instrumentType: 'fund', averageBuyIn: '1' },
    { isin: 'US5949181045', account: 'example', name: 'Synthetic unvalued holding', quantity: '1', instrumentType: 'stock', averageBuyIn: '1' },
  ] })
  const common = { observedAt: at, checkedAt: at, completeness: 'success', quotes: [], instruments: [], cash: [] }
  store.connections.saveObservation(connection.id, { ...common, sourceId: 'instrumentDetails', instruments: [{ isin: exampleFundIsin,
    confirmedIsin: exampleFundIsin, unit: 'per-security', listings: [{ venue: 'synthetic', currency: 'EUR', active: true }], failed: false }] })
  store.connections.saveObservation(connection.id, { ...common, sourceId: 'quotes', quotes: [{ isin: exampleFundIsin, venue: 'synthetic', price: '100', time: Date.parse(at), failed: false }] })
  const providerHost = new ProviderRefreshService(store, registry, exampleContext)
  let service = new PortfolioService(unavailableBroker, store)
  try {
    assert.equal(providerHost.refresh(), true); await providerHost.settled()
    assert.equal(store.selectedCompositions().length, 1)
    const before = financialRead(service, 'analysis')
    await providerHost.close(); await service.close()
    store = new SnapshotStore(path, createPluginRegistry([examplePlugin]))
    service = new PortfolioService(unavailableBroker, store)
    assert.deepEqual(financialRead(service, 'analysis'), before)
    return { directory, service, store, close: async () => { await service.close(); rmSync(directory, { recursive: true, force: true }) } }
  } catch (error) { await providerHost.close(); await service.close(); rmSync(directory, { recursive: true, force: true }); throw error }
}
export async function serveExample() {
  const host = await createExampleHost()
  const http = createHttpServer()
  const server = await createServer({ server: { middlewareMode: true, hmr: { server: http } }, plugins: [{ name: 'synthetic-sdk-read-api',
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next()
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }
      const result = financialRoute(new URL(req.url, 'http://127.0.0.1'), host.service)
      res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.body))
    }) },
  }] })
  http.on('request', server.middlewares)
  try { await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve) }) }
  catch (error) { await server.close(); await host.close(); throw error }
  const address = http.address()
  if (!address || typeof address === 'string') throw Error('Example loopback address unavailable')
  return { ...host, url: `http://127.0.0.1:${address.port}/examples/synthetic-source/index.html`,
    close: async () => { await server.close(); await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())); await host.close() } }
}
