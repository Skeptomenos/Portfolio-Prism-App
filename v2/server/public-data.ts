import WebSocket from 'ws'
import { BrokerFailure } from './broker-contract'

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
    let transportPhase: 'connect' | 'response' = 'connect'
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
      () => finish(new BrokerFailure({ category: 'timeout', errorType: 'TRTimeoutError', timeoutOrigin: 'request', transportPhase })),
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
      if (frame === 'connected') { transportPhase = 'response'; socket.send('sub 1 ' + JSON.stringify({ type: topic, id: isin })) }
      else if (frame.startsWith('1 A ')) {
        try {
          finish(null, JSON.parse(frame.slice(4)))
        } catch {
          finish(new Error('Invalid public response'))
        }
      } else if (frame.startsWith('1 E ') || frame.startsWith('1 C'))
        finish(new BrokerFailure({ category: 'provider_topic', transportPhase }))
    })
    socket.on('error', () => finish(new BrokerFailure({ category: 'connection', errorType: 'TRConnectionError', transportPhase })))
    socket.on('close', (closeCode) => finish(new BrokerFailure({ category: 'connection', errorType: 'TRConnectionError', transportPhase, closeCode })))
  })
}
