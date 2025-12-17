/**
 * Tauri API Wrapper
 * 
 * Provides type-safe access to Tauri's invoke and listen APIs.
 * Falls back gracefully when running in a browser (not Tauri).
 */

import type { 
  DashboardData, 
  EngineHealth, 
  EngineStatusEvent, 
  PortfolioUpdatedEvent,
  SyncProgress,
  AuthStatus,
  SessionCheck,
  AuthResponse,
  LogoutResponse,
  PortfolioSyncResult,
  PositionsResponse
} from '../types';

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Check if we're running inside Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// =============================================================================
// Type Definitions for Tauri Commands
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

// =============================================================================
// Typed Invoke Wrapper
// =============================================================================

/**
 * Type-safe invoke wrapper for Tauri commands
 */
export async function invoke<K extends keyof TauriCommands>(
  command: K,
  args?: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (!isTauri()) {
    throw new Error(`Tauri not available. Cannot invoke command: ${command}`);
  }

  // Dynamic import to avoid issues in non-Tauri environments
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke(command, args);
}

// =============================================================================
// Typed Listen Wrapper
// =============================================================================

type UnlistenFn = () => void;

/**
 * Type-safe listen wrapper for Tauri events
 */
export async function listen<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot listen for event: ${event}`);
    // Return no-op unlisten function
    return () => {};
  }

  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen(event, (e) => handler(e.payload as TauriEvents[K]));
}

/**
 * Listen for an event once
 */
export async function once<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot listen for event: ${event}`);
    return () => {};
  }

  const { once: tauriOnce } = await import('@tauri-apps/api/event');
  return tauriOnce(event, (e) => handler(e.payload as TauriEvents[K]));
}

// =============================================================================
// Emit Events (for testing/debugging)
// =============================================================================

/**
 * Emit an event (useful for testing without Rust backend)
 */
export async function emit<K extends keyof TauriEvents>(
  event: K,
  payload: TauriEvents[K]
): Promise<void> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot emit event: ${event}`);
    return;
  }

  const { emit: tauriEmit } = await import('@tauri-apps/api/event');
  return tauriEmit(event, payload);
}
