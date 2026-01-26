/**
 * IPC Commands Module
 *
 * High-level functions for communicating with the Rust backend.
 */

import { z } from 'zod'
import { invoke, isTauri } from './tauri'
import { scrubObject } from './scrubber'
import { logger } from './logger'
import type {
  DashboardData,
  EngineHealth,
  Holding,
  AuthStatus,
  SessionCheck,
  AuthResponse,
  LogoutResponse,
  PortfolioSyncResult,
  PositionsResponse,
  TauriCommands,
  TrueHoldingsResponse,
  SystemLogReport,
  UploadHoldingsResult,
  PipelineHealthReport,
} from '../types'

export class IPCValidationError extends Error {
  constructor(
    public readonly command: string,
    public readonly issues: z.core.$ZodIssue[]
  ) {
    const summary = issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    super(`IPC validation failed for ${command}: ${summary}`)
    this.name = 'IPCValidationError'
  }
}

export function validateResponse<T>(command: string, data: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new IPCValidationError(command, result.error.issues)
  }
  return result.data
}

// Commands that handle credentials - never log their payloads raw
const AUTH_COMMANDS = ['tr_login', 'tr_submit_2fa', 'tr_get_stored_credentials'] as const

const pendingRequests = new Map<string, Promise<unknown>>()

/**
 * Get Echo Bridge token from environment.
 * SECURITY: Fails fast if token is not configured - no hardcoded fallbacks.
 *
 * @throws Error if VITE_ECHO_BRIDGE_TOKEN is not set
 */
let _cachedEchoToken: string | null = null
function getEchoBridgeToken(): string {
  if (_cachedEchoToken !== null) {
    return _cachedEchoToken
  }

  const token = import.meta.env.VITE_ECHO_BRIDGE_TOKEN
  if (!token) {
    throw new Error(
      '[IPC] VITE_ECHO_BRIDGE_TOKEN environment variable is required for Echo Bridge mode. ' +
        'Set it in your .env file or run in Tauri mode instead.'
    )
  }

  _cachedEchoToken = token
  return token
}

async function deduplicatedCall<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>
  }

  const promise = fn()
  pendingRequests.set(key, promise)

  try {
    return await promise
  } finally {
    pendingRequests.delete(key)
  }
}

async function callCommand<K extends keyof TauriCommands>(
  command: K,
  payload: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (isTauri()) {
    return await invoke(command, payload)
  }

  try {
    const echoToken = getEchoBridgeToken()
    const response = await fetch('http://127.0.0.1:5001/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Echo-Bridge-Token': echoToken,
      },

      body: JSON.stringify({
        id: Math.floor(Math.random() * 1000000),
        command,
        payload,
      }),
    })

    if (!response.ok) {
      throw new Error(`Echo-Bridge unreachable (status: ${response.status})`)
    }

    const result = await response.json()
    if (!result.success) {
      const errorMsg = result.error?.message || 'Unknown backend error'
      const errorCode = result.error?.code || 'UNKNOWN'
      logger.error(`[IPC] Backend error (${errorCode}): ${errorMsg}`)

      // Log to system logs for auto-reporting
      // SECURITY: Never log credentials (phone, pin, 2FA code) to system logs
      const safePayload = AUTH_COMMANDS.includes(command as (typeof AUTH_COMMANDS)[number])
        ? { ...payload, phone: '[REDACTED]', pin: '[REDACTED]', code: '[REDACTED]' }
        : scrubObject(payload)

      logEvent(
        'ERROR',
        `Backend Error: ${errorMsg}`,
        {
          command,
          code: errorCode,
          payload: safePayload,
        },
        'pipeline',
        'api_error'
      )

      throw new Error(`Backend Error: ${errorMsg}`)
    }

    return result.data
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Backend Error:')) {
      throw error
    }
    logger.error('[IPC] Echo-Bridge connection failed', error instanceof Error ? error : undefined)
    throw new Error('Echo-Bridge unreachable. Check if the Python engine is running on port 5001.')
  }
}

/**
 * Get engine health status
 */
