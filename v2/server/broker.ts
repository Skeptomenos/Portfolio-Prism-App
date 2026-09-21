import { tradeRepublicObservation } from './trade-republic-observation'
import { valuationSource } from './history-observation'
import type { FinancialObservation } from './financial-observation'
import { extractData, sdkTransport, type DataSource } from './explorer'
import type { DiagnosticStage } from './diagnostics'
import { classifyTradeRepublicError as classifyError, httpStage } from './trade-republic-errors'
import { createHash } from 'node:crypto'
import { TRClient, TRAuthError, TRHttpError, type Socket } from 'trade-republic-sdk'
import { Entry } from '@napi-rs/keyring'
import WebSocket from 'ws'
import { decodeSnapshot, type Snapshot } from './model'

import { BrokerFailure, validateAuth, brokerContractVersion, type Broker, type BrokerObserver, type SessionVault, type AuthInput, type AuthState, type BrokerProvider } from './broker-contract'
export type { Broker, BrokerObserver, SessionVault } from './broker-contract'

export const tradeRepublicAuth = { fields: [
  { id: 'phone', label: 'Phone number', secret: false, pattern: '^\\+[1-9]\\d{6,14}$', maxLength: 16 },
  { id: 'pin', label: 'PIN', secret: true, pattern: '^\\d{4}$', maxLength: 4 },
], approval: 'external', restore: true } as const

export class TradeRepublicBroker implements Broker {
  private observer: BrokerObserver = () => {}
  observe(observer: BrokerObserver): void {
    this.observer = observer
  }
  private client: TRClient
  private sessionWarning: string | null = null
  private accounts: string[] = []
  private activeSignal: AbortSignal | undefined
  constructor(
    private readonly entry: SessionVault = new Entry('PortfolioPrismV2', 'trade-republic-session'),
    private readonly transport: typeof fetch = fetch
  ) {
    this.client = this.makeClient()
  }
  private makeClient(session?: string): TRClient {
    return new TRClient({
      session,
      validate: 'off',
      // The Node native WebSocket cannot reliably carry session headers across supported Node versions.
      socket: (url, protocols, options) => {
        const ws = new WebSocket(url, protocols, options)
        const socket: Socket = {
          get readyState() {
            return ws.readyState
          },
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          send: (data) => ws.send(data),
          close: (code, reason) => ws.close(code, reason),
        }
        ws.on('open', () => socket.onopen?.())
        ws.on('message', (data) => socket.onmessage?.({ data: data.toString() }))
        ws.on('error', (error) => socket.onerror?.({ error }))
        ws.on('close', (code, reason) =>
          socket.onclose?.({ code, reason: reason.toString(), wasClean: code === 1000 })
        )
        return socket
      },
      fetch: async (input, init) => {
        const signals = [AbortSignal.timeout(20_000)]
        if (init?.signal) signals.push(init.signal)
        if (this.activeSignal) signals.push(this.activeSignal)
        const started = performance.now()
        const stage = httpStage(input)
        this.observer({ stage, event: 'started', category: 'none', durationMs: 0 })
        try {
          const response = await this.transport(input, {
            ...init,
            signal: AbortSignal.any(signals),
          })
          this.observer({
            stage,
            event: response.ok ? 'succeeded' : 'failed',
            category: response.ok ? 'none' : 'http',
            httpStatus: response.status,
            durationMs: Math.round(performance.now() - started),
          })
          return response
        } catch (error) {
          this.observer({
            stage,
            event: 'failed',
            ...classifyError(error),
            durationMs: Math.round(performance.now() - started),
          })
          throw error
        }
      },
    })
  }
  private persist(): void {
    const session = this.client.exportSession()
    if (!session) return
    try {
      this.entry.setPassword(session)
      this.sessionWarning = null
    } catch {
      this.observer({
        stage: 'credential_store',
        event: 'failed',
        category: 'credential_store',
        durationMs: 0,
      })
      this.sessionWarning =
        'Session could not be saved in the system credential store. You may need to reconnect after restart.'
    }
  }
  async authenticate(input: AuthInput, signal: AbortSignal, state: (state: AuthState) => void): Promise<void> {
    const { phone, pin } = validateAuth(tradeRepublicAuth, input)
    try { await this.login(phone, pin, signal, () => state('awaiting-approval')) }
    catch (error) { throw new BrokerFailure(classifyError(error)) }
  }
  async login(phone: string, pin: string, signal: AbortSignal, pending: () => void): Promise<void> {
    this.activeSignal = signal
    try {
      await this.client.login(phone, pin, {
        signal,
        onApprovalPending: pending,
        timeoutMs: 180_000,
      })
      signal.throwIfAborted()
      this.persist()
    } finally {
      this.activeSignal = undefined
    }
  }
  async restore(signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    let session: string | null
    try {
      session = this.entry.getPassword()
    } catch {
      this.observer({
        stage: 'credential_store',
        event: 'failed',
        category: 'credential_store',
        durationMs: 0,
      })
      this.sessionWarning = 'System credential store is unavailable. Connect again to continue.'
      return false
    }
    if (!session) return false
    this.client.logout()
    this.client = this.makeClient(session)
    this.activeSignal = signal
    try {
      await this.client.refresh()
      signal.throwIfAborted()
    } finally {
      this.activeSignal = undefined
    }
    this.persist()
    return true
  }
  private async observed<T>(stage: DiagnosticStage, work: () => T | Promise<T>): Promise<T> {
    const started = performance.now()
    this.observer({ stage, event: 'started', category: 'none', durationMs: 0 })
    try {
      const result = await work()
      this.observer({
        stage,
        event: 'succeeded',
        category: 'none',
        durationMs: Math.round(performance.now() - started),
      })
      return result
    } catch (error) {
      this.observer({
        stage,
        event: 'failed',
        ...classifyError(error),
        durationMs: Math.round(performance.now() - started),
      })
      throw error
    }
  }
  async fetch(signal: AbortSignal): Promise<Snapshot> {
    const pairs = await this.observed('account_discovery', () =>
      this.client.accountPairs.get({}, { signal, timeoutMs: 30_000 })
    )
    if (!pairs || !Array.isArray(pairs.accounts)) throw new Error('Invalid account response')
    const accounts = [...new Set(pairs.accounts.map((a) => a.securitiesAccountNumber))]
    if (!accounts.length || accounts.some((a) => typeof a !== 'string' || !a))
      throw new Error('No securities account confirmed')
    const positions: Snapshot['positions'][number][] = []
    for (const account of accounts) {
      const response = await this.observed('portfolio_retrieval', () =>
        this.client.compactPortfolioByType.get({ secAccNo: account }, { signal, timeoutMs: 30_000 })
      )
      if (response?.products !== undefined && (!Array.isArray(response.products) || response.products.length))
        throw new Error('Unrecognized portfolio products')
      if (!response || !Array.isArray(response.categories))
        throw new Error('Invalid portfolio response')
      for (const category of response.categories) {
        if (!Array.isArray(category.positions)) throw new Error('Invalid category response')
        for (const row of category.positions)
          positions.push({
            account: createHash('sha256').update(account).digest('hex').slice(0, 16),
            isin: row.isin,
            name: row.name,
            quantity: row.netSize,
            instrumentType: row.instrumentType,
            averageBuyIn: row.averageBuyIn,
          })
      }
    }
    this.accounts = accounts.map(account => createHash('sha256').update(account).digest('hex').slice(0,16))
    const result = await this.observed('snapshot_validation', () =>
      decodeSnapshot({ fetchedAt: new Date().toISOString(), positions })
    )
    this.persist()
    return result
  }
  async readData(
    previous: DataSource[],
    save: (source: DataSource) => void,
    signal: AbortSignal,
    mode: 'refresh' | 'continue' | 'valuation' | 'history-batch'
  ): Promise<void> {
    this.activeSignal = signal
    try {
      await extractData(
        sdkTransport(this.client),
        previous,
        save,
        signal,
        mode,
        (sourceId, event, durationMs, detail) =>
          this.observer({ stage: 'data_extraction', sourceId, event, durationMs, ...detail })
      )
    } finally {
      this.activeSignal = undefined
    }
  }
  async readHoldings(signal: AbortSignal) {
    const snapshot = await this.fetch(signal)
    return { snapshot, completeness: snapshot.positions.length ? 'complete' as const : 'authoritative-empty' as const, accounts: this.accounts }
  }
  async readObservations(previous: readonly FinancialObservation[], save: (value: FinancialObservation) => void, signal: AbortSignal): Promise<void> {
    const legacy = previous.map(o => valuationSource({ ...o,
      instruments: o.instruments.map(i => ({ ...i, priceFactor: i.unit === 'per-security' ? 1 : null })),
      // This compatibility path does not convert new decimal strings to numbers.
      cash: o.cash.map(c => ({ ...c, amount: null })),
    }))
    await this.readData(legacy, source => {
      const value = tradeRepublicObservation(source)
      if (!value) return
      // A failed extraction retains the old source, not a newly observed balance.
      // Keep canonical decimal cash directly; the legacy numeric wire adapter must
      // neither erase it nor round it through a JavaScript number.
      const retainedCash = source.id === 'cash' && source.status === 'failed'
        ? previous.find(o => o.sourceId === 'cash') : undefined
      save(retainedCash ? { ...value, observedAt: retainedCash.observedAt, cash: retainedCash.cash } : value)
    }, signal, 'valuation')
  }
  logout(): void {
    this.client.logout()
    this.entry.deleteCredential()
  }
  close(): void {
    this.persist()
    this.client.logout()
  }
  warning(): string | null {
    return this.sessionWarning
  }
}

