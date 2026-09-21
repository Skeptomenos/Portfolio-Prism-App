import React, { useEffect, useState } from 'react'
import { decodeConnections, type ConnectionStatus } from '../contracts/connections'

export function ConnectionList() {
  const [connections,setConnections] = useState<readonly ConnectionStatus[]>([])
  const [error,setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const read = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch('/api/connections',{signal:controller.signal})
        if (!response.ok) throw Error('Connections unavailable')
        const result = decodeConnections(await response.json())
        if (!controller.signal.aborted) { setConnections(result.connections); setError(false) }
      } catch { if (!controller.signal.aborted) setError(true) }
      finally { pending = false }
    }
    void read()
    const timer = setInterval(() => { void read() },5000)
    return () => { controller.abort(); clearInterval(timer) }
  },[])
  return <section className="panel" aria-label="Saved connections">
    <h2>Saved connections</h2>
    <p>Saved holdings remain available when a connection is disabled or disconnected.</p>
    {error && <p role="status">Connection status is unavailable. Retry when the local service is ready.</p>}
    {!error && !connections.length && <p>Checking saved connections…</p>}
    {connections.map(connection => <article key={connection.id}>
      <h3>{connection.providerId === 'trade-republic' ? 'Trade Republic' : connection.providerId}</h3>
      <p>{!connection.available ? 'Connector unavailable' : !connection.enabled ? 'Disabled' : connection.active ? 'Updating' : connection.connected ? 'Connected' : 'Disconnected'} · {connection.savedHoldingsAt ? `Holdings saved ${new Date(connection.savedHoldingsAt).toLocaleString()}` : 'No saved holdings'}</p>
      {connection.error && <p role="status">{connection.error}</p>}
      <details><summary>Connection reference</summary><p style={{overflowWrap:'anywhere'}}>{connection.id}</p></details>
    </article>)}
  </section>
}
