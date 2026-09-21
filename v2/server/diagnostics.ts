import { ParseResult } from 'effect'
import type { OperationOutcome } from './model'
import { BrokerFailure } from './broker-contract'

export type DiagnosticCategory =
  | 'none'
  | 'cancelled'
  | 'authentication'
  | 'http'
  | 'timeout'
  | 'connection'
  | 'validation'
  | 'provider_topic'
  | 'credential_store'
  | 'unexpected'
export type DiagnosticStage =
  | 'composition'
  | 'connecting'
  | 'awaiting-approval'
  | 'restoring'
  | 'syncing'
  | 'persisting'
  | 'logout'
  | 'login_request'
  | 'login_approval'
  | 'session_refresh'
  | 'broker_http'
  | 'credential_store'
  | 'request_validation'
  | 'account_discovery'
  | 'portfolio_retrieval'
  | 'snapshot_validation'
  | 'data_extraction'
export type DiagnosticEvent = 'started' | 'succeeded' | 'partial' | 'failed' | 'cancelled'
export interface DiagnosticDetail {
  category: DiagnosticCategory
  httpStatus?: number
  networkCode?: string
  errorType?: string
  transportPhase?: 'connect' | 'response'
  closeCode?: number
  timeoutOrigin?: 'request' | 'operation'
  isin?: string
  venue?: string
}
export interface Diagnostic extends DiagnosticDetail {
  connectionId?: string
  providerId?: string
  terminal?: boolean
  outcome?: OperationOutcome
  sourceId?: string
  attemptId: string
  operation:
    | 'login'
    | 'restore'
    | 'sync'
    | 'extraction'
    | 'logout'
    | 'background'
    | 'request'
    | 'composition'
  stage: DiagnosticStage
  event: DiagnosticEvent
  at: string
  durationMs: number
}
export const safeNetworkCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
])
export function classifyError(error: unknown): DiagnosticDetail {
  const detail: DiagnosticDetail = { category: 'unexpected' }
  if (ParseResult.isParseError(error)) detail.category = 'validation'
  else if (error instanceof BrokerFailure) return safeDiagnosticDetail(error.detail)
  let cause: unknown = error
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (cause.name === 'TimeoutError') detail.category = 'timeout'
    if ('code' in cause && typeof cause.code === 'string' && safeNetworkCodes.has(cause.code)) {
      detail.networkCode = cause.code
      detail.category = 'connection'
    }
    cause = cause.cause
  }
  return detail
}

const categories = new Set<string>(['none','cancelled','authentication','http','timeout','connection','validation','provider_topic','credential_store','unexpected'])
const stages = new Set<string>(['composition','connecting','awaiting-approval','restoring','syncing','persisting','logout','login_request','login_approval','session_refresh','broker_http','credential_store','request_validation','account_discovery','portfolio_retrieval','snapshot_validation','data_extraction'])
const events = new Set<string>(['started','succeeded','partial','failed','cancelled'])
const operations = new Set<string>(['login','restore','sync','extraction','logout','background','request','composition'])
export function safeDiagnosticDetail(detail: DiagnosticDetail): DiagnosticDetail {
  return { category: categories.has(detail.category) ? detail.category : 'unexpected',
    ...(typeof detail.errorType === 'string' && ['TRConnectionError','TRTimeoutError','TRAuthError','TRHttpError','TRAbortError','TRValidationError','TRTopicError'].includes(detail.errorType) ? { errorType: detail.errorType } : {}),
    ...(['connect','response'].includes(detail.transportPhase ?? '') ? { transportPhase: detail.transportPhase } : {}),
    ...(['request','operation'].includes(detail.timeoutOrigin ?? '') ? { timeoutOrigin: detail.timeoutOrigin } : {}),
    ...(Number.isInteger(detail.closeCode) && detail.closeCode! >= 1000 && detail.closeCode! <= 4999 ? { closeCode: detail.closeCode } : {}),
    ...(typeof detail.isin === 'string' && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(detail.isin) ? { isin: detail.isin } : {}),
    ...(typeof detail.venue === 'string' && /^[A-Z][A-Z0-9._-]{1,15}$/.test(detail.venue) ? { venue: detail.venue } : {}),
    ...(Number.isInteger(detail.httpStatus) && detail.httpStatus! >= 100 && detail.httpStatus! <= 599 ? { httpStatus: detail.httpStatus } : {}),
    ...(typeof detail.networkCode === 'string' && safeNetworkCodes.has(detail.networkCode) ? { networkCode: detail.networkCode } : {}) }
}
/** Runtime allowlists protect observer and exception paths, not only TS callers. */
export function safeDiagnostic(event: Diagnostic): Diagnostic {
  return { ...safeDiagnosticDetail(event),
    attemptId: typeof event.attemptId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(event.attemptId) ? event.attemptId : 'unavailable',
    operation: operations.has(event.operation) ? event.operation : 'background',
    stage: stages.has(event.stage) ? event.stage : 'broker_http',
    event: events.has(event.event) ? event.event : 'failed',
    at: typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)) ? new Date(event.at).toISOString() : new Date().toISOString(),
    durationMs: typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs >= 0 ? Math.min(Math.round(event.durationMs), 86_400_000) : 0,
    ...(event.terminal === true ? { terminal: true } : {}),
  }
}
