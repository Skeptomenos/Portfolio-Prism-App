/**
 * Shared TypeScript types for Portfolio Prism frontend
 * 
 * These types mirror the IPC API spec (keystone/specs/ipc_api.md)
 * and provide type safety across the React application.
 */

// =============================================================================
// Navigation
// =============================================================================

export type ViewType = 'dashboard' | 'xray' | 'holdings' | 'health' | 'trade-republic';

// =============================================================================
// Engine Status (from Rust/Python sidecar)
// =============================================================================

export type EngineStatus = 'idle' | 'connecting' | 'processing' | 'error' | 'disconnected';

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
}

export interface EngineHealth {
  version: string;
  memoryUsageMb: number;
  uptime?: number;
  sessionId?: string;
}

// =============================================================================
// Portfolio Data (from SQLite/Parquet via IPC)
// =============================================================================

export interface AllocationData {
  sector: Record<string, number>;
  region: Record<string, number>;
}

export interface DashboardData {
  totalValue: number;
  totalGain: number;
  gainPercentage: number;
  dayChange: number;          // New field
  dayChangePercent: number;   // New field
  history: { date: string; value: number }[]; // New field for chart
  allocations: AllocationData;
  topHoldings: Holding[];
  lastUpdated: string | null;
  isEmpty: boolean;
  positionCount: number;
}

export interface Holding {
  isin: string;
  name: string;
  ticker?: string;
  value: number;
  weight: number;
  pnl: number;
  pnlPercentage: number;
}

export interface XRayData {
  totalUniqueStocks: number;
  totalETFs: number;
  underlyingHoldings: UnderlyingHolding[];
}

export interface UnderlyingHolding {
  isin: string;
  name: string;
  ticker?: string;
  totalWeight: number;
  sources: {
    etf: string;
    weight: number;
  }[];
}



// =============================================================================
// IPC Events (Tauri events from Rust)
// =============================================================================

export interface PortfolioUpdatedEvent {
  timestamp: string;
  portfolioId: number;
}

export interface EngineStatusEvent {
  status: EngineStatus;
  progress: number;
  message: string;
}

// =============================================================================
// UI State
// =============================================================================

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  dismissable?: boolean;
  duration?: number; // ms, undefined = persistent
}

// =============================================================================
// Trade Republic Auth Types
// =============================================================================

export type AuthState = 'idle' | 'waiting_2fa' | 'authenticated' | 'error';

export interface AuthStatus {
  authState: AuthState;
  hasStoredCredentials: boolean;
  lastError?: string;
}

export interface SessionCheck {
  hasSession: boolean;
  phoneNumber?: string; // Masked: +49***1234
  prompt: 'restore_session' | 'login_required';
}

export interface AuthResponse {
  authState: AuthState;
  message: string;
  countdown?: number; // For 2FA timer
}

export interface LogoutResponse {
  authState: 'idle';
  message: string;
}

export interface PortfolioSyncResult {
  syncedPositions: number;
  newPositions: number;
  updatedPositions: number;
  totalValue: number;
  durationMs: number;
}

// =============================================================================
// Position Data (Full Trade Republic Export)
// =============================================================================

export interface Position {
  isin: string;
  name: string;
  ticker?: string;
  instrumentType: 'stock' | 'etf' | 'crypto' | 'bond' | 'derivative' | 'other';
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  pnlEur: number;
  pnlPercent: number;
  weight: number;
  currency: string;
  notes?: string;
  lastUpdated: string;
}

export interface PositionsResponse {
  positions: Position[];
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPercent: number;
  lastSyncTime?: string;
}

// =============================================================================
// Toast Notifications
// =============================================================================

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
}

// =============================================================================
// Tauri Commands & Events
// =============================================================================

/**
 * Command names and their argument/return types
 */
export interface TauriCommands {
  get_engine_health: {
    args: Record<string, never>;
    returns: EngineHealth;
  };
  get_dashboard_data: {
    args: { portfolioId: number };
    returns: DashboardData;
  };
  get_positions: {
    args: { portfolioId: number };
    returns: PositionsResponse;
  };
  sync_portfolio: {
    args: { force: boolean; portfolioId: number };
    returns: PortfolioSyncResult;
  };
  tr_get_auth_status: {
    args: Record<string, never>;
    returns: AuthStatus;
  };
  tr_check_saved_session: {
    args: Record<string, never>;
    returns: SessionCheck;
  };
  tr_get_stored_credentials: {
    args: Record<string, never>;
    returns: { hasCredentials: boolean; phone: string | null; pin: string | null };
  };
  tr_login: {
    args: { phone: string; pin: string; remember: boolean };
    returns: AuthResponse;
  };
  tr_submit_2fa: {
    args: { code: string };
    returns: AuthResponse;
  };
  tr_logout: {
    args: Record<string, never>;
    returns: LogoutResponse;
  };
  run_pipeline: {
    args: Record<string, never>;
    returns: { success: boolean; errors: string[]; durationMs: number };
  };
  get_pipeline_report: {
    args: Record<string, never>;
    returns: any;
  };
  get_true_holdings: {
    args: Record<string, never>;
    returns: TrueHoldingsResponse;
  };
  upload_holdings: {
    args: { filePath: string; etfIsin: string };
    returns: any;
  };
  log_event: {
    args: {
      level: string;
      message: string;
      context: Record<string, any>;
      component: string;
      category: string;
    };
    returns: boolean;
  };
  get_recent_reports: {
    args: Record<string, never>;
    returns: SystemLogReport[];
  };
  get_pending_reviews: {
    args: Record<string, never>;
    returns: any[];
  };
  set_hive_contribution: {
    args: { enabled: boolean };
    returns: void;
  };
  get_hive_contribution: {
    args: Record<string, never>;
    returns: { enabled: boolean };
  };
}

/**
 * Event names and their payload types
 */
export interface TauriEvents {
  'engine-status': EngineStatusEvent;
  'portfolio-updated': PortfolioUpdatedEvent;
  'sync-progress': SyncProgress;
  'python-ready': { port: number; status: string };
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
  | 'TR_LOGOUT_ERROR';

// =============================================================================
// X-Ray Resolution Types (Phase 6)
// =============================================================================

export type ResolutionStatus = 'resolved' | 'unresolved' | 'skipped' | 'unknown';

/**
 * Known resolution sources from the backend.
 * Uses intersection with `string` to allow unknown sources while keeping autocomplete.
 */
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
  | (string & {}); // Allow unknown sources from backend

export interface XRayHolding {
  stock: string;
  ticker: string;
  isin?: string | null;
  totalValue: number;
  sector?: string;
  geography?: string;
  sources: { etf: string; value: number; weight: number }[];
  resolutionStatus: ResolutionStatus;
  resolutionSource?: ResolutionSource;
  resolutionConfidence: number;
  resolutionDetail?: string;
}

export interface ResolutionSummary {
  total: number;
  resolved: number;
  unresolved: number;
  skipped: number;
  unknown: number;
  bySource: Record<string, number>;
  healthScore: number;
}

export interface TrueHoldingsResponse {
  holdings: XRayHolding[];
  summary: ResolutionSummary;
}

// =============================================================================
// System Logs / Telemetry
// =============================================================================

export interface SystemLogReport {
  id: number;
  session_id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  source: string;
  component: string | null;
  category: string | null;
  message: string;
  context: string | null;
  error_hash: string | null;
  processed: number;
  reported_at: string | null;
}
