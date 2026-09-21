import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { validIsin } from './composition'
import type { IssuerCandidate, IssuerProfile, IusaRow } from './iusa-qualification'

const D = Decimal.clone({ precision: 256 })
function text(value: unknown): string {
  if (typeof value !== 'string') throw Error('text')
  return value
}
function decimal(value: unknown): string {
  const token = text(value)
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token) || token.length > 128) throw Error('numeric')
  const exponent = /[eE]([+-]?\d+)$/.exec(token)
  if (exponent && Math.abs(Number(exponent[1])) > 100) throw Error('numeric')
  if (!new D(token).isFinite() || new D(token).abs().gt('1e100')) throw Error('numeric')
  return token
}
function losslessJson(raw: string): { aaData: unknown[][] } {
  JSON.parse(raw)
  return JSON.parse(raw.replace(/"(?:[^"\\]|\\[\s\S])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    token => token.startsWith('"') ? token : JSON.stringify(token)))
}
function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', state: 'start' | 'plain' | 'quoted' | 'closed' = 'start'
  const finishCell = () => { row.push(cell); cell = ''; state = 'start' }
  const finishRow = () => { finishCell(); if (row.some(value => value.trim())) rows.push(row); row = [] }
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (state === 'quoted') {
      if (char === '"') {
        if (raw[i + 1] === '"') { cell += '"'; i++ } else state = 'closed'
      } else cell += char
      continue
    }
    if (char === ',') finishCell()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && raw[i + 1] === '\n') i++
      finishRow()
    } else if (state === 'closed') throw Error('csv trailing quote content')
    else if (char === '"') {
      if (state !== 'start') throw Error('csv embedded quote')
      state = 'quoted'
    } else { cell += char; state = 'plain' }
  }
  if (state === 'quoted') throw Error('csv unclosed quote')
  if (cell || row.length || state === 'closed') finishRow()
  return rows
}
function german(value: string): string {
  if (!/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?$/.test(value)) throw Error('german decimal')
  return decimal(value.replaceAll('.', '').replace(',', '.'))
}
function roundedWeightMatches(actual: string, shown: string) {
  const places = shown.includes('.') ? shown.split('.')[1].length : 0
  return new D(actual).sub(shown).abs().lte(new D(10).pow(-places).div(2))
}
const optional = (value: unknown) => value === null || value === '-' || value === '' ? null : text(value)
const raw = (value: unknown) => value && typeof value === 'object' && 'raw' in value ? decimal((value as { raw: unknown }).raw) : decimal(value)
const decode = (bytes: Buffer) => {
  if (bytes.length > 3_000_000) throw Error('size')
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
}
export function parseLegacyIssuerCandidate(bytes: Buffer, retrievedAt: string, profile: IssuerProfile, csvBytes: Buffer, pageBytes: Buffer): IssuerCandidate {
  if (profile.sourceKind !== 'legacy' || profile.fundIsin !== 'DE000A0F5UF5' || profile.productId !== '251896') throw Error('profile')
  if (!/^\d{4}-\d{2}-\d{2}T/.test(retrievedAt) || !Number.isFinite(Date.parse(retrievedAt)) || Date.parse(retrievedAt) < Date.parse(profile.expectedAsOf ?? '2026-09-10')) throw Error('date')
  const page = decode(pageBytes)
  const expectedAsOf = profile.expectedAsOf ?? '2026-09-10'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedAsOf) || !Number.isFinite(Date.parse(expectedAsOf)) || new Date(expectedAsOf).toISOString().slice(0,10) !== expectedAsOf) throw Error('date')
  if (!/portfolioId\s*[:=]\s*["']251896["']/.test(page) || !page.includes('ISIN: DE000A0F5UF5')) throw Error('page identity')
  // Historical schema-8 replay keeps its reviewed page condition. New provider
  // evidence binds the selected holdings date before calling this parser.
  if (!profile.expectedAsOf && !/NAV per\s+10\.Sept\.2026/.test(page)) throw Error('page identity')
  const parsed = losslessJson(decode(bytes))
  if (!parsed || !Array.isArray(parsed.aaData) || !parsed.aaData.length || parsed.aaData.length > 5000) throw Error('rows')
  const csvRows = parseCsv(decode(csvBytes))
  const headers = ['Emittententicker','Name','Sektor','Anlageklasse','Marktwert','Gewichtung (%)','Nominalwert','Nominale','Kurs','Standort','Börse','Marktwährung']
  const csvDate = /^(\d{1,2})\.([A-Za-zÄä]+)\.?(\d{4})$/.exec(csvRows[0]?.[1] ?? '')
  const monthNames: Record<string,string> = { jan:'01',januar:'01',feb:'02',februar:'02',märz:'03',mär:'03',mar:'03',apr:'04',april:'04',mai:'05',may:'05',juni:'06',jun:'06',juli:'07',jul:'07',aug:'08',august:'08',sept:'09',sep:'09',september:'09',okt:'10',oct:'10',oktober:'10',nov:'11',november:'11',dez:'12',dec:'12',dezember:'12' }
  const csvAsOf = csvDate ? `${csvDate[3]}-${monthNames[csvDate[2].toLowerCase()]}-${csvDate[1].padStart(2,'0')}` : null
  if (csvRows[0]?.length !== 2 || csvRows[0][0] !== 'Fondsposition per' || csvAsOf !== expectedAsOf ||
      JSON.stringify(csvRows[1]) !== JSON.stringify(headers) || csvRows.length !== parsed.aaData.length + 2) throw Error('csv header or rows')
  const rows: IusaRow[] = parsed.aaData.map((source, index) => {
    if (!Array.isArray(source) || source.length !== 13) throw Error('width')
    const csvRow = csvRows[index + 2]
    if (csvRow.length !== 12) throw Error('csv width')
    const name = text(source[1]), sourceClass = text(source[3]), weightPercent = raw(source[5])
    if (!name.trim() || !sourceClass.trim() || new D(weightPercent).abs().gt(100)) throw Error('row')
    for (const [csvIndex, jsonIndex] of [[0,0],[1,1],[2,2],[3,3],[9,10],[10,11],[11,12]])
      if (csvRow[csvIndex] !== text(source[jsonIndex])) throw Error('csv context correspondence')
    if (!new D(raw(source[4])).eq(german(csvRow[4])) || !new D(raw(source[6])).eq(german(csvRow[6])) ||
        !roundedWeightMatches(weightPercent, german(csvRow[5]))) throw Error('csv numerical correspondence')
    const isin = optional(source[8]), assetClass = sourceClass === 'Aktien' ? 'Equity' : sourceClass
    return { sourceRow: index + 1, ticker: optional(source[0]), name, assetClass, marketValue: raw(source[4]),
      weightPercent, notionalValue: raw(source[6]), isin, currency: text(source[12]), exchange: optional(source[11]), country: optional(source[10]),
      identifierPresence: isin ? 'present' : 'missing', equityIdentity: assetClass === 'Equity' ? isin && validIsin(isin) ? 'valid-isin' : 'unresolved' : 'not-equity' }
  })
  const sum = (list: IusaRow[], key: 'weightPercent' | 'marketValue' | 'notionalValue') => list.reduce((total, row) => total.add(row[key]), new D(0)).toFixed()
  const equity = rows.filter(row => row.assetClass === 'Equity'), nonEquity = rows.filter(row => row.assetClass !== 'Equity')
  const byAssetClass = [...new Set(rows.map(row => row.assetClass))].map(assetClass => {
    const group = rows.filter(row => row.assetClass === assetClass)
    return { assetClass, rows: group.length, weightPercent: sum(group, 'weightPercent'), marketValue: sum(group, 'marketValue'), notionalValue: sum(group, 'notionalValue') }
  })
  return { fundIsin: profile.fundIsin, productId: profile.productId, asOf: expectedAsOf, retrievedAt,
    sha256: createHash('sha256').update(bytes).digest('hex'), parserVersion: 'ishares-legacy/2', weightUnit: 'percent', denominator: 'issuer-reported-all-holdings', rows,
    accounting: { sourceRows: rows.length, equityRows: equity.length, nonEquityRows: nonEquity.length,
      validEquityIsins: equity.filter(row => row.equityIdentity === 'valid-isin').length, unresolvedEquityRows: equity.filter(row => row.equityIdentity !== 'valid-isin').length,
      reportedPercent: sum(rows, 'weightPercent'), equityPercent: sum(equity, 'weightPercent'), nonEquityPercent: sum(nonEquity, 'weightPercent'),
      marketValue: sum(rows, 'marketValue'), notionalValue: sum(rows, 'notionalValue'), byAssetClass } }
}
