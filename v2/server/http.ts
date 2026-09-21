import { connectionRequest } from './connection-http'
import { financialRoute } from './financial-read-model'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HistoryParameterError } from './history'
import { Schema } from 'effect'
import { LoginSchema } from './model'
import type { PortfolioService } from './service'

export function allowedRequest(req: IncomingMessage, origin: string): boolean {
  if (req.headers.host !== new URL(origin).host) return false
  if (req.headers.origin && req.headers.origin !== origin) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  if (
    req.method !== 'GET' &&
    (req.headers.origin !== origin ||
      req.headers['x-prism-client'] !== '1' ||
      req.headers['content-type'] !== 'application/json')
  )
    return false
  return true
}
export async function api(
  req: IncomingMessage,
  res: ServerResponse,
  service: PortfolioService,
  origin: string
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const send = (status: number, data: object) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  if (!allowedRequest(req, origin)) {
    send(403, { error: 'Request origin rejected' })
    return
  }
  const url = new URL(req.url ?? '/', origin)
  if (req.method === 'GET' && url.pathname === '/api/connections' && !url.search) {
    const result = await connectionRequest('GET',url.pathname,null,service.connections)
    send(result!.status,result!.data); return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/financial/')) {
    const result = financialRoute(url, service)
    send(result.status, result.body)
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/events' && !url.search) {
    try { send(200,service.events()) } catch { send(500,{error:'Saved event evidence is unavailable.'}) }
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/history/')) {
    try {
      let result: object | null
      if (url.pathname === '/api/history/runs') {
        if ([...url.searchParams.keys()].some(key => !['limit', 'cursor'].includes(key)) ||
          url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1 ||
          (url.searchParams.has('limit') && !/^[1-9]\d{0,2}$/.test(url.searchParams.get('limit')!))) throw new HistoryParameterError()
        result = service.history().runs(url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 25, url.searchParams.get('cursor'))
      } else {
        if (url.search) throw new HistoryParameterError()
        const match = /^\/api\/history\/(runs|checkpoints)\/(.*)$/.exec(url.pathname)
        if (!match) { send(404, { error: 'History endpoint not found' }); return }
        result = match[1] === 'runs' ? service.history().run(match[2]) : service.history().checkpoint(match[2])
      }
      send(result ? 200 : 404, result ?? { error: 'History record not found' })
    } catch (error) {
      send(error instanceof HistoryParameterError ? 400 : 500, { error: error instanceof HistoryParameterError ? 'Invalid history request' : 'Saved history is unavailable. Check local storage and restore a verified backup if needed.' })
    }
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/coverage') {
    send(200, service.coverage())
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/development') {
    send(200, service.development())
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/development/etf/')) {
    const isin = decodeURIComponent(url.pathname.slice('/api/development/etf/'.length))
    const fund = service.developmentFund(isin)
    if (!fund) {
      send(404, { error: 'Development fund not found' })
      return
    }
    send(200, fund)
    return
  }
  if (req.method === 'GET' && req.url === '/api/overview') {
    send(200, service.overview())
    return
  }
  if (req.method === 'GET' && req.url === '/api/exposure') {
    send(200, service.exposure())
    return
  }
  if (req.method === 'GET' && req.url === '/api/data') {
    send(200, { sources: service.sources() })
    return
  }
  if (req.method === 'GET' && req.url === '/api/diagnostics') {
    send(200, { events: service.diagnostics() })
    return
  }
  if (req.method === 'GET' && req.url === '/api/status') {
    send(200, service.status())
    return
  }
  if (req.method === 'GET' && req.url === '/api/compositions/status') {
    send(200, service.issuerRefresh.status())
    return
  }
  if (req.method !== 'POST') {
    send(404, { error: 'Not found' })
    return
  }
  let text = ''
  for await (const chunk of req) {
    text += chunk.toString()
    if (Buffer.byteLength(text) > 2048) {
      send(413, { error: 'Request too large' })
      return
    }
  }
  let accepted: boolean
  try {
    const connection = await connectionRequest('POST',req.url ?? '',text ? JSON.parse(text) : {},service.connections)
    if (connection) { send(connection.status,connection.data); return }
    if (req.url === '/api/login') {
      const { phone, pin } = Schema.decodeUnknownSync(LoginSchema)(JSON.parse(text))
      accepted = service.login(phone, pin)
    } else if (req.url === '/api/composition/refresh') accepted = service.compositions.refresh()
    else if (req.url === '/api/compositions/refresh') accepted = service.issuerRefresh.refresh()
    else if (req.url === '/api/compositions/cancel') {
      service.issuerRefresh.cancel()
      accepted = true
    }
    else if (req.url === '/api/extract') accepted = service.extract('refresh')
    else if (req.url === '/api/events/backfill') accepted = service.backfillEvents()
    else if (req.url === '/api/history/batch') accepted = service.extract('history-batch')
    else if (req.url === '/api/history/continue') accepted = service.extract('continue')
    else if (req.url === '/api/sync') accepted = service.sync()
    else if (req.url === '/api/logout') accepted = service.logout()
    else if (req.url === '/api/cancel') {
      service.cancel()
      accepted = true
    } else {
      send(404, { error: 'Not found' })
      return
    }
  } catch {
    service.invalidRequest()
    send(400, { error: 'Could not process request. Check your input or system credential store.' })
    return
  }
  send(
    accepted ? 202 : 409,
    accepted ? { accepted: true } : { error: 'Another operation is running' }
  )
}
