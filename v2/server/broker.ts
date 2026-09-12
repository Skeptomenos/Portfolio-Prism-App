import { extractData, sdkTransport, type DataSource } from './explorer'
import { classifyError, httpStage, type Diagnostic, type DiagnosticStage } from './diagnostics'
import { createHash } from 'node:crypto'
import { TRClient, TRAuthError, TRHttpError, type Socket } from 'trade-republic-sdk'
import { Entry } from '@napi-rs/keyring'
import WebSocket from 'ws'
import { decodeSnapshot, type Snapshot } from './model'

export type BrokerObserver = (
  event: Pick<
    Diagnostic,
    'stage' | 'event' | 'category' | 'durationMs' | 'httpStatus' | 'networkCode' | 'sourceId'
  >
) => void
export interface Broker {
  readData?(
    previous: DataSource[],
    save: (source: DataSource) => void,
    signal: AbortSignal,
    mode: 'refresh' | 'continue' | 'valuation'
  ): Promise<void>
  observe?(observer: BrokerObserver): void
  login(phone: string, pin: string, signal: AbortSignal, pending: () => void): Promise<void>
  restore(signal: AbortSignal): Promise<boolean>
  fetch(signal: AbortSignal): Promise<Snapshot>
  logout(): void
  close(): void
  warning(): string | null
}

export interface SessionVault {
  getPassword(): string | null
  setPassword(value: string): void
  deleteCredential(): boolean
}
export class TradeRepublicBroker implements Broker {
  private observer: BrokerObserver = () => {}
  observe(observer: BrokerObserver): void {
    this.observer = observer
  }
  private client: TRClient
  private sessionWarning: string | null = null
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
      if (response?.products?.length) throw new Error('Unrecognized portfolio products')
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
    mode: 'refresh' | 'continue' | 'valuation'
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
