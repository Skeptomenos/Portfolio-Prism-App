import type { DataSource } from './explorer'
import type { Snapshot } from './model'
import { quantityObservations, type QuantityObservation } from './quantity-observations'
import { tradeRepublicObservation } from './trade-republic-observation'
import { valueObservations, currentValuationPolicy, type ValuationPolicy } from './valuation'
export type { ValuedPosition } from './valuation'

/** Compatibility entry point for retained Trade Republic explorer records. */
export function overview(snapshot: Snapshot | null, sources: DataSource[], now = Date.now(),
  observations: readonly QuantityObservation[] = quantityObservations(snapshot ? [snapshot] : []), policy: ValuationPolicy = currentValuationPolicy) {
  return valueObservations(snapshot, sources.flatMap(s => { const o = tradeRepublicObservation(s); return o ? [o] : [] }), now, observations, policy)
}
