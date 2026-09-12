import { it, expect } from 'vitest'
import { overview } from '../server/overview'
import { catalog, type DataSource } from '../server/explorer'
import { decodeSnapshot, type Snapshot } from '../server/model'
import { exposure } from '../server/exposure'
import { quantityObservations } from '../server/quantity-observations'
const now = Date.parse('2026-09-06T12:00:00Z')
const snapshot: Snapshot = {
  fetchedAt: '2026-09-06T11:00:00Z',
  positions: [
    {
      account: 'a',
      isin: 'US0378331005',
      name: 'USD stock name',
      quantity: '1.234567890123456789',
      instrumentType: 'stock',
      averageBuyIn: '10',
    },
  ],
}
const source = (id: string, payload: DataSource['payload']): DataSource => ({
  ...catalog.find((s) => s.id === id)!,
  status: 'success',
  fetchedAt: '2026-09-06T11:00:00Z',
  payload,
})
const sources = () => [
  source('instrumentDetails', [
    {
      isin: 'US0378331005',
      response: {
        isin: 'US0378331005',
        priceFactor: 1,
        listings: [{ slug: 'LSX', active: true, currencyId: 'EUR' }],
      },
    },
  ]),
  source('quotes', [
    { isin: 'US0378331005', venue: 'LSX', quote: { bid: { price: '100', time: now - 1000 } } },
  ]),
  source('cash', [
    { accountNumber: 'cash', currencyId: 'EUR', amount: 50 },
    { accountNumber: 'cashUSD', currencyId: 'USD', amount: 20 },
  ]),
]
it('uses exact quantities and listing currency, never the name/base currency; separates cash and currencies', () => {
  const result = overview(snapshot, sources(), now)
  expect(result.rows[0]).toMatchObject({
    value: '123.4567890123456789',
    currency: 'EUR',
    weight: '100.0000',
  })
  expect(result.totals.find((t) => t.currency === 'EUR')).toMatchObject({
    securities: '123.4567890123456789',
    cash: '50',
  })
  expect(result.totals.find((t) => t.currency === 'USD')).toMatchObject({
    securities: '0',
    cash: '20',
  })
})
it('does not silently value an unsupported or missing position and labels partial denominator', () => {
  const input = {
    ...snapshot,
    positions: [...snapshot.positions, { ...snapshot.positions[0], isin: 'US88160R1014' }],
  }
  const result = overview(input, sources(), now)
  expect(result.missingCount).toBe(1)
  expect(result.rows[1].value).toBeNull()
  expect(result.totals[0].pricedCount).toBe(1)
})
it('retains old quote estimates with an explicit age flag and rejects future or invalid quotes', () => {
  const data = sources()
  data[1] = source('quotes', [
    { isin: 'US0378331005', venue: 'LSX', quote: { bid: { price: '100', time: now - 86400001 } } },
  ])
  const observations = quantityObservations([
    { ...snapshot, fetchedAt: '2026-09-04T11:00:00Z' },
    snapshot,
  ])
  expect(overview(snapshot, data, now, observations).rows[0].quality).toContain(
    'Quote older than 24h'
  )
  expect(overview(snapshot, data, now, observations).rows[0].value).toBe('123.4567890123456789')
  data[1] = source('quotes', [
    { isin: 'US0378331005', venue: 'LSX', quote: { bid: { price: '100', time: now + 3600000 } } },
  ])
  expect(overview(snapshot, data, now).rows[0].value).toBeNull()
})
it('rejects mismatched reference identity and unconfirmed scaling', () => {
  for (const response of [
    { isin: 'US88160R1014', priceFactor: 1 },
    { isin: 'US0378331005', priceFactor: 0.01 },
  ]) {
    const data = sources()
    data[0] = source('instrumentDetails', [
      {
        isin: 'US0378331005',
        response: { ...response, listings: [{ slug: 'LSX', active: true, currencyId: 'EUR' }] },
      },
    ])
    expect(overview(snapshot, data, now).rows[0].value).toBeNull()
  }
})

it('does not double count duplicate cash accounts', () => {
  const data = sources()
  data[2] = source('cash', [
    { accountNumber: 'same', currencyId: 'EUR', amount: 50 },
    { accountNumber: 'same', currencyId: 'EUR', amount: 50 },
  ])
  expect(overview(snapshot, data, now).totals[0].cash).toBeNull()
})

it('withholds a new quantity from an earlier market quote even when it was retrieved recently', () => {
  const input = {
    ...snapshot,
    fetchedAt: new Date(now).toISOString(),
    positions: [{ ...snapshot.positions[0], quantity: '20' }],
  }
  const data = sources()
  data[1].fetchedAt = new Date(now).toISOString()
  const result = overview(input, data, now)
  expect(result.rows[0].value).toBeNull()
  expect(result.rows[0].quality).toContain('Quantity/quote basis unverified')
  expect(result.totals[0].securities).toBe('0')
  data[1] = source('quotes', [
    { isin: input.positions[0].isin, venue: 'LSX', quote: { bid: { price: '50', time: now + 1 } } },
  ])
  expect(overview(input, data, now + 1).rows[0].value).toBe('1000')
})

it('preserves signed rows but excludes negatives and zero rows from the long-only denominator', () => {
  const input = {
    ...snapshot,
    positions: [
      { ...snapshot.positions[0], quantity: '10' },
      { ...snapshot.positions[0], account: 'short', quantity: '-9' },
      { ...snapshot.positions[0], account: 'zero', quantity: '0' },
    ],
  }
  const result = overview(input, sources(), now)
  expect(result.totals[0]).toMatchObject({ securities: '1000', pricedCount: 1 })
  expect(result.rows[0].weight).toBe('100.0000')
  expect(result.rows[1]).toMatchObject({ quantity: '-9', value: null, weight: null })
  expect(result.rows[1].quality).toContain('Negative quantity')
  expect(result.rows[2]).toMatchObject({ quantity: '0', value: '0', weight: null })
  expect(result.missingCount).toBe(1)
  const view = exposure(result, null, null, false, now)
  expect(view.rows[0]).toMatchObject({ knownTotal: '1000', percentOfPriced: '100' })
  expect(view.rows[0].contributions).toHaveLength(1)
  expect(view.gaps).toHaveLength(1)
})

it('establishes zero without a quote, listing or supported instrument type', () => {
  const result = overview(
    {
      ...snapshot,
      positions: [{ ...snapshot.positions[0], quantity: '0', instrumentType: 'unsupported' }],
    },
    [],
    now
  )
  expect(result.rows[0]).toMatchObject({ value: '0', weight: null })
  expect(result.missingCount).toBe(0)
})

it('keeps the review stock-plus-negative-fund case within supported ownership coverage', () => {
  const rows = [
    { ...snapshot.positions[0], quantity: '10' },
    { ...snapshot.positions[0], isin: 'IE00B4L5Y983', quantity: '-9', instrumentType: 'fund' },
    { ...snapshot.positions[0], account: 'zero', quantity: '0' },
  ]
  const input = decodeSnapshot({ ...snapshot, positions: rows })
  const data = sources()
  const result = overview(input, data, now)
  const view = exposure(result, null, null, false, now)
  expect(result.totals.find((t) => t.currency === 'EUR')?.securities).toBe('1000')
  expect(view.coverage.find((t) => t.currency === 'EUR')).toMatchObject({
    knownCompanyValue: '1000',
    knownPercent: '100',
    unresolvedValue: '0',
  })
  expect(view.gaps).toEqual([
    expect.objectContaining({
      isin: 'IE00B4L5Y983',
      value: null,
      reason: expect.stringContaining('Negative quantity'),
    }),
  ])
})
