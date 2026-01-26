/**
 * Shared TypeScript types for Portfolio Prism frontend
 *
 * These types mirror the IPC API spec (keystone/specs/ipc_api.md)
 * and provide type safety across the React application.
 *
 * Types are inferred from Zod schemas where available (runtime validation).
 */

import type { EngineHealth as _EngineHealth } from '../lib/schemas/health'

import type {
  DashboardData as _DashboardData,
  Holding as _Holding,
  AllocationData as _AllocationData,
  XRayHolding as _XRayHolding,
  ResolutionSummary as _ResolutionSummary,
  TrueHoldingsResponse as _TrueHoldingsResponse,
} from '../features/dashboard/schemas'

import type {
  AuthState as _AuthState,
  AuthStatus as _AuthStatus,
  SessionCheck as _SessionCheck,
  AuthResponse as _AuthResponse,
  LogoutResponse as _LogoutResponse,
} from '../features/auth/schemas'

import type {
  PortfolioSyncResult as _PortfolioSyncResult,
  Position as _Position,
  PositionsResponse as _PositionsResponse,
  UploadHoldingsResult as _UploadHoldingsResult,
  SystemLogReport as _SystemLogReport,
  PipelineHealthReport as _PipelineHealthReport,
} from '../lib/schemas/ipc'

// =============================================================================
// Zod Schema Re-exports (Single Source of Truth)
// =============================================================================

export type EngineHealth = _EngineHealth
export type DashboardData = _DashboardData
export type Holding = _Holding
export type AllocationData = _AllocationData
export type XRayHolding = _XRayHolding
export type ResolutionSummary = _ResolutionSummary
export type TrueHoldingsResponse = _TrueHoldingsResponse
export type AuthState = _AuthState
export type AuthStatus = _AuthStatus
export type SessionCheck = _SessionCheck
export type AuthResponse = _AuthResponse
export type LogoutResponse = _LogoutResponse
export type PortfolioSyncResult = _PortfolioSyncResult
export type Position = _Position
export type PositionsResponse = _PositionsResponse
export type UploadHoldingsResult = _UploadHoldingsResult
export type SystemLogReport = _SystemLogReport
export type PipelineHealthReport = _PipelineHealthReport

export { EngineHealthSchema } from '../lib/schemas/health'
export {
  DashboardDataSchema,
  HoldingSchema,
  AllocationDataSchema,
  XRayHoldingSchema,
  ResolutionSummarySchema,
  TrueHoldingsResponseSchema,
  ResolutionStatusSchema,
} from '../features/dashboard/schemas'
export {
  AuthStateSchema,
  AuthStatusSchema,
  SessionCheckSchema,
  AuthResponseSchema,
  LogoutResponseSchema,
  StoredCredentialsSchema,
} from '../features/auth/schemas'
export {
  PortfolioSyncResultSchema,
  PositionSchema,
  PositionsResponseSchema,
  UploadHoldingsResultSchema,
  SystemLogReportSchema,
  RunPipelineResultSchema,
  HiveContributionResultSchema,
  PipelineHealthReportSchema,
} from '../lib/schemas/ipc'

// =============================================================================
// Navigation
// =============================================================================

export type ViewType = 'dashboard' | 'xray' | 'holdings' | 'health' | 'trade-republic'

// =============================================================================
// Engine Status (from Rust/Python sidecar)
// =============================================================================

export type EngineStatus = 'idle' | 'connecting' | 'processing' | 'error' | 'disconnected'

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'complete' | 'error'
  progress: number
  message: string
}

// =============================================================================
// Legacy X-Ray Types (not yet migrated to Zod)
// =============================================================================

export interface XRayData {
  totalUniqueStocks: number
  totalETFs: number
  underlyingHoldings: UnderlyingHolding[]
}

export interface UnderlyingHolding {
  isin: string
  name: string
  ticker?: string
  totalWeight: number
  sources: {
    etf: string
    weight: number
  }[]
}

// =============================================================================
// IPC Events (Tauri events from Rust)
// =============================================================================

export interface PortfolioUpdatedEvent {
  timestamp: string
  portfolioId: number
}

