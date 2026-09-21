import { expect, it } from 'vitest'
import { qualifyIssuerBundle } from '../server/issuer-evidence'
import { issuerComposition } from '../server/issuer-composition'
import { issuerBundle, issuerRaw, rebind, fixtureAt } from './issuer-fixture'

it.each(['IE0031442068', 'IE00B4L5Y983', 'IE00B53SZB19', 'IE00B3WJKG14'])('qualifies exact %s profile and replays the original retrieval time deterministically', isin => {
  const bundle = issuerBundle(isin), composition = issuerComposition(bundle)
  expect(qualifyIssuerBundle(bundle).state).toBe('ready')
  expect(composition.retrievedAt).toBe(fixtureAt)
  expect(issuerComposition(JSON.parse(JSON.stringify(bundle)))).toEqual(composition)
  expect(composition.sourceAccounting).toMatchObject({ sourceRows: 4, equityRows: 2, nonEquityRows: 2, equityPercent: '99', nonEquityPercent: '1' })
  expect(composition.sourceRows?.[3]).toMatchObject({ weightPercent: '0.00000', notionalValue: '17', equityIdentity: 'not-equity' })
})
it('rejects stored body/receipt/manifest/version/profile corruption on every replay', () => {
  const mutations = [
    (b: ReturnType<typeof issuerBundle>) => { b.captures[0].body = Buffer.from('tampered').toString('base64') },
    (b: ReturnType<typeof issuerBundle>) => { b.captures[0].receipt += ' ' },
    (b: ReturnType<typeof issuerBundle>) => { b.manifests[0].body = '{"files":[]}' },
    (b: ReturnType<typeof issuerBundle>) => { b.parserVersion = 'future-version' },
    (b: ReturnType<typeof issuerBundle>) => { b.profile.productId = '999999' },
    (b: ReturnType<typeof issuerBundle>) => { b.fundIsin = 'IE00BYVQ9F29' },
    (b: ReturnType<typeof issuerBundle>) => { b.captures[1] = b.captures[0] },
  ]
  for (const mutate of mutations) { const b = issuerBundle(); mutate(b); expect(qualifyIssuerBundle(b).state).toBe('failed') }
})
it('rejects internally hashed wrong routes, receipt times and publication dates', () => {
  for (const patch of [{ url: 'https://evil.test/' }, { retrievedAt: 'not-a-date' }, { retrievedAt: '2026-09-01T12:00:00Z' }, { status: 403 }]) {
    const b = issuerBundle(); b.captures[0].receipt = JSON.stringify({ ...JSON.parse(b.captures[0].receipt), ...patch }); rebind(b)
    expect(qualifyIssuerBundle(b).state).toBe('failed')
  }
  expect(qualifyIssuerBundle(issuerBundle(undefined, issuerRaw().replace('20260910', '20260909'))).state).toBe('failed')
})
it('requires repeat agreement, unique valid equity IDs, long-only weights and whole-table accounting', () => {
  for (const [before, after] of [['39.00000', '38.00000'], ['60.00000', '-60.00000'], ['US46625H1005', 'US0378331005'], ['US46625H1005', 'US46625H1006'], ['Weight (%)', 'Weight'], ['holdings.all.holdingPercent', 'other.weight']]) {
    expect(qualifyIssuerBundle(issuerBundle(undefined, issuerRaw().replace(before, after))).eligibleForMonetaryExposure).toBe(false)
  }
  const b = issuerBundle(); b.captures[1].body = Buffer.from(issuerRaw().replace('Synthetic equity A', 'Changed')).toString('base64'); rebind(b)
  expect(qualifyIssuerBundle(b).checks.find(c => c.id === 'bounded-repeat')?.state).toBe('failed')
})
it('preserves numeric tokens beyond binary precision and rejects unreasonable exponents', () => {
  const b = issuerBundle(undefined, issuerRaw().replace('"600"', '600.123456789012345678901'))
  expect(issuerComposition(b).sourceRows?.[0].marketValue).toBe('600.123456789012345678901')
  expect(qualifyIssuerBundle(issuerBundle(undefined, issuerRaw().replace('"600"', '1e1000'))).state).toBe('failed')
})
