import type { BrokerConnections } from './broker-connections'
/** Called only after the host's origin/content-type and body-size guards. */
export async function connectionRequest(method: string, path: string, body: unknown, connections: BrokerConnections): Promise<{ status: number; data: object } | null> {
  if (path === '/api/connections' && method === 'GET') return { status: 200, data: { providers: connections.providers(), connections: connections.list() } }
  if (method !== 'POST' || !path.startsWith('/api/connections')) return null
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Invalid connection request')
  const value = body as Record<string, unknown>
  if (path === '/api/connections') {
    if (Object.keys(value).length !== 1 || typeof value.providerId !== 'string') throw Error('Invalid provider')
    return { status: 201, data: connections.add(value.providerId) }
  }
  const match = /^\/api\/connections\/([0-9a-f-]{36})\/(authenticate|sync|restore|cancel|disable|enable|logout)$/.exec(path)
  if (!match) throw Error('Invalid connection command')
  const [,id,command] = match
  if (command !== 'authenticate' && Object.keys(value).length) throw Error('Unexpected command input')
  let accepted = true
  if (command === 'authenticate') accepted = connections.authenticate(id,value)
  else if (command === 'sync') accepted = connections.sync(id)
  else if (command === 'restore') accepted = connections.restore(id)
  else if (command === 'cancel') connections.cancel(id)
  else if (command === 'logout') accepted = await connections.logout(id)
  else await connections.enable(id,command === 'enable')
  return { status: accepted ? 202 : 409, data: accepted ? { accepted: true } : { error: 'An operation is already running for this connection' } }
}
