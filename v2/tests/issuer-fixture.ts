import { createHash } from 'node:crypto'
import { issuerEvidenceSpecs, issuerBundleVersion, type IssuerBundle } from '../server/issuer-evidence'
import { issuerProfiles } from '../server/issuer-profiles'
export const fixtureAt = '2026-09-11T12:00:00Z'
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export function issuerRaw(isin = 'IE00B4L5Y983') {
  const profile = issuerProfiles[isin], spec = issuerEvidenceSpecs[isin]
  const point = (value: unknown) => ({ value })
  return JSON.stringify({ productId: profile.productId, portfolioType: 'ISHARES_FUND_DATA', currencyCode: profile.currency,
    fundName: profile.fundName, pageScopeData: { portfolioId: profile.productId, ticker: profile.ticker },
    componentsByNameMap: { holdings: { containersByNameMap: { all: { fullName: 'holdings.all', dataPointsByNameMap: {
      asOfDate: point(spec.asOf.replaceAll('-', '')), issueName: point(['Synthetic equity A', 'Synthetic equity B', 'Cash', 'Future']),
      isin: point(['US0378331005', 'US46625H1005', null, null]), ticker: point(['A', 'B', 'USD', 'FUT']),
      assetClass: point(['Equity', 'Equity', 'Cash', 'Futures']),
      holdingPercent: { value: ['60.00000', '39.00000', '1.00000', '0.00000'], label: 'Weight (%)', fullName: 'holdings.all.holdingPercent' },
      marketValue: point(['600', '390', '10', '0']), notionalValue: point(['600', '390', '10', '17']),
      marketCurrencyCode: point(['USD', 'USD', 'USD', 'USD']),
    } } } } } })
}
export function rebind(bundle: IssuerBundle) {
  // Test helper simulates an internally consistent receipt/manifest, so negative
  // tests reach semantic checks rather than accidentally stopping at the hash gate.
  bundle.manifests = [
    { name: 'manifest-2026-09-11.json', body: JSON.stringify({ files: bundle.captures.flatMap(c => {
      const raw = Buffer.from(c.body, 'base64'), receipt = JSON.parse(c.receipt)
      c.receipt = JSON.stringify({ ...receipt, bytes: raw.length, sha256: digest(raw) })
      return [{ file: c.name, bytes: raw.length, sha256: digest(raw) }, { file: `${c.name}.receipt.json`, bytes: Buffer.byteLength(c.receipt), sha256: digest(c.receipt) }]
    }) }) }, { name: 'manifest-2026-09-11-expansion.json', body: '{"files":[]}' },
  ]
  return bundle
}
export function issuerBundle(isin = 'IE00B4L5Y983', raw = issuerRaw(isin)): IssuerBundle {
  const profile = issuerProfiles[isin], spec = issuerEvidenceSpecs[isin]
  const url = `https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data?appSubType=ISHARES&appType=PRODUCT_PAGE&component=holdings.all&locale=en_GB&portfolioId=${profile.productId}&targetSite=ishares-uk&userType=individual&excludeContent=true&asOfDate=${spec.asOf.replaceAll('-', '')}&includeConfig=true`
  return rebind({ fundIsin: isin, profile: { ...profile }, parserVersion: issuerBundleVersion, manifests: [],
    captures: spec.files.map(name => ({ name, body: Buffer.from(raw).toString('base64'), receipt: JSON.stringify({ url, retrievedAt: fixtureAt, status: 200 }) })) })
}
