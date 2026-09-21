import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { decodeInvestigationCommand, type Scope } from '../contracts/investigations'
import { InvestigationStore } from '../server/investigations'

const latestPriceEvidence = (snapshot: ReturnType<InvestigationStore['snapshot']>, selectedScope: Scope) => {
  const prices = snapshot.evidence.filter(evidence => evidence.scope.connectionId === selectedScope.connectionId && evidence.scope.account === selectedScope.account && evidence.scope.isin === selectedScope.isin && evidence.kind === 'price')
  const latest = prices.at(-1)
  if (!latest) return null
  const revoked = new Set(snapshot.evidence.filter(evidence => evidence.kind === 'revoke' && evidence.revokes).map(evidence => evidence.revokes!))
  return revoked.has(latest.id) ? null : latest
}

const scope: Scope = { connectionId: 'connection-1', account: 'account-1', isin: 'US0378331005' }
const now = '2026-09-21T10:00:00Z'

function makeRepository() {
  const db = new DatabaseSync(':memory:')
  InvestigationStore.migrate(db)
  return { db, store: new InvestigationStore(db) }
}

describe('investigation contracts and append-only repository', () => {
  it('decodes strict commands and rejects unknown properties and malformed values', () => {
    expect(decodeInvestigationCommand({ action: 'price', scope, price: '123.4500', currency: 'EUR', asOf: now, source: 'broker', reason: 'manual quote', unit: 'per-security' }).action).toBe('price')
    assert.throws(() => decodeInvestigationCommand({ action: 'note', scope, source: 'manual', reason: 'x', extra: true }))
    assert.throws(() => decodeInvestigationCommand({ action: 'price', scope, price: '0', currency: 'EUR', asOf: now, source: 'broker', reason: 'x', unit: 'per-security' }))
    assert.throws(() => decodeInvestigationCommand({ action: 'price', scope: { ...scope, isin: 'not-an-isin' }, price: '1', currency: 'eur', asOf: 'yesterday', source: 'broker', reason: 'x', unit: 'per-security' }))
  })

  it('persists all decision and evidence revisions across repository instances', () => {
    const { db, store } = makeRepository()
    const decision = store.appendDecision(scope, 'excluded', 'not held', now)
    const note = store.appendEvidence({ scope, kind: 'note', price: null, currency: null, asOf: null, source: 'user', reason: 'reviewed', unit: null, quantity: null, quantityObservedAt: null, revokes: null }, now)
    expect(store.snapshot().decisions).toEqual([decision])
    expect(store.snapshot().evidence).toEqual([note])
    expect(new InvestigationStore(db).snapshot().evidence).toHaveLength(1)
    expect(Number(db.prepare('PRAGMA user_version').get()?.user_version)).toBe(14)
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM investigation_evidence').get()?.n)).toBe(1)
  })

  it('does not fall back to a superseded price after the latest price is revoked', () => {
    const { store } = makeRepository()
    const first = store.appendEvidence({ scope, kind: 'price', price: '100', currency: 'EUR', asOf: now, source: 'broker', reason: 'first', unit: 'per-security', quantity: '2', quantityObservedAt: now, revokes: null }, now)
    store.appendEvidence({ scope, kind: 'price', price: '110', currency: 'EUR', asOf: now, source: 'broker', reason: 'replacement', unit: 'per-security', quantity: '2', quantityObservedAt: now, revokes: null }, '2026-09-21T11:00:00Z')
    expect(latestPriceEvidence(store.snapshot(), scope)?.price).toBe('110')
    store.appendEvidence({ scope, kind: 'revoke', price: null, currency: null, asOf: null, source: 'manual', reason: 'retracted', unit: null, quantity: null, quantityObservedAt: null, revokes: first.id }, '2026-09-21T12:00:00Z')
    expect(latestPriceEvidence(store.snapshot(), scope)?.price).toBe('110')
    const latest = store.snapshot().evidence.find(evidence => evidence.kind === 'price' && evidence.price === '110')!
    store.appendEvidence({ scope, kind: 'revoke', price: null, currency: null, asOf: null, source: 'manual', reason: 'latest retracted', unit: null, quantity: null, quantityObservedAt: null, revokes: latest.id }, '2026-09-21T13:00:00Z')
    expect(latestPriceEvidence(store.snapshot(), scope)).toBeNull()
  })
})
