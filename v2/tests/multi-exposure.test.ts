import { expect, it } from 'vitest'
import { exposure } from '../server/exposure'
import type { Composition } from '../server/composition'
import type { overview, ValuedPosition } from '../server/overview'
const at = '2026-09-11T12:00:00Z'
const stock = 'US67066G1040'
function source(fundIsin: string, weight: string): Composition {
  return {
    fundIsin,
    fundName: 'Synthetic fund',
    sourceUrl: 'https://example.invalid/source',
    termsUrl: 'https://example.invalid/terms',
    asOf: '2026-09-10',
    retrievedAt: at,
    sha256: fundIsin,
    parserVersion: 1,
    scope: 'full-holdings',
    measure: 'issuer-reported-allocation-estimate',
    weightUnit: 'percent',
    disclosedPercent: '100',
    identifiedPercent: weight,
    missingPercent: '0',
    rows: [{ isin: stock, name: 'Synthetic shared security', weightPercent: weight, issue: null }],
  }
}
function position(
  isin: string,
  value: string | null,
  currency = 'EUR',
  account = 'a'
): ValuedPosition {
  return {
    isin,
    value,
    currency,
    account,
    name: 'Synthetic',
    quantity: '1',
    instrumentType: isin === stock ? 'stock' : 'fund',
    averageBuyIn: '1',
    price: value,
    quoteAt: value === null ? null : at,
    venue: 'TEST',
    quality: 'Synthetic',
    weight: null,
    quantityObservedAt: at,
    valuationStatus: value === null ? 'unavailable' : 'priced',
  }
}
function valuation(rows: ValuedPosition[], eur: string, usd = '0'): ReturnType<typeof overview> {
  return {
    rows,
    totals: ['EUR', 'USD'].map((currency) => ({
      currency,
      securities: currency === 'EUR' ? eur : usd,
      cash: null,
      pricedCount: rows.filter((row) => row.currency === currency && row.value !== null).length,
      cashAt: null,
      cashStale: true,
      olderQuotes: 0,
    })),
    pricedCount: rows.filter((row) => row.value !== null).length,
    zeroCount: 0,
    missingCount: rows.filter((row) => row.value === null).length,
    holdingsAt: at,
    quoteRetrievedAt: at,
  }
}
it('aggregates the same ISIN across funds once per account with independent source provenance and currency', () => {
  const sources = [source('IE0031442068', '10'), source('IE00B4L5Y983', '20')]
  const result = exposure(
    valuation(
      [
        position('IE0031442068', '100'),
        position('IE00B4L5Y983', '200'),
        position('IE00B4L5Y983', '50', 'EUR', 'b'),
        position(stock, '7'),
        position('IE00B4L5Y983', '80', 'USD'),
        position(stock, '3', 'USD'),
      ],
      '357',
      '83'
    ),
    sources,
    null
  )
  const eur = result.rows.find((row) => row.currency === 'EUR')!
  expect(eur).toMatchObject({ direct: '7', indirect: '60', knownTotal: '67' })
  expect(eur.contributions.filter((row) => row.kind === 'etf')).toHaveLength(3)
  expect(
    eur.contributions.filter((row) => row.kind === 'etf').map((row) => row.source?.sha256)
  ).toEqual(['IE0031442068', 'IE00B4L5Y983', 'IE00B4L5Y983'])
  expect(result.rows.find((row) => row.currency === 'USD')).toMatchObject({
    direct: '3',
    indirect: '16',
    knownTotal: '19',
  })
  expect(result.coverage.map((group) => group.unresolvedValue)).toEqual(['290', '64'])
  expect(() => exposure(valuation([], '0'), [sources[0], sources[0]], null)).toThrow(
    'Multiple selected'
  )
})
it('keeps unsupported hedged funds and unvalued direct stocks explicit while other sources contribute', () => {
  const result = exposure(
    valuation(
      [position('IE00B4L5Y983', '100'), position('FR0010361683', '40'), position(stock, null)],
      '140'
    ),
    [source('IE00B4L5Y983', '20')],
    null
  )
  expect(result.rows[0]).toMatchObject({ indirect: '20', knownTotal: '20' })
  expect(result.rows[0].contributions.find((row) => row.kind === 'direct')?.value).toBeNull()
  expect(result.missingValuations).toBe(1)
  expect(result.directStockCoverage).toHaveLength(1)
  expect(result.directStockCoverage[0]).toMatchObject({ value: null, validIsin: true })
  expect(result.directStockCoverage[0].matchedFunds.map((source) => source.fundIsin)).toEqual([
    'IE00B4L5Y983',
  ])
  expect(result.gaps.find((row) => row.isin === 'FR0010361683')?.value).toBe('40')
  expect(result.coverage[0].unresolvedValue).toBe('120')
})

