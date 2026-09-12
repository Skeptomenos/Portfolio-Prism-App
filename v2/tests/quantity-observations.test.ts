import { it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { quantityObservations } from '../server/quantity-observations'
import { SnapshotStore } from '../server/store'
import { overview } from '../server/overview'
import { catalog } from '../server/explorer'
import type { Snapshot } from '../server/model'

const isin = 'US0378331005'
const snapshot = (hour: number, quantity = '10', account = 'a'): Snapshot => ({
  fetchedAt: `2026-09-06T${hour}:00:00Z`,
  positions: [
    { isin, account, quantity, name: 'Synthetic', instrumentType: 'stock', averageBuyIn: '1' },
  ],
})

it('retains the quantity observation across same-quantity imports and reopen, then rejects pre-change quotes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-quantity-'))
  const path = join(dir, 'portfolio.sqlite')
  let store = new SnapshotStore(path)
  try {
    store.save(snapshot(10))
    store.save(snapshot(11, '10.00'))
    const data = [
      {
        ...catalog.find((s) => s.id === 'instrumentDetails')!,
        payload: [
          {
            isin,
            response: {
              isin,
              priceFactor: 1,
              listings: [{ slug: 'LSX', active: true, currencyId: 'EUR' }],
            },
          },
        ],
      },
      {
        ...catalog.find((s) => s.id === 'quotes')!,
        payload: [
          {
            isin,
            venue: 'LSX',
            quote: { bid: { price: '100', time: Date.parse('2026-09-06T10:30:00Z') } },
          },
        ],
      },
    ]
    const read = () =>
      overview(
        store.latest(),
        data,
        Date.parse('2026-09-06T18:00:00Z'),
        store.quantityObservations()
      )
    expect(read().rows[0]).toMatchObject({
      value: '1000',
      quantityObservedAt: snapshot(10).fetchedAt,
    })
    store.close()
    store = new SnapshotStore(path)
    expect(read().rows[0].value).toBe('1000')
    store.save(snapshot(12, '20'))
    store.save(snapshot(13, '20.0'))
    expect(read().rows[0]).toMatchObject({
      value: null,
      quantityObservedAt: snapshot(12).fetchedAt,
    })
    store.close()
    store = new SnapshotStore(path)
    expect(read().rows[0].value).toBeNull()
    expect(store.latest()?.positions[0].quantity).toBe('20.0')
    // A failed refresh may retain its old payload; it must not restore a rejected valuation.
    const failedData = data.map((s) => ({ ...s, status: 'failed' as const }))
    expect(
      overview(
        store.latest(),
        failedData,
        Date.parse('2026-09-06T18:00:00Z'),
        store.quantityObservations()
      ).rows[0].value
    ).toBeNull()
    expect(
      overview(store.latest(), data, Date.parse('2026-09-06T18:00:00Z'), []).rows[0].value
    ).toBeNull()
  } finally {
    store.close()
    rmSync(dir, { recursive: true })
  }
})

it('uses account-scoped continuity and resets the basis after disappearance', () => {
  const history = [
    snapshot(10),
    {
      ...snapshot(11),
      positions: [...snapshot(11).positions, ...snapshot(11, '10', 'b').positions],
    },
  ]
  expect(quantityObservations(history).map((p) => [p.account, p.observedAt])).toEqual([
    ['a', snapshot(10).fetchedAt],
    ['b', snapshot(11).fetchedAt],
  ])
  expect(
    quantityObservations([...history, { ...snapshot(12), positions: [] }, snapshot(13)])[0]
      .observedAt
  ).toBe(snapshot(13).fetchedAt)
})

it('does not infer compatibility from malformed or out-of-order legacy observation dates', () => {
  expect(quantityObservations([snapshot(11), snapshot(10, '20')])[0].observedAt).toBeNull()
  expect(quantityObservations([{ ...snapshot(10), fetchedAt: 'unknown' }])[0].observedAt).toBeNull()
  expect(
    quantityObservations([snapshot(11), snapshot(10, '20'), snapshot(12, '20')])[0].observedAt
  ).toBe(snapshot(12).fetchedAt)
})
