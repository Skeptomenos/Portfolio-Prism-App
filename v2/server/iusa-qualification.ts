import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { pilotIsin, validIsin } from './composition'

const D = Decimal.clone({ precision: 256 })
export const iusaParserVersion = 'ishares-iusa-columnar/1' as const
export const iusaReviewVersion = 'iusa-source-review/2026-09-20' as const
export const iusaProductUrl = 'https://www.ishares.com/uk/individual/en/products/251900/ishares-sp-500-ucits-etf-inc-fund'
export const iusaTermsUrl = 'https://www.ishares.com/uk/individual/en/compliance/terms-and-conditions'
export type CheckState = 'passed' | 'failed' | 'pending'
export interface SourceCheck {
  id: string
  state: CheckState
  detail: string
  evidence: string[]
}
export interface IusaRow {
  sourceRow: number
  name: string
  isin: string | null
  ticker: string | null
  assetClass: string
  weightPercent: string
  marketValue: string
  notionalValue: string
  currency: string
  exchange: string | null
  country: string | null
  identifierPresence: 'present' | 'missing'
  equityIdentity: 'valid-isin' | 'unresolved' | 'not-equity'
}
export interface IusaCandidate {
  fundIsin: typeof pilotIsin
  productId: '251900'
  asOf: string
  retrievedAt: string
  sha256: string
  parserVersion: typeof iusaParserVersion
  weightUnit: 'percent'
  denominator: 'issuer-reported-all-holdings'
  rows: IusaRow[]
  accounting: {
    sourceRows: number
    equityRows: number
    nonEquityRows: number
    validEquityIsins: number
    unresolvedEquityRows: number
    reportedPercent: string
    equityPercent: string
    nonEquityPercent: string
    marketValue: string
    notionalValue: string
    byAssetClass: { assetClass: string; rows: number; weightPercent: string; marketValue: string; notionalValue: string }[]
  }
}
export interface IusaQualification {
  parserVersion: typeof iusaParserVersion
  reviewVersion: typeof iusaReviewVersion
  state: 'open' | 'failed' | 'ready'
  eligibleForMonetaryExposure: boolean
  candidate: IusaCandidate | IssuerCandidate | null
  checks: SourceCheck[]
}
export interface IssuerProfile {
  fundIsin: string
  productId: string
  fundName: string
  shareClassName?: string
  estimateLimitation?: import('./composition').Composition['estimateLimitation']
  currency: string
  ticker?: string
  sourceKind: 'columnar' | 'legacy'
  productUrl: string
  termsUrl: string
  expectedAsOf?: string
}
export interface IssuerCandidate extends Omit<IusaCandidate, 'fundIsin' | 'productId' | 'parserVersion'> {
  fundIsin: string
  productId: string
  parserVersion: string
}
class SourceError extends Error {
  constructor(readonly code: string) { super(code) }
}
const fail = (code: string): never => { throw new SourceError(code) }
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('format')
  return v as Record<string, unknown>
}
const string = (v: unknown): string => typeof v === 'string' ? v : fail('format')
const decimal = (v: unknown): string => {
  const s = string(v)
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s) || s.length > 128) return fail('numeric')
  const exponent = /[eE]([+-]?\d+)$/.exec(s)
  if (exponent && Math.abs(Number(exponent[1])) > 100) return fail('numeric')
  const n = new D(s)
  if (!n.isFinite() || n.abs().gt('1e100')) return fail('numeric')
  return s // Keep source numeric text, including trailing zeroes and exponent notation.
}
const optional = (v: unknown): string | null => v === null || v === '-' || v === '' ? null : string(v)

