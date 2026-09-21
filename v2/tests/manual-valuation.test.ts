import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Decimal } from 'decimal.js'
import { describe, expect, it, vi } from 'vitest'
import { catalog, type DataSource } from '../server/explorer'
import { SnapshotStore } from '../server/store'
import type { Snapshot } from '../server/model'

const isin = 'US0378331005'
const observedAt = '2026-09-20T10:00:00Z'
const now = Date.parse('2026-09-21T12:00:00Z')

const snapshot = (quantity = '3', account = 'a'): Snapshot => ({
  fetchedAt: observedAt,
  positions: [{ account, isin, quantity, name: 'Synthetic', instrumentType: 'stock', averageBuyIn: '1' }],
})
const source = (id: string, payload: DataSource['payload']): DataSource => ({ ...catalog.find(item => item.id === id)!, status: 'success', fetchedAt: observedAt, payload })
const instrumentSource = (currency = 'EUR', unit = 1) => source('instrumentDetails', [{ isin, response: { isin, priceFactor: unit, listings: [{ slug: 'LSX', active: true, currencyId: currency }] } }])
const quoteSource = (price = '100') => source('quotes', [{ isin, venue: 'LSX', quote: { bid: { price, time: Date.parse(observedAt) + 1000 } } }])
const makeStore = (quantity = '3', account = 'a') => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-manual-'))
  const path = join(dir, 'portfolio.sqlite')
  const store = new SnapshotStore(path)
  store.save(snapshot(quantity, account))
  store.saveSource(instrumentSource())
  return { store, dir }
}
const scopeFor = (store: SnapshotStore, account = 'a') => ({ connectionId: store.connections.defaultId, account, isin })
const priceCommand = (scope: ReturnType<typeof scopeFor>, overrides: Record<string, unknown> = {}) => ({ action: 'price', scope, price: '7.123456789012345678901234567890', currency: 'EUR', asOf: '2026-09-21T11:00:00Z', source: 'synthetic source', reason: 'manual check', unit: 'per-security', ...overrides })

describe('manual valuation through SnapshotStore investigation commands', () => {
  it('uses exact decimal arithmetic and exposes manual provenance', () => {
    const { store, dir } = makeStore('3')
    try {
      const result = store.investigationCommand(priceCommand(scopeFor(store)), now)
      const item = result.items.find(row => row.scope.account === 'a')!
      expect(item.value).toBe('21.37037036703703703670370370367')
      expect(item.value).toBe(store.overview(now).rows[0].value)
      expect(item.value).toBe(store.history.checkpoint(result.checkpointId!)!.positions[0].value)
      expect(item.value).toBe(store.history.replay(result.checkpointId!).valuations.rows[0].value)
      expect(item.currency).toBe('EUR')
      expect(item.manualEvidence).toMatchObject({ source: 'synthetic source', reason: 'manual check', asOf: '2026-09-21T11:00:00Z' })
      expect(item.manualStatus).toContain('Manual price fallback selected')
    } finally { store.close(); rmSync(dir, { recursive: true }) }
  })

  it('keeps broker valuation ahead of manual evidence and notes do not alter finance', () => {
    const { store, dir } = makeStore()
    try {
      store.saveSource(quoteSource('100'))
      const before = store.overview(now)
      store.investigationCommand({ action: 'note', scope: scopeFor(store), source: 'review', reason: 'checked manually' }, now)
      expect(store.overview(now)).toEqual(before)
      const result = store.investigationCommand(priceCommand(scopeFor(store), { price: '999' }), now)
      const item = result.items.find(row => row.scope.account === 'a')!
      expect(item.brokerValue).toBe('300')
      expect(item.value).toBe('300')
      expect(item.manualStatus).toContain('Inactive: eligible broker value')
    } finally { store.close(); rmSync(dir, { recursive: true }) }
  })

  it('rejects invalid currency, unit, future date, changed quantity and cross-account scope', () => {
    const { store, dir } = makeStore()
    try {
      for (const command of [
        priceCommand(scopeFor(store), { currency: 'USD' }),
        priceCommand(scopeFor(store), { unit: 'share' }),
        priceCommand(scopeFor(store), { asOf: '2026-09-22T00:00:00Z' }),
        priceCommand(scopeFor(store, 'other')),
      ]) assert.throws(() => store.investigationCommand(command, now))
      store.investigationCommand(priceCommand(scopeFor(store)), now)
      store.save(snapshot('4'))
      expect(store.investigationReport(now).items[0].manualStatus).toContain('Quantity continuity changed')
      expect(store.investigations.snapshot().evidence).toHaveLength(1)
    } finally { store.close(); rmSync(dir, { recursive: true }) }
  })

  it('tracks reversible exclusion, reopening, revisions and revocation across reopen', () => {
    const { store, dir } = makeStore()
    const path = join(dir, 'portfolio.sqlite')
    try {
      const currentScope = scopeFor(store)
      store.investigationCommand({ action: 'decide', scope: currentScope, state: 'excluded' }, now)
      expect(store.investigationReport(now).counts.excluded).toBe(1)
      store.investigationCommand({ action: 'decide', scope: currentScope, state: 'open', reason: 'reconsidered' }, now + 1)
      const first = store.investigationCommand(priceCommand(currentScope, { price: '10' }), now + 2)
      const firstId = first.items[0].manualEvidence!.id
      store.investigationCommand(priceCommand(currentScope, { price: '11' }), now + 3)
      const revisions = store.investigations.snapshot().evidence.filter(evidence => evidence.kind === 'price')
      expect(revisions.map(evidence => evidence.price)).toEqual(['10', '11'])
      expect(revisions[0].id).toBe(firstId)
      const latestId = revisions[1].id
      store.investigationCommand({ action: 'revoke', scope: currentScope, evidenceId: latestId, reason: 'bad quote' }, now + 4)
      expect(store.investigationReport(now + 4).items[0].manualStatus).toContain('revoked')
      store.close()
      const reopened = new SnapshotStore(path)
      try {
        expect(reopened.investigations.snapshot().evidence).toHaveLength(3)
        expect(reopened.investigationReport(now + 4).items[0].manualStatus).toContain('revoked')
      } finally { reopened.close() }
    } finally { try { store.close() } catch {} rmSync(dir, { recursive: true }) }
  })

  it('rolls back evidence and checkpoint creation when history capture fails', () => {
    const { store, dir } = makeStore()
    try {
      vi.spyOn(store.history, 'capture').mockImplementation(() => { throw new Error('synthetic checkpoint failure') })
      assert.throws(() => store.investigationCommand(priceCommand(scopeFor(store)), now), /synthetic checkpoint failure/)
      expect(store.investigations.snapshot()).toEqual({ decisions: [], evidence: [] })
      expect(store.history.runs().items).toHaveLength(0)
    } finally { store.close(); rmSync(dir, { recursive: true }) }
  })
})
