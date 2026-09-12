import { overview } from './overview'
import { randomUUID } from 'node:crypto'
import { classifyError, type Diagnostic, type DiagnosticStage } from './diagnostics'
import { Data, Effect } from 'effect'
import { TRAuthError } from 'trade-republic-sdk'
import { brokerError, type Broker } from './broker'
import type { OperationOutcome, Status } from './model'
import { SnapshotStore } from './store'
import { CompositionService } from './composition-service'
import { exposure } from './exposure'
import type { DataSource } from './explorer'

class OperationFailed extends Data.TaggedError('OperationFailed')<{
  message: string
  authRejected: boolean
  detail: ReturnType<typeof classifyError>
}> {}
export class PortfolioService {
  readonly compositions: CompositionService
  private state: Omit<Status, 'snapshot' | 'sessionWarning' | 'lastDiagnostic' | 'outcome'> = {
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
  constructor(
    private readonly broker: Broker,
    private readonly store: SnapshotStore
  ) {
    this.compositions = new CompositionService(store)
    this.broker.observe?.((event) => this.record(event))
  }
  private record(
    event: Pick<
      Diagnostic,
      'stage' | 'event' | 'category' | 'durationMs' | 'httpStatus' | 'networkCode' | 'sourceId'
    >
  ): void {
    try {
      this.store.recordDiagnostic({
        ...event,
        ...(this.activeOutcome ? { outcome: this.activeOutcome } : {}),
        attemptId: this.attemptId ?? randomUUID(),
        operation: this.attemptId ? this.operationName : 'background',
        at: new Date().toISOString(),
      })
    } catch {
      this.diagnosticFailure = true
    }
  }
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
    return {
      ...this.state,
      outcome: this.activeOutcome ?? this.store.latestOutcome(),
      snapshot: this.store.latest(),
      sessionWarning: this.diagnosticFailure
        ? 'Local diagnostics could not be saved. Stop retries until local storage is checked.'
        : this.broker.warning(),
      lastDiagnostic: this.store.diagnostics()[0] ?? null,
    }
  }
  private async import(signal: AbortSignal): Promise<void> {
    this.activeOutcome = { holdings: null, valuation: 'not-requested', sources: [] }
    this.state.phase = 'syncing'
    this.stage = 'syncing'
    this.state.lastAttemptAt = new Date().toISOString()
    const snapshot = await this.broker.fetch(signal)
    signal.throwIfAborted()
    this.stage = 'persisting'
    const snapshotId = this.store.save(snapshot)
    this.activeOutcome!.holdings = { snapshotId, fetchedAt: snapshot.fetchedAt }
    this.record({ stage: 'persisting', event: 'succeeded', category: 'none', durationMs: 0 })
    if (this.broker.readData) {
      this.stage = 'data_extraction'
      this.activeOutcome!.valuation = 'refreshing'
      await this.broker.readData(
        this.store.sources(),
        (source) => this.saveOperationSource(source, signal),
        signal,
        'valuation'
      )
      signal.throwIfAborted()
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
    signal.throwIfAborted()
    this.store.saveSource(source)
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
    task: (signal: AbortSignal) => Promise<void>
  ): boolean {
    if (this.operation) return false
    this.attemptId = randomUUID()
    this.operationName =
      phase === 'connecting' ? 'login' : phase === 'restoring' ? 'restore' : 'sync'
    this.stage = phase
    this.activeOutcome = null
    const started = performance.now()
    this.record({ stage: phase, event: 'started', category: 'none', durationMs: 0 })
    this.state.phase = phase
    this.state.error = null
    const controller = new AbortController()
    this.controller = controller
    const work = Effect.tryPromise({
      try: () => task(controller.signal),
      catch: (error) =>
        new OperationFailed({
          message: brokerError(error),
          authRejected:
            error instanceof TRAuthError || classifyError(error).category === 'authentication',
          detail: classifyError(error),
        }),
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          this.record({
            stage: this.stage,
            event: this.activeOutcome?.valuation === 'partial' ? 'partial' : 'succeeded',
            category: 'none',
            durationMs: Math.round(performance.now() - started),
          })
        )
      ),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          if (this.activeOutcome?.valuation === 'refreshing')
            this.activeOutcome.valuation = controller.signal.aborted ? 'cancelled' : 'failed'
          this.record({
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
      this.attemptId = null
      this.activeOutcome = null
      this.operation = null
      this.controller = null
    })
    return true
  }
  login(phone: string, pin: string): boolean {
    return this.start('connecting', async (signal) => {
      this.connected = false
      await this.broker.login(phone, pin, signal, () => {
        this.state.phase = 'awaiting-approval'
        this.stage = 'awaiting-approval'
      })
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
      this.connected = await this.broker.restore(signal)
      if (this.connected) await this.import(signal)
    })
  }
  sync(): boolean {
    if (!this.connected) return this.restore()
    return this.start('syncing', (signal) => this.import(signal))
  }
  overview() {
    return overview(
      this.store.latest(),
      this.store.sources(),
      Date.now(),
      this.store.quantityObservations()
    )
  }
  exposure() {
    return {
      ...exposure(
        this.overview(),
        this.store.composition(),
        this.store.compositionAttempt(),
        this.compositions.refreshing
      ),
      warning: this.compositions.warning,
    }
  }
  sources() {
    return this.store.sources()
  }
  extract(mode: 'refresh' | 'continue'): boolean {
    if (!this.connected || !this.broker.readData) return false
    return this.start('syncing', async (signal) => {
      this.activeOutcome = { holdings: null, valuation: 'not-requested', sources: [] }
      this.stage = 'data_extraction'
      let nextMode = mode
      for (let batch = 0; batch < 100; batch++) {
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
    })
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
      this.broker.logout()
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
    await this.compositions.close()
    await this.settled()
    this.broker.close()
    this.store.close()
  }
}
