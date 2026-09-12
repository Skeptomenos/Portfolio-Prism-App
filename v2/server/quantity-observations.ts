import { Decimal } from 'decimal.js'
import type { Snapshot } from './model'

export interface QuantityObservation {
  account: string
  isin: string
  quantity: string
  // This is an observation boundary, never an inferred trade or corporate-action time.
  observedAt: string | null
}

export const positionKey = (account: string, isin: string) => JSON.stringify([account, isin])

export function quantityObservations(history: readonly Snapshot[]): QuantityObservation[] {
  let previous = new Map<string, QuantityObservation>()
  let latestTime = -Infinity
  for (const snapshot of history) {
    const time = Date.parse(snapshot.fetchedAt)
    const ordered = Number.isFinite(time) && time >= latestTime
    const current = new Map<string, QuantityObservation>()
    for (const p of snapshot.positions) {
      const key = positionKey(p.account, p.isin)
      const old = previous.get(key)
      current.set(key, {
        account: p.account,
        isin: p.isin,
        quantity: p.quantity,
        observedAt: !ordered
          ? null
          : old?.observedAt && new Decimal(old.quantity).eq(p.quantity)
            ? old.observedAt
            : snapshot.fetchedAt,
      })
    }
    // An absent/sold position breaks continuity if it appears in a later import.
    previous = current
    if (Number.isFinite(time)) latestTime = Math.max(latestTime, time)
  }
  return [...previous.values()]
}
