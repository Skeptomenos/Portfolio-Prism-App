import { afterEach, describe, expect, it } from 'vitest'
import { Schema } from 'effect'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { financialFixture } from './fixtures/financial'
import { financialRead, financialRoute } from '../server/financial-read-model'
import { financialSchemas, type FinancialResource } from '../contracts/financial'
import { createFinancialClient } from '../web/views/financial-client'
import { contributionMix } from '../web/views/contribution-mix'
import { AnalyticsRegistry } from '../web/views/analytics-registry'
import { contributionMixPlugin } from '../web/views/plugin-metadata'
import { api } from '../server/http'
const fixtures: ReturnType<typeof financialFixture>[] = []
const fixture = () => { const value = financialFixture(); fixtures.push(value); return value }
afterEach(async () => { for (const value of fixtures.splice(0)) await value.service.close() })
const signal = () => new AbortController().signal
const clientFor = (body: unknown, status = 200) => createFinancialClient(async () => new Response(JSON.stringify(body), { status }))

describe('versioned financial projections', () => {
  it('preserves connection correlation through diagnostic persistence, projection and client decoding', async () => {
    const { service, store } = fixture()
    const connection = store.connections.add('synthetic-ledger', '1.0.0')
    store.recordDiagnostic({ attemptId: 'synthetic-connection-attempt', connectionId: connection.id,
      providerId: 'synthetic-ledger', operation: 'sync', stage: 'syncing', event: 'failed',
      at: '2026-09-21T12:00:00.000Z', durationMs: 12, category: 'connection', networkCode: 'ECONNRESET' })
    const expected = { events: service.diagnostics() }
    const projected = financialRead(service, 'diagnostics')!
    expect(projected.data).toEqual(expected)
    const decoded = await clientFor(projected).diagnostics(signal())
    expect(decoded).toEqual(expected)
    expect(decoded.events.find(event => event.attemptId === 'synthetic-connection-attempt'))
      .toMatchObject({ connectionId: connection.id, providerId: 'synthetic-ledger' })
  })
  it('preserves decimal values, all contributions, coverage, dates, source identities and immutable saved history', () => {
    const { service, store } = fixture()
    const run = store.history.start('broker-sync')
    const checkpoint = store.history.capture(run, 'valuation')!
    const before = { overview: service.overview(), exposure: service.exposure(), coverage: service.coverage() }
    const overview = financialRead(service, 'overview')!
    const result = Schema.decodeUnknownSync(financialSchemas.exposure)(financialRead(service, 'exposure')!.data)
    expect(overview.data).toEqual(before.overview)
    expect(result.rows).toEqual(before.exposure.rows)
    expect(result.gaps).toEqual(before.exposure.gaps)
    expect(result.issuerGroups).toEqual(before.exposure.issuerGroups)
    expect(financialRead(service, 'coverage')!.data).toEqual(before.coverage)
    expect(store.history.checkpoint(checkpoint.checkpoint.id)).toEqual(checkpoint)
    expect(service.overview()).toEqual(before.overview)
    expect(service.exposure()).toEqual(before.exposure)
    expect(service.coverage()).toEqual(before.coverage)
    expect(JSON.stringify(result)).not.toContain('PRIVATE-MARKER')
    expect(JSON.stringify(result)).not.toContain('sourceRows":[')
  })
  it('covers every resource, strips unknown fields, and scopes exact fund identity', async () => {
    const { service } = fixture()
    for (const resource of Object.keys(financialSchemas) as FinancialResource[]) {
      const response = financialRead(service, resource, resource === 'fund' ? 'FR0010361683' : undefined)!
      expect(response.contractVersion).toBe('portfolio-financial/1')
      expect(response.snapshot.id).toMatch(/^[a-f0-9]{64}$/)
    }
    const projection = financialRead(service, 'development')!
    expect(projection.data).not.toHaveProperty('evidence.directory')
    expect(projection.data).not.toHaveProperty('evidence.manifestFile')
    const client = clientFor({ ...financialRead(service, 'overview'), secret: 'PRIVATE-MARKER' })
    expect(await client.overview(signal())).toEqual(service.overview())
    await expect(clientFor(financialRead(service, 'fund', 'FR0010361683')).fund('IE00B4L5Y983', signal())).rejects.toThrow('identity')
    await expect(client.fund('../credentials', signal())).rejects.toThrow('identifier')
  })
  it('rejects missing/wrong versions, wrong resources, malformed decimals and HTTP failures without empty success', async () => {
    const { service } = fixture()
    const envelope = financialRead(service, 'overview')!
    for (const response of [{ ...envelope, contractVersion: 'portfolio-financial/2' }, { ...envelope, resource: 'coverage' },
      { ...envelope, contractVersion: undefined }, { ...envelope, data: { rows: [] } }, { ...envelope, data: { ...service.overview(), holdingsAt: '2026-02-31' } },
      { ...envelope, data: { ...service.overview(), rows: [{ ...service.overview().rows[0], value: 123 }] } }]) {
      await expect(clientFor(response).overview(signal())).rejects.toThrow('incompatible or malformed')
    }
    await expect(clientFor({ error: 'PRIVATE-MARKER' }, 500).overview(signal())).rejects.toThrow('could not load')
    const aborted = new AbortController(); aborted.abort()
    let forwarded: AbortSignal | null | undefined
    const client = createFinancialClient(async (_, options) => { forwarded = options?.signal; throw new DOMException('Aborted', 'AbortError') })
    await expect(client.coverage(aborted.signal)).rejects.toThrow('Aborted'); expect(forwarded).toBe(aborted.signal)
  })
  it('serves only bounded GET routes with existing origin protection and safe failures', async () => {
    const { service } = fixture()
    const server = createServer((req, res) => { void api(req, res, service, origin) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      expect((await fetch(origin + '/api/financial/overview')).status).toBe(200)
      expect((await fetch(origin + '/api/financial/overview', { headers: { Origin: 'https://outside.invalid' } })).status).toBe(403)
      expect((await fetch(origin + '/api/financial/overview', { method: 'POST', headers: { Origin: origin, 'X-Prism-Client': '1', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404)
      expect((await fetch(origin + '/api/financial/overview?raw=1')).status).toBe(400)
      expect((await fetch(origin + '/api/financial/fund/US0378331005')).status).toBe(404)
      expect(financialRoute(new URL(origin + '/api/financial/fund'), service).status).toBe(400)
      const broken = { ...service, overview: () => { throw Error('PRIVATE-MARKER') } }
      // Inject only the failed method; the other service methods keep their real receiver.
      const original = service.overview; service.overview = broken.overview
      const response = await fetch(origin + '/api/financial/overview')
      expect(response.status).toBe(500); expect(await response.text()).not.toContain('PRIVATE-MARKER')
      service.overview = original
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  })
})

describe('independent contribution analytics', () => {
  it('uses exact declared input, preserves canonical values, unknowns and currency groups, and rejects inconsistent inputs', async () => {
    const { service } = fixture()
    const input = await clientFor(financialRead(service, 'analysis')).analysis(signal())
    const before = JSON.stringify(input)
    const registry = new AnalyticsRegistry([{ metadata: contributionMixPlugin, analyticsId: 'contribution-mix', evaluate: contributionMix }])
    const result = registry.evaluate('contribution-mix', input)
    expect(result.map(row => row.currency)).toEqual(['EUR', 'USD'])
    expect(input.data.coverage.unvalued).toBe(1)
    expect(JSON.stringify(input)).toBe(before)
    const invalid = { ...input, data: { ...input.data, coverage: { ...input.data.coverage, totals: input.data.coverage.totals.map(row => ({ ...row, knownCompanyValue: '0' })) } } }
    expect(() => registry.evaluate('contribution-mix', invalid)).toThrow('reconcile')
    registry.disable('contribution-mix')
    expect(() => registry.evaluate('contribution-mix', input)).toThrow('disabled')
    expect(service.coverage().totals).toEqual(input.data.coverage.totals)
  })
  it('isolates incompatible/throwing analytics and prevents mutation of canonical input', async () => {
    const { service } = fixture()
    const input = await clientFor(financialRead(service, 'analysis')).analysis(signal())
    const metadata = { ...contributionMixPlugin, compatibility: { hostVersion: 'unsupported/2' } }
    const incompatible = new AnalyticsRegistry([{ metadata, analyticsId: 'contribution-mix', evaluate: contributionMix }])
    expect(() => incompatible.evaluate('contribution-mix', input)).toThrow('incompatible')
    const before = JSON.stringify(input)
    const broken = new AnalyticsRegistry([{ metadata: contributionMixPlugin, analyticsId: 'contribution-mix', evaluate: data => { Object.assign(data.coverage, { unvalued: 0 }); return [] } }])
    expect(() => broken.evaluate('contribution-mix', input)).toThrow()
    expect(JSON.stringify(input)).toBe(before)
    expect(Object.isFrozen(input.data)).toBe(false)
    expect(contributionMix(input.data)).toHaveLength(2)
  })
})

it('does not mix currencies or replace unknown contributions with invented value', async () => {
  const { service } = fixture()
  const input = await clientFor(financialRead(service, 'analysis')).analysis(signal())
  const eur = input.data.coverage.totals.find(total => total.currency === 'EUR')!
  const base = input.data.exposure.rows.filter(row => row.currency === 'EUR')
  const extended = { ...input.data, exposure: { ...input.data.exposure,
    rows: [...base, ...base.map(row => ({ ...row, currency: 'USD' })),
      { ...base[0], currency: 'USD', direct: '0', indirect: '0', knownTotal: '0', contributions: [{ ...base[0].contributions[0], value: null }] }],
  }, coverage: { ...input.data.coverage, totals: [eur, { ...eur, currency: 'USD' }] } }
  const [euro, dollar] = contributionMix(extended)
  expect(euro.currency).toBe('EUR'); expect(dollar.currency).toBe('USD')
  expect(euro.direct).toBe(dollar.direct); expect(euro.etf).toBe(dollar.etf)
  expect(euro.unknownContributions).toBe(0); expect(dollar.unknownContributions).toBe(1)
})