export function brokerError(error: unknown): string {
  if (classifyError(error).category === 'validation')
    return 'The broker data could not be validated. Check local diagnostics for the failed stage.'
  if (error instanceof TRAuthError)
    return 'Trade Republic rejected or expired the session. Connect again.'
  if (error instanceof TRHttpError && error.status === 403)
    return 'Trade Republic refused the connection.'
  return 'The operation could not complete. Retry or reconnect.'
}

export const tradeRepublicProvider: BrokerProvider = {
  id: 'trade-republic', version: '1.0.0', contractVersion: brokerContractVersion,
  auth: tradeRepublicAuth,
  create: ({ vault }) => {
    const adapter = new TradeRepublicBroker(vault)
    const safe = async <T>(work: () => Promise<T>) => { try { return await work() } catch (error) { throw new BrokerFailure(classifyError(error)) } }
    return {
      authenticate: (input, signal, state) => safe(() => adapter.authenticate(input, signal, state)),
      restore: signal => safe(() => adapter.restore(signal)),
      readHoldings: signal => safe(() => adapter.readHoldings(signal)),
      fetch: signal => safe(() => adapter.fetch(signal)),
      readObservations: (previous, save, signal) => safe(() => adapter.readObservations(previous, save, signal)),
      readData: (previous, save, signal, mode) => safe(() => adapter.readData(previous, save, signal, mode)),
      observe: observer => adapter.observe(observer), logout: () => adapter.logout(), close: () => adapter.close(), warning: () => adapter.warning(),
    }
  },
}