it('aggregates an admitted NQSE equity estimate with direct holdings by exact ISIN', () => {
  const result = exposure(
    valuation([position('IE00BYVQ9F29', '40'), position(stock, '3')], '43'),
    [source('IE00BYVQ9F29', '20')],
    null
  )
  const row = result.rows.find((item) => item.isin === stock && item.currency === 'EUR')!
  expect(row).toMatchObject({ direct: '3', indirect: '8', knownTotal: '11' })
  expect(row.contributions.find((item) => item.positionIsin === 'IE00BYVQ9F29')?.source).toMatchObject({
    fundIsin: 'IE00BYVQ9F29',
    measure: 'issuer-reported-allocation-estimate',
  })
  expect(result.gaps.find((gap) => gap.isin === 'IE00BYVQ9F29')).toMatchObject({ value: '32' })
})

it('excludes sold, absent and negative ETF positions from direct-stock matches while retaining unvalued held funds', () => {
  const sold = { ...position('IE0031442068', '0'), quantity: '0', valuationStatus: 'zero' as const }
  const short = { ...position('IE00B53SZB19', null), quantity: '-1' }
  const heldUnknown = position('IE00B4L5Y983', null)
  const sources = ['IE0031442068', 'IE00B53SZB19', 'IE00B4L5Y983', 'IE00B3WJKG14'].map((isin) =>
    source(isin, '20')
  )
  const result = exposure(
    valuation([position(stock, '7'), sold, short, heldUnknown], '7'),
    sources,
    null
  )
  expect(result.directStockCoverage[0].matchedFunds.map((source) => source.fundIsin)).toEqual([
    'IE00B4L5Y983',
  ])
  expect(result.rows[0].contributions.filter((item) => item.kind === 'etf')).toMatchObject([
    { positionIsin: 'IE00B4L5Y983', value: null },
  ])
  expect(result.rows[0].knownTotal).toBe('7')
})

it('keeps both valuation and source remedies visible for an unmatched unvalued direct stock', () => {
  const result = exposure(valuation([position(stock, null)], '0'), [], null)
  expect(result.directStockCoverage[0].matchedFunds).toEqual([])
  expect(result.directStockCoverage[0].nextAction).toContain(
    'Resolve the direct holding valuation.'
  )
  expect(result.directStockCoverage[0].nextAction).toContain('Inspect missing fund coverage')
})

it('retains saved fund class names without changing contribution arithmetic', () => {
  const positions = [
    { ...position('IE0031442068', '100'), name: 'NASDAQ100 USD (Dist)' },
    { ...position('IE00B53SZB19', '200'), name: 'NASDAQ100 USD (Acc)' },
  ]
  const result = exposure(
    valuation(positions, '300'),
    [source(positions[0].isin, '10'), source(positions[1].isin, '20')],
    null
  )
  expect(result.rows[0].contributions.map((item) => item.positionName)).toEqual(
    positions.map((item) => item.name)
  )
  expect(result.rows[0].contributions.map((item) => item.value)).toEqual(['10', '40'])
  expect(result.rows[0].knownTotal).toBe('50')
})
