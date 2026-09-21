import { ConnectionStore, valueConnections, type ConnectionInputs, accountScope } from './connection-store'
import { tradeRepublicObservation } from './trade-republic-observation'
import { PortfolioHistory } from './history'
import { ProviderError, type ProviderEvidence, type ProviderAttempt } from './composition-provider'
import { inspectionFingerprint, type InspectionEvidence, type InspectionObservation } from './composition-inspection'
import { bundledPluginRegistry, type PluginRegistry } from './plugin-registry'
import { randomUUID } from 'node:crypto'
import { issuerComposition } from './issuer-composition'
import type { IssuerBundle } from './issuer-evidence'
import { iusaComposition } from './iusa-composition'
import type { IusaEvidenceBundle } from './iusa-evidence'
import { quantityObservations } from './quantity-observations'
import { catalog, type DataSource } from './explorer'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { safeDiagnostic, type Diagnostic } from './diagnostics'
import { decodeSnapshot, type Snapshot, type OperationOutcome } from './model'
import { parseComposition, type Composition, type CompositionAttempt } from './composition'

/** A full admitted source outranks the partial recovery input on the same date. */
function promotesPartialRecovery(previous: Composition | undefined, source: Composition): boolean {
  return previous?.scope === 'top-ten' && source.scope === 'full-holdings' &&
    previous.asOf === source.asOf
}

export class SnapshotStore {
  issuerWarning: string | null = null
  inspectionWarnings: Record<string, string> = {}
  readonly connections: ConnectionStore
  readonly history: PortfolioHistory
  private readonly db: DatabaseSync
  constructor(path: string, readonly registry: PluginRegistry = bundledPluginRegistry) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    // VACUUM INTO includes committed WAL pages. Recovery uses this untouched copy.
    if (typeof version === 'number' && version > 0 && version < 12 && path !== ':memory:') {
      const backup = `${path}.pre-history-${randomUUID()}.sqlite`
      this.db.prepare('VACUUM INTO ?').run(backup)
      chmodSync(backup, 0o600)
    }
    if (version === 0) {
      this.db.exec(
        'BEGIN; CREATE TABLE snapshots (id INTEGER PRIMARY KEY, fetched_at TEXT NOT NULL, payload TEXT NOT NULL); PRAGMA user_version=1; COMMIT;'
      )
    } else if (
      version !== 1 &&
      version !== 2 &&
      version !== 3 &&
      version !== 4 &&
      version !== 5 &&
      version !== 6 &&
      version !== 7 &&
      version !== 8 &&
      version !== 9 &&
      version !== 10 &&
      version !== 11 &&
      version !== 12
    )
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
    if (typeof version === 'number' && version < 7)
      this.db.exec('BEGIN; CREATE TABLE iusa_allocations (sha256 TEXT PRIMARY KEY, as_of TEXT NOT NULL, bundle TEXT NOT NULL, imported_at TEXT NOT NULL); PRAGMA user_version=7; COMMIT;')

    if (typeof version === 'number' && version < 8)
      this.db.exec('BEGIN; CREATE TABLE issuer_allocations (fund_isin TEXT NOT NULL, sha256 TEXT NOT NULL, as_of TEXT NOT NULL, bundle TEXT NOT NULL, imported_at TEXT NOT NULL, PRIMARY KEY(fund_isin,sha256)); CREATE TABLE issuer_attempts (fund_isin TEXT PRIMARY KEY, payload TEXT NOT NULL); PRAGMA user_version=8; COMMIT;')

