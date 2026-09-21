import { inCredentialScope, credentialSignal, credentialCleanup } from './credential-scope'
import { boundedOperation } from './bounded-operation'
import { admitHoldings } from './broker-holdings'
import { BrokerConnections } from './broker-connections'
import { validateAuth } from './broker-contract'
import { issuerReadiness, iusaDetail } from './iusa-readiness'
import { randomUUID } from 'node:crypto'
import { classifyError, type Diagnostic, type DiagnosticStage } from './diagnostics'
import { Data, Effect } from 'effect'
import type { Broker } from './broker-contract'
import type { OperationOutcome, Status } from './model'
import { SnapshotStore } from './store'
import { CompositionService } from './composition-service'
import { ProviderRefreshService } from './provider-refresh-service'
import { exposure } from './exposure'
import { fundValuation, illustrativeValues } from './illustrative-values'
import { withSourceReadiness } from './exposure-readiness'
import { coverageReport } from './coverage-report'
import type { DataSource } from './explorer'
import {
  developmentFund,
  developmentProgress,
  knownDevelopmentIsin,
  type DevelopmentFundDetail,
  type DevelopmentProgress,
} from './development'

class OperationFailed extends Data.TaggedError('OperationFailed')<{
  message: string
  authRejected: boolean
  detail: ReturnType<typeof classifyError>
}> {}
export class PortfolioService {
  readonly connections: BrokerConnections
  readonly compositions: CompositionService
  readonly issuerRefresh: ProviderRefreshService
  private state: Pick<Status, 'phase' | 'error' | 'lastAttemptAt'> = {
    phase: 'disconnected',
    error: null,
    lastAttemptAt: null,
  }
  private activeOutcome: OperationOutcome | null = null
  private operation: Promise<void> | null = null
  private controller: AbortController | null = null
  private connected = false
  private attemptId: string | null = null
  private operationName: Diagnostic['operation'] = 'background'
  private stage: DiagnosticStage = 'restoring'
  private diagnosticFailure = false
  private historyRun: string | null = null
  private broker: Broker
  private readonly brokerFactory: (() => Broker) | null
  constructor(
    broker: Broker | (() => Broker),
    private readonly store: SnapshotStore,
    private readonly evidenceDirectory: string | null = null,
    private readonly automaticRefreshEnabled = false
  ) {
    this.brokerFactory = typeof broker === 'function' ? broker : null
    this.broker = this.brokerFactory ? this.brokerFactory() : broker as Broker
    this.compositions = new CompositionService(store)
    this.issuerRefresh = new ProviderRefreshService(store)
    this.connections = new BrokerConnections(store, { status: () => this.status(), authenticate: input => this.authenticate(input), sync: () => this.sync(), restore: () => this.restore(), cancel: () => this.cancel(), logout: () => this.logout(), suspend: () => { credentialCleanup(() => this.broker.close()); this.connected = false; this.state.phase = 'disconnected' }, settled: () => this.settled(), committed: () => { if (this.automaticRefreshEnabled) this.issuerRefresh.refresh(true) } })
    this.observeBroker()
  }
  private observeBroker() {
    this.broker.observe?.(event => {
      const signal = credentialSignal()
      if (signal?.aborted || signal && signal !== this.controller?.signal) return
      this.record({ stage:event.stage,event:event.event,category:event.category,durationMs:event.durationMs,httpStatus:event.httpStatus,networkCode:event.networkCode,sourceId:event.sourceId })
    })
  }
  private guard(signal: AbortSignal) {
    signal.throwIfAborted()
    const connection = this.store.connections.get(this.store.connections.defaultId)!
    if (this.controller?.signal !== signal || !connection.enabled || this.store.registry.brokerProvider(connection.providerId)?.version !== connection.providerVersion) throw new Error('Broker operation retired')
  }
  private record(
    event: Pick<
      Diagnostic,
      | 'stage'
      | 'event'
      | 'category'
      | 'durationMs'
      | 'httpStatus'
      | 'networkCode'
      | 'sourceId'
      | 'terminal'
    >
  ): void {
    try {
      this.store.recordDiagnostic({
        ...event,
        connectionId: this.store.connections.defaultId,
        ...(this.activeOutcome ? { outcome: this.activeOutcome } : {}),
        attemptId: this.attemptId ?? randomUUID(),
        operation: this.attemptId ? this.operationName : 'background',
        at: new Date().toISOString(),
      })
    } catch {
      this.diagnosticFailure = true
    }
  }
  history() { return this.store.history }
  diagnostics(): Diagnostic[] {
    return this.store.diagnostics()
  }
  invalidRequest(): void {
    this.record({
      stage: 'request_validation',
      event: 'failed',
      category: 'validation',
      durationMs: 0,
    })
  }

