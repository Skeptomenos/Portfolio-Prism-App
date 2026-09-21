import { randomUUID } from 'node:crypto'
import { Effect } from 'effect'
import { acquireComposition, CompositionError, pilotIsin } from './composition'
import { classifyError, type Diagnostic } from './diagnostics'
import type { SnapshotStore } from './store'

export class CompositionService {
  private pending: Promise<void> | null = null
  private controller: AbortController | null = null
  warning: string | null = null
  constructor(
    private store: SnapshotStore,
    private acquire = acquireComposition
  ) {}
  get refreshing() {
    return this.pending !== null
  }
  refresh(automatic = false): boolean {
    if (this.pending || !this.store.combinedSnapshot()?.positions.some((p) => p.isin === pilotIsin))
      return false
    const previous = this.store.compositionAttempt()
    if (
      automatic &&
      previous &&
      previous.code !== 'cancelled' &&
      Date.now() - Date.parse(previous.at) < 86400000
    )
      return false
    const id = randomUUID(),
      at = new Date().toISOString(),
      started = performance.now()
    const controller = new AbortController()
    this.controller = controller
    this.warning = null
    const record = (event: Diagnostic['event'], error?: unknown) => {
      const detail = controller.signal.aborted
        ? { category: 'cancelled' as const }
        : error instanceof CompositionError
          ? {
              category: error.code === 'http' ? ('http' as const) : ('validation' as const),
              ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
            }
          : error
            ? classifyError(error)
            : { category: 'none' as const }
      try {
        this.store.recordDiagnostic({
          attemptId: id,
          operation: 'composition',
          stage: 'composition',
          event,
          at: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started),
          ...detail,
        })
      } catch {
        this.warning =
          'Composition diagnostics could not be saved. Check local storage before retrying.'
      }
    }
    this.store.history.start('composition-refresh', id, at)
    record('started')
    this.pending = Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const result = await this.acquire(
            AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
          )
          controller.signal.throwIfAborted()
          this.store.saveComposition(result.raw, result.composition.retrievedAt, {
            at,
            id,
            status: 'success',
            code: null,
          })
          this.store.history.capture(id, 'composition')
          this.store.history.finish(id, 'succeeded')
          record('succeeded')
        },
        catch: (error) => error,
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            const code = controller.signal.aborted
              ? 'cancelled'
              : error instanceof CompositionError
                ? error.code
                : classifyError(error).category
            try {
              this.store.saveCompositionAttempt({ at, id, status: 'failed', code })
            } catch {
              this.warning =
                'Composition refresh failed and its status could not be saved. Check local storage.'
            }
            this.store.history.finish(id, controller.signal.aborted ? 'cancelled' : 'failed')
            record(controller.signal.aborted ? 'cancelled' : 'failed', error)
          })
        )
      )
    ).finally(() => {
      this.pending = null
      this.controller = null
    })
    return true
  }
  async settled() {
    await this.pending
  }
  async close() {
    this.controller?.abort()
    await this.pending
  }
}
