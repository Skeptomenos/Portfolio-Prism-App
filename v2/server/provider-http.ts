import { createHash } from 'node:crypto'
import { ProviderError, type ProviderContext, type ProviderRequest, type SourceArtifact } from './composition-provider'

const MAX_BYTES = 3_000_000
const MAX_HTML_BYTES = 5_000_000
const REQUEST_TIMEOUT_MS = 25_000
const MAX_REQUESTS = 5
const ISSUER_HOST = 'www.ishares.com'
const AMUNDI_HOST = 'www.amundietf.de'
const AMUNDI_COMPOSITION_PATH = '/mapi/ProductAPI/getProductsData'

/** The small public route set used by bundled issuer providers. */
export function allowedProviderUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new ProviderError('access')
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash)
    throw new ProviderError('access')
  if (url.hostname === AMUNDI_HOST && url.pathname === AMUNDI_COMPOSITION_PATH && !url.search)
    return url
  if (url.hostname !== ISSUER_HOST) throw new ProviderError('access')
  // Product pages and the issuer's documented JSON/CSV ajax routes are public.
  const productRoute = url.pathname.startsWith('/uk/individual/en/products/') ||
    url.pathname.startsWith('/de/privatanleger/de/produkte/')
  const knownRoute = url.pathname.startsWith('/varnish-api/') || productRoute ||
    (productRoute && /\.ajax(?:\/|$)/.test(url.pathname))
  if (!knownRoute)
    throw new ProviderError('access')
  return url
}

function signalWithDeadline(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
}

async function readBounded(response: Response, signal: AbortSignal, limit: number): Promise<Uint8Array> {
  const length = response.headers.get('content-length')
  if (length && Number(length) > limit) {
    void response.body?.cancel().catch(() => {})
    throw new ProviderError('size')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      let onAbort: (() => void) | undefined
      try {
        const abort = new Promise<never>((_, reject) => {
          onAbort = () => reject(signal.reason)
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        })
        const next = await Promise.race([reader.read(), abort])
        if (onAbort) signal.removeEventListener('abort', onAbort)
        if (next.done) break
        total += next.value.byteLength
        if (total > limit) {
          void reader.cancel().catch(() => {})
          throw new ProviderError('size')
        }
        chunks.push(next.value)
      } catch (error) {
        if (onAbort) signal.removeEventListener('abort', onAbort)
        void reader.cancel().catch(() => {})
        throw error
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* A cancelled stream may already have released it. */ }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export function providerContext(signal: AbortSignal): ProviderContext {
  let requests = 0
  const artifact = (url: URL, role: string, contentType: string, bytes: Uint8Array, request?: ProviderRequest): SourceArtifact => ({
    role,
    url: url.toString(),
    retrievedAt: new Date().toISOString(),
    status: 200,
    contentType,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    body: Buffer.from(bytes).toString('base64'),
    ...(request ? { request } : {}),
  })
  return {
    signal,
    async get(input, role, contentType) {
      if (++requests > MAX_REQUESTS) throw new ProviderError('size')
      const url = allowedProviderUrl(input)
      const requestSignal = signalWithDeadline(signal)
      let response: Response
      try {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          signal: requestSignal,
          headers: { Accept: contentType === 'html' ? 'text/html' : contentType === 'csv' ? 'text/csv' : 'application/json' },
        })
      } catch (error) {
        requestSignal.throwIfAborted()
        throw error
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new ProviderError('http', response.status)
      }
      const actualType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
      const compatible = contentType === 'html'
        ? actualType === 'text/html' || actualType === 'application/xhtml+xml'
        : contentType === 'json'
          ? actualType === 'application/json' || actualType.endsWith('+json')
          : actualType === 'text/csv' || actualType === 'text/plain'
      if (!compatible) {
        void response.body?.cancel().catch(() => {})
        throw new ProviderError('format')
      }
      const bytes = await readBounded(response, requestSignal, contentType === 'html' ? MAX_HTML_BYTES : MAX_BYTES)
      return artifact(url, role, response.headers.get('content-type')?.split(';')[0] ?? contentType, bytes)
    },
    async post(input, role, body) {
      if (++requests > MAX_REQUESTS) throw new ProviderError('size')
      const url = allowedProviderUrl(input)
      if (url.hostname !== AMUNDI_HOST || url.pathname !== AMUNDI_COMPOSITION_PATH)
        throw new ProviderError('access')
      const bodyBytes = Buffer.byteLength(body, 'utf8')
      if (bodyBytes === 0 || bodyBytes > 64_000) throw new ProviderError('size')
      const requestSignal = signalWithDeadline(signal)
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          redirect: 'error',
          credentials: 'omit',
          signal: requestSignal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body,
        })
      } catch (error) {
        requestSignal.throwIfAborted()
        throw error
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new ProviderError('http', response.status)
      }
      const actualType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
      if (actualType !== 'application/json' && !actualType.endsWith('+json')) {
        void response.body?.cancel().catch(() => {})
        throw new ProviderError('format')
      }
      const bytes = await readBounded(response, requestSignal, MAX_BYTES)
      const request: ProviderRequest = {
        method: 'POST',
        url: url.toString(),
        body,
        sha256: createHash('sha256').update(body).digest('hex'),
      }
      return artifact(url, role, response.headers.get('content-type')?.split(';')[0] ?? 'application/json', bytes, request)
    },
  }
}
