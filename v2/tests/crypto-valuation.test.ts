import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Decimal } from 'decimal.js'
import { catalog, type DataSource } from '../server/explorer'
import { overview } from '../server/overview'
import { exposure } from '../server/exposure'
import { SnapshotStore } from '../server/store'
import type { Snapshot } from '../server/model'

const at = '2026-09-21T10:00:00.000Z'
const now = Date.parse(at)
const btc = 'XF000BTC0017'

const snapshot = (quantity = '0.0003', fetchedAt = at): Snapshot => ({
  fetchedAt,
  positions: [{
    account: 'synthetic-account',
    isin: btc,
    name: 'Synthetic Bitcoin',
    quantity,
    instrumentType: 'crypto',
    averageBuyIn: '0',
  }],
})

const source = (id: string, payload: DataSource['payload'], status: DataSource['status'] = 'success'): DataSource => ({
  ...catalog.find((entry) => entry.id === id)!,
  status,
  fetchedAt: at,
  payload,
})

const cryptoSources = (overrides: {
  venue?: string
  currency?: string
  quoteCurrency?: string | null
  cryptoMetadata?: boolean
  quoteTime?: number
  price?: string
} = {}) => [
  source('instrumentDetails', [{
    isin: btc,
    response: {
      isin: btc,
      typeId: overrides.cryptoMetadata === false ? 'stock' : 'crypto',
      legalTypeId: overrides.cryptoMetadata === false ? 'STOCK' : 'CRYPTO',
      priceFactor: overrides.cryptoMetadata === false ? 0.01 : 1,
      listings: [{ slug: overrides.venue ?? 'BHS', currencyId: overrides.currency ?? 'EUR', active: true }],
    },
  }]),
  source('quotes', [{
    isin: btc,
    venue: overrides.venue ?? 'BHS',
    ...(('quoteCurrency' in overrides)
      ? (overrides.quoteCurrency === null ? {} : { currency: overrides.quoteCurrency })
      : { currency: 'EUR' }),
    quote: { bid: { price: overrides.price ?? '45000.1234567890123456789', time: overrides.quoteTime ?? now } },
  }]),
]

it('values the exact BTC instrument with exact decimal quantity and price', () => {
  const result = overview(snapshot(), cryptoSources(), now)
  expect(result.rows[0]).toMatchObject({
    isin: btc,
    currency: 'EUR',
    venue: 'BHS',
    price: '45000.1234567890123456789',
    value: '13.50003703703670370370367',
    valuationStatus: 'priced',
  })
  expect(result.totals).toEqual([expect.objectContaining({ currency: 'EUR', securities: '13.50003703703670370370367', pricedCount: 1 })])
})

it('requires the exact crypto unit, active BHS/B2C venue, and EUR listing currency', () => {
  for (const overrides of [
    { venue: 'LSX' },
    { venue: 'BHS', currency: 'USD' },
    { venue: 'BHS', cryptoMetadata: false },
  ]) {
    const result = overview(snapshot(), cryptoSources(overrides), now)
    expect(result.rows[0].value).toBeNull()
  }
  for (const venue of ['BHS', 'B2C'])
    expect(overview(snapshot(), cryptoSources({ venue }), now).rows[0].valuationStatus).toBe('priced')
})

it('requires explicit EUR quote currency and rejects a quote rebound to another listing currency', () => {
  const missing = overview(snapshot(), cryptoSources({ quoteCurrency: null }), now)
  expect(missing.rows[0].value).toBeNull()
  expect(missing.rows[0].quality).toContain('Crypto quote unit unverified')

  const mismatched = overview(snapshot(), cryptoSources({ quoteCurrency: 'USD' }), now)
  expect(mismatched.rows[0].value).toBeNull()
  expect(mismatched.rows[0].quality).toContain('Quote and listing currencies differ')
})

it('rejects future quotes and quotes before the observed quantity', () => {
  const future = overview(snapshot(), cryptoSources({ quoteTime: now + 60001 }), now)
  expect(future.rows[0].value).toBeNull()

  const earlier = overview(
    snapshot('0.0003', at),
    cryptoSources({ quoteTime: now - 1 }),
    now,
  )
  expect(earlier.rows[0].value).toBeNull()
  expect(earlier.rows[0].quality).toContain('Quantity/quote basis unverified')
})

it('keeps priced crypto outside company rows and conserves currency coverage', () => {
  const valuations = overview(snapshot(), cryptoSources(), now)
  const result = exposure(valuations, null, null, false, now)
  expect(result.rows).toEqual([])
  expect(result.gaps).toEqual([])
  expect(result.coverage).toEqual([{
    currency: 'EUR',
    pricedSecurities: '13.50003703703670370370367',
    knownCompanyValue: '0',
    unresolvedValue: '0',
    knownPercent: '0',
    nonCompanyValue: '13.50003703703670370370367',
  }])
})

it('normalizes retained crypto observations across SQLite reopen and replays a new checkpoint', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-crypto-'))
  const path = join(directory, 'portfolio.sqlite')
  try {
    let store = new SnapshotStore(path)
    store.save(snapshot())
    for (const item of cryptoSources()) store.saveSource(item)
    const firstRun = store.history.start('broker-sync')
    const first = store.history.capture(firstRun, 'valuation', randomUUID(), now)!
    expect(first.positions[0]).toMatchObject({ isin: btc, unitPrice: '45000.1234567890123456789', value: '13.50003703703670370370367' })
    store.close()

    store = new SnapshotStore(path)
    expect(store.latest()).toEqual(snapshot())
    expect(store.sources().find((item) => item.id === 'instrumentDetails')?.payload).toEqual([{
      isin: btc,
      response: {
        isin: btc,
        priceFactor: 1,
        typeId: 'crypto',
        legalTypeId: 'CRYPTO',
        listings: [{ slug: 'BHS', currencyId: 'EUR', active: true }],
      },
    }])
    expect(store.history.replay(first.checkpoint.id).detail).toEqual(first)

    const secondRun = store.history.start('broker-sync')
    const second = store.history.capture(secondRun, 'valuation', randomUUID(), now + 1)!
    expect(store.history.replay(second.checkpoint.id).detail).toEqual(second)
    store.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('leaves the legacy valuation policy unable to value crypto', () => {
  const result = overview(snapshot(), cryptoSources(), now, undefined, 'legacy')
  expect(result.rows[0].value).toBeNull()
  expect(result.rows[0].quality).toBe('Pricing convention not supported yet')
  expect(new Decimal(result.totals[0].securities)).toEqual(new Decimal(0))
})
