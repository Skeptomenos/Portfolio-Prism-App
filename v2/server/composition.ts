import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'

export const pilotIsin = 'IE0031442068'
export const compositionUrl = `https://www.justetf.com/en/etf-profile.html?isin=${pilotIsin}`
export const termsUrl = 'https://www.justetf.com/documents/justETF_general_terms_and_conditions.pdf'
const D = Decimal.clone({ precision: 256 })
export class CompositionError extends Error {
  constructor(
    public readonly code: 'identity' | 'format' | 'date' | 'units' | 'weights' | 'http' | 'size',
    public readonly httpStatus?: number
  ) {
    super(`Composition ${code} validation failed`)
  }
}
export interface Constituent {
  name: string
  isin: string | null
  weightPercent: string
  issue: string | null
}
export interface Composition {
  fundIsin: string
  fundName: string
  asOf: string | null
  retrievedAt: string
  sourceUrl: string
  termsUrl: string
  sha256: string
  parserVersion: 1
  weightUnit: 'percent'
  scope: 'top-ten'
  rows: Constituent[]
  disclosedPercent: string
  identifiedPercent: string
  missingPercent: string
}
export interface CompositionAttempt {
  at: string
  id: string
  status: 'success' | 'failed'
  code: string | null
}
export function validIsin(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  const digits = [...isin].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('')
  return (
    [...digits].reverse().reduce((sum, c, i) => {
      const n = Number(c) * (i % 2 ? 2 : 1)
      return sum + Math.floor(n / 10) + (n % 10)
    }, 0) %
      10 ===
    0
  )
}
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
// Deliberately narrow provider contract. Ambiguous/missing elements fail closed.
function element(html: string, id: string): string {
  const matches = [
    ...html.matchAll(
      new RegExp(`<([a-z0-9]+)[^>]*data-testid="${id}"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'g')
    ),
  ]
  if (matches.length !== 1) throw new CompositionError('format')
  return matches[0][2]
}
function percent(value: string): Decimal {
  if (!/^\d{1,3}(?:\.\d{1,8})?%$/.test(value)) throw new CompositionError('units')
  const n = new D(value.slice(0, -1))
  if (n.gt(100)) throw new CompositionError('weights')
  return n
}
export function parseComposition(raw: string, retrievedAt: string): Composition {
  if (Buffer.byteLength(raw) > 2_000_000) throw new CompositionError('size')
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new CompositionError('date')
  const isin = text(element(raw, 'etf-profile-header_isin-value'))
  const name = text(element(raw, 'etf-profile-header_etf-name'))
  if (isin !== pilotIsin || name !== 'iShares Core S&P 500 UCITS ETF USD (Dist)')
    throw new CompositionError('identity')
  const dateText = text(element(raw, 'tl_etf-holdings_reference-date'))
  let asOf: string | null = null
  if (dateText !== 'As of -' && dateText !== 'As of —') {
    const match = /^As of (\d{2})\/(\d{2})\/(\d{4})$/.exec(dateText)
    if (!match) throw new CompositionError('date')
    asOf = `${match[3]}-${match[2]}-${match[1]}`
    const ms = Date.parse(asOf)
    if (
      !Number.isFinite(ms) ||
      new Date(ms).toISOString().slice(0, 10) !== asOf ||
      ms > Date.parse(retrievedAt)
    )
      throw new CompositionError('date')
  }
  if (text(element(raw, 'hl_etf-holdings_top-holdings_header')) !== 'Top 10 Holdings')
    throw new CompositionError('format')
  const table = element(raw, 'etf-holdings_top-holdings_table')
  const rows: Constituent[] = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => {
    const row = match[1]
    const weight = percent(text(element(row, 'tl_etf-holdings_top-holdings_value_percentage')))
    const links = [...row.matchAll(/href="\/en\/stock-profiles\/([A-Z0-9]+)"/g)]
    const id = links.length === 1 && validIsin(links[0][1]) ? links[0][1] : null
    const label = text(row.split('</td>')[0]).slice(0, 200)
    if (!label) throw new CompositionError('format')
    return {
      name: label,
      isin: id,
      weightPercent: weight.toFixed(),
      issue: id
        ? null
        : 'No verified equity ISIN; cash, derivatives or unmatched security remain unresolved',
    }
  })
  if (rows.length !== 10) throw new CompositionError('format')
  const ids = rows.flatMap((r) => (r.isin ? [r.isin] : []))
  if (new Set(ids).size !== ids.length) throw new CompositionError('identity')
  const disclosed = rows.reduce((sum, r) => sum.add(r.weightPercent), new D(0))
  const stated = percent(text(element(raw, 'tl_etf-holdings_top-holdings_weight')))
  if (disclosed.gt(100) || disclosed.sub(stated).abs().gt('0.05'))
    throw new CompositionError('weights')
  const identified = rows
    .filter((r) => r.isin)
    .reduce((sum, r) => sum.add(r.weightPercent), new D(0))
  return {
    fundIsin: isin,
    fundName: name,
    asOf,
    retrievedAt,
    sourceUrl: compositionUrl,
    termsUrl,
    sha256: createHash('sha256').update(raw).digest('hex'),
    parserVersion: 1,
    weightUnit: 'percent',
    scope: 'top-ten',
    rows,
    disclosedPercent: disclosed.toFixed(),
    identifiedPercent: identified.toFixed(),
    missingPercent: new D(100).sub(disclosed).toFixed(),
  }
}
export async function acquireComposition(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(compositionUrl, {
    signal,
    redirect: 'error',
    credentials: 'omit',
    headers: { Accept: 'text/html' },
  })
  if (!response.ok) throw new CompositionError('http', response.status)
  if (!response.headers.get('content-type')?.includes('text/html') || !response.body)
    throw new CompositionError('format')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_000_000) throw new CompositionError('size')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  const composition = parseComposition(raw, new Date().toISOString())
  return { raw, composition }
}