  status(): Status {
    const attempts = this.store.portfolioAttempts()
    return {
      ...this.state,
      connected: this.connected,
      activeOperation: this.operation
        ? this.operationName === 'extraction'
          ? 'extraction'
          : 'portfolio'
        : null,
      automaticRefresh: {
        enabled: this.automaticRefreshEnabled,
        intervalMinutes: 15,
        sessionRestoreEnabled: this.store.autoRestoreEnabled(),
      },
      lastPortfolioAttempt: attempts[0] ?? null,
      lastSuccessfulSyncAt:
        attempts.find((attempt) => attempt.event === 'succeeded' && attempt.outcome?.holdings)
          ?.at ?? null,
      outcome: this.activeOutcome ?? this.store.latestOutcome(),
      snapshot: this.store.combinedSnapshot(),
      sessionWarning: this.diagnosticFailure
        ? 'Local diagnostics could not be saved. Stop retries until local storage is checked.'
        : this.broker.warning(),
      lastDiagnostic: this.store.diagnostics()[0] ?? null,
    }
  }
  private async import(signal: AbortSignal): Promise<void> {
    this.guard(signal)
    this.activeOutcome = { holdings: null, valuation: 'not-requested', sources: [] }
    this.state.phase = 'syncing'
    this.stage = 'syncing'
    this.state.lastAttemptAt = new Date().toISOString()
    const snapshot = this.broker.readHoldings ? admitHoldings(await this.broker.readHoldings(signal)) : await this.broker.fetch(signal)
    this.guard(signal)
    this.stage = 'persisting'
    const snapshotId = this.store.save(snapshot)
    this.activeOutcome!.holdings = { snapshotId, fetchedAt: snapshot.fetchedAt }
    if (this.historyRun) this.store.history.capture(this.historyRun, 'holdings')
    this.record({ stage: 'persisting', event: 'succeeded', category: 'none', durationMs: 0 })
    // Re-evaluate supported funds after the holdings commit, including first login.
    if (this.automaticRefreshEnabled) this.issuerRefresh.refresh(true)
    if (this.broker.readData) {
      this.stage = 'data_extraction'
      this.activeOutcome!.valuation = 'refreshing'
      await this.broker.readData(
        this.store.sources(),
        (source) => this.saveOperationSource(source, signal),
        signal,
        'valuation'
      )
      this.guard(signal)
      const saved = this.activeOutcome!.sources
      this.activeOutcome!.valuation =
        ['instrumentDetails', 'quotes', 'cash'].every((id) =>
          saved.some((s) => s.id === id && s.status === 'success')
        ) && saved.every((s) => s.status === 'success')
          ? 'success'
          : 'partial'
      if (this.activeOutcome!.valuation === 'partial')
        this.state.error = `${this.committedOutcomeMessage()} Diagnostic reference: ${this.attemptId}`
    }
  }
  private saveOperationSource(source: DataSource, signal: AbortSignal): void {
    this.guard(signal)
    this.store.saveSource(source)
    if (this.historyRun && ['quotes', 'instrumentDetails', 'cash'].includes(source.id)) this.store.history.capture(this.historyRun, 'valuation')
    const outcome = this.activeOutcome!
    outcome.sources = [
      ...outcome.sources.filter((s) => s.id !== source.id),
      { id: source.id, status: source.status },
    ]
  }
  private committedOutcomeMessage(): string {
    const outcome = this.activeOutcome
    if (!outcome?.holdings) return 'Your last saved holdings are unchanged.'
    return (
      `Holdings saved at ${outcome.holdings.fetchedAt}. Valuation refresh ${outcome.valuation}. ` +
      `${outcome.sources.length} source outcomes saved; see broker data for individual results.`
    )
  }
  private start(
    phase: 'connecting' | 'restoring' | 'syncing',
    task: (signal: AbortSignal) => Promise<void>,
    operationName?: Diagnostic['operation']
  ): boolean {
    const connection = this.store.connections.get(this.store.connections.defaultId)!
    if (this.operation || !connection.enabled || this.store.registry.brokerProvider(connection.providerId)?.version !== connection.providerVersion) return false
    this.attemptId = randomUUID()
    this.operationName =
      operationName ??
      (phase === 'connecting' ? 'login' : phase === 'restoring' ? 'restore' : 'sync')
    this.historyRun = this.operationName === 'extraction' ? null : this.store.history.start('broker-sync', this.attemptId)
    this.stage = phase
    this.activeOutcome = null
    const started = performance.now()
    this.record({ stage: phase, event: 'started', category: 'none', durationMs: 0 })
    this.state.phase = phase
    this.state.error = null
    const controller = new AbortController()
    this.controller = controller
    const timeout = setTimeout(() => controller.abort(new DOMException('Timed out','TimeoutError')),180_000)
    timeout.unref()
    const work = Effect.tryPromise({
      try: () => boundedOperation(inCredentialScope(controller.signal,() => task(controller.signal)),controller.signal),
      catch: (error) =>
        new OperationFailed({
          message: classifyError(error).category === 'authentication' ? 'The broker session expired or was rejected. Connect again.' : 'The operation could not complete. Retry or reconnect.',
          authRejected:
            classifyError(error).category === 'authentication',
          detail: classifyError(error),
        }),
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (this.historyRun) this.store.history.finish(this.historyRun, this.activeOutcome?.valuation === 'partial' ? 'partial' : 'succeeded')
          this.record({
            terminal: true,
            stage: this.stage,
            event: this.activeOutcome?.valuation === 'partial' ? 'partial' : 'succeeded',
            category: 'none',
            durationMs: Math.round(performance.now() - started),
          })
        })
      ),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          if (this.activeOutcome?.valuation === 'refreshing')
            this.activeOutcome.valuation = controller.signal.aborted ? 'cancelled' : 'failed'
          if (this.historyRun) this.store.history.finish(this.historyRun, controller.signal.aborted ? 'cancelled' : 'failed', [{ code: controller.signal.aborted ? 'cancelled' : 'operation-failed', severity: 'warning', message: 'The operation did not finish. Previously committed checkpoints remain available.', nextAction: 'Inspect source diagnostics and retry when the cause is resolved.', diagnosticId: this.attemptId }])
          this.record({
            terminal: true,
            stage: this.stage,
            event: controller.signal.aborted ? 'cancelled' : 'failed',
            ...error.detail,
            ...(controller.signal.aborted ? { category: 'cancelled' as const } : {}),
            durationMs: Math.round(performance.now() - started),
          })
          this.state.error = `${this.committedOutcomeMessage()} ${error.message} Diagnostic reference: ${this.attemptId}`
          if (error.authRejected) this.connected = false
        })
      ),
      Effect.ensuring(
        Effect.sync(() => {
          this.state.phase = this.connected ? 'connected' : 'disconnected'
        })
      )
    )
    this.operation = Effect.runPromise(work).finally(() => {
      clearTimeout(timeout)
      const cancelled = controller.signal.aborted
      controller.abort()
      if (cancelled && this.brokerFactory) {
        inCredentialScope(controller.signal,() => { try { this.broker.close() } catch {} })
        this.broker = this.brokerFactory(); this.observeBroker()
        this.connected = false; this.state.phase = 'disconnected'
      }
      this.attemptId = null
      this.historyRun = null
      this.activeOutcome = null
      this.operation = null
      this.controller = null
    })
    return true
  }
  login(phone: string, pin: string): boolean { return this.authenticate({ phone, pin }) }
  authenticate(input: unknown): boolean {
    const provider = this.store.registry.brokerProvider(this.store.connections.get(this.store.connections.defaultId)!.providerId)
    if (!provider || !this.store.connections.get(this.store.connections.defaultId)?.enabled) return false
    const auth = validateAuth(provider.auth, input)
    return this.start('connecting', async (signal) => {
      this.connected = false
      await this.broker.authenticate(auth, signal, (state) => {
        this.guard(signal)
        if (state !== 'awaiting-approval') return
        this.state.phase = 'awaiting-approval'
        this.stage = 'awaiting-approval'
      })
      this.guard(signal)
      this.connected = true
      this.store.setAutoRestore(true)
      await this.import(signal)
    })
  }
  restore(): boolean {
    return this.start('restoring', async (signal) => {
      if (!this.store.autoRestoreEnabled()) {
        this.connected = false
        return
      }
      this.connected = false
      const restored = await this.broker.restore(signal)
      this.guard(signal)
      this.connected = restored
      if (this.connected) await this.import(signal)
    })
  }
  sync(): boolean {
    if (!this.connected) return this.restore()
    return this.start('syncing', (signal) => this.import(signal))
  }
  overview() {
    return this.store.overview()
  }
  exposure(valuations = this.overview(), progress = this.development()) {
    const providerAttempts = this.store.providerAttempts()
    return {
      ...withSourceReadiness(
        exposure(
          valuations,
          this.store.selectedCompositions(),
          this.store.compositionAttempt(),
          this.compositions.refreshing
        ),
        progress.funds
      ),
      warning: [this.compositions.warning, ...Object.entries(this.store.allocationWarnings).map(([isin, warning]) => `${isin}: ${warning}`), ...Object.entries(this.store.inspectionWarnings).map(([isin, warning]) => `${isin}: ${warning}`)].filter(Boolean).join(' ') || null,
      sourceAttempts: { ...this.store.issuerAttempts(), ...providerAttempts },
      issuerRefresh: this.issuerRefresh.status(),
    }
  }
  sources() {
    return this.store.sources()
  }
  coverage() {
    const valuations = this.overview(), progress = this.development()
    const result = this.exposure(valuations, progress)
    return coverageReport(valuations, result, progress, {
      failed: result.refreshFailed || Object.values(result.sourceAttempts).some(attempt => attempt.status === 'failed') ||
        this.store.sources().some(source => ['quotes', 'instrumentDetails'].includes(source.id) && ['failed', 'partial'].includes(source.status)),
      warning: result.warning,
    })
  }
  development(): DevelopmentProgress {
    const selected = this.store.selectedCompositions()
    const inspections = this.store.selectedInspections()
    const progress = issuerReadiness(developmentProgress(
      this.store.combinedSnapshot(), this.store.sources(), selected.find(source => source.fundIsin === 'IE0031442068') ?? null, this.store.compositionAttempt(),
      this.evidenceDirectory, this.state.phase, Date.now(), inspections
    ), selected, this.evidenceDirectory)
    return this.store.inspectionWarnings && Object.keys(this.store.inspectionWarnings).length
      ? { ...progress, evidence: { ...progress.evidence, diagnostics: [...progress.evidence.diagnostics, ...Object.entries(this.store.inspectionWarnings).map(([isin, warning]) => `${isin}: ${warning}`)] } }
      : progress
  }
  developmentFund(isin: string): DevelopmentFundDetail | null {
    if (!knownDevelopmentIsin(isin)) return null
    const progress = this.development()
    const found = developmentFund(progress, this.store.combinedSnapshot(), this.evidenceDirectory, isin, this.store.selectedInspections())
    if (!found) return null
    const selected = this.store.selectedCompositions().find(source => source.fundIsin === isin) ?? null
    const fund = iusaDetail(found, progress, selected)
    const valuation = this.overview()
    return { ...fund, valuation: fundValuation(isin, valuation),
      illustrative: fund.inspection ? undefined : illustrativeValues(fund, fund.rows, valuation, selected) }
  }
  extract(mode: 'refresh' | 'continue' | 'history-batch'): boolean {
    if (!this.connected || !this.broker.readData) return false
    return this.start(
      'syncing',
      async (signal) => {
        this.activeOutcome = { holdings: null, valuation: 'not-requested', sources: [] }
        this.stage = 'data_extraction'
        let nextMode = mode
        for (let batch = 0; batch < (mode === 'history-batch' ? 1 : 100); batch++) {
          await this.broker.readData!(
            this.store.sources(),
            (source) => this.saveOperationSource(source, signal),
            signal,
            nextMode
          )
          const sources = this.store.sources()
          const history = sources.find((s) => s.id === 'timelineTransactions'),
            details = sources.find((s) => s.id === 'timelineDetails')
          if (history?.status === 'failed' || details?.status === 'failed') break
          const h = history?.payload,
            d = details?.payload
          const moreHistory = h && typeof h === 'object' && !Array.isArray(h) && !!h.nextCursor
          const moreDetails =
            d &&
            typeof d === 'object' &&
            !Array.isArray(d) &&
            typeof d.remaining === 'number' &&
            d.remaining > 0
          if (!moreHistory && !moreDetails) break
          nextMode = 'continue'
        }
      },
      'extraction'
    )
  }
  logout(): boolean {
    if (this.operation) return false
    this.attemptId = randomUUID()
    this.operationName = 'logout'
    this.record({ stage: 'logout', event: 'started', category: 'none', durationMs: 0 })
    this.store.setAutoRestore(false)
    this.connected = false
    this.state = { ...this.state, phase: 'disconnected', error: null }
    try {
      credentialCleanup(() => this.broker.logout())
      this.record({ stage: 'logout', event: 'succeeded', category: 'none', durationMs: 0 })
    } catch {
      this.record({
        stage: 'credential_store',
        event: 'failed',
        category: 'credential_store',
        durationMs: 0,
      })
      this.state.error =
        'Disconnected, but the saved session could not be removed from the system credential store. Automatic reconnection is disabled. Retry forgetting the session.'
    }
    this.attemptId = null
    return true
  }
  cancel(): void {
    this.controller?.abort()
  }
  async settled(): Promise<void> {
    await this.operation
  }
  async close(): Promise<void> {
    this.cancel()
    await this.connections.close()
    await this.issuerRefresh.close()
    await this.compositions.close()
    await this.settled()
    credentialCleanup(() => this.broker.close())
    this.store.close()
  }
}
