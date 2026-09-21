import { expect, it } from 'vitest'
import { parseLegacyIssuerCandidate } from '../server/issuer-legacy'
import { issuerProfiles } from '../server/issuer-profiles'

const profile = issuerProfiles.DE000A0F5UF5
const page = '<script>var portfolioId = "251896";</script><div>ISIN: DE000A0F5UF5</div><span>NAV per 10.Sept.2026</span>'
const row = (weight = '1.234567'): unknown[] => ['ABC','Alpha','IT','Aktien',{raw:'1234.56789'},{raw:weight},{raw:'1234.56789'},'1','US0378331005','1','United States','NASDAQ','USD']
const json = (rows = [row()]) => Buffer.from(JSON.stringify({ aaData: rows }))
const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`
function csv(rows = [row()]) {
  const numeric = (value: unknown) => String((value as {raw: string}).raw).replace('.', ',')
  return Buffer.from(['Fondsposition per,"10.Sept.2026"', '\u00a0',
    'Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung',
    ...rows.map(r => [r[0],r[1],r[2],r[3],numeric(r[4]),numeric(r[5]),numeric(r[6]),r[7],r[9],r[10],r[11],r[12]].map(quote).join(',')), '\u00a0'].join('\n'))
}
const parse = (body = json(), table = csv(), html = Buffer.from(page)) => parseLegacyIssuerCandidate(body, '2026-09-11T12:00:00Z', profile, table, html)
it('preserves literal numeric precision, weight units and source accounting', () => {
  const body = json().toString().replace('"1234.56789"', '1234.56789')
  const candidate = parse(Buffer.from(body))
  expect(candidate.rows[0]).toMatchObject({ marketValue: '1234.56789', weightPercent: '1.234567', equityIdentity: 'valid-isin' })
  expect(candidate.accounting.byAssetClass).toEqual([{ assetClass: 'Equity', rows: 1, weightPercent: '1.234567', marketValue: '1234.56789', notionalValue: '1234.56789' }])
  const precise = row(); precise[4] = { raw: '1234.567890123456789012345' }
  const token = json([precise]).toString().replace('"1234.567890123456789012345"', '1234.567890123456789012345')
  expect(parse(Buffer.from(token), csv([precise])).rows[0].marketValue).toBe('1234.567890123456789012345')
})
it('accepts CSV escaped quotes and multiline names without changing text', () => {
  const r = row(); r[1] = 'Synthetic "quoted"\nCompany'
  expect(parse(json([r]), csv([r])).rows[0].name).toBe(r[1])
})
it('rejects malformed quotes, JSON, UTF-8, widths and product/date evidence', () => {
  for (const raw of [csv().toString().replace('"Alpha"', 'Al"pha'), csv().toString().replace('"Alpha"', '"Alpha"junk')])
    expect(() => parse(json(), Buffer.from(raw))).toThrow()
  expect(() => parse(Buffer.from('{"aaData":[01]}'))).toThrow()
  expect(() => parse(Buffer.from([255]))).toThrow()
  expect(() => parse(json([row().slice(0,12)]))).toThrow()
  expect(() => parse(json(), csv(), Buffer.from(page.replace('251896', '251900')))).toThrow()
  expect(() => parse(json(), Buffer.from(csv().toString().replace('10.Sept', '09.Sept')))).toThrow()
})
it('checks ordered CSV context and numerics while allowing only displayed weight rounding', () => {
  for (const [from, to] of [['Alpha','Tampered'], ['1,234567','2,234567'], ['1234,56789','1234,56790'], ['Aktien','Futures'], ['NASDAQ','Other']])
    expect(() => parse(json(), Buffer.from(csv().toString().replace(from,to)))).toThrow()
  expect(parse(json(), Buffer.from(csv().toString().replace('1,234567', '1,23'))).rows[0].weightPercent).toBe('1.234567')
  expect(() => parse(json([row('1e-1000')]))).toThrow()
})
it('retains signed non-equity separately with class accounting', () => {
  const r = row('-0.100000'); r[3] = 'Futures'; r[8] = null; r[11] = 'Chicago Mercantile Exchange'
  const candidate = parse(json([r]), csv([r]))
  expect(candidate.rows[0]).toMatchObject({ equityIdentity: 'not-equity', weightPercent: '-0.100000' })
  expect(candidate.accounting).toMatchObject({ equityPercent: '0', nonEquityPercent: '-0.1', nonEquityRows: 1 })
  expect(candidate.accounting.byAssetClass[0].assetClass).toBe('Futures')
})
