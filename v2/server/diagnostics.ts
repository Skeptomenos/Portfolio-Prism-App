import { ParseResult } from 'effect'
import type { OperationOutcome } from './model'
import {
  TRAbortError,
  TRAuthError,
  TRConnectionError,
  TRHttpError,
  TRTimeoutError,
  TRValidationError,
  TRTopicError,
} from 'trade-republic-sdk'

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
}
export interface Diagnostic extends DiagnosticDetail {
  outcome?: OperationOutcome
  sourceId?: string
  attemptId: string
  operation: 'login' | 'restore' | 'sync' | 'logout' | 'background' | 'request' | 'composition'
  stage: DiagnosticStage
  event: DiagnosticEvent
  at: string
  durationMs: number
}
const safeNetworkCodes = new Set([
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
  else if (error instanceof TRHttpError) {
    detail.category = 'http'
    detail.httpStatus = error.status
  } else if (error instanceof TRAuthError) detail.category = 'authentication'
  else if (error instanceof TRTimeoutError) detail.category = 'timeout'
  else if (error instanceof TRAbortError) detail.category = 'cancelled'
  else if (error instanceof TRConnectionError) detail.category = 'connection'
  else if (error instanceof TRValidationError) detail.category = 'validation'
  else if (error instanceof TRTopicError)
    detail.category =
      error.errorCode === 'AUTHENTICATION_ERROR' ? 'authentication' : 'provider_topic'
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
export function httpStage(input: string | URL | Request): DiagnosticStage {
  const path = new URL(input instanceof Request ? input.url : input).pathname
  if (path === '/api/v2/auth/web/login') return 'login_request'
  if (path.startsWith('/api/v2/auth/web/login/processes/')) return 'login_approval'
  if (path === '/api/v1/auth/web/session') return 'session_refresh'
  return 'broker_http'
}
