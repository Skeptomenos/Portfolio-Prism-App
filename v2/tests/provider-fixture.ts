import { createHash } from 'node:crypto'
import { issuerProfile } from '../server/issuer-profiles'
import { compositionContractVersion, compositionPolicyVersion, type ProviderEvidence } from '../server/composition-provider'

const retrievedAt = '2026-09-11T12:00:00.000Z'
const artifact = (role: string, url: string, body: string, contentType: string) => {
  const bytes = Buffer.from(body)
  return { role, url, retrievedAt, status: 200 as const, contentType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), body: bytes.toString('base64') }
}

/** Synthetic, redistributable provider evidence for admission and store tests. */
export function providerEvidence(fundIsin = 'IE0031442068', date = '2026-09-10', weights: [string, string] = ['99', '1']): ProviderEvidence {
  const profile = issuerProfile(fundIsin)
  if (!profile || profile.sourceKind !== 'columnar') throw Error('columnar fixture profile')
  const fields: Record<string, unknown> = {}
  const values: Record<string, unknown[]> = {
    issueName: ['Synthetic Equity', 'Synthetic Cash'], isin: ['US0378331005', null], ticker: ['SYN', null], assetClass: ['Equity', 'Cash'],
    holdingPercent: weights, marketValue: ['1000.123456789012345', '8'], notionalValue: ['1000.123456789012345', '8'], marketCurrencyCode: [profile.currency, profile.currency], exchange: ['NASDAQ', null], countryOfRisk: ['US', null],
  }
  for (const [name, value] of Object.entries(values)) fields[name] = { value, label: name === 'holdingPercent' ? 'Weight (%)' : name, fullName: name === 'holdingPercent' ? 'holdings.all.holdingPercent' : `holdings.all.${name}` }
  fields.asOfDate = { value: date.replaceAll('-', '') }
  const body = JSON.stringify({ productId: profile.productId, portfolioType: 'ISHARES_FUND_DATA', currencyCode: profile.currency, fundName: profile.fundName, pageScopeData: { portfolioId: profile.productId, ticker: profile.ticker }, componentsByNameMap: { holdings: { containersByNameMap: { all: { fullName: 'holdings.all', dataPointsByNameMap: fields } } } } })
  const config = { componentId: 'holdings', context: { productId: profile.productId, ticker: profile.ticker }, initSelectedTab: 'all', initAsOfDates: { all: date.replaceAll('-', '') } }
  const page = `<html>${profile.fundName} ${profile.shareClassName ?? ''} ${profile.fundIsin} portfolioId="${profile.productId}" <walrus-render-on-client componentprops="${JSON.stringify(config).replaceAll('"','&quot;')}"></walrus-render-on-client></html>`

  const params = new URLSearchParams({ appSubType: 'ISHARES', appType: 'PRODUCT_PAGE', component: 'holdings.all', locale: 'en_GB', portfolioId: profile.productId, targetSite: 'ishares-uk', userType: 'individual', excludeContent: 'true', asOfDate: date.replaceAll('-', ''), includeConfig: 'true' })
  const holdingsUrl = `https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data?${params}`
  return { policyVersion: compositionPolicyVersion, format: 'composition-evidence/1', providerId: 'ishares-bundled', providerVersion: '1.0.0', contractVersion: compositionContractVersion, parserVersion: 'ishares-composition/1', fundIsin, publicationDate: date, artifacts: [artifact('page', profile.productUrl, page, 'text/html'), artifact('holdings', holdingsUrl, body, 'application/json')] }
}
