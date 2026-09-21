import { valueConnections, type ConnectionInputs } from './connection-store'
import { createHash, randomUUID } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import type { DatabaseSync } from 'node:sqlite'
import { Decimal } from 'decimal.js'
import { historyContractVersion, type HistoryCheckpointDetail, type HistoryCheckpointSummary, type HistoryInputReference, type HistoryNotice, type HistoryRunSummary, type HistoryRunsPage, type HistoryRunDetail } from '../contracts/history'
import { decodeCheckpoint, decodeRun } from './history-validation'
import { financialObservation, valuationSource } from './history-observation'
import { currentIdentityPolicy, identityPolicyEvidence } from './issuer-relationships'
import { quantityObservations } from './quantity-observations'
import { overview } from './overview'
import { exposure } from './exposure'
import type { SnapshotStore } from './store'
import { compositionPolicyVersion } from './composition-provider'
import type { ProviderAttempt } from './composition-provider'
import type { DataSource } from './explorer'
import { decodeSnapshot, type Snapshot } from './model'

const encodeManifest = (json: string) => {
  if (Buffer.byteLength(json) > 64 * 1024 * 1024) throw Error('Checkpoint manifest exceeds storage limit')
  return 'deflate:' + deflateRawSync(Buffer.from(json)).toString('base64')
}
const decodeManifest = (text: string) => JSON.parse(text.startsWith('deflate:')
  ? inflateRawSync(Buffer.from(text.slice(8), 'base64'), { maxOutputLength: 64 * 1024 * 1024 }).toString() : text)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const versions = { calculator: 'exposure/1', valuation: 'quantity-compatible-bid/1', identity: currentIdentityPolicy.version, observation: 'financial-observation/1', manifest: 'history-manifest/1' }
const connectionVersions = { ...versions, valuation: 'connection-valuation/1', observation: 'broker-observation/1', manifest: 'history-manifest/2' }
const notice = (code: string, message: string, nextAction: string | null = null, diagnosticId: string | null = null): HistoryNotice => ({ code, severity: 'warning', message, nextAction, diagnosticId })
const range = (values: (string | null)[]) => { const sorted = values.filter((v): v is string => !!v).sort(); return { min: sorted[0] ?? null, max: sorted.at(-1) ?? null } }
export class HistoryParameterError extends Error {}
export function historyId(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new HistoryParameterError('Invalid history identity'); return id }

/** Single-writer SQLite journal. All calculation/publication work is synchronous:
 * no asynchronous calculator can publish an old captured generation after a newer one. */
