import type { IncomingMessage, ServerResponse } from 'node:http'
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
    if (req.url === '/api/login') {
      const { phone, pin } = Schema.decodeUnknownSync(LoginSchema)(JSON.parse(text))
      accepted = service.login(phone, pin)
    } else if (req.url === '/api/composition/refresh') accepted = service.compositions.refresh()
    else if (req.url === '/api/extract') accepted = service.extract('refresh')
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