export interface EngineStatusEvent {
  status: EngineStatus
  progress: number
  message: string
}

// =============================================================================
// UI State
// =============================================================================

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  dismissable?: boolean
  duration?: number // ms, undefined = persistent
}

// =============================================================================
// Toast Notifications
// =============================================================================

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number // ms, default 4000
}

// =============================================================================
// Tauri Commands & Events
// =============================================================================

/**
 * Command names and their argument/return types
 */
export interface TauriCommands {
  get_engine_health: {
    args: Record<string, never>
    returns: EngineHealth
  }
  get_dashboard_data: {
    args: { portfolioId: number }
    returns: DashboardData
  }
  get_positions: {
    args: { portfolioId: number }
    returns: PositionsResponse
  }
  sync_portfolio: {
    args: { force: boolean; portfolioId: number }
    returns: PortfolioSyncResult
  }
  tr_get_auth_status: {
    args: Record<string, never>
    returns: AuthStatus
  }
  tr_check_saved_session: {
    args: Record<string, never>
    returns: SessionCheck
  }
  tr_get_stored_credentials: {
    args: Record<string, never>
    returns: { hasCredentials: boolean; maskedPhone: string | null }
  }
  tr_login: {
    args: { phone?: string; pin?: string; remember?: boolean; useStoredCredentials?: boolean }
    returns: AuthResponse
  }
  tr_submit_2fa: {
    args: { code: string }
    returns: AuthResponse
  }
  tr_logout: {
    args: Record<string, never>
    returns: LogoutResponse
  }
  run_pipeline: {
    args: Record<string, never>
    returns: { success: boolean; errors: string[]; durationMs: number }
  }
  get_pipeline_report: {
    args: Record<string, never>
    returns: PipelineHealthReport
  }
  get_true_holdings: {
    args: Record<string, never>
    returns: TrueHoldingsResponse
  }
  upload_holdings: {
    args: { filePath: string; etfIsin: string }
    returns: UploadHoldingsResult
  }
  log_event: {
    args: {
      level: string
      message: string
      context: Record<string, unknown>
      component: string
      category: string
    }
    returns: boolean
  }
  get_recent_reports: {
    args: Record<string, never>
    returns: SystemLogReport[]
  }
  get_pending_reviews: {
    args: Record<string, never>
    returns: SystemLogReport[]
  }
  set_hive_contribution: {
    args: { enabled: boolean }
    returns: void
  }
  get_hive_contribution: {
    args: Record<string, never>
    returns: { enabled: boolean }
  }
}

/**
 * Event names and their payload types
 */
export interface TauriEvents {
  'engine-status': EngineStatusEvent
  'portfolio-updated': PortfolioUpdatedEvent
  'sync-progress': SyncProgress
  'python-ready': { port: number; status: string }
}

export type TRErrorCode =
  | 'TR_AUTH_REQUIRED'
  | 'TR_INVALID_CREDENTIALS'
  | 'TR_LOGIN_FAILED'
  | 'TR_2FA_REQUIRED'
  | 'TR_2FA_INVALID'
  | 'TR_2FA_EXPIRED'
  | 'TR_RATE_LIMITED'
  | 'TR_SESSION_EXPIRED'
  | 'TR_NETWORK_ERROR'
  | 'TR_DAEMON_ERROR'
  | 'TR_SYNC_FAILED'
  | 'TR_COMPONENTS_MISSING'
  | 'TR_AUTH_ERROR'
  | 'TR_SESSION_CHECK_ERROR'
  | 'TR_LOGIN_ERROR'
  | 'TR_2FA_ERROR'
  | 'TR_LOGOUT_ERROR'

// =============================================================================
// Resolution Source Type (extended for backend compatibility)
// =============================================================================

export type ResolutionSource =
  | 'provider'
  | 'manual'
  | 'hive'
  | 'local_cache'
  | 'api_wikidata'
  | 'api_finnhub'
  | 'api_yfinance'
  | 'api_openfigi'
  | 'unknown'
  | (string & {})

export type ResolutionStatus = 'resolved' | 'unresolved' | 'skipped' | 'unknown'
