import { expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TradeRepublicBroker } from '../server/broker'
import { extractData } from '../server/explorer'
import { SnapshotStore } from '../server/store'
import type { FinancialObservation } from '../server/financial-observation'
import { valueObservations } from '../server/valuation'

const observedAt = '2026-09-21T10:00:00.000Z'
const priorCash = (amount: string | null): FinancialObservation => ({
  sourceId: 'cash', observedAt, checkedAt: observedAt, completeness: 'success',
  quotes: [], instruments: [], cash: [{ accountId: 'synthetic-account', currency: 'EUR', amount }],
})
function adapter(readCash: () => unknown) {
  const broker = new TradeRepublicBroker({ getPassword: () => null, setPassword() {}, deleteCredential: () => true }, async () => { throw Error('Network forbidden') })
  // Exercise the actual explorer's failed-source retention, with no SDK/network.
  broker.readData = (previous, save, signal, mode) => extractData({ read: async id => {
    if (id === 'cash') return readCash()
    throw Error('Synthetic source unavailable')
  } }, previous, save, signal, mode, () => {})
  return broker
}
it('retains exact normalized cash through failed TR extraction, persistence and restart', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'prism-cash-retention-')), 'portfolio.sqlite')
  let store = new SnapshotStore(path)
  const connection = store.connections.add('trade-republic', '1.0.0')
  const prior = priorCash('12345678901234567890.123456789')
  store.connections.saveObservation(connection.id, prior)
  const broker = adapter(() => { throw Error('Synthetic cash unavailable') })
  for (let attempt = 0; attempt < 2; attempt++) {
    await broker.readObservations(store.connections.inputs(connection).observations,
      value => store.connections.saveObservation(connection.id, value), new AbortController().signal)
    store.close(); store = new SnapshotStore(path)
    const cash = store.connections.inputs(connection).observations.find(o => o.sourceId === 'cash')!
    expect(cash).toMatchObject({ observedAt, completeness: 'failed', cash: prior.cash })
    expect(cash.checkedAt).not.toBe(observedAt)
    expect(valueObservations(null, [cash]).totals[0]).toMatchObject({ cash: prior.cash[0].amount, cashAt: observedAt, cashStale: true })
  }
  store.close(); broker.close()
})
it.each([0, 87.65])('replaces retained cash on fresh success, including explicit zero (%s)', async amount => {
  const broker = adapter(() => [{ accountNumber: 'synthetic-account', currencyId: 'EUR', amount }])
  const values: FinancialObservation[] = []
  await broker.readObservations([priorCash('123.45')], value => values.push(value), new AbortController().signal)
  const cash = values.find(o => o.sourceId === 'cash')!
  expect(cash.completeness).toBe('success')
  expect(cash.cash[0].amount).toBe(String(amount))
  expect(cash.observedAt).not.toBe(observedAt)
  broker.close()
})
it('keeps missing cash unknown on failure instead of manufacturing a balance', async () => {
  const broker = adapter(() => { throw Error('Synthetic cash unavailable') })
  for (const previous of [[], [priorCash(null)]]) {
    const values: FinancialObservation[] = []
    await broker.readObservations(previous, value => values.push(value), new AbortController().signal)
    const cash = values.find(o => o.sourceId === 'cash')!
    expect(cash.completeness).toBe('failed')
    expect(cash.cash.every(row => row.amount === null)).toBe(true)
    expect(valueObservations(null, [cash]).totals.every(total => total.cash === null)).toBe(true)
  }
  broker.close()
})