    if (typeof version === 'number' && version < 9)
      this.db.exec('BEGIN; CREATE TABLE provider_compositions (fund_isin TEXT NOT NULL, sha256 TEXT NOT NULL, as_of TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(fund_isin,sha256,as_of)); CREATE TABLE provider_attempts (fund_isin TEXT PRIMARY KEY, payload TEXT NOT NULL); PRAGMA user_version=9; COMMIT;')
    if (typeof version === 'number' && version < 10)
      this.db.exec('BEGIN; CREATE TABLE IF NOT EXISTS provider_inspections (fund_isin TEXT NOT NULL, sha256 TEXT NOT NULL, as_of TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(fund_isin,sha256,as_of)); PRAGMA user_version=10; COMMIT;')
    if (typeof version === 'number' && version < 11) PortfolioHistory.migrate(this.db)
    if (typeof version === 'number' && version < 12) ConnectionStore.migrate(this.db)
    this.history = new PortfolioHistory(this.db, this)
    this.connections = new ConnectionStore(this.db, this.history.connectionId)
    if (!this.connections.get(this.history.connectionId)) {
      this.connections.add('trade-republic', '1.0.0', this.history.connectionId)
      this.connections.configure(this.history.connectionId,true,this.autoRestoreEnabled())
    }
    if (this.db.prepare("SELECT value FROM history_meta WHERE key='baseline-pending'").get()?.value === '1') {
      for (const row of this.db.prepare('SELECT payload FROM snapshots ORDER BY id').all()) this.history.retainSnapshot(decodeSnapshot(JSON.parse(String(row.payload))))
      if (this.latest()) {
        const run = this.history.start('migration')
        this.history.capture(run, 'migration')
        this.history.finish(run, 'partial')
      }
      this.db.prepare("UPDATE history_meta SET value='0' WHERE key='baseline-pending'").run()
    }
  }
  composition() {
    const issuer = this.issuerComposition()
    if (issuer) return issuer
    if (this.issuerWarning) {
      this.issuerWarning = this.pilotComposition()
        ? 'Saved issuer evidence failed replay validation. The retained top-ten pilot is used instead; restore or revalidate the rejected artifact.'
        : 'Saved issuer evidence failed replay validation. No valid issuer or recovery composition is available; restore or revalidate the rejected artifact.'
    }
    return this.pilotComposition()
  }
  issuerComposition() {
    const rows = this.db.prepare('SELECT bundle FROM iusa_allocations ORDER BY as_of DESC, rowid DESC').all()
    this.issuerWarning = null
    let rejected = false
    for (const row of rows) {
      try {
        const valid = iusaComposition(JSON.parse(String(row.bundle)))
        if (rejected) this.issuerWarning = 'Newer saved issuer evidence failed replay validation. A prior valid source is used; restore or revalidate the rejected artifact.'
        return valid
      } catch {
        rejected = true
      }
    }
    if (rejected) this.issuerWarning = 'Saved issuer evidence failed replay validation.'
    return null
  }

  pilotComposition() {
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
    const previous = this.pilotComposition()
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
  saveIusaAllocation(bundle: IusaEvidenceBundle, importedAt: string) {
    const parsed = iusaComposition(bundle)
    if (!Number.isFinite(Date.parse(importedAt))) throw Error('Invalid import date')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.issuerComposition()
      if (previous?.asOf && parsed.asOf! < previous.asOf) throw Error('IUSA date regressed')
      if (previous?.asOf === parsed.asOf && JSON.stringify(previous.sourceRows) !== JSON.stringify(parsed.sourceRows))
        throw Error('Conflicting same-date IUSA rows')
      this.db.prepare('INSERT OR IGNORE INTO iusa_allocations VALUES (?,?,?,?)')
        .run(parsed.sha256, parsed.asOf!, JSON.stringify(bundle), importedAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return parsed
  }
  iusaAllocationCount(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM iusa_allocations').get()!.n)
  }
  allocationWarnings: Record<string, string> = {}
  selectedCompositions(registry: PluginRegistry = this.registry) {
    this.allocationWarnings = {}
    const selected = new Map<string, ReturnType<typeof issuerComposition>>()
    for (const row of this.db.prepare('SELECT fund_isin,sha256,as_of,bundle FROM issuer_allocations ORDER BY as_of DESC,rowid DESC').all()) {
      const isin = String(row.fund_isin)
      if (selected.has(isin)) continue
      try {
        const source = issuerComposition(JSON.parse(String(row.bundle)))
        if (source.fundIsin !== isin || source.sha256 !== row.sha256 || source.asOf !== row.as_of) throw Error('Stored identity or publication mismatch')
        selected.set(isin, source)
        if (this.allocationWarnings[isin]) this.allocationWarnings[isin] = 'Newer evidence failed replay; previous valid issuer source retained.'
      } catch { this.allocationWarnings[isin] = 'Saved issuer evidence failed replay; no valid source selected for this fund.' }
    }
    if (!selected.has('IE0031442068')) {
      const legacy = this.composition()
      if (legacy) {
        selected.set(legacy.fundIsin, legacy)
        if (this.allocationWarnings[legacy.fundIsin]) this.allocationWarnings[legacy.fundIsin] = 'Newer evidence failed replay; saved IUSA recovery source retained.'
      }
      if (this.issuerWarning) this.allocationWarnings['IE0031442068'] = this.issuerWarning
    }
    const providerSelected = new Set<string>()
    for (const row of this.db.prepare('SELECT fund_isin,sha256,as_of,evidence FROM provider_compositions ORDER BY as_of DESC,rowid DESC').all()) {
      const isin = String(row.fund_isin)
      if (providerSelected.has(isin)) continue
      try {
        const source = registry.decodeProviderEvidence(JSON.parse(String(row.evidence)))
        if (source.fundIsin !== isin || source.sha256 !== row.sha256 || source.asOf !== row.as_of) throw new ProviderError('identity')
        const previous = selected.get(isin)
        const promotion = promotesPartialRecovery(previous, source)
        if (!promotion && previous?.asOf === source.asOf && JSON.stringify(source.sourceRows) !== JSON.stringify(previous.sourceRows)) throw new ProviderError('conflict')
        if (promotion || !previous?.asOf || source.asOf! > previous.asOf || (source.asOf === previous.asOf && JSON.stringify(source.sourceRows) === JSON.stringify(previous.sourceRows))) {
          selected.set(isin, source)
        }
        providerSelected.add(isin)
        if (this.allocationWarnings[isin]) this.allocationWarnings[isin] = 'Saved newer evidence failed replay; previous valid composition retained. Restore or revalidate the rejected evidence.'
      } catch {
        this.allocationWarnings[isin] = selected.has(isin)
          ? 'Provider evidence failed replay; previous valid composition retained. Restore compatible source evidence and decoder.'
          : 'Provider evidence failed replay; no valid composition available. Restore compatible source evidence and decoder.'
      }
    }
    return [...selected.values()].sort((a,b) => a.fundIsin.localeCompare(b.fundIsin))
  }
  issuerAttempts(): Record<string, { id: string; at: string; status: 'success' | 'failed'; code: string | null }> {
    return Object.fromEntries(this.db.prepare('SELECT fund_isin,payload FROM issuer_attempts').all()
      .map(row => [String(row.fund_isin), JSON.parse(String(row.payload))]))
  }
  recordIssuerAttempt(isin: string, attempt: { id: string; at: string; status: 'success' | 'failed'; code: string | null }) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw Error('Invalid fund identity')
    this.db.prepare('INSERT INTO issuer_attempts VALUES (?,?) ON CONFLICT(fund_isin) DO UPDATE SET payload=excluded.payload')
      .run(isin, JSON.stringify(attempt))
  }
  saveIssuerAllocation(bundle: IssuerBundle, importedAt: string) {
    const id = randomUUID(), isin = bundle.fundIsin
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw Error('Invalid fund identity')
    const attempt = (status: 'success' | 'failed', code: string | null) =>
      this.db.prepare('INSERT INTO issuer_attempts VALUES (?,?) ON CONFLICT(fund_isin) DO UPDATE SET payload=excluded.payload')
        .run(isin, JSON.stringify({ id, at: importedAt, status, code }))
    let transaction = false
    try {
      const parsed = issuerComposition(bundle)
      if (parsed.fundIsin !== isin || !Number.isFinite(Date.parse(importedAt))) throw Error('Identity or date')
      this.db.exec('BEGIN IMMEDIATE'); transaction = true
      const previous = this.selectedCompositions().find(source => source.fundIsin === isin)
      if (previous?.asOf && parsed.asOf! < previous.asOf) throw Error('Date regressed')
      if (previous?.asOf === parsed.asOf && JSON.stringify(previous.sourceRows) !== JSON.stringify(parsed.sourceRows)) throw Error('Conflicting same-date rows')
      this.db.prepare('INSERT OR IGNORE INTO issuer_allocations VALUES (?,?,?,?,?)')
        .run(isin, parsed.sha256, parsed.asOf!, JSON.stringify(bundle), importedAt)
      attempt('success', null)
      this.db.exec('COMMIT'); transaction = false
      return parsed
    } catch {
      if (transaction) this.db.exec('ROLLBACK')
      attempt('failed', 'source-validation-or-conflict')
      throw Error(`Issuer import failed for ${isin}; previous valid sources retained. Diagnostic ${id}`)
    }
  }
  providerAttempts(): Record<string, ProviderAttempt> {
    return Object.fromEntries(this.db.prepare('SELECT fund_isin,payload FROM provider_attempts').all().map(row => [String(row.fund_isin), JSON.parse(String(row.payload))]))
  }
  recordProviderAttempt(fundIsin: string, attempt: ProviderAttempt) {
    // Persist only the contract's safe diagnostic fields, never raw provider errors.
    const { id, at, providerId, status, code, outcome, resolution, httpStatus } = attempt
    this.db.prepare('INSERT INTO provider_attempts VALUES (?,?) ON CONFLICT(fund_isin) DO UPDATE SET payload=excluded.payload')
      .run(fundIsin, JSON.stringify({ id, at, providerId, status, code, outcome, resolution, ...(httpStatus === undefined ? {} : { httpStatus }) }))
  }
  saveProviderEvidence(evidence: ProviderEvidence, attempt: ProviderAttempt, registry: PluginRegistry = this.registry): 'updated' | 'unchanged' {
    const source = registry.decodeProviderEvidence(evidence)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.selectedCompositions(registry).find(item => item.fundIsin === source.fundIsin)
      if (previous?.asOf && source.asOf! < previous.asOf) throw new ProviderError('date')
      const sameDate = previous?.asOf === source.asOf
      const promotion = promotesPartialRecovery(previous, source)
      if (sameDate && !promotion && JSON.stringify(previous.sourceRows) !== JSON.stringify(source.sourceRows)) throw new ProviderError('conflict')
      // Metadata/menu changes do not rewrite original accepted retrieval provenance.
      const outcome = sameDate && !promotion ? 'unchanged' : 'updated'
      if (outcome === 'updated') this.db.prepare('INSERT INTO provider_compositions VALUES (?,?,?,?)')
        .run(source.fundIsin, source.sha256, source.asOf!, JSON.stringify(evidence))
      this.recordProviderAttempt(source.fundIsin, { ...attempt, status: 'success', code: null, outcome, resolution: outcome === 'unchanged' ? 'The compatible issuer publication is unchanged.' : 'The latest compatible issuer composition was saved.' })
      this.db.exec('COMMIT')
      return outcome
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  providerCompositionCount(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM provider_compositions').get()!.n)
  }
  selectedInspections(registry: PluginRegistry = this.registry): InspectionObservation[] {
    this.inspectionWarnings = {}
    const selected = new Map<string, InspectionObservation>()
    const rejected = new Set<string>()
    for (const row of this.db.prepare('SELECT fund_isin,sha256,as_of,evidence FROM provider_inspections ORDER BY as_of DESC,rowid DESC').all()) {
      const isin = String(row.fund_isin)
      if (selected.has(isin)) continue
      try {
        const source = registry.decodeInspectionEvidence(JSON.parse(String(row.evidence)) as InspectionEvidence)
        if (source.fundIsin !== isin || source.responseSha256 !== row.sha256 || source.asOf !== row.as_of)
          throw new ProviderError('identity')
        selected.set(isin, source)
        if (rejected.has(isin)) this.inspectionWarnings[isin] = 'Newer inspection evidence failed replay; a previous valid observation was retained.'
      } catch {
        rejected.add(isin)
        this.inspectionWarnings[isin] = 'Inspection evidence failed replay; no valid observation is available. Restore compatible source evidence and decoder.'
      }
    }
    return [...selected.values()].sort((a, b) => a.fundIsin.localeCompare(b.fundIsin))
  }
  saveInspectionEvidence(evidence: InspectionEvidence, attempt: ProviderAttempt, registry: PluginRegistry = this.registry): 'updated' | 'unchanged' {
    const source = registry.decodeInspectionEvidence(evidence)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.selectedInspections(registry).find(item => item.fundIsin === source.fundIsin)
      if (previous?.asOf && source.asOf < previous.asOf) throw new ProviderError('date')
      if (previous?.asOf === source.asOf) {
        if (inspectionFingerprint(previous) !== inspectionFingerprint(source)) throw new ProviderError('conflict')
        this.recordProviderAttempt(source.fundIsin, { ...attempt, status: 'success', code: null, outcome: 'unchanged', resolution: 'The compatible issuer inspection is unchanged.' })
        this.db.exec('COMMIT')
        return 'unchanged'
      }
      this.db.prepare('INSERT INTO provider_inspections VALUES (?,?,?,?)')
        .run(source.fundIsin, source.responseSha256, source.asOf, JSON.stringify(evidence))
      this.recordProviderAttempt(source.fundIsin, { ...attempt, status: 'success', code: null, outcome: 'updated', resolution: 'The latest compatible issuer inspection was saved.' })
      this.db.exec('COMMIT')
      return 'updated'
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  inspectionEvidenceCount(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM provider_inspections').get()!.n)
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
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.history.retainSource(source)
      this.db.prepare('INSERT INTO data_sources(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload')
        .run(source.id, JSON.stringify(source))
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  recordDiagnostic(event: Diagnostic): void {
    const connection = event.connectionId ? this.connections.get(event.connectionId) : null
    const safe: Diagnostic = {
      ...(connection ? { connectionId: connection.id, providerId: connection.providerId } : {}),
      ...(event.terminal ? { terminal: true } : {}),
      ...(event.outcome
        ? {
            outcome: {
              holdings: event.outcome.holdings
                ? {
                    snapshotId: Number.isSafeInteger(event.outcome.holdings.snapshotId) ? event.outcome.holdings.snapshotId : 0,
                    fetchedAt: typeof event.outcome.holdings.fetchedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.outcome.holdings.fetchedAt) && Number.isFinite(Date.parse(event.outcome.holdings.fetchedAt)) ? event.outcome.holdings.fetchedAt : '',
                  }
                : null,
              valuation: ['not-requested','refreshing','success','partial','failed','cancelled'].includes(event.outcome.valuation) ? event.outcome.valuation : 'failed',
              sources: event.outcome.sources
                .filter((s) => catalog.some((d) => d.id === s.id))
                .map((s) => ({ id: s.id, status: ['not-fetched','success','partial','failed','unsupported'].includes(s.status) ? s.status : 'failed' as const })),
            },
          }
        : {}),
      ...(event.sourceId && catalog.some((s) => s.id === event.sourceId)
        ? { sourceId: event.sourceId }
        : {}),
      ...safeDiagnostic(event),
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
  portfolioAttempts(): Diagnostic[] {
    return this.db
      .prepare(
        "SELECT payload FROM diagnostics WHERE json_extract(payload,'$.terminal')=1 AND json_extract(payload,'$.operation') IN ('login','restore','sync') ORDER BY id DESC LIMIT 1000"
      )
      .all()
      .map((row) => JSON.parse(String(row.payload)))
  }
  autoRestoreEnabled(): boolean {
    return this.db.prepare("SELECT value FROM settings WHERE key='auto_restore'").get()?.value !== 0
  }
  setAutoRestore(enabled: boolean): void {
    const connection = this.connections.get(this.connections.defaultId)!
    this.connections.configure(connection.id,connection.enabled,enabled)
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
      this.history.retainSnapshot(snapshot)
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
  connectionInputs(): ConnectionInputs[] {
    return this.connections.list().map(connection => connection.id === this.connections.defaultId
      ? { connection, snapshot: this.latest(), holdingsHistory: this.db.prepare('SELECT payload FROM snapshots ORDER BY id').all().map(row => decodeSnapshot(JSON.parse(String(row.payload)))), observations: this.sources().flatMap(source => { const o = tradeRepublicObservation(source); return o ? [o] : [] }), quantities: this.quantityObservations() }
      : this.connections.inputs(connection))
  }
  overview(now = Date.now()) { return valueConnections(this.connectionInputs(), this.connections.defaultId, now) }
  combinedSnapshot(): Snapshot | null {
    const inputs = this.connectionInputs().filter(i => i.snapshot)
    if (!inputs.length) return null
    return { fetchedAt: inputs.map(i => i.snapshot!.fetchedAt).sort().at(-1)!, positions: inputs.flatMap(i => i.snapshot!.positions.map(p => ({ ...p, account: accountScope(i.connection.id, p.account, this.connections.defaultId) }))) }
  }
  close(): void {
    this.db.close()
  }
}
