import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  decodeDecision,
  decodeManualEvidence,
  decodeScope,
  type Decision,
  type DecisionState,
  type InvestigationSnapshot,
  type ManualEvidence,
  type ManualEvidenceInput,
  type Scope,
} from '../contracts/investigations'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function assertEvidenceShape(value: ManualEvidenceInput): ManualEvidenceInput {
  const evidence = decodeManualEvidence({ ...value, id: randomUUID(), recordedAt: new Date(0).toISOString() })
  if (evidence.kind === 'note' && (evidence.price !== null || evidence.currency !== null || evidence.asOf !== null || evidence.unit !== null || evidence.quantity !== null || evidence.quantityObservedAt !== null || evidence.revokes !== null)) throw new Error('Note evidence cannot contain price, quantity or revocation fields')
  if (evidence.kind === 'price' && (evidence.price === null || evidence.currency === null || evidence.asOf === null || evidence.unit !== 'per-security' || evidence.revokes !== null)) throw new Error('Price evidence requires price, currency, asOf and per-security unit')
  if (evidence.kind === 'revoke' && (evidence.price !== null || evidence.currency !== null || evidence.asOf !== null || evidence.unit !== null || evidence.quantity !== null || evidence.quantityObservedAt !== null || evidence.revokes === null)) throw new Error('Revoke evidence has invalid fields')
  return evidence
}

const recordedAt = (now: number | string) => typeof now === 'number' ? new Date(now).toISOString() : now

export class InvestigationStore {
  constructor(private readonly db: DatabaseSync) {}

  static migrate(db: DatabaseSync) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS investigation_decisions(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        connection_id TEXT NOT NULL,
        account TEXT NOT NULL,
        isin TEXT NOT NULL,
        state TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reason TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS investigation_evidence(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        connection_id TEXT NOT NULL,
        account TEXT NOT NULL,
        isin TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        price TEXT,
        currency TEXT,
        as_of TEXT,
        source TEXT NOT NULL,
        reason TEXT NOT NULL,
        unit TEXT,
        quantity TEXT,
        quantity_observed_at TEXT,
        revokes TEXT
      );
      CREATE INDEX IF NOT EXISTS investigation_decisions_scope ON investigation_decisions(connection_id,account,isin,seq);
      CREATE INDEX IF NOT EXISTS investigation_evidence_scope ON investigation_evidence(connection_id,account,isin,seq);
      PRAGMA user_version=14; COMMIT;`)
  }

  snapshot(): InvestigationSnapshot {
    const decisions = this.db.prepare('SELECT id,connection_id,account,isin,state,recorded_at,reason FROM investigation_decisions ORDER BY seq').all().map(row => decodeDecision({
      id: String(row.id), scope: { connectionId: String(row.connection_id), account: String(row.account), isin: String(row.isin) }, state: String(row.state), recordedAt: String(row.recorded_at), reason: String(row.reason),
    }))
    const evidence = this.db.prepare('SELECT id,connection_id,account,isin,recorded_at,kind,price,currency,as_of,source,reason,unit,quantity,quantity_observed_at,revokes FROM investigation_evidence ORDER BY seq').all().map(row => decodeManualEvidence({
      id: String(row.id), scope: { connectionId: String(row.connection_id), account: String(row.account), isin: String(row.isin) }, recordedAt: String(row.recorded_at), kind: String(row.kind), price: row.price === null ? null : String(row.price), currency: row.currency === null ? null : String(row.currency), asOf: row.as_of === null ? null : String(row.as_of), source: String(row.source), reason: String(row.reason), unit: row.unit === null ? null : String(row.unit), quantity: row.quantity === null ? null : String(row.quantity), quantityObservedAt: row.quantity_observed_at === null ? null : String(row.quantity_observed_at), revokes: row.revokes === null ? null : String(row.revokes),
    }))
    return { decisions, evidence }
  }

  appendDecision(scope: Scope, state: DecisionState, reason: string, now: number | string): Decision {
    const parsedScope = decodeScope(scope)
    const decision = decodeDecision({ id: randomUUID(), scope: parsedScope, state, recordedAt: recordedAt(now), reason })
    this.db.prepare('INSERT INTO investigation_decisions(id,connection_id,account,isin,state,recorded_at,reason) VALUES (?,?,?,?,?,?,?)').run(decision.id, parsedScope.connectionId, parsedScope.account, parsedScope.isin, decision.state, decision.recordedAt, decision.reason)
    return decision
  }

  appendEvidence(value: ManualEvidenceInput, now: number | string): ManualEvidence {
    const parsed = assertEvidenceShape(value)
    const evidence = decodeManualEvidence({ ...parsed, id: randomUUID(), recordedAt: recordedAt(now) })
    if (evidence.revokes !== null && !uuid.test(evidence.revokes)) throw new Error('Invalid evidence identity')
    this.db.prepare('INSERT INTO investigation_evidence(id,connection_id,account,isin,recorded_at,kind,price,currency,as_of,source,reason,unit,quantity,quantity_observed_at,revokes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      evidence.id, evidence.scope.connectionId, evidence.scope.account, evidence.scope.isin, evidence.recordedAt, evidence.kind, evidence.price, evidence.currency, evidence.asOf, evidence.source, evidence.reason, evidence.unit, evidence.quantity, evidence.quantityObservedAt, evidence.revokes,
    )
    return evidence
  }
}