export class PortfolioHistory {
  readonly datasetId: string
  readonly connectionId: string
  constructor(private readonly db: DatabaseSync, private readonly store: SnapshotStore) {
    this.datasetId = String(db.prepare("SELECT value FROM history_meta WHERE key='dataset'").get()!.value)
    this.connectionId = String(db.prepare("SELECT value FROM history_meta WHERE key='connection'").get()!.value)
    const running = db.prepare("SELECT id FROM history_runs WHERE status='running'").all()
    for (const row of running) this.finish(String(row.id), 'interrupted', [notice('interrupted', 'The process stopped before this operation finished. Committed checkpoints are retained.', 'Inspect saved inputs before retrying.')])
  }
  static migrate(db: DatabaseSync) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE history_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE history_blobs (sha256 TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE history_observations (id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL, observed_at TEXT, completeness TEXT NOT NULL, sha256 TEXT NOT NULL REFERENCES history_blobs(sha256));
      CREATE TABLE history_runs (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE history_checkpoints (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, run_id TEXT NOT NULL REFERENCES history_runs(id), payload TEXT NOT NULL, sha256 TEXT NOT NULL, manifest TEXT NOT NULL, manifest_sha256 TEXT NOT NULL);
      CREATE TABLE history_checks (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES history_runs(id), source_id TEXT NOT NULL, checked_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX history_checks_source ON history_checks(source_id,checked_at);
      CREATE INDEX history_checkpoints_run ON history_checkpoints(run_id,seq);
      PRAGMA user_version=11;`)
    try {
      db.prepare('INSERT INTO history_meta VALUES (?,?)').run('dataset', randomUUID())
      db.prepare('INSERT INTO history_meta VALUES (?,?)').run('connection', randomUUID())
      db.prepare('INSERT INTO history_meta VALUES (?,?)').run('baseline-pending', '1')
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
  }
  private observation(kind: HistoryInputReference['kind'], sourceId: string, payload: unknown, observedAt: string | null, completeness: string, asOf: string | null = null, parserVersion: string | null = versions.observation): HistoryInputReference {
    const body = JSON.stringify(payload), sha256 = hash(body)
    const id = hash(JSON.stringify([this.datasetId, this.connectionId, kind, sourceId, observedAt, completeness, sha256]))
    this.db.prepare('INSERT OR IGNORE INTO history_blobs VALUES (?,?)').run(sha256, body)
    this.db.prepare('INSERT OR IGNORE INTO history_observations VALUES (?,?,?,?,?,?)').run(id, kind, sourceId, observedAt, completeness, sha256)
    return { id, kind, sourceId, observedAt, asOf, sha256, parserVersion }
  }
  retainSnapshot(snapshot: Snapshot) {
    if (!Number.isFinite(Date.parse(snapshot.fetchedAt)) || snapshot.positions.some(p => !p.account)) throw Error('Invalid holdings observation scope or time')
    return this.observation('holdings', this.connectionId, decodeSnapshot(snapshot), snapshot.fetchedAt, snapshot.positions.length ? 'complete' : 'authoritative-empty')
  }
  retainSource(source: DataSource) {
    const normalized = financialObservation(source)
    if (!normalized) return null
    return this.observation(source.id === 'quotes' ? 'quote' : source.id === 'cash' ? 'cash' : 'instrument', source.id, normalized, normalized.observedAt, normalized.completeness)
  }
  start(trigger: HistoryRunSummary['trigger'], id: string = randomUUID(), at = new Date().toISOString()) {
    historyId(id)
    const run = decodeRun({ id, trigger, startedAt: at, finishedAt: null, status: 'running', checkpointCount: 0, latestCheckpoint: null, notices: [] })
    this.db.prepare('INSERT INTO history_runs(id,status,payload) VALUES (?,?,?)').run(id, 'running', JSON.stringify(run))
    return id
  }
  recordCheck(runId: string, sourceId: string, attempt: ProviderAttempt) {
    const { id, at, providerId, status, code, outcome, resolution, httpStatus } = attempt
    this.db.prepare('INSERT INTO history_checks VALUES (?,?,?,?,?)').run(id, runId, sourceId, at,
      JSON.stringify({ id, at, providerId, status, code, outcome, resolution, ...(httpStatus === undefined ? {} : { httpStatus }) }))
  }
  sourceChecks(sourceId: string) {
    return this.db.prepare('SELECT payload FROM history_checks WHERE source_id=? ORDER BY rowid DESC').all(sourceId).map(row => JSON.parse(String(row.payload)) as ProviderAttempt)
  }
  finish(id: string, status: Exclude<HistoryRunSummary['status'], 'running'>, notices: readonly HistoryNotice[] = []) {
    const row = this.db.prepare('SELECT payload,status FROM history_runs WHERE id=?').get(id)
    if (!row) throw Error('History operation missing')
    if (row.status !== 'running') return // terminal outcomes cannot be rewritten
    const run = decodeRun({ ...decodeRun(JSON.parse(String(row.payload))), finishedAt: new Date().toISOString(), status, notices })
    this.db.prepare('UPDATE history_runs SET status=?,payload=? WHERE id=? AND status=?').run(status, JSON.stringify(run), id, 'running')
  }
  capture(runId: string, reason: HistoryCheckpointSummary['reason'], id: string = randomUUID(), now = Date.now()): HistoryCheckpointDetail | null {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.checkpoint(id)
      if (existing) { if (existing.checkpoint.runId !== runId) throw Error('Checkpoint identity conflict'); this.db.exec('COMMIT'); return existing }
      const run = this.db.prepare('SELECT status FROM history_runs WHERE id=?').get(runId)
      if (run?.status !== 'running') throw Error('History operation is not running')
      const connectionInputs = this.store.connectionInputs()
      const multiConnection = connectionInputs.length > 1 ? connectionInputs : null
      const recordedVersions = multiConnection ? connectionVersions : versions
      const snapshot = multiConnection ? this.store.combinedSnapshot() : this.store.latest()
      if (!snapshot) { this.db.exec('COMMIT'); return null }
      const inputs: HistoryInputReference[] = multiConnection ? [] : [this.retainSnapshot(snapshot)]
      const sources = this.store.sources().flatMap(source => {
        const normalized = financialObservation(source)
        if (!normalized) return []
        inputs.push(this.retainSource(source)!)
        return [normalized]
      })
      const quantityHistory = this.db.prepare('SELECT payload FROM snapshots ORDER BY id').all().map(row => decodeSnapshot(JSON.parse(String(row.payload))))
      const quantityEvidence = quantityHistory.map(snapshot => this.retainSnapshot(snapshot))
      const quantities = quantityObservations(quantityHistory)
      const compositions = this.store.selectedCompositions()
      for (const source of compositions) {
        const ref = this.observation('composition', source.fundIsin, source, source.retrievedAt, source.scope, source.asOf, source.sourceParserVersion ?? null)
        inputs.push({ ...ref, sha256: source.sha256 })
      }
      inputs.push(this.observation('identity', 'verified-equity-classes', currentIdentityPolicy, null, 'bounded', null, versions.identity))
      inputs.push(this.observation('policy', 'valuation-and-exposure', recordedVersions, null, 'supported', null, versions.calculator))
      if (multiConnection) for (const input of multiConnection) {
        inputs.push(this.observation('holdings', input.connection.id, input, input.snapshot?.fetchedAt ?? null, 'connection-inputs', null, 'broker-observation/1'))
      }
      const valuations = multiConnection ? valueConnections(multiConnection, this.connectionId, now) : overview(snapshot, sources.map(valuationSource), now, quantities)
      const account = (scoped: string) => {
        const connection = multiConnection?.find(i => i.connection.id !== this.connectionId && scoped.startsWith(i.connection.id + ':'))
        return { connectionId: connection?.connection.id ?? this.connectionId, accountId: connection ? scoped.slice(connection.connection.id.length + 1) : scoped }
      }
      const result = exposure(valuations, compositions, this.store.compositionAttempt(), false, now)
      const notices: HistoryNotice[] = [notice('reconciliation-pending', 'Broker reconciliation and complete company grouping remain pending.', 'Reconcile against broker statements before interpreting complete portfolio results.')]
      if (reason === 'migration') notices.push(notice('migration-baseline', 'History begins from surviving saved inputs at migration time. Earlier overwritten prices and cash are not recorded.', 'Use earlier holdings as observations only; do not infer trades or returns.'))
      if (valuations.missingCount) notices.push(notice('unvalued-positions', 'Some positions have unknown values or unsupported units.', 'Inspect position quality and obtain compatible quotes and instrument metadata.'))
      if (valuations.totals.some(t => t.cash === null || t.cashStale || !t.cashAt) || !valuations.totals.length) notices.push(notice('cash-incomplete', 'Cash is missing, stale or partial and is separate from priced securities.', 'Refresh and reconcile cash for the same account scope.'))
      if (valuations.totals.some(t => t.olderQuotes)) notices.push(notice('stale-quotes', 'Some selected quotes are older than 24 hours at this checkpoint.', 'Refresh quotes before making a current-value comparison.'))
      if (result.stale) notices.push(notice('stale-compositions', 'Selected compositions have old or unknown publication dates.', 'Check for a compatible issuer publication.'))
      // Latest source state describes saved evidence, not which operation failed.
      // Pin only checks already committed by this run; later failures must not rewrite this checkpoint.
      const runChecks = this.db.prepare('SELECT source_id,payload FROM history_checks WHERE run_id=? ORDER BY rowid').all(runId)
        .map(row => ({ sourceId: String(row.source_id), attempt: JSON.parse(String(row.payload)) as ProviderAttempt }))
      for (const { sourceId, attempt } of runChecks.filter(check => check.attempt.status === 'failed'))
        notices.push(notice('source-refresh-failed', `The issuer check for ${sourceId} failed during this operation. Eligible saved inputs remain selected.`, attempt.resolution, attempt.id))
      for (const source of sources.filter(s => ['failed', 'partial'].includes(s.completeness)))
        notices.push(notice('saved-source-incomplete', `The saved ${source.sourceId} observation is ${source.completeness}; eligible retained values may predate this operation.`, 'Inspect source dates and diagnostics; obtain complete compatible observations.'))
      const heldFunds = new Set(snapshot.positions.filter(p => new Decimal(p.quantity).gt(0)).map(p => p.isin))
      for (const [fund, attempt] of Object.entries(this.store.providerAttempts()))
        if (heldFunds.has(fund) && attempt.status === 'failed' && !runChecks.some(check => check.attempt.id === attempt.id))
          notices.push(notice('saved-provider-check-failed', `The latest saved issuer check for held fund ${fund} failed at ${attempt.at}. This is saved source state, not a failure attributed to this operation.`, attempt.resolution, attempt.id))
      const pilotAttempt = this.store.compositionAttempt()
      if (pilotAttempt?.status === 'failed' && (pilotAttempt.id === runId || compositions.some(c => heldFunds.has(c.fundIsin) && c.scope === 'top-ten')))
        notices.push(notice(pilotAttempt.id === runId ? 'source-refresh-failed' : 'saved-provider-check-failed',
          pilotAttempt.id === runId ? 'The recovery composition refresh failed during this operation.' : `The selected recovery composition has a failed saved check at ${pilotAttempt.at}; eligible saved evidence remains selected.`,
          'Inspect recovery-source diagnostics and retry when appropriate.', pilotAttempt.id))
      for (const warning of Object.values(this.store.allocationWarnings)) notices.push(notice('source-replay', warning, 'Restore compatible source evidence and decoder.'))
      for (const source of compositions.filter(c => c.estimateLimitation)) notices.push(notice('allocation-estimate', source.estimateLimitation!.qualifier, source.estimateLimitation!.nextAction))
      const checkpoint: HistoryCheckpointSummary = {
        id, runId, recordedAt: new Date(now).toISOString(), reason, datasetId: this.datasetId,
        accounts: [...new Set([...snapshot.positions.map(p => p.account), ...(multiConnection ? multiConnection.flatMap(i => i.observations.flatMap(s => s.cash.flatMap(c => c.accountId ? [i.connection.id === this.connectionId ? hash(c.accountId).slice(0,16) : i.connection.id + ':' + hash(c.accountId).slice(0,16)] : []))) : sources.flatMap(s => s.cash.flatMap(c => c.accountId ? [hash(c.accountId).slice(0, 16)] : [])))])].sort().map(account),
        holdingsObservedAt: snapshot.fetchedAt, quoteDates: range(valuations.rows.map(p => p.quoteAt)), compositionDates: range(compositions.filter(c => result.rows.some(row => row.contributions.some(p => p.source?.fundIsin === c.fundIsin))).map(c => c.asOf)),
        currencies: result.coverage.map(c => { const t = valuations.totals.find(t => t.currency === c.currency)!; return {
          currency: c.currency, pricedSecurities: c.pricedSecurities, includedSecurityValue: c.knownCompanyValue, unassignedValue: c.unresolvedValue, nonCompanyValue: null, coveragePercent: c.knownPercent,
          allocationState: new Decimal(c.unresolvedValue).isNegative() ? 'incompatible' : !new Decimal(c.pricedSecurities).gt(0) ? 'unavailable' : new Decimal(c.unresolvedValue).isZero() ? 'allocated' : 'partial',
          cashValue: t.cash, cashState: t.cash === null ? 'unknown' : t.cashStale || !t.cashAt ? 'partial' : 'known',
        } }),
        pricedPositionCount: valuations.pricedCount, unvaluedPositionCount: valuations.missingCount, zeroPositionCount: valuations.zeroCount,
        valuationState: !valuations.rows.length ? 'empty' : valuations.missingCount ? valuations.pricedCount ? 'partial' : 'unavailable' : 'valued',
        companyGrouping: result.rows.length ? 'partial' : 'unavailable', reconciliation: 'pending', notices,
      }
      const detail = decodeCheckpoint({ contractVersion: historyContractVersion, checkpoint, inputs, versions: recordedVersions,
        positions: valuations.rows.map(p => ({ account: account(p.account), isin: p.isin, name: p.name, quantity: p.quantity, currency: p.currency, unitPrice: p.price, value: p.value, quoteAt: p.quoteAt, valuationStatus: p.valuationStatus, quality: p.quality })),
        replay: { state: 'available', reason: null },
      })
      // Manifest pins selection, quantity-continuity evidence, clock, policy and full
      // unrounded result. Original provider evidence remains in its existing table.
      const manifest = encodeManifest(JSON.stringify({ ...(multiConnection ? { connectionInputs: multiConnection } : {}), versions: recordedVersions, now, snapshot, sources, quantities, quantityEvidence, compositions, attempt: this.store.compositionAttempt(), identity: currentIdentityPolicy, valuations, result, inputs, providerAttempts: this.store.providerAttempts(), runChecks, allocationWarnings: this.store.allocationWarnings }))
      const payload = JSON.stringify(detail)
      this.db.prepare('INSERT INTO history_checkpoints(id,run_id,payload,sha256,manifest,manifest_sha256) VALUES (?,?,?,?,?,?)').run(id, runId, payload, hash(payload), manifest, hash(manifest))
      this.db.exec('COMMIT')
      return detail
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
  checkpoint(id: string): HistoryCheckpointDetail | null {
    historyId(id)
    const row = this.db.prepare('SELECT payload,sha256,manifest,manifest_sha256 FROM history_checkpoints WHERE id=?').get(id)
    if (!row) return null
    if (hash(String(row.payload)) !== row.sha256) throw Error('Saved history result integrity failure')
    const detail = decodeCheckpoint(JSON.parse(String(row.payload)))
    if (detail.checkpoint.id !== id || detail.checkpoint.datasetId !== this.datasetId) throw Error('Saved history identity mismatch')
    let unavailable: string | null = null
    if (hash(String(row.manifest)) !== row.manifest_sha256) unavailable = 'Saved input manifest failed integrity validation; the frozen result remains available.'
    else if (!identityPolicyEvidence(detail.versions.identity) || ![versions,connectionVersions].some(v => JSON.stringify({ ...detail.versions, identity: versions.identity }) === JSON.stringify(v))) unavailable = 'The recorded calculator or policy version is unavailable; the frozen result remains available.'
    else {
      const manifest = decodeManifest(String(row.manifest))
      if (JSON.stringify(manifest.versions) !== JSON.stringify(detail.versions) ||
        JSON.stringify(manifest.identity) !== JSON.stringify(identityPolicyEvidence(detail.versions.identity)))
        unavailable = 'The recorded identity policy differs from its retained version; the frozen result remains available.'
      for (const source of manifest.compositions ?? []) if (source.provider) {
        // Acquisition lifecycle does not remove retained decoders used by offline replay.
        const entry = this.store.registry.capabilityForFund(source.fundIsin, true)
        if (!entry || entry.provider.manifest.parserVersion !== source.sourceParserVersion ||
          entry.provider.manifest.id !== source.provider.id || entry.provider.manifest.version !== source.provider.version ||
          entry.provider.manifest.contractVersion !== source.provider.contractVersion || source.provider.policyVersion !== compositionPolicyVersion)
          unavailable = 'A recorded composition decoder is unavailable; the frozen result remains available.'
      }
      for (const input of [...detail.inputs, ...(manifest.quantityEvidence ?? [])]) {
        const blob = this.db.prepare('SELECT b.payload,b.sha256 FROM history_observations o JOIN history_blobs b ON b.sha256=o.sha256 WHERE o.id=?').get(input.id)
        if (!blob || hash(String(blob.payload)) !== blob.sha256) unavailable = 'A retained observation is missing or corrupt; the frozen result remains available.'
      }
    }
    return { ...detail, replay: unavailable ? { state: 'unavailable', reason: unavailable } : detail.replay }
  }
  /** Private replay evidence; never exposed through HTTP. */
  replay(id: string) {
    const detail = this.checkpoint(id)
    if (!detail || detail.replay.state !== 'available') throw Error('Checkpoint replay unavailable')
    const row = this.db.prepare('SELECT manifest FROM history_checkpoints WHERE id=?').get(id)!
    const manifest = decodeManifest(String(row.manifest))
    if (manifest.quantityEvidence) {
      const history = manifest.quantityEvidence.map((input: HistoryInputReference) => {
        const blob = this.db.prepare('SELECT b.payload FROM history_observations o JOIN history_blobs b ON b.sha256=o.sha256 WHERE o.id=?').get(input.id)!
        return decodeSnapshot(JSON.parse(String(blob.payload)))
      })
      if (JSON.stringify(quantityObservations(history)) !== JSON.stringify(manifest.quantities)) throw Error('Quantity continuity replay differs')
    }
    if (manifest.connectionInputs) for (const input of manifest.connectionInputs as ConnectionInputs[]) {
      if (JSON.stringify(quantityObservations(input.holdingsHistory)) !== JSON.stringify(input.quantities) || JSON.stringify(input.holdingsHistory.at(-1) ?? null) !== JSON.stringify(input.snapshot)) throw Error('Connection quantity continuity replay differs')
    }
    const valuations = manifest.connectionInputs ? valueConnections(manifest.connectionInputs as ConnectionInputs[], this.connectionId, manifest.now) : overview(decodeSnapshot(manifest.snapshot), manifest.sources.map(valuationSource), manifest.now, manifest.quantities)
    const result = exposure(valuations, manifest.compositions, manifest.attempt, false, manifest.now, detail.versions.identity)
    if (JSON.stringify(valuations) !== JSON.stringify(manifest.valuations) || JSON.stringify(result) !== JSON.stringify(manifest.result)) throw Error('Checkpoint replay differs from recorded result')
    return { detail, valuations, result }
  }
  private summary(row: Record<string, unknown>): HistoryRunSummary {
    const run = decodeRun(JSON.parse(String(row.payload)))
    const count = Number(this.db.prepare('SELECT count(*) n FROM history_checkpoints WHERE run_id=?').get(run.id)!.n)
    const last = this.db.prepare('SELECT id FROM history_checkpoints WHERE run_id=? ORDER BY seq DESC LIMIT 1').get(run.id)
    return { ...run, checkpointCount: count, latestCheckpoint: last ? this.checkpoint(String(last.id))!.checkpoint : null }
  }
  runs(limit = 25, cursor: string | null = null): HistoryRunsPage {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HistoryParameterError('Invalid history limit')
    let before = Number.MAX_SAFE_INTEGER
    if (cursor !== null) {
      try {
        if (!/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) throw Error()
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        if (decoded.dataset !== this.datasetId || !Number.isSafeInteger(decoded.before) || decoded.before < 1) throw Error()
        before = decoded.before
      } catch { throw new HistoryParameterError('Invalid history cursor') }
    }
    const rows = this.db.prepare('SELECT seq,payload FROM history_runs WHERE seq<? ORDER BY seq DESC LIMIT ?').all(before, limit + 1)
    const page = rows.slice(0, limit)
    return { contractVersion: historyContractVersion, items: page.map(row => this.summary(row)), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ dataset: this.datasetId, before: Number(page.at(-1)!.seq) })).toString('base64url') : null }
  }
  run(id: string): HistoryRunDetail | null {
    historyId(id)
    const row = this.db.prepare('SELECT payload FROM history_runs WHERE id=?').get(id)
    if (!row) return null
    return { contractVersion: historyContractVersion, run: this.summary(row), checkpoints: this.db.prepare('SELECT id FROM history_checkpoints WHERE run_id=? ORDER BY seq').all(id).map(r => this.checkpoint(String(r.id))!.checkpoint) }
  }
}
