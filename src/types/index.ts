/**
 * Shared TypeScript types for Portfolio Prism frontend
 * 
 * These types mirror the IPC API spec (anamnesis/specs/ipc_api.md)
 * and provide type safety across the React application.
 */

// =============================================================================
// Navigation
// =============================================================================

export type ViewType = 'dashboard' | 'xray' | 'overlap' | 'holdings' | 'data' | 'health' | 'trade-republic';

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

export interface OverlapData {
  etfPairs: ETFOverlapPair[];
}

export interface ETFOverlapPair {
  etf1: string;
  etf2: string;
  overlapPercentage: number;
  sharedHoldings: number;
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
