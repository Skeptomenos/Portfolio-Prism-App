import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { isharesProvider } from '../server/ishares-provider'
import { issuerProfiles } from '../server/issuer-profiles'
import type { ProviderEvidence, SourceArtifact } from '../server/composition-provider'
import { providerEvidence } from './provider-fixture'

const retrievedAt = '2026-09-11T12:00:00.000Z'
function artifact(role: string, url: string, body: string, contentType: string): SourceArtifact {
  const bytes = Buffer.from(body)
  return { role, url, retrievedAt, status: 200, contentType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), body: bytes.toString('base64') }
}
function bodyOf(item: SourceArtifact): string { return Buffer.from(item.body, 'base64').toString('utf8') }
function withPage(evidence: ProviderEvidence, mutate: (page: string) => string): ProviderEvidence {
  return { ...evidence, artifacts: evidence.artifacts.map(item => item.role === 'page' ? artifact(item.role, item.url, mutate(bodyOf(item)), item.contentType) : item) }
}
function withArtifactUrl(evidence: ProviderEvidence, role: string, url: string): ProviderEvidence {
  return { ...evidence, artifacts: evidence.artifacts.map(item => item.role === role ? { ...item, url } : item) }
}
function acquireFrom(evidence: ProviderEvidence) {
  return isharesProvider.acquire(evidence.fundIsin, { signal: new AbortController().signal, get: async (url, role) => evidence.artifacts.find(item => item.role === role && item.url === url) ?? (() => { throw Error(`unexpected ${role} ${url}`) })() })
}

it('uses the selected holdings date when a newer NAV date is present', async () => {
  const evidence = withPage(providerEvidence(), page => `${page}<div>NAV per 11.Sept.2026</div>`)
  const result = await acquireFrom(evidence)
  expect(result.state).toBe('publication')
  if (result.state === 'publication') expect(result.evidence.publicationDate).toBe('2026-09-10')
})

it('rejects a page with a NAV date but no selected holdings date', async () => {
  const evidence = withPage(providerEvidence(), page => page.replace(/componentprops="[^"]*"/, 'componentprops="&quot;componentId&quot;:&quot;holdings&quot;,&quot;context&quot;:{&quot;productId&quot;:&quot;251900&quot;},&quot;initSelectedTab&quot;:&quot;all&quot;') + '<div>NAV per 11.Sept.2026</div>')
  await expect(acquireFrom(evidence)).rejects.toThrow(/discovery/)
})

it('rejects page and holdings URL mismatches during decode', () => {
  const evidence = providerEvidence()
  expect(() => isharesProvider.decode(withArtifactUrl(evidence, 'page', 'https://www.ishares.com/wrong-page'))).toThrow()
  expect(() => isharesProvider.decode(withArtifactUrl(evidence, 'holdings', 'https://www.ishares.com/wrong-data'))).toThrow()
})

it('retains exact decimal tokens through provider decode', () => {
  const candidate = isharesProvider.decode(providerEvidence())
  expect(candidate.rows[0]).toMatchObject({ weightPercent: '99', marketValue: '1000.123456789012345' })
})

it('registers NQSE as an exact class profile while keeping its estimate measure explicit', async () => {
  const evidence = providerEvidence('IE00BYVQ9F29', '2026-09-10', ['99', '1'])
  expect(isharesProvider.manifest.capabilities.funds).toContain('IE00BYVQ9F29')
  const result = await acquireFrom(evidence)
  expect(result.state).toBe('publication')
  if (result.state === 'publication') {
    const candidate = isharesProvider.decode(result.evidence)
    expect(candidate).toMatchObject({
      fundIsin: 'IE00BYVQ9F29',
      fundName: 'iShares NASDAQ 100 UCITS ETF EUR Hedged (Acc)',
      sourceUrl: 'https://www.ishares.com/uk/individual/en/products/304353/ishares-nasdaq-100-ucits-etf',
      measure: 'issuer-reported-allocation-estimate',
      weightBasis: 'whole-published-holdings',
    })
  }
})

it('rejects EXXT evidence when CSV publication date differs from selected date', () => {
  const profile = issuerProfiles.DE000A0F5UF5
  const page = `<div id="allHoldingsTab"><select><option value="20260910" selected>10.Sept.2026</option></select></div> ${profile.fundName} DE000A0F5UF5 portfolioId="251896" ISIN: DE000A0F5UF5`
  const row = ['ABC','Alpha','IT','Aktien',{raw:'1234.56789'},{raw:'100'},{raw:'1234.56789'},'1','US0378331005','1','United States','NASDAQ','USD']
  const json = JSON.stringify({ aaData: [row] })
  const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`
  const csvBody = [`Fondsposition per,"11.Sept.2026"`, '\u00a0', 'Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung', [row[0],row[1],row[2],row[3],'1234,56789','100','1234,56789',row[7],row[9],row[10],row[11],row[12]].map(quote).join(','), '\u00a0'].join('\n')
  const jsonArtifact = artifact('holdings', `${profile.productUrl}/1478358465952.ajax?tab=all&fileType=json`, json, 'application/json')
  const pageArtifact = artifact('page', `${profile.productUrl}?siteEntryPassthrough=true&switchLocale=y`, page, 'text/html')
  const csvArtifact = artifact('csv', `${profile.productUrl}/1478358465952.ajax?fileType=csv&fileName=EXXT_holdings&dataType=fund`, csvBody, 'text/csv')
  const evidence = { ...providerEvidence(), fundIsin: 'DE000A0F5UF5', publicationDate: '2026-09-10', artifacts: [pageArtifact, jsonArtifact, csvArtifact] } as ProviderEvidence
  expect(() => isharesProvider.decode(evidence)).toThrow()
})

it('accepts EXXT when the selected date and CSV date agree', () => {
  const profile = issuerProfiles.DE000A0F5UF5
  const page = `<div id="allHoldingsTab"><select><option value="20260910" selected>10.Sept.2026</option></select></div> ${profile.fundName} DE000A0F5UF5 portfolioId="251896" ISIN: DE000A0F5UF5`
  const row = ['ABC','Alpha','IT','Aktien',{raw:'1234.56789'},{raw:'100'},{raw:'1234.56789'},'1','US0378331005','1','United States','NASDAQ','USD']
  const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`
  const csvBody = [`Fondsposition per,"10.Sept.2026"`, '\u00a0', 'Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung', [row[0],row[1],row[2],row[3],'1234,56789','100','1234,56789',row[7],row[9],row[10],row[11],row[12]].map(quote).join(','), '\u00a0'].join('\n')
  const evidence = { ...providerEvidence(), fundIsin: 'DE000A0F5UF5', publicationDate: '2026-09-10', artifacts: [
    artifact('page', `${profile.productUrl}?siteEntryPassthrough=true&switchLocale=y`, page, 'text/html'),
    artifact('holdings', `${profile.productUrl}/1478358465952.ajax?tab=all&fileType=json`, JSON.stringify({ aaData: [row] }), 'application/json'),
    artifact('csv', `${profile.productUrl}/1478358465952.ajax?fileType=csv&fileName=EXXT_holdings&dataType=fund`, csvBody, 'text/csv'),
  ] } as ProviderEvidence
  expect(isharesProvider.decode(evidence).asOf).toBe('2026-09-10')
})
