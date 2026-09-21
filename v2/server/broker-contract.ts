import type { HoldingsObservation } from './broker-holdings'
import type { Snapshot } from './model'
import type { FinancialObservation } from './financial-observation'
import type { Diagnostic, DiagnosticDetail } from './diagnostics'
import type { DataSource } from './explorer'

export const brokerContractVersion = 'broker-connector/1'
export type AuthInput = Readonly<Record<string, string>>
export type AuthState = 'disconnected' | 'connecting' | 'awaiting-approval' | 'connected'
export interface AuthField { id: string; label: string; secret: boolean; pattern: string; maxLength: number }
export interface BrokerAuth { fields: readonly AuthField[]; approval: 'external' | 'none'; restore: boolean }
export interface SessionVault { getPassword(): string | null; setPassword(value: string): void; deleteCredential(): boolean }
export type BrokerObserver = (event: Pick<Diagnostic, 'stage' | 'event' | 'category' | 'durationMs' | 'httpStatus' | 'networkCode' | 'sourceId'>) => void
export interface Broker {
  authenticate(input: AuthInput, signal: AbortSignal, state: (state: AuthState) => void): Promise<void>
  restore(signal: AbortSignal): Promise<boolean>
  readHoldings?(signal: AbortSignal): Promise<HoldingsObservation>
  fetch(signal: AbortSignal): Promise<Snapshot>
  readObservations?(previous: readonly FinancialObservation[], save: (value: FinancialObservation) => void, signal: AbortSignal): Promise<void>
  // Optional source explorer capability. Raw records never enter neutral valuation.
  readData?(previous: DataSource[], save: (source: DataSource) => void, signal: AbortSignal, mode: 'refresh' | 'continue' | 'valuation' | 'history-batch'): Promise<void>
  observe?(observer: BrokerObserver): void
  logout(): void
  close(): void
  warning(): string | null
}
export interface BrokerProvider {
  id: string
  version: string
  contractVersion: typeof brokerContractVersion
  auth: BrokerAuth
  create(context: { connectionId: string; vault: SessionVault }): Broker & { readHoldings(signal: AbortSignal): Promise<HoldingsObservation> }
}
/** Only fixed classifications cross the adapter boundary, never upstream messages. */
export class BrokerFailure extends Error {
  constructor(readonly detail: DiagnosticDetail) { super('Broker operation failed') }
}
export function validateAuth(auth: BrokerAuth, input: unknown): AuthInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BrokerFailure({ category: 'validation' })
  const entries = Object.entries(input)
  if (entries.length !== auth.fields.length || entries.some(([key]) => !auth.fields.some(f => f.id === key))) throw new BrokerFailure({ category: 'validation' })
  for (const field of auth.fields) {
    const value = (input as Record<string, unknown>)[field.id]
    if (typeof value !== 'string' || value.length > field.maxLength || !new RegExp(field.pattern).test(value)) throw new BrokerFailure({ category: 'validation' })
  }
  return input as AuthInput
}
