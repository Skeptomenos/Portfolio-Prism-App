/**
 * Structured Frontend Logger
 *
 * Provides environment-aware logging that:
 * - In development: Uses console methods with formatted prefixes
 * - In production: Suppresses debug/info, retains warn/error for monitoring
 *
 * Each log entry includes:
 * - Timestamp (ISO format)
 * - Log level
 * - Scope (component/module identifier)
 * - Structured context data
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('[Auth] User logged in', { userId: '123' })
 *   logger.error('[IPC] Command failed', error)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogContext = Record<string, unknown> | object

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
}

/**
 * Check if we're in development mode.
 * Vite sets import.meta.env.DEV in dev mode.
 */
function isDevelopment(): boolean {
  try {
    return import.meta.env.DEV === true
  } catch {
    // Fallback for test environments
    return process.env.NODE_ENV !== 'production'
  }
}

/**
 * Format a log entry for console output.
 * In dev mode, use colored prefixes for readability.
 */
function formatLogEntry(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`
  return `${prefix} ${entry.message}`
}

/**
 * Core logging function that handles all log levels.
 */
function log(level: LogLevel, message: string, context?: LogContext | Error): void {
  const isDev = isDevelopment()

  // In production, suppress debug and info logs
  if (!isDev && (level === 'debug' || level === 'info')) {
    return
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context instanceof Error ? { error: context.message, stack: context.stack } : context,
  }

  const formattedMessage = formatLogEntry(entry)

  /* eslint-disable no-console */
  switch (level) {
    case 'debug':
      console.debug(formattedMessage, entry.context ?? '')
      break
    case 'info':
      console.log(formattedMessage, entry.context ?? '')
      break
    case 'warn':
      console.warn(formattedMessage, entry.context ?? '')
      break
    case 'error':
      console.error(formattedMessage, entry.context ?? '')
      break
  }
  /* eslint-enable no-console */
}

/**
 * Structured logger with typed methods for each log level.
 *
 * @example
 * logger.debug('[SSE] Heartbeat received')
 * logger.info('[App] Initialization complete', { env: 'tauri' })
 * logger.warn('[Auth] Session expiring soon', { expiresIn: '5m' })
 * logger.error('[IPC] Command failed', error)
 */
export const logger = {
  /**
   * Debug-level logging. Only visible in development.
   * Use for verbose internal state, heartbeats, detailed flow tracking.
   */
  debug: (message: string, context?: LogContext | Error): void => {
    log('debug', message, context)
  },

  /**
   * Info-level logging. Only visible in development.
   * Use for significant state changes, initialization, connections.
   */
  info: (message: string, context?: LogContext | Error): void => {
    log('info', message, context)
  },

  /**
   * Warning-level logging. Visible in all environments.
   * Use for recoverable issues, deprecations, unexpected but handled states.
   */
  warn: (message: string, context?: LogContext | Error): void => {
    log('warn', message, context)
  },

  /**
   * Error-level logging. Visible in all environments.
   * Use for failures, exceptions, unrecoverable states.
   */
  error: (message: string, context?: LogContext | Error): void => {
    log('error', message, context)
  },
}

export type { LogLevel, LogContext, LogEntry }
