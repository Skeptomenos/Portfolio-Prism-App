import { decodeSnapshot, type Snapshot } from './model'
import { BrokerFailure } from './broker-contract'
export interface HoldingsObservation { snapshot: Snapshot; completeness: 'complete' | 'partial' | 'authoritative-empty'; accounts: readonly string[] }
/** A partial response is evidence of a gap, never evidence that an account sold. */
export function admitHoldings(value: HoldingsObservation): Snapshot {
  const snapshot = decodeSnapshot(value.snapshot)
  if (value.completeness === 'partial' || !['complete','authoritative-empty'].includes(value.completeness) || !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
      !value.accounts.length || new Set(value.accounts).size !== value.accounts.length || value.accounts.some(a => !a || a.length > 256) ||
      snapshot.positions.some(p => !value.accounts.includes(p.account)) ||
      (value.completeness === 'authoritative-empty') !== (snapshot.positions.length === 0)) throw new BrokerFailure({ category: 'validation' })
  return snapshot
}