export async function getEngineHealth(): Promise<EngineHealth> {
  try {
    return await deduplicatedCall('get_engine_health', () => callCommand('get_engine_health', {}))
  } catch (error) {
    logger.error('[IPC] get_health failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get dashboard data for a portfolio
 */
export async function getDashboardData(portfolioId: number): Promise<DashboardData> {
  try {
    const key = `get_dashboard_data:${portfolioId}`
    return await deduplicatedCall(key, () => callCommand('get_dashboard_data', { portfolioId }))
  } catch (error) {
    logger.error('[IPC] get_dashboard_data failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get all holdings for a portfolio
 */
export async function getHoldings(portfolioId: number): Promise<Holding[]> {
  try {
    const dashboard = await getDashboardData(portfolioId)
    return dashboard.topHoldings
  } catch (error) {
    logger.error('[IPC] getHoldings failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get all positions for a portfolio (full data for table)
 */
export async function getPositions(portfolioId: number): Promise<PositionsResponse> {
  try {
    const key = `get_positions:${portfolioId}`
    return await deduplicatedCall(key, () => callCommand('get_positions', { portfolioId }))
  } catch (error) {
    logger.error('[IPC] get_positions failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Trigger portfolio sync with real Trade Republic data
 */
export async function syncPortfolio(
  portfolioId: number,
  force: boolean = false
): Promise<PortfolioSyncResult> {
  try {
    const key = `sync_portfolio:${portfolioId}:${force}`
    return await deduplicatedCall(key, () => callCommand('sync_portfolio', { portfolioId, force }))
  } catch (error) {
    logger.error('[IPC] sync_portfolio failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Trigger analytics pipeline manually
 */
export async function runPipeline(): Promise<{
  success: boolean
  errors: string[]
  durationMs: number
}> {
  try {
    return await callCommand('run_pipeline', {})
  } catch (error) {
    logger.error('[IPC] run_pipeline failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get current Trade Republic authentication status
 */
export async function trGetAuthStatus(): Promise<AuthStatus> {
  try {
    return await deduplicatedCall('tr_get_auth_status', () => callCommand('tr_get_auth_status', {}))
  } catch (error) {
    logger.error('[IPC] tr_get_auth_status failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Check for saved Trade Republic session
 */
export async function trCheckSavedSession(): Promise<SessionCheck> {
  try {
    return await deduplicatedCall('tr_check_saved_session', () =>
      callCommand('tr_check_saved_session', {})
    )
  } catch (error) {
    logger.error('[IPC] tr_check_saved_session failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Check if stored Trade Republic credentials exist.
 * SECURITY: Only returns masked phone for UI display, never plaintext credentials.
 */
export async function trGetStoredCredentials(): Promise<{
  hasCredentials: boolean
  maskedPhone: string | null
}> {
  try {
    return await callCommand('tr_get_stored_credentials', {})
  } catch (error) {
    logger.error(
      '[IPC] tr_get_stored_credentials failed',
      error instanceof Error ? error : undefined
    )
    return { hasCredentials: false, maskedPhone: null }
  }
}

/**
 * Start Trade Republic login process with provided credentials.
 */
export async function trLogin(
  phone: string,
  pin: string,
  remember: boolean = true
): Promise<AuthResponse> {
  try {
    return await callCommand('tr_login', { phone, pin, remember })
  } catch (error) {
    logger.error('[IPC] tr_login failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Start Trade Republic login using stored credentials (server-side).
 * SECURITY: Credentials are retrieved and used server-side, never sent to frontend.
 */
export async function trLoginWithStoredCredentials(): Promise<AuthResponse> {
  try {
    return await callCommand('tr_login', { useStoredCredentials: true })
  } catch (error) {
    logger.error('[IPC] tr_login (stored) failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Submit 2FA code for Trade Republic
 */
export async function trSubmit2FA(code: string): Promise<AuthResponse> {
  try {
    return await callCommand('tr_submit_2fa', { code })
  } catch (error) {
    logger.error('[IPC] tr_submit_2fa failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Logout from Trade Republic
 */
export async function trLogout(): Promise<LogoutResponse> {
  try {
    return await callCommand('tr_logout', {})
  } catch (error) {
    logger.error('[IPC] tr_logout failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Check if the backend is reachable
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await getEngineHealth()
    return true
  } catch {
    return false
  }
}

/**
 * Get current runtime environment
 */
export function getEnvironment(): 'tauri' | 'browser' {
  return isTauri() ? 'tauri' : 'browser'
}

/**
 * Upload manual ETF holdings
 */
export async function uploadHoldings(
  filePath: string,
  etfIsin: string
): Promise<UploadHoldingsResult> {
  try {
    return await callCommand('upload_holdings', { filePath, etfIsin })
  } catch (error) {
    logger.error('[IPC] upload_holdings failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get decomposed true holdings with resolution metadata
 */
export async function getTrueHoldings(): Promise<TrueHoldingsResponse> {
  try {
    return await deduplicatedCall('get_true_holdings', () => callCommand('get_true_holdings', {}))
  } catch (error) {
    logger.error('[IPC] get_true_holdings failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Log an event to the backend database
 */
export async function logEvent(
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  message: string,
  context: Record<string, unknown> = {},
  component: string = 'ui',
  category: string = 'general'
): Promise<void> {
  try {
    await callCommand('log_event', { level, message, context, component, category })
  } catch (error) {
    // Fallback to avoid infinite loops if logger fails
    console.error('[IPC] Failed to log event:', error)
  }
}

export async function getRecentReports(): Promise<SystemLogReport[]> {
  try {
    return await callCommand('get_recent_reports', {})
  } catch (error) {
    logger.error('[IPC] get_recent_reports failed', error instanceof Error ? error : undefined)
    return []
  }
}

/**
 * Get pending reviews
 */
export async function getPendingReviews(): Promise<SystemLogReport[]> {
  try {
    return await callCommand('get_pending_reviews', {})
  } catch (error) {
    logger.error('[IPC] get_pending_reviews failed', error instanceof Error ? error : undefined)
    return []
  }
}

/**
 * Get the latest pipeline health report
 */
export async function getPipelineReport(): Promise<PipelineHealthReport> {
  try {
    return await deduplicatedCall('get_pipeline_report', () =>
      callCommand('get_pipeline_report', {})
    )
  } catch (error) {
    logger.error('[IPC] get_pipeline_report failed', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Set Hive contribution preference
 */
export async function setHiveContribution(enabled: boolean): Promise<void> {
  try {
    await callCommand('set_hive_contribution', { enabled })
  } catch (error) {
    logger.error('[IPC] set_hive_contribution failed', error instanceof Error ? error : undefined)
  }
}

/**
 * Get Hive contribution preference
 */
export async function getHiveContribution(): Promise<boolean> {
  try {
    const result = await callCommand('get_hive_contribution', {})
    return result?.enabled ?? false
  } catch (error) {
    logger.error('[IPC] get_hive_contribution failed', error instanceof Error ? error : undefined)
    return false
  }
}
