import type { FinancialObservation as RetainedFinancialObservation } from './history-observation'
import type { LedgerEvent, EventCoverage, EventCashBalance } from '../contracts/events'
import type { DataSource, Json } from './explorer'

/** The provider alone interprets its opaque continuation and wire evidence. */
export interface BrokerEventBatch {
  contractVersion: 'broker-events/1'
  observedAt: string
  events: readonly { event: LedgerEvent; evidence: Json }[]
  cashBalances?: readonly EventCashBalance[]
  coverage: EventCoverage
  state: Json
}
export interface BrokerEvents {
  readEvents(previous: Json | null, save: (batch: BrokerEventBatch) => void, signal: AbortSignal, mode: 'recent' | 'backfill'): Promise<void>
  /** Pure interpretation of retained adapter state; must not acquire or authenticate. */
  normalizeRetainedEvents?(state: Json): BrokerEventBatch | null
  // Offline bridge for evidence already retained by the legacy explorer.
  eventsFromSources?(sources: readonly DataSource[], retainedCash?: readonly RetainedFinancialObservation[]): BrokerEventBatch | null
}
