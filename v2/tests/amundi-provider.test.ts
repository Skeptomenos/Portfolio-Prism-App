import { describe, expect, it } from 'vitest'
import { amundiFundIsin, amundiProvider, amundiRequestBody, amundiSourceUrl } from '../server/amundi-provider'
import { ProviderError, type ProviderContext } from '../server/composition-provider'
import { providerContext } from '../server/provider-http'
import { createHash } from 'node:crypto'
import { inspectionEvidence, inspectionResponse } from './inspection-fixture'

const contextFor = (post: NonNullable<ProviderContext['post']>): ProviderContext => ({
  signal: new AbortController().signal,
  get: async () => { throw new ProviderError('format') },
  post,
})

function evidenceWithBody(body: string) {
  const evidence = inspectionEvidence()
  const bytes = Buffer.from(body)
  evidence.artifact.body = bytes.toString('base64')
  evidence.artifact.bytes = bytes.length
  evidence.artifact.sha256 = createHash('sha256').update(bytes).digest('hex')
  return evidence
}

describe('Amundi direct composition inspection provider', () => {
  it.each([
    'https://example.invalid/not-amundi',
    'https://www.amundietf.de/not-amundi',
    `${amundiSourceUrl}?other=1`,
  ])('rejects consistently rebound replay URLs: %s', (url) => {
    const evidence = inspectionEvidence()
    evidence.sourceUrl = evidence.request.url = evidence.artifact.url = evidence.artifact.request!.url = url
    expect(() => amundiProvider.decode(evidence)).toThrowError(expect.objectContaining({ code: 'identity' }))
  })

  it('rejects a rehashed request that omits reviewed fields', () => {
    const evidence = inspectionEvidence()
    const request = JSON.parse(evidence.request.body)
    request.characteristics = ['ISIN', 'POSITION_AS_OF_DATE']
    evidence.request.body = JSON.stringify(request)
    evidence.request.sha256 = createHash('sha256').update(evidence.request.body).digest('hex')
    evidence.artifact.request = { ...evidence.request }
    expect(() => amundiProvider.decode(evidence)).toThrowError(expect.objectContaining({ code: 'identity' }))
  })

  it('allows harmless request formatting while verifying its original hash', () => {
    const evidence = inspectionEvidence()
    evidence.request.body = JSON.stringify(JSON.parse(evidence.request.body), null, 2)
    evidence.request.sha256 = createHash('sha256').update(evidence.request.body).digest('hex')
    evidence.artifact.request = { ...evidence.request }
    expect(amundiProvider.decode(evidence).fundIsin).toBe(amundiFundIsin)
  })

  it('preserves dated substitute-basket rows, signed fractions and partial benchmark scope', () => {
    const decoded = amundiProvider.decode(inspectionEvidence())
    expect(decoded.fundIsin).toBe(amundiFundIsin)
    expect(decoded.asOf).toBe('2026-09-16')
    expect(decoded.rows).toHaveLength(3)
    expect(decoded.benchmarkRows).toHaveLength(1)
    expect(decoded.rows[0]).toMatchObject({ scope: 'substitute-basket', weight: '0.6', weightUnit: 'fraction' })
    expect(decoded.rows.at(-1)).toMatchObject({ assetClass: 'CASH', weight: '-0.0001' })
    expect(decoded.benchmarkRows[0]).toMatchObject({ scope: 'partial-benchmark', weight: '0.75' })
    expect(decoded.replicationMethod).toBe('Indirect (Unfunded swap)')
    expect(decoded.sourceLimits.map(limit => limit.id)).toEqual([
      'substitute-basket', 'partial-benchmark', 'synthetic-economics', 'source-use',
    ])
  })

  it('uses the fixed direct POST route and validates the response before returning evidence', async () => {
    let calledUrl = ''
    let calledBody = ''
    const result = await amundiProvider.acquire(amundiFundIsin, contextFor(async (url, _role, body) => {
      calledUrl = url
      calledBody = body
      const evidence = inspectionEvidence()
      return evidence.artifact
    }))
    expect(result.state).toBe('observation')
    expect(calledUrl).toBe(amundiSourceUrl)
    expect(JSON.parse(calledBody).productIds).toEqual([amundiFundIsin])
    if (result.state === 'observation') expect(result.evidence.artifact.request?.url).toBe(amundiSourceUrl)
  })

  it('does not fall back to browser-only access when the host has no POST capability', async () => {
    const result = await amundiProvider.acquire(amundiFundIsin, {
      signal: new AbortController().signal,
      get: async () => { throw new ProviderError('format') },
    })
    expect(result).toEqual({ state: 'partial', diagnostic: 'access' })
  })

  it('rejects incomplete or identity-rebound responses', () => {
    const evidence = inspectionEvidence()
    const changed = structuredClone(evidence)
    const body = JSON.parse(Buffer.from(changed.artifact.body, 'base64').toString('utf8'))
    body.products[0].productId = 'IE0031442068'
    const bytes = Buffer.from(JSON.stringify(body))
    changed.artifact.body = bytes.toString('base64')
    changed.artifact.bytes = bytes.length
    changed.artifact.sha256 = '0'.repeat(64)
    expect(() => amundiProvider.decode(changed)).toThrowError(expect.objectContaining({ code: 'format' }))
  })

  it('fails closed for malformed, partial, empty and conflicting source rows', () => {
    const partial = JSON.parse(inspectionResponse())
    partial.products[0].composition.compositionData.pop()
    expect(() => amundiProvider.decode(evidenceWithBody(JSON.stringify(partial)))).toThrowError(expect.objectContaining({ code: 'partial' }))

    const empty = JSON.parse(inspectionResponse())
    empty.products[0].composition.totalNumberOfInstruments = 0
    empty.products[0].composition.compositionData = []
    expect(() => amundiProvider.decode(evidenceWithBody(JSON.stringify(empty)))).toThrowError(expect.objectContaining({ code: 'empty' }))

    const conflict = JSON.parse(inspectionResponse())
    conflict.products[0].composition.compositionData[0].compositionCharacteristics.weight = '0.7'
    expect(() => amundiProvider.decode(evidenceWithBody(JSON.stringify(conflict)))).toThrowError(expect.objectContaining({ code: 'conflict' }))
  })

  it('keeps the parser input as JSON bytes rather than a rendered page', () => {
    expect(JSON.parse(inspectionResponse()).products[0].composition.compositionData).toHaveLength(3)
  })

  it('keeps the host POST boundary fixed to the Amundi JSON route', async () => {
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (input, init) => {
        expect(String(input)).toBe(amundiSourceUrl)
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(amundiRequestBody)
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
      const artifact = await providerContext(new AbortController().signal).post!(amundiSourceUrl, 'amundi-details', amundiRequestBody)
      expect(artifact.request).toMatchObject({ method: 'POST', url: amundiSourceUrl })
    } finally {
      globalThis.fetch = original
    }
  })
})
