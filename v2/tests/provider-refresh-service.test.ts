import { describe, expect, it } from 'vitest'
import { SnapshotStore } from '../server/store'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { allowedProviderUrl, providerContext } from '../server/provider-http'
import type { CompositionProvider } from '../server/composition-provider'

const isin = 'IE0031442068'
const secondIsin = 'IE00B4L5Y983'
const manifest = {
  id: 'test-provider', version: '1', contractVersion: 'composition-provider/1' as const,
  parserVersion: 'test/1', capabilities: { discovery: 'direct-http' as const, funds: [isin] },
  sourceConstraints: { access: 'public-no-credentials' as const, retention: 'unsettled-private-use' as const, termsUrl: 'https://example.test/terms' },
}
const provider = (acquire: CompositionProvider['acquire']): CompositionProvider => ({ manifest, acquire, decode: () => { throw Error('not used') } })
const storeWithHolding = () => {
  const store = new SnapshotStore(':memory:')
  store.save({ fetchedAt: new Date().toISOString(), positions: [{ account: 'a', isin, name: 'ETF', quantity: '1', instrumentType: 'etf', averageBuyIn: '1' }] })
  return store
}
const storeWithTwoHoldings = () => {
  const store = new SnapshotStore(':memory:')
  store.save({ fetchedAt: new Date().toISOString(), positions: [
    { account: 'a', isin, name: 'ETF', quantity: '1', instrumentType: 'etf', averageBuyIn: '1' },
    { account: 'a', isin: secondIsin, name: 'ETF 2', quantity: '2', instrumentType: 'etf', averageBuyIn: '1' },
  ] })
  return store
}

describe('provider refresh host', () => {
  it('refreshes supported funds sequentially and records a typed failure', async () => {
    const store = storeWithHolding()
    const service = new ProviderRefreshService(store, [provider(async () => ({ state: 'partial', diagnostic: 'format' }))])
    expect(service.refresh()).toBe(true)
    await service.settled()
    expect(service.status().attempts[isin]).toMatchObject({ status: 'failed', code: 'format', outcome: 'failed' })
    await service.close(); store.close()
  })

  it('throttles failed automatic attempts for a day but permits a manual retry', async () => {
    const store = storeWithHolding()
    const failed = { id: 'old', at: new Date().toISOString(), providerId: manifest.id, status: 'failed' as const, code: 'format' as const, outcome: 'failed' as const, resolution: 'retry' }
    store.recordProviderAttempt(isin, failed)
    let calls = 0
    const service = new ProviderRefreshService(store, [provider(async () => { calls++; return { state: 'partial', diagnostic: 'format' } })])
    expect(service.refresh(true)).toBe(false)
    expect(service.refresh(false)).toBe(true)
    await service.settled()
    expect(calls).toBe(1)
    await service.close(); store.close()
  })

  it('cancels an in-flight fund and records cancellation', async () => {
    const store = storeWithHolding()
    const service = new ProviderRefreshService(store, [provider((_isin, context) => new Promise((_resolve, reject) => context.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })))])
    expect(service.refresh()).toBe(true)
    service.cancel()
    await service.settled()
    expect(service.status().attempts[isin]).toMatchObject({ code: 'cancelled', outcome: 'cancelled' })
    await service.close(); store.close()
  })

  it('continues through supported funds after one provider failure', async () => {
    const store = storeWithTwoHoldings()
    const twoFund = { ...manifest, capabilities: { discovery: 'direct-http' as const, funds: [isin, secondIsin] } }
    const service = new ProviderRefreshService(store, [{ ...provider(async () => ({ state: 'partial', diagnostic: 'format' })), manifest: twoFund }])
    expect(service.refresh()).toBe(true)
    await service.settled()
    expect(Object.keys(service.status().attempts).sort()).toEqual([isin, secondIsin].sort())
    await service.close(); store.close()
  })
})

describe('provider HTTP boundary', () => {
  it('accepts only fixed issuer route families and rejects rebinding', () => {
    expect(allowedProviderUrl('https://www.ishares.com/varnish-api/x').hostname).toBe('www.ishares.com')
    expect(allowedProviderUrl('https://www.ishares.com/de/privatanleger/de/produkte/x/1478358465952.ajax').pathname).toContain('.ajax')
    expect(() => allowedProviderUrl('https://www.ishares.com.evil.test/varnish-api/x')).toThrow()
    expect(() => allowedProviderUrl('https://www.ishares.com/robots.txt')).toThrow()
    expect(() => allowedProviderUrl('http://www.ishares.com/varnish-api/x')).toThrow()
  })

  it('requires the requested MIME and enforces the bounded body size', async () => {
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch
      const artifact = await providerContext(new AbortController().signal).get('https://www.ishares.com/uk/individual/en/products/x', 'page', 'html')
      expect(artifact.bytes).toBe(2)
      globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch
      await expect(providerContext(new AbortController().signal).get('https://www.ishares.com/uk/individual/en/products/x', 'page', 'html')).rejects.toThrow()
      globalThis.fetch = (async () => new Response('x', { status: 200, headers: { 'content-type': 'text/html', 'content-length': '5000001' } })) as typeof fetch
      await expect(providerContext(new AbortController().signal).get('https://www.ishares.com/uk/individual/en/products/x', 'page', 'html')).rejects.toThrow()
    } finally {
      globalThis.fetch = original
    }
  })

  it('cancels a hanging response body when the request signal aborts', async () => {
    const original = globalThis.fetch
    let cancelled = false
    try {
      globalThis.fetch = (async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array([1])) },
        pull() {},
        cancel() { cancelled = true },
      }), { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch
      const controller = new AbortController()
      const pending = providerContext(controller.signal).get('https://www.ishares.com/uk/individual/en/products/x', 'page', 'html')
      controller.abort()
      await expect(pending).rejects.toBeDefined()
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(cancelled).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })
})
