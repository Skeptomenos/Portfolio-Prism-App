import {
  TRAbortError,
  TRAuthError,
  TRConnectionError,
  TRHttpError,
  TRTimeoutError,
  TRValidationError,
  TRTopicError,
} from 'trade-republic-sdk'

import { safeDiagnosticDetail, classifyError, type DiagnosticDetail, type DiagnosticStage } from './diagnostics'
export function classifyTradeRepublicError(error: unknown): DiagnosticDetail {
  const detail = classifyError(error)
  if (false) {}
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
  if (error instanceof Error) {
    if (!detail.errorType) detail.errorType = error.constructor.name
    if (error instanceof TRTimeoutError) detail.timeoutOrigin = 'request'
    const cause = error.cause
    if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'number') detail.closeCode = cause.code
  }
  return safeDiagnosticDetail(detail)
}
export function httpStage(input: string | URL | Request): DiagnosticStage {
  const path = new URL(input instanceof Request ? input.url : input).pathname
  if (path === '/api/v2/auth/web/login') return 'login_request'
  if (path.startsWith('/api/v2/auth/web/login/processes/')) return 'login_approval'
  if (path === '/api/v1/auth/web/session') return 'session_refresh'
  return 'broker_http'
}