// Tokenize strings and numbers together: quoted content stays unchanged, JSON numbers
// become strings before JSON.parse can round them through binary floating point.
function losslessJson(raw: string): unknown {
  JSON.parse(raw) // Reject invalid JSON before the token-preserving transformation.
  return JSON.parse(raw.replace(/"(?:[^"\\]|\\[\s\S])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    token => token.startsWith('"') ? token : JSON.stringify(token)))
}
export function parseColumnarIssuerCandidate(bytes: Uint8Array, retrievedAt: string, profile: IssuerProfile): IssuerCandidate {
  if (bytes.byteLength > 3_000_000) return fail('size')
  if (!/^\d{4}-\d{2}-\d{2}T/.test(retrievedAt) || !Number.isFinite(Date.parse(retrievedAt))) return fail('date')
  const root = object(losslessJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  const scope = object(root.pageScopeData)
  if (root.productId !== profile.productId || root.portfolioType !== 'ISHARES_FUND_DATA' || root.currencyCode !== profile.currency || root.fundName !== profile.fundName || scope.portfolioId !== profile.productId) return fail('identity')
  if (profile.ticker && scope.ticker !== profile.ticker) return fail('identity')
  const all = object(object(object(root.componentsByNameMap).holdings).containersByNameMap).all
  const points = object(object(all).dataPointsByNameMap)
  const field = (name: string) => object(points[name])
  const values = (name: string): unknown[] => { const v = field(name).value; return Array.isArray(v) ? v : fail('rows') }
  const names = values('issueName'); if (!names.length || names.length > 5000) return fail('rows')
  const length = names.length
  for (const [key, value] of Object.entries(points)) if (key !== 'dateList') for (const property of ['value','formattedValue']) { const v = object(value)[property]; if (Array.isArray(v) && v.length !== length) return fail('rows') }
  const optionalValues = (name: string) => points[name] === undefined ? Array.from({length}, () => null) : values(name)
  const asOfToken = string(field('asOfDate').value); if (!/^\d{8}$/.test(asOfToken)) return fail('date')
  const asOf = `${asOfToken.slice(0,4)}-${asOfToken.slice(4,6)}-${asOfToken.slice(6)}`; const date = Date.parse(asOf)
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0,10) !== asOf || date > Date.parse(retrievedAt)) return fail('date')
  if (object(all).fullName !== 'holdings.all' || field('holdingPercent').label !== 'Weight (%)' || field('holdingPercent').fullName !== 'holdings.all.holdingPercent') return fail('scope')
  const ids = values('isin'), types = values('assetClass'), weights = values('holdingPercent'), market = values('marketValue'), notional = values('notionalValue'), currencies = values('marketCurrencyCode'), tickers = optionalValues('ticker'), exchanges = optionalValues('exchange'), countries = optionalValues('countryOfRisk')
  if (![ids,types,weights,market,notional,currencies,tickers,exchanges,countries].every(a => a.length === length)) return fail('rows')
  const rows: IusaRow[] = names.map((v,i) => { const name=string(v), isin=optional(ids[i]), assetClass=string(types[i]); if(!name.trim()||!assetClass.trim()) return fail('rows'); const weightPercent=decimal(weights[i]); if(new D(weightPercent).abs().gt(100)) return fail('weights'); return {sourceRow:i+1,name,isin,ticker:optional(tickers[i]),assetClass,weightPercent,marketValue:decimal(market[i]),notionalValue:decimal(notional[i]),currency:string(currencies[i]),exchange:optional(exchanges[i]),country:optional(countries[i]),identifierPresence:isin?'present':'missing',equityIdentity:assetClass!=='Equity'?'not-equity':isin&&validIsin(isin)?'valid-isin':'unresolved'} })
  const sum=(list:IusaRow[],key:'weightPercent'|'marketValue'|'notionalValue')=>list.reduce((s,r)=>s.add(r[key]),new D(0)).toFixed(); const equity=rows.filter(r=>r.assetClass==='Equity'); const groups=new Map<string, {assetClass:string;rows:number;weightPercent:string;marketValue:string;notionalValue:string}>()
  for(const row of rows){const g=groups.get(row.assetClass)??{assetClass:row.assetClass,rows:0,weightPercent:'0',marketValue:'0',notionalValue:'0'};g.rows++;for(const k of ['weightPercent','marketValue','notionalValue'] as const)g[k]=new D(g[k]).add(row[k]).toFixed();groups.set(row.assetClass,g)}
  return {fundIsin:profile.fundIsin,productId:profile.productId,asOf,retrievedAt,sha256:createHash('sha256').update(bytes).digest('hex'),parserVersion:'ishares-columnar/2',weightUnit:'percent',denominator:'issuer-reported-all-holdings',rows,accounting:{sourceRows:rows.length,equityRows:equity.length,nonEquityRows:rows.length-equity.length,validEquityIsins:equity.filter(r=>r.equityIdentity==='valid-isin').length,unresolvedEquityRows:equity.filter(r=>r.equityIdentity!=='valid-isin').length,reportedPercent:sum(rows,'weightPercent'),equityPercent:sum(equity,'weightPercent'),nonEquityPercent:sum(rows.filter(r=>r.assetClass!=='Equity'),'weightPercent'),marketValue:sum(rows,'marketValue'),notionalValue:sum(rows,'notionalValue'),byAssetClass:[...groups.values()]}}
}
export function parseIusaCandidate(bytes: Uint8Array, retrievedAt: string): IusaCandidate {
  if (bytes.byteLength > 3_000_000) return fail('size')
  if (!/^\d{4}-\d{2}-\d{2}T/.test(retrievedAt) || !Number.isFinite(Date.parse(retrievedAt))) return fail('date')
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const root = object(losslessJson(raw))
  const scope = object(root.pageScopeData)
  if (root.productId !== '251900' || root.portfolioType !== 'ISHARES_FUND_DATA' ||
      root.currencyCode !== 'USD' || root.fundName !== 'iShares Core S&P 500 UCITS ETF USD (Dist)' ||
      scope.portfolioId !== '251900' || scope.ticker !== 'IUSA') return fail('identity')
  const holdings = object(object(root.componentsByNameMap).holdings)
  const points = object(object(object(holdings.containersByNameMap).all).dataPointsByNameMap)
  const field = (name: string) => object(points[name])
  const names = field('issueName').value
  if (!Array.isArray(names) || !names.length || names.length > 2000) return fail('rows')
  const length = names.length
  // Every returned row array must align. Date-menu arrays are not holding rows.
  for (const [key, value] of Object.entries(points)) {
    if (key === 'dateList') continue
    const point = object(value)
    for (const property of ['value', 'formattedValue'])
      if (Array.isArray(point[property]) && point[property].length !== length) return fail('rows')
  }
  const values = (name: string): unknown[] => {
    const v = field(name).value
    return Array.isArray(v) && v.length === length ? v : fail('rows')
  }
  const optionalValues = (name: string): unknown[] => {
    const point = points[name]
    if (point === undefined) return Array.from({ length }, () => null)
    const v = object(point).value
    return Array.isArray(v) && v.length === length ? v : fail('rows')
  }
  const asOfToken = string(field('asOfDate').value)
  if (!/^\d{8}$/.test(asOfToken)) return fail('date')
  const asOf = `${asOfToken.slice(0,4)}-${asOfToken.slice(4,6)}-${asOfToken.slice(6)}`
  const date = Date.parse(asOf)
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0,10) !== asOf || date > Date.parse(retrievedAt)) return fail('date')
  if (object(object(holdings.containersByNameMap).all).fullName !== 'holdings.all') return fail('scope')
  if (field('holdingPercent').label !== 'Weight (%)' || field('holdingPercent').fullName !== 'holdings.all.holdingPercent') return fail('units')
  const ids = values('isin'), types = values('assetClass'), weights = values('holdingPercent')
  const market = values('marketValue'), notional = values('notionalValue')
  const currencies = values('marketCurrencyCode'), tickers = values('ticker')
  const exchanges = optionalValues('exchange'), countries = optionalValues('countryOfRisk')
  const rows: IusaRow[] = names.map((value, i) => {
    const name = string(value), isin = optional(ids[i]), assetClass = string(types[i])
    if (!name.trim() || !assetClass.trim()) return fail('rows')
    const weightPercent = decimal(weights[i])
    if (new D(weightPercent).abs().gt(100)) return fail('weights')
    return { sourceRow: i + 1, name, isin, ticker: optional(tickers[i]), assetClass,
      weightPercent, marketValue: decimal(market[i]), notionalValue: decimal(notional[i]), currency: string(currencies[i]),
      exchange: optional(exchanges[i]), country: optional(countries[i]),
      identifierPresence: isin ? 'present' : 'missing',
      equityIdentity: assetClass !== 'Equity' ? 'not-equity' : isin && validIsin(isin) ? 'valid-isin' : 'unresolved' }
  })
  const groups = new Map<string, { assetClass: string; rows: number; weightPercent: string; marketValue: string; notionalValue: string }>()
  for (const row of rows) {
    const group = groups.get(row.assetClass) ?? { assetClass: row.assetClass, rows: 0, weightPercent: '0', marketValue: '0', notionalValue: '0' }
    group.rows++
    for (const key of ['weightPercent', 'marketValue', 'notionalValue'] as const) group[key] = new D(group[key]).add(row[key]).toFixed()
    groups.set(row.assetClass, group)
  }
  const sum = (list: IusaRow[], key: 'weightPercent' | 'marketValue' | 'notionalValue') => list.reduce((s,r) => s.add(r[key]), new D(0)).toFixed()
  const equity = rows.filter(r => r.assetClass === 'Equity')
  return {
    fundIsin: pilotIsin, productId: '251900', asOf, retrievedAt,
    sha256: createHash('sha256').update(bytes).digest('hex'), parserVersion: iusaParserVersion,
    weightUnit: 'percent', denominator: 'issuer-reported-all-holdings', rows,
    accounting: { sourceRows: rows.length, equityRows: equity.length, nonEquityRows: rows.length - equity.length,
      validEquityIsins: equity.filter(r => r.equityIdentity === 'valid-isin').length,
      unresolvedEquityRows: equity.filter(r => r.equityIdentity !== 'valid-isin').length,
      reportedPercent: sum(rows, 'weightPercent'), equityPercent: sum(equity, 'weightPercent'),
      nonEquityPercent: sum(rows.filter(r => r.assetClass !== 'Equity'), 'weightPercent'),
      marketValue: sum(rows, 'marketValue'), notionalValue: sum(rows, 'notionalValue'), byAssetClass: [...groups.values()] }
  }
}

