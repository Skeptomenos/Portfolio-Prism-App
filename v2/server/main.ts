import { startAutomaticRefresh } from './automatic-refresh'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { connectionVault } from './connection-vault'
import { SnapshotStore } from './store'
import { PortfolioService } from './service'
import { api, allowedRequest } from './http'

const port = Number(process.env.PRISM_V2_PORT ?? 4310)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PRISM_V2_PORT')
const origin = `http://127.0.0.1:${port}`
const dataDir = process.env.PRISM_V2_DATA_DIR ?? join(homedir(), '.portfolio-prism-v2')
const evidenceDirectory = process.env.PRISM_V2_EVIDENCE_DIR ?? null
const offline = process.env.PRISM_V2_OFFLINE === '1'
const store = new SnapshotStore(join(dataDir, 'portfolio.sqlite'))
const service = new PortfolioService(() => store.registry.brokerProvider('trade-republic')!.create({ connectionId: store.connections.defaultId, vault: connectionVault('trade-republic',store.connections.defaultId,store.connections.defaultId) }), store, evidenceDirectory, !offline)
const server = createServer((req, res) => {
  if (!allowedRequest(req, origin)) {
    res.writeHead(403)
    res.end('Request rejected')
    return
  }
  if (req.url?.startsWith('/api/')) {
    void api(req, res, service, origin).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  } else vite.middlewares(req, res)
})
const vite = await createViteServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: { server } },
  appType: 'spa',
})
server.requestTimeout = 10_000
let stopAutomaticRefresh = () => {}
server.listen(port, '127.0.0.1', () => {
  console.log(`Portfolio Prism V2: ${origin}`)
  stopAutomaticRefresh = startAutomaticRefresh(service, !offline)
})
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  stopAutomaticRefresh()
  server.close()
  await service.close()
  await vite.close()
}
process.on('SIGINT', () => {
  void stop()
})
process.on('SIGTERM', () => {
  void stop()
})
