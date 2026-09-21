import type { ManualEvidence } from '../contracts/investigations'
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { decodeSnapshot, type Snapshot } from './model'
import { decodeFinancialObservation, type FinancialObservation } from './financial-observation'
import { quantityObservations } from './quantity-observations'
import { valueObservations, currentValuationPolicy, type ValuationPolicy } from './valuation'
import { Decimal } from 'decimal.js'

export interface ConnectionRecord { id: string; providerId: string; providerVersion: string; enabled: boolean; restore: boolean }
export interface ConnectionInputs { connection: ConnectionRecord; snapshot: Snapshot | null; holdingsHistory: readonly Snapshot[]; observations: readonly FinancialObservation[]; quantities: ReturnType<typeof quantityObservations> }
const D = Decimal.clone({ precision: 256 })
export class ConnectionStore {
  constructor(private readonly db: DatabaseSync, readonly defaultId: string) {}
  static migrate(db: DatabaseSync) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS broker_connections(id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, provider_version TEXT NOT NULL, enabled INTEGER NOT NULL, restore INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS broker_snapshots(seq INTEGER PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES broker_connections(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS broker_observations(seq INTEGER PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES broker_connections(id), source_id TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS broker_snapshots_connection ON broker_snapshots(connection_id,seq);
      CREATE INDEX IF NOT EXISTS broker_observations_connection ON broker_observations(connection_id,source_id,seq);
      PRAGMA user_version=12; COMMIT;`)
  }
  list(): ConnectionRecord[] {
    return this.db.prepare('SELECT * FROM broker_connections ORDER BY rowid').all().map(r => ({ id: String(r.id), providerId: String(r.provider_id), providerVersion: String(r.provider_version), enabled: r.enabled === 1, restore: r.restore === 1 }))
  }
  get(id: string) { return this.list().find(c => c.id === id) ?? null }
  add(providerId: string, providerVersion: string, id: string = randomUUID()) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('Invalid connection identity')
    this.db.prepare('INSERT INTO broker_connections VALUES (?,?,?,1,0)').run(id, providerId, providerVersion)
    return this.get(id)!
  }
  configure(id: string, enabled: boolean, restore: boolean) {
    if (!this.get(id)) throw Error('Unknown connection')
    this.db.prepare('UPDATE broker_connections SET enabled=?,restore=? WHERE id=?').run(Number(enabled), Number(restore), id)
  }
  saveSnapshot(id: string, value: unknown) {
    if (!this.get(id)) throw Error('Unknown connection')
    const snapshot = decodeSnapshot(value)
    if (!Number.isFinite(Date.parse(snapshot.fetchedAt)) || snapshot.positions.some(p => !p.account || p.account.length > 256) || new Set(snapshot.positions.map(p => JSON.stringify([p.account,p.isin]))).size !== snapshot.positions.length) throw Error('Invalid connection holdings')
    return Number(this.db.prepare('INSERT INTO broker_snapshots(connection_id,payload) VALUES (?,?)').run(id, JSON.stringify(snapshot)).lastInsertRowid)
  }
  saveObservation(id: string, value: unknown) {
    if (!this.get(id)) throw Error('Unknown connection')
    const observation = decodeFinancialObservation(value)
    if ([observation.observedAt, observation.checkedAt].some(d => d !== null && !Number.isFinite(Date.parse(d)))) throw Error('Invalid observation date')
    if (new Set(observation.quotes.map(q => q.isin)).size !== observation.quotes.length || new Set(observation.instruments.map(i => i.isin)).size !== observation.instruments.length) throw Error('Ambiguous observation')
    this.db.prepare('INSERT INTO broker_observations(connection_id,source_id,payload) VALUES (?,?,?)').run(id, observation.sourceId, JSON.stringify(observation))
  }
  inputs(connection: ConnectionRecord): ConnectionInputs {
    const snapshots = this.db.prepare('SELECT payload FROM broker_snapshots WHERE connection_id=? ORDER BY seq').all(connection.id).map(r => decodeSnapshot(JSON.parse(String(r.payload))))
    const observations = this.db.prepare('SELECT payload FROM broker_observations WHERE seq IN (SELECT max(seq) FROM broker_observations WHERE connection_id=? GROUP BY source_id) ORDER BY seq').all(connection.id).map(r => decodeFinancialObservation(JSON.parse(String(r.payload))))
    return { connection, snapshot: snapshots.at(-1) ?? null, holdingsHistory: snapshots, observations, quantities: quantityObservations(snapshots) }
  }
}
export function accountScope(connectionId: string, account: string, defaultId: string) {
  return connectionId === defaultId ? account : `${connectionId}:${account}`
}
/** Each provider values only its own quantities. Cross-connection merging happens
 * after eligibility; an ISIN match never lends another account a quote or cash. */
export function valueConnections(inputs: readonly ConnectionInputs[], defaultId: string, now = Date.now(), policy: ValuationPolicy = currentValuationPolicy, manualEvidence?: readonly ManualEvidence[]) {
  const values = inputs.map(input => {
    const result = valueObservations(input.snapshot, input.observations, now, input.quantities, policy, manualEvidence ? { connectionId: input.connection.id, evidence: manualEvidence } : undefined)
    return { ...result, rows: result.rows.map(row => ({ ...row, account: accountScope(input.connection.id, row.account, defaultId) })) }
  })
  if (values.length === 1) return values[0]
  const rows = values.flatMap(v => v.rows)
  const totals = [...new Set(values.flatMap(v => v.totals.map(t => t.currency)))].map(currency => {
    const scoped = values.flatMap(v => v.totals.filter(t => t.currency === currency))
    const securities = scoped.reduce((sum,t) => sum.add(t.securities), new D(0))
    const priced = rows.filter(r => r.currency === currency && r.valuationStatus === 'priced')
    for (const row of priced) row.weight = securities.gt(0) ? new D(row.value!).div(securities).mul(100).toFixed(4) : null
    // Missing currency/account cash cannot silently become zero. An explicit zero
    // observation is required from every connection represented in this currency.
    return { currency, securities: securities.toFixed(), cash: scoped.every(t => t.cash !== null) ? scoped.reduce((sum,t) => sum.add(t.cash!), new D(0)).toFixed() : null,
      pricedCount: priced.length, cashAt: scoped.every(t => t.cashAt) ? scoped.map(t => t.cashAt!).sort()[0] : null,
      cashStale: scoped.some(t => t.cashStale), olderQuotes: scoped.reduce((sum,t) => sum+t.olderQuotes,0) }
  })
  return { rows, totals, pricedCount: rows.filter(r => r.valuationStatus === 'priced').length, zeroCount: rows.filter(r => r.valuationStatus === 'zero').length,
    missingCount: rows.filter(r => r.value === null).length, holdingsAt: values.map(v => v.holdingsAt).filter((v):v is string => !!v).sort().at(-1) ?? null,
    quoteRetrievedAt: values.map(v => v.quoteRetrievedAt).filter((v):v is string => !!v).sort().at(-1) ?? null }
}