export function qualifyIusa(bytes: Uint8Array, retrievedAt: string, repeat?: { bytes: Uint8Array; retrievedAt: string }): IusaQualification {
  const checks: SourceCheck[] = []
  let candidate: IusaCandidate | null = null
  try {
    candidate = parseIusaCandidate(bytes, retrievedAt)
    checks.push({ id: 'source-format', state: 'passed', detail: 'Exact IUSA product, date, percentage label and all returned row arrays validated; every row retained.', evidence: [candidate.sha256, iusaProductUrl] })
    checks.push({ id: 'weight-accounting', state: new D(candidate.accounting.reportedPercent).sub(100).abs().lte('0.005') ? 'passed' : 'failed',
      detail: 'All signed row weights accounted for; total must stay within 0.005 percentage points of 100 for this fixed unlevered source profile. This rounding guard does not prove completeness or infer units; original weights are never normalized.', evidence: [candidate.sha256] })
    checks.push({ id: 'long-only-equity', state: candidate.rows.some(r => r.assetClass === 'Equity' && new D(r.weightPercent).lt(0)) ? 'failed' : 'passed', detail: 'Signed equity rows are preserved but cannot enter this long-only allocation measure.', evidence: [candidate.sha256] })
    const ids = candidate.rows.filter(r => r.equityIdentity === 'valid-isin').map(r => r.isin)
    checks.push({ id: 'security-identifiers', state: candidate.accounting.unresolvedEquityRows || new Set(ids).size !== ids.length ? 'pending' : 'passed', detail: 'Equity ISIN checksums checked. Missing or repeated IDs retain their source rows; no company or share-class merge is inferred.', evidence: [candidate.sha256] })
    if (repeat) {
      const second = parseIusaCandidate(repeat.bytes, repeat.retrievedAt)
      const same = second.asOf === candidate.asOf && JSON.stringify(second.rows) === JSON.stringify(candidate.rows)
      checks.push({ id: 'bounded-repeat', state: same ? 'passed' : 'failed', detail: same ? 'Independent retained response has identical date and canonical rows. Menu/config byte changes do not invalidate row equality.' : 'Repeat response differs in date or canonical rows.', evidence: [candidate.sha256, second.sha256] })
    } else checks.push({ id: 'bounded-repeat', state: 'pending', detail: 'No independent same-date response was supplied.', evidence: [] })
  } catch (error) {
    checks.push({ id: 'source-format', state: 'failed', detail: `Source validation failed: ${error instanceof SourceError ? error.code : 'format'}. No source body or provider error is included.`, evidence: [] })
  }
  // Technical readiness is separate from the unsettled rights finding. This adapter
  // supports existing private evidence only; no retrieval or redistribution licence.
  // A future source contract needs new authoritative evidence and a reviewed adapter.
  checks.push(
    { id: 'fund-value-basis', state: candidate ? 'passed' : 'pending', detail: 'Issuer-reported allocation of the whole published primary holdings table, including non-equity rows. Compatible with the authorized allocation-estimate measure, not accounting NAV reconciliation. No renormalization.', evidence: [iusaProductUrl] },
    { id: 'non-equity-scope', state: candidate ? 'passed' : 'pending', detail: 'Every cash, collateral, futures and other source row remains separate. Zero futures weight is not zero economic exposure. No non-equity row is admitted as ordinary equity.', evidence: candidate ? [candidate.sha256] : [] },
    { id: 'local-use', state: 'pending', detail: 'Applicable terms do not yet establish permission for private automated retention, replay and derived display. Public HTTP access alone does not establish this.', evidence: [iusaTermsUrl] }
  )
  const technical = checks.filter(c => c.id !== 'local-use')
  const state = technical.some(c => c.state === 'failed') ? 'failed' : technical.some(c => c.state === 'pending') ? 'open' : 'ready'
  return { parserVersion: iusaParserVersion, reviewVersion: iusaReviewVersion, state, eligibleForMonetaryExposure: state === 'ready', candidate, checks }
}
