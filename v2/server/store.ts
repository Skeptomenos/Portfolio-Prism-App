import { quantityObservations } from './quantity-observations'
import { catalog, type DataSource } from './explorer'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Diagnostic } from './diagnostics'
import { decodeSnapshot, type Snapshot, type OperationOutcome } from './model'
import { parseComposition, type CompositionAttempt } from './composition'

export class SnapshotStore {
  private readonly db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version === 0) {
      this.db.exec(
        'BEGIN; CREATE TABLE snapshots (id INTEGER PRIMARY KEY, fetched_at TEXT NOT NULL, payload TEXT NOT NULL); PRAGMA user_version=1; COMMIT;'
      )
    } else if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5)
      throw new Error('Unsupported V2 database version')
    if (version === 0 || version === 1)
      this.db.exec(
        'BEGIN; CREATE TABLE settings (key TEXT PRIMARY KEY, value INTEGER NOT NULL); PRAGMA user_version=2; COMMIT;'
      )
    if (version === 0 || version === 1 || version === 2)
      this.db.exec(
        'BEGIN; CREATE TABLE diagnostics (id INTEGER PRIMARY KEY, payload TEXT NOT NULL); PRAGMA user_version=3; COMMIT;'
      )
    if (typeof version === 'number' && version < 4)
      this.db.exec(
        'BEGIN; CREATE TABLE data_sources (id TEXT PRIMARY KEY, payload TEXT NOT NULL); PRAGMA user_version=4; COMMIT;'
      )
    if (typeof version === 'number' && version < 5)
      this.db.exec(
        'BEGIN; CREATE TABLE compositions (fund_isin TEXT PRIMARY KEY, raw TEXT NOT NULL, retrieved_at TEXT NOT NULL); CREATE TABLE composition_attempts (fund_isin TEXT PRIMARY KEY, payload TEXT NOT NULL); PRAGMA user_version=5; COMMIT;'
      )
  }
  composition() {
    const row = this.db
      .prepare('SELECT raw,retrieved_at FROM compositions WHERE fund_isin=?')
      .get('IE0031442068')
    return row ? parseComposition(String(row.raw), String(row.retrieved_at)) : null
  }
  compositionEvidence() {
    const row = this.db
      .prepare('SELECT raw,retrieved_at FROM compositions WHERE fund_isin=?')
      .get('IE0031442068')
    return row ? { raw: String(row.raw), retrievedAt: String(row.retrieved_at) } : null
  }
  compositionAttempt(): CompositionAttempt | null {
    const row = this.db
      .prepare('SELECT payload FROM composition_attempts WHERE fund_isin=?')
      .get('IE0031442068')
    return row ? JSON.parse(String(row.payload)) : null
  }
  saveCompositionAttempt(attempt: CompositionAttempt) {
    this.db
      .prepare(
        'INSERT INTO composition_attempts VALUES (?,?) ON CONFLICT(fund_isin) DO UPDATE SET payload=excluded.payload'
      )
      .run('IE0031442068', JSON.stringify(attempt))
  }
  saveComposition(raw: string, retrievedAt: string, attempt: CompositionAttempt) {
    const parsed = parseComposition(raw, retrievedAt)
    const previous = this.composition()
    if (previous?.asOf && (!parsed.asOf || parsed.asOf < previous.asOf))
      throw new Error('Composition date regressed')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          'INSERT INTO compositions VALUES (?,?,?) ON CONFLICT(fund_isin) DO UPDATE SET raw=excluded.raw,retrieved_at=excluded.retrieved_at'
        )
        .run(parsed.fundIsin, raw, retrievedAt)
      this.saveCompositionAttempt(attempt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  sources(): DataSource[] {
    const saved = new Map(
      this.db
        .prepare('SELECT id,payload FROM data_sources')
        .all()
        .map((row) => [String(row.id), JSON.parse(String(row.payload)) as DataSource])
    )
    return catalog.map((def) => saved.get(def.id) ?? def)
  }
  saveSource(source: DataSource): void {
    this.db
      .prepare(
        'INSERT INTO data_sources(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload'
      )
      .run(source.id, JSON.stringify(source))
  }
  recordDiagnostic(event: Diagnostic): void {
    const safe: Diagnostic = {
      ...(event.outcome
        ? {
            outcome: {
              holdings: event.outcome.holdings
                ? {
                    snapshotId: event.outcome.holdings.snapshotId,
                    fetchedAt: event.outcome.holdings.fetchedAt,
                  }
                : null,
              valuation: event.outcome.valuation,
              sources: event.outcome.sources
                .filter((s) => catalog.some((d) => d.id === s.id))
                .map((s) => ({ id: s.id, status: s.status })),
            },
          }
        : {}),
      ...(event.sourceId && catalog.some((s) => s.id === event.sourceId)
        ? { sourceId: event.sourceId }
        : {}),
      attemptId: event.attemptId,
      operation: event.operation,
      stage: event.stage,
      event: event.event,
      at: event.at,
      durationMs: event.durationMs,
      category: event.category,
      ...(event.httpStatus !== undefined ? { httpStatus: event.httpStatus } : {}),
      ...(event.networkCode ? { networkCode: event.networkCode } : {}),
    }
    this.db.prepare('INSERT INTO diagnostics(payload) VALUES (?)').run(JSON.stringify(safe))
    this.db.exec(
      'DELETE FROM diagnostics WHERE id NOT IN (SELECT id FROM diagnostics ORDER BY id DESC LIMIT 1000)'
    )
  }
  diagnostics(): Diagnostic[] {
    return this.db
      .prepare('SELECT payload FROM diagnostics ORDER BY id DESC LIMIT 100')
      .all()
      .map((row) => JSON.parse(String(row.payload)))
  }
  latestOutcome(): OperationOutcome | null {
    const row = this.db
      .prepare(
        "SELECT payload FROM diagnostics WHERE json_type(payload,'$.outcome')='object' ORDER BY id DESC LIMIT 1"
      )
      .get()
    return row ? ((JSON.parse(String(row.payload)) as Diagnostic).outcome ?? null) : null
  }
  autoRestoreEnabled(): boolean {
    return this.db.prepare("SELECT value FROM settings WHERE key='auto_restore'").get()?.value !== 0
  }
  setAutoRestore(enabled: boolean): void {
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES ('auto_restore',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      )
      .run(enabled ? 1 : 0)
  }
  latest(): Snapshot | null {
    const row = this.db.prepare('SELECT payload FROM snapshots ORDER BY id DESC LIMIT 1').get()
    return row ? decodeSnapshot(JSON.parse(String(row.payload))) : null
  }
  quantityObservations() {
    const history = this.db
      .prepare('SELECT payload FROM snapshots ORDER BY id')
      .all()
      .map((row) => decodeSnapshot(JSON.parse(String(row.payload))))
    return quantityObservations(history)
  }
  save(value: Snapshot): number {
    const snapshot = decodeSnapshot(value)
    const keys = snapshot.positions.map((p) => `${p.account}:${p.isin}`)
    if (new Set(keys).size !== keys.length)
      throw new Error('Duplicate positions in broker snapshot')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const saved = this.db
        .prepare('INSERT INTO snapshots(fetched_at,payload) VALUES (?,?)')
        .run(snapshot.fetchedAt, JSON.stringify(snapshot))
      this.db.exec('COMMIT')
      return Number(saved.lastInsertRowid)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  close(): void {
    this.db.close()
  }
}
