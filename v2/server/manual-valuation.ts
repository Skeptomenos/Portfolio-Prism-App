import { Decimal } from 'decimal.js'
import type { ManualEvidence, Scope } from '../contracts/investigations'
import type { FinancialObservation } from './financial-observation'
import type { Snapshot, Position } from './model'
import type { QuantityObservation } from './quantity-observations'
import type { ValuedPosition } from './valuation'
const D = Decimal.clone({ precision: 256 })
export const sameScope = (a: Scope, b: Scope) => a.connectionId === b.connectionId && a.account === b.account && a.isin === b.isin
export function latestManual(evidence: readonly ManualEvidence[], scope: Scope) {
  const prices = evidence.filter(e => sameScope(e.scope, scope) && e.kind === 'price')
  const price = prices.at(-1)
  return price && !evidence.some(e => e.kind === 'revoke' && e.revokes === price.id && sameScope(e.scope, scope)) ? price : null
}
export function manualCompatibility(position: Position, sources: readonly FinancialObservation[], currency: string) {
  const instrument = sources.find(s => s.sourceId === 'instrumentDetails')?.instruments.find(i => i.isin === position.isin)
  if (instrument?.confirmedIsin !== position.isin) return 'Instrument identity is not confirmed'
  if (!['stock', 'fund', 'etf'].includes(position.instrumentType.toLowerCase()) || instrument.unit !== 'per-security') return 'Manual prices require a confirmed per-security stock or fund unit'
  if (!/^[A-Z]{3}$/.test(currency) || !instrument.listings.some(l => l.currency === currency)) return 'Currency is not corroborated by retained listing metadata'
  return null
}
export function manualIneligibility(e: ManualEvidence, p: Position, sources: readonly FinancialObservation[], basis: QuantityObservation | undefined, snapshot: Snapshot, now: number) {
  if (e.kind !== 'price' || e.unit !== 'per-security' || !e.price || !e.currency || !e.asOf) return 'Manual price fields are incomplete'
  const incompatible = manualCompatibility(p, sources, e.currency)
  if (incompatible) return incompatible
  if (!new D(p.quantity).gt(0)) return 'Only positive held quantities support manual prices'
  const boundary = Date.parse(basis?.observedAt ?? '')
  const at = Date.parse(e.asOf)
  if (!basis || !e.quantity || !new D(e.quantity).eq(p.quantity) || e.quantityObservedAt !== basis.observedAt || !Number.isFinite(boundary) || boundary > Date.parse(snapshot.fetchedAt) || boundary > now) return 'Quantity continuity changed or is unverified; provide new dated evidence'
  if (!Number.isFinite(at) || at < boundary || at > now) return 'Manual price date must be at or after the quantity observation and not in the future'
  try { const price = new D(e.price); if (!/^\d+(\.\d+)?$/.test(e.price) || e.price.length > 128 || !price.isFinite() || !price.gt(0) || Math.abs(price.e) > 100) return 'Manual price must be a positive bounded decimal' } catch { return 'Manual price is invalid' }
  return null
}
export function applyManual(row: ValuedPosition, evidence: ManualEvidence | null, snapshot: Snapshot, sources: readonly FinancialObservation[], basis: QuantityObservation | undefined, now: number): ValuedPosition {
  if (row.value !== null || !evidence || manualIneligibility(evidence, row, sources, basis, snapshot, now)) return row
  return { ...row, currency: evidence.currency, price: evidence.price, value: new D(row.quantity).mul(evidence.price!).toFixed(),
    quoteAt: evidence.asOf, venue: null, valuationStatus: 'priced',
    quality: `Manual price fallback · ${now - Date.parse(evidence.asOf!) > 86400000 ? 'older than 24h · ' : ''}${evidence.source} · ${evidence.reason}`,
    manualEvidence: { id: evidence.id, source: evidence.source, reason: evidence.reason, recordedAt: evidence.recordedAt, asOf: evidence.asOf! } }
}
