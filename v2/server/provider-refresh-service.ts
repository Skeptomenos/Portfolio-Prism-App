import { randomUUID } from 'node:crypto'
import { providerResolution, ProviderError, type CompositionProvider, type ProviderAttempt, type ProviderErrorCode, type ProviderEvidence } from './composition-provider'
import type { InspectionEvidence } from './composition-inspection'
import { providerContext } from './provider-http'
import type { SnapshotStore } from './store'
import { createCompositionRegistry, type PluginRegistry } from './plugin-registry'
import { Decimal } from 'decimal.js'
import { Effect } from 'effect'

const DAY_MS = 86_400_000
const OPERATION_TIMEOUT_MS = 90_000

type RefreshStatus = {
  active: boolean
  automatic: boolean
  currentFundIsin: string | null
  attempts: Record<string, ProviderAttempt>
  warning: string | null
}

function errorCode(error: unknown): ProviderErrorCode {
  if (error instanceof ProviderError) return error.code
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  if (error instanceof Error && /abort|cancel/i.test(error.message)) return 'cancelled'
  if (error instanceof Error && /size limit|budget/i.test(error.message)) return 'size'
  if (error && typeof error === 'object' && 'httpStatus' in error) return 'http'
  return 'network'
}

export class ProviderRefreshService {
  private pending: Promise<void> | null = null
  private controller: AbortController | null = null
  private currentFundIsin: string | null = null
  private automatic = false
  private automaticQueued = false
  private closed = false
  private warning: string | null = null
  private readonly registry: PluginRegistry
  constructor(
    private readonly store: SnapshotStore,
    capabilities: PluginRegistry | readonly CompositionProvider[] = store.registry,
    private readonly contextFactory: typeof providerContext = providerContext
  ) {
    this.registry = capabilities instanceof Object && 'capabilityForFund' in capabilities
      ? capabilities as PluginRegistry
      : createCompositionRegistry(capabilities as readonly CompositionProvider[])
  }

  get refreshing() { return this.pending !== null }
  status(): RefreshStatus {
    return { active: this.refreshing, automatic: this.automatic, currentFundIsin: this.currentFundIsin, attempts: this.store.providerAttempts(), warning: this.warning }
  }

  refresh(automatic = false): boolean {
    if (this.closed) return false
    if (this.pending) {
      if (automatic) this.automaticQueued = true
      return false
    }
    const controller = new AbortController()
    this.registry.activate(controller.signal)
    const held = this.store.combinedSnapshot()?.positions ?? []
    const funds = [...new Set(held.filter(p => new Decimal(p.quantity).gt(0)).map(p => p.isin))]
      .filter(isin => {
        const entry = this.registry.capabilityForFund(isin, true)
        return entry !== null && this.registry.state(entry.plugin.id) !== 'disabled'
      })
    if (!funds.length) return false
    const attempts = this.store.providerAttempts()
    if (automatic) funds.splice(0, funds.length, ...funds.filter(isin => {
      const attempt = attempts[isin]
      return !attempt || attempt.code === 'cancelled' || Date.now() - Date.parse(attempt.at) >= DAY_MS
    }))
    if (!funds.length) return false
    this.controller = controller
    this.automatic = automatic
    this.warning = null
    const runId = this.store.history.start('composition-refresh')
    this.pending = Effect.runPromise(Effect.tryPromise({ try: () => this.run(funds, controller, runId), catch: error => error })).finally(() => {
      this.pending = null
      this.controller = null
      this.currentFundIsin = null
      this.automatic = false
      const queued = this.automaticQueued
      this.automaticQueued = false
      if (queued && !this.closed) this.refresh(true)
    })
    return true
  }

  private async run(funds: string[], controller: AbortController, runId: string): Promise<void> {
    let successes = 0, failures = 0
    for (const fundIsin of funds) {
      this.currentFundIsin = fundIsin
      const operationSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(OPERATION_TIMEOUT_MS)])
      const entry = this.registry.capabilityForFund(fundIsin, true)
      if (!entry || this.registry.state(entry.plugin.id) === 'disabled') continue
      const id = randomUUID(), at = new Date().toISOString()
      let attempt: ProviderAttempt
      try {
        operationSignal.throwIfAborted()
        if (this.registry.state(entry.plugin.id) !== 'active') throw new ProviderError('activation')
        operationSignal.throwIfAborted()
        let evidence: ProviderEvidence | InspectionEvidence
        if (entry.kind === 'composition') {
          const result = await (entry.provider as CompositionProvider).acquire(fundIsin, this.contextFactory(operationSignal))
          if (result.state !== 'publication') {
            throw new ProviderError('diagnostic' in result ? result.diagnostic : 'format')
          }
          evidence = result.evidence
          this.registry.decodeProviderEvidence(evidence)
        } else {
          const result = await entry.provider.acquire(fundIsin, this.contextFactory(operationSignal))
          if (result.state !== 'observation') {
            throw new ProviderError('diagnostic' in result ? result.diagnostic : 'format')
          }
          evidence = result.evidence
          this.registry.decodeInspectionEvidence(evidence)
        }
        operationSignal.throwIfAborted()
        attempt = { id, at, providerId: entry.provider.manifest.id, status: 'success', code: null, outcome: 'updated', resolution: entry.kind === 'inspection' ? 'The latest compatible issuer inspection was saved.' : 'The latest compatible issuer composition was saved.' }
        let outcome: 'updated' | 'unchanged'
        try {
          outcome = entry.kind === 'composition'
            ? this.store.saveProviderEvidence(evidence as ProviderEvidence, attempt, this.registry)
            : this.store.saveInspectionEvidence(evidence as InspectionEvidence, attempt, this.registry)
        } catch (error) {
          if (error instanceof ProviderError) throw error
          throw new ProviderError('storage')
        }
        this.store.history.capture(runId, 'composition')
        successes++
        attempt = { ...attempt, outcome, resolution: outcome === 'unchanged' ? `The compatible issuer ${entry.kind === 'inspection' ? 'inspection' : 'publication'} is unchanged.` : attempt.resolution }
      } catch (error) {
        failures++
        const code = controller.signal.aborted ? 'cancelled' : errorCode(error)
        attempt = { id, at, providerId: entry.provider.manifest.id, status: 'failed', code, outcome: code === 'cancelled' ? 'cancelled' : 'failed', resolution: providerResolution[code], ...(error instanceof ProviderError && error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}) }
        if (code !== 'cancelled') this.warning = `${fundIsin}: ${attempt.resolution}`
        try { this.store.recordProviderAttempt(fundIsin, attempt) } catch { this.warning = 'Provider attempt status could not be saved. Check local storage before retrying.' }
        if (controller.signal.aborted) { this.store.history.recordCheck(runId, fundIsin, attempt); break }
      }
      this.store.history.recordCheck(runId, fundIsin, attempt)
    }
    this.store.history.finish(runId, controller.signal.aborted ? 'cancelled' : failures ? successes ? 'partial' : 'failed' : 'succeeded', failures ? [{ code: 'provider-incomplete', severity: 'warning', message: 'One or more issuer checks did not complete. Saved inputs and checkpoints are retained.', nextAction: 'Inspect issuer diagnostics and retry the affected source.', diagnosticId: runId }] : [])
  }

  cancel() { this.automaticQueued = false; this.controller?.abort() }
  async settled() { while (this.pending) await this.pending }
  async close() { this.closed = true; this.cancel(); await this.settled() }
}

export type { RefreshStatus }
