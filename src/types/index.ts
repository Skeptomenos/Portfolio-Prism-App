/**
 * Shared TypeScript types for Portfolio Prism frontend
 * 
 * These types mirror the IPC API spec (anamnesis/specs/ipc_api.md)
 * and provide type safety across the React application.
 */

// =============================================================================
// Navigation
// =============================================================================

export type ViewType = 'dashboard' | 'xray' | 'overlap' | 'holdings' | 'data' | 'health';

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

export interface DashboardData {
  totalValue: number;
  totalGain: number;
  gainPercentage: number;
  allocations: {
    sector: Record<string, number>;
    region: Record<string, number>;
  };
  topHoldings: Holding[];
  lastUpdated: string;
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
