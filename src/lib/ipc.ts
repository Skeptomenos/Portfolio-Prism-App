/**
 * IPC Commands Module
 * 
 * High-level functions for communicating with the Rust backend.
 */

import { invoke, isTauri } from './tauri';
import type { 
  DashboardData, EngineHealth, Holding, AuthStatus, SessionCheck, 
  AuthResponse, LogoutResponse, PortfolioSyncResult, PositionsResponse,
  TauriCommands, TrueHoldingsResponse, SystemLogReport
} from '../types';

const pendingRequests = new Map<string, Promise<unknown>>();

async function deduplicatedCall<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = fn();
  pendingRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    pendingRequests.delete(key);
  }
}

async function callCommand<K extends keyof TauriCommands>(
  command: K,
  payload: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (isTauri()) {
    return await invoke(command, payload);
  }

  try {
    const response = await fetch('http://127.0.0.1:5001/command', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Echo-Bridge-Token': 'dev-echo-bridge-secret'
      },

      body: JSON.stringify({
        id: Math.floor(Math.random() * 1000000),
        command,
        payload
      })
    });

    if (!response.ok) {
      throw new Error(`Echo-Bridge unreachable (status: ${response.status})`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      const errorMsg = result.error.message || 'Unknown backend error';
      const errorCode = result.error.code || 'UNKNOWN';
      console.error(`[IPC] Backend error (${errorCode}):`, errorMsg);
      
      // Log to system logs for auto-reporting
      logEvent('ERROR', `Backend Error: ${errorMsg}`, { 
        command, 
        code: errorCode,
        payload 
      }, 'pipeline', 'api_error');

      throw new Error(`Backend Error: ${errorMsg}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Backend Error:')) {
      throw error;
    }
    console.error('[IPC] Echo-Bridge connection failed:', error);
    throw new Error('Echo-Bridge unreachable. Check if the Python engine is running on port 5001.');
  }
}

/**
 * Get engine health status
 */
export async function getEngineHealth(): Promise<EngineHealth> {
  try {
    return await deduplicatedCall('get_engine_health', () => 
      callCommand('get_engine_health', {})
    );
  } catch (error) {
    console.error('[IPC] get_health failed:', error);
    throw error;
  }
}

/**
 * Get dashboard data for a portfolio
 */
export async function getDashboardData(portfolioId: number): Promise<DashboardData> {
  try {
    const key = `get_dashboard_data:${portfolioId}`;
    return await deduplicatedCall(key, () => 
      callCommand('get_dashboard_data', { portfolioId })
    );
  } catch (error) {
    console.error('[IPC] get_dashboard_data failed:', error);
    throw error;
  }
}

/**
 * Get all holdings for a portfolio
 */
export async function getHoldings(portfolioId: number): Promise<Holding[]> {
  try {
    const dashboard = await getDashboardData(portfolioId);
    return dashboard.topHoldings;
  } catch (error) {
    console.error('[IPC] getHoldings failed:', error);
    throw error;
  }
}

/**
 * Get all positions for a portfolio (full data for table)
 */
export async function getPositions(portfolioId: number): Promise<PositionsResponse> {
  try {
    const key = `get_positions:${portfolioId}`;
    return await deduplicatedCall(key, () => 
      callCommand('get_positions', { portfolioId })
    );
  } catch (error) {
    console.error('[IPC] get_positions failed:', error);
    throw error;
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
    const key = `sync_portfolio:${portfolioId}:${force}`;
    return await deduplicatedCall(key, () => 
      callCommand('sync_portfolio', { portfolioId, force })
    );
  } catch (error) {
    console.error('[IPC] sync_portfolio failed:', error);
    throw error;
  }
}

/**
 * Trigger analytics pipeline manually
 */
export async function runPipeline(): Promise<{ success: boolean; errors: string[]; durationMs: number }> {
  try {
    return await callCommand('run_pipeline', {});
  } catch (error) {
    console.error('[IPC] run_pipeline failed:', error);
    throw error;
  }
}

/**
 * Get current Trade Republic authentication status
 */
export async function trGetAuthStatus(): Promise<AuthStatus> {
  try {
    return await deduplicatedCall('tr_get_auth_status', () => 
      callCommand('tr_get_auth_status', {})
    );
  } catch (error) {
    console.error('[IPC] tr_get_auth_status failed:', error);
    throw error;
  }
}

/**
 * Check for saved Trade Republic session
 */
export async function trCheckSavedSession(): Promise<SessionCheck> {
  try {
    return await deduplicatedCall('tr_check_saved_session', () => 
      callCommand('tr_check_saved_session', {})
    );
  } catch (error) {
    console.error('[IPC] tr_check_saved_session failed:', error);
    throw error;
  }
}

/**
 * Get stored Trade Republic credentials for form pre-fill
 */
export async function trGetStoredCredentials(): Promise<{
  hasCredentials: boolean;
  phone: string | null;
  pin: string | null;
}> {
  try {
    return await callCommand('tr_get_stored_credentials', {});
  } catch (error) {
    console.error('[IPC] tr_get_stored_credentials failed:', error);
    return { hasCredentials: false, phone: null, pin: null };
  }
}

/**
 * Start Trade Republic login process
 */
export async function trLogin(
  phone: string,
  pin: string,
  remember: boolean = true
): Promise<AuthResponse> {
  try {
    return await callCommand('tr_login', { phone, pin, remember });
  } catch (error) {
    console.error('[IPC] tr_login failed:', error);
    throw error;
  }
}

/**
 * Submit 2FA code for Trade Republic
 */
export async function trSubmit2FA(code: string): Promise<AuthResponse> {
  try {
    return await callCommand('tr_submit_2fa', { code });
  } catch (error) {
    console.error('[IPC] tr_submit_2fa failed:', error);
    throw error;
  }
}

/**
 * Logout from Trade Republic
 */
export async function trLogout(): Promise<LogoutResponse> {
  try {
    return await callCommand('tr_logout', {});
  } catch (error) {
    console.error('[IPC] tr_logout failed:', error);
    throw error;
  }
}

/**
 * Check if the backend is reachable
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await getEngineHealth();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current runtime environment
 */
export function getEnvironment(): 'tauri' | 'browser' {
  return isTauri() ? 'tauri' : 'browser';
}

/**
 * Upload manual ETF holdings
 */
export async function uploadHoldings(filePath: string, etfIsin: string): Promise<any> {
  try {
    return await callCommand('upload_holdings', { filePath, etfIsin });
  } catch (error) {
    console.error('[IPC] upload_holdings failed:', error);
    throw error;
  }
}

/**
 * Get decomposed true holdings with resolution metadata
 */
export async function getTrueHoldings(): Promise<TrueHoldingsResponse> {
  try {
    return await deduplicatedCall('get_true_holdings', () => 
      callCommand('get_true_holdings', {})
    );
  } catch (error) {
    console.error('[IPC] get_true_holdings failed:', error);
    throw error;
  }
}

/**
 * Log an event to the backend database
 */
export async function logEvent(
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  message: string,
  context: Record<string, any> = {},
  component: string = 'ui',
  category: string = 'general'
): Promise<void> {
  try {
    await callCommand('log_event', { level, message, context, component, category });
  } catch (error) {
    // Silent fail to avoid infinite loops if logging itself fails
    console.error('[IPC] Failed to log event:', error);
  }
}

export async function getRecentReports(): Promise<SystemLogReport[]> {
  try {
    return await callCommand('get_recent_reports', {});
  } catch (error) {
    console.error('[IPC] get_recent_reports failed:', error);
    return [];
  }
}

/**
 * Get pending reviews
 */
export async function getPendingReviews(): Promise<any[]> {
  try {
    return await callCommand('get_pending_reviews', {});
  } catch (error) {
    console.error('[IPC] get_pending_reviews failed:', error);
    return [];
  }
}

/**
 * Get the latest pipeline health report
 */
export async function getPipelineReport(): Promise<any> {
  try {
    return await deduplicatedCall('get_pipeline_report', () => 
      callCommand('get_pipeline_report', {})
    );
  } catch (error) {
    console.error('[IPC] get_pipeline_report failed:', error);
    throw error;
  }
}

/**
 * Set Hive contribution preference
 */
export async function setHiveContribution(enabled: boolean): Promise<void> {
  try {
    await callCommand('set_hive_contribution', { enabled });
  } catch (error) {
    console.error('[IPC] set_hive_contribution failed:', error);
  }
}

/**
 * Get Hive contribution preference
 */
export async function getHiveContribution(): Promise<boolean> {
  try {
    const result = await callCommand('get_hive_contribution', {});
    return result?.enabled ?? false;
  } catch (error) {
    console.error('[IPC] get_hive_contribution failed:', error);
    return false;
  }
}
