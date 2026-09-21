import { scopedVault, inCredentialScope, credentialSignal, credentialCleanup } from './credential-scope'
import { boundedOperation } from './bounded-operation'
import { admitHoldings } from './broker-holdings'
import { randomUUID } from 'node:crypto'
import type { SnapshotStore } from './store'
import { BrokerFailure, validateAuth, type Broker, type SessionVault } from './broker-contract'
import { connectionVault } from './connection-vault'
import { classifyError, type Diagnostic } from './diagnostics'

type DefaultConnection = {
  status(): { connected: boolean; phase: string; error: string | null; activeOperation: unknown }
  authenticate(input: unknown): boolean
  sync(): boolean
  restore(): boolean
  cancel(): void
  logout(): boolean
  suspend?(): void
  committed?(): void
  settled(): Promise<void>
}
type Runtime = { broker: Broker; connected: boolean; phase: string; error: string | null; operation: Promise<void> | null; controller: AbortController | null }
export class BrokerConnections {
  private readonly runtime = new Map<string, Runtime>()
  private closed = false
  constructor(private readonly store: SnapshotStore, private readonly primary: DefaultConnection,
    private readonly vault: (providerId: string, connectionId: string, defaultId: string) => SessionVault = connectionVault) {}
  providers() { return this.store.registry.brokerProviders().map(({ id, version, auth }) => ({ id, version, auth })) }
  list() {
    return this.store.connections.list().map(c => {
      const runtime = c.id === this.store.connections.defaultId ? this.primary.status() : this.runtime.get(c.id)
      const provider = this.store.registry.brokerProvider(c.providerId)
      const diagnostics = this.store.diagnostics().filter(d => d.connectionId === c.id)
      const terminal = diagnostics.find(d => d.terminal)
      const savedError = terminal && ['failed','cancelled'].includes(terminal.event) ? `Last operation ${terminal.event}. Saved data is retained. Diagnostic reference: ${terminal.attemptId}` : null
      return { ...c, available: !!provider && provider.version === c.providerVersion,
        connected: runtime?.connected ?? false, phase: runtime?.phase ?? 'disconnected', error: runtime?.error ?? savedError,
        active: runtime && 'activeOperation' in runtime ? !!runtime.activeOperation : !!runtime?.operation,
        diagnostics,
        savedHoldingsAt: this.store.connectionInputs().find(i => i.connection.id === c.id)?.snapshot?.fetchedAt ?? null }
    })
  }
  add(providerId: string) {
    if (this.closed) throw new BrokerFailure({ category: 'connection' })
    const provider = this.store.registry.brokerProvider(providerId)
    if (!provider) throw new BrokerFailure({ category: 'validation' })
    return this.store.connections.add(provider.id, provider.version)
  }
  private configured(id: string) {
    const connection = this.store.connections.get(id)
    const provider = connection && this.store.registry.brokerProvider(connection.providerId)
    if (!connection || !connection.enabled || !provider || provider.version !== connection.providerVersion || this.closed) throw new BrokerFailure({ category: 'connection' })
    return { connection, provider }
  }
  private get(id: string): Runtime {
    const { connection, provider } = this.configured(id)
    let runtime = this.runtime.get(id)
    if (!runtime) {
      runtime = { broker: provider.create({ connectionId: id, vault: scopedVault(this.vault(connection.providerId,id,this.store.connections.defaultId)) }), connected: false, phase: 'disconnected', error: null, operation: null, controller: null }
      this.runtime.set(id, runtime)
    }
    return runtime
  }
  private start(id: string, operation: 'login' | 'restore' | 'sync', input?: unknown) {
    const { provider } = this.configured(id)
    const auth = operation === 'login' ? validateAuth(provider.auth,input) : null
    this.store.registry.activate(new AbortController().signal)
    this.configured(id)
    if (id === this.store.connections.defaultId) {
      return operation === 'login' ? this.primary.authenticate(auth) : operation === 'sync' ? this.primary.sync() : this.primary.restore()
    }
    const runtime = this.get(id)
    if (runtime.operation) return false
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)])
    runtime.controller = controller
    runtime.phase = operation === 'login' ? 'connecting' : 'restoring'
    runtime.error = null
    const attemptId = this.store.history.start('broker-sync'), started = performance.now()
    const record = (event: Diagnostic['event'], category: Diagnostic['category'], terminal = false) => this.store.recordDiagnostic({ connectionId: id, providerId: provider.id, attemptId, operation, stage: 'syncing', event, category, at: new Date().toISOString(), durationMs: Math.round(performance.now()-started), terminal })
    const guard = () => { signal.throwIfAborted(); this.configured(id) }
    record('started','none')
    runtime.broker.observe?.(event => {
      // Operation-local sink: no raw errors, credentials or connector payloads.
      if (!signal.aborted && credentialSignal() === signal) this.store.recordDiagnostic({ stage:event.stage,event:event.event,category:event.category,durationMs:event.durationMs,httpStatus:event.httpStatus,networkCode:event.networkCode,sourceId:event.sourceId, connectionId: id, providerId: provider.id, attemptId, operation, at: new Date().toISOString() })
    })
    const work = inCredentialScope(signal,async () => {
      if (operation === 'login') {
        await runtime.broker.authenticate(auth!,signal,state => { guard(); runtime.phase = state })
        guard(); runtime.connected = true
        this.store.connections.configure(id,true,true)
      } else if (!runtime.connected) {
        if (!this.store.connections.get(id)!.restore) return
        const restored = await runtime.broker.restore(signal)
        guard(); runtime.connected = restored
        if (!runtime.connected) return
      }
      runtime.phase = 'syncing'
      if (!runtime.broker.readHoldings) throw new BrokerFailure({ category: 'validation' })
      const snapshot = admitHoldings(await runtime.broker.readHoldings(signal))
      guard()
      // The connector's fetch contract is a complete snapshot of this connection.
      // An adapter must reject partial account discovery before this boundary.
      this.store.connections.saveSnapshot(id,snapshot)
      this.store.history.capture(attemptId,'holdings')
      this.primary.committed?.()
      let partial = false
      if (runtime.broker.readObservations) {
        const saved = new Set<string>()
        await runtime.broker.readObservations(this.store.connections.inputs(this.store.connections.get(id)!).observations, observation => {
          guard(); this.store.connections.saveObservation(id,observation)
          saved.add(observation.sourceId); partial ||= observation.completeness !== 'success'
          this.store.history.capture(attemptId,'valuation')
        },signal,this.store.excludedQuoteIsins(id))
        partial ||= saved.size < 3
      } else partial = true
      if(runtime.broker.readEvents) {
        let eventFailure=false
        await runtime.broker.readEvents(this.store.ledger.state(id), batch=>{guard();this.store.ledger.save(id,batch);eventFailure=batch.coverage.acquisition==='failed';partial ||= batch.coverage.failedDetails>0||batch.coverage.recentGap},signal,'recent')
        if(eventFailure)throw new BrokerFailure({category:'unexpected'})
      }
      guard()
      this.store.history.finish(attemptId,partial ? 'partial' : 'succeeded')
      record(partial ? 'partial' : 'succeeded','none',true)
    })
    runtime.operation = boundedOperation(work,signal).catch(error => {
      const category = signal.aborted ? 'cancelled' : classifyError(error).category
      if (category === 'authentication') runtime.connected = false
      runtime.error = `Broker operation ${category}. Saved data is retained. Diagnostic reference: ${attemptId}`
      this.store.history.finish(attemptId,signal.aborted ? 'cancelled' : 'failed')
      record(signal.aborted ? 'cancelled' : 'failed',category,true)
    }).finally(() => {
      this.store.history.finish(attemptId,'succeeded')
      const cancelled = signal.aborted
      controller.abort() // revoke every continuation, including completed work
      if (cancelled) {
        inCredentialScope(signal,() => { try { runtime.broker.close() } catch {} })
        this.runtime.delete(id)
      }
      runtime.phase = runtime.connected ? 'connected' : 'disconnected'
      runtime.operation = null; runtime.controller = null
      runtime.broker.observe?.(() => {})
    })
    return true
  }
  authenticate(id: string,input: unknown) { return this.start(id,'login',input) }
  sync(id: string) { return this.start(id,'sync') }
  restore(id: string) { return this.start(id,'restore') }
  cancel(id: string) {
    if (!this.store.connections.get(id)) throw new BrokerFailure({ category: 'validation' })
    if (id === this.store.connections.defaultId) this.primary.cancel()
    else this.runtime.get(id)?.controller?.abort()
  }
  async settled(id?: string) {
    if (!id || id === this.store.connections.defaultId) await this.primary.settled()
    await Promise.all([...this.runtime].filter(([key]) => !id || key === id).map(([,r]) => r.operation))
  }
  async enable(id: string, enabled: boolean) {
    const connection = this.store.connections.get(id)
    if (!connection) throw new BrokerFailure({ category: 'validation' })
    this.store.connections.configure(id,enabled,connection.restore)
    if (!enabled) {
      this.cancel(id); await this.settled(id)
      if (id === this.store.connections.defaultId) this.primary.suspend?.()
      const runtime = this.runtime.get(id)
      if (runtime) { credentialCleanup(() => runtime.broker.close()); this.runtime.delete(id) }
    }
  }
  async logout(id: string) {
    const connection = this.store.connections.get(id)
    if (!connection) throw new BrokerFailure({ category: 'validation' })
    this.cancel(id); await this.settled(id)
    this.store.connections.configure(id,connection.enabled,false)
    if (id === this.store.connections.defaultId) return this.primary.logout()
    const runtime = this.runtime.get(id)
    if (runtime) { runtime.connected = false; runtime.phase = 'disconnected'; credentialCleanup(() => runtime.broker.logout()) }
    else credentialCleanup(() => { this.vault(connection.providerId,id,this.store.connections.defaultId).deleteCredential() })
    return true
  }
  refreshOtherConnections() {
    for (const connection of this.store.connections.list()) if (connection.id !== this.store.connections.defaultId && connection.enabled && connection.restore) {
      try { this.sync(connection.id) } catch { /* Unavailable plugin remains visible in list(). */ }
    }
  }
  async close() {
    this.closed = true
    for (const runtime of this.runtime.values()) runtime.controller?.abort()
    await Promise.all([...this.runtime.values()].map(r => r.operation))
    for (const runtime of this.runtime.values()) credentialCleanup(() => runtime.broker.close())
    this.runtime.clear()
  }
}
