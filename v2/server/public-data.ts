import WebSocket from 'ws'
import { TRConnectionError, TRTimeoutError } from 'trade-republic-sdk'

// pytr's read-only instrument/stockDetails topics, on the same public broker socket as quotes.
// This connection never receives session cookies or broker credentials.
export function readPublicData(
  topic: 'instrument' | 'stockDetails',
  isin: string,
  signal: AbortSignal,
  connect: () => WebSocket = () => new WebSocket('wss://api.traderepublic.com')
): Promise<unknown> {
  if (!['instrument', 'stockDetails'].includes(topic) || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin))
    return Promise.reject(new Error('Invalid public read'))
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const socket = connect()
    let done = false
    const finish = (error: unknown, value?: unknown) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (socket.readyState === WebSocket.OPEN) {
        socket.send('unsub 1')
        socket.close()
      } else socket.terminate()
      if (error) reject(error)
      else resolve(value)
    }
    const abort = () => finish(signal.reason ?? new Error('Cancelled'))
    const timer = setTimeout(
      () => finish(new TRTimeoutError('Public data request timed out')),
      10000
    )
    signal.addEventListener('abort', abort, { once: true })
    socket.on('open', () =>
      socket.send(
        'connect 31 ' +
          JSON.stringify({
            locale: 'en',
            platformId: 'webtrading',
            clientId: 'app.traderepublic.com',
            clientVersion: '3.181.1',
          })
      )
    )
    socket.on('message', (raw) => {
      if (done) return
      const frame = raw.toString()
      if (frame === 'connected') socket.send('sub 1 ' + JSON.stringify({ type: topic, id: isin }))
      else if (frame.startsWith('1 A ')) {
        try {
          finish(null, JSON.parse(frame.slice(4)))
        } catch {
          finish(new Error('Invalid public response'))
        }
      } else if (frame.startsWith('1 E ') || frame.startsWith('1 C'))
        finish(new Error('Public data unavailable'))
    })
    socket.on('error', () => finish(new TRConnectionError('Public data connection failed')))
    socket.on('close', () => finish(new TRConnectionError('Public data connection closed')))
  })
}
