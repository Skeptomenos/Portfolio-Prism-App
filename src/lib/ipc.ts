/**
 * IPC Commands Module
 * 
 * High-level functions for communicating with the Rust backend.
 */

import { invoke, isTauri } from './tauri';
import type { 
  DashboardData, EngineHealth, Holding, AuthStatus, SessionCheck, 
  AuthResponse, LogoutResponse, PortfolioSyncResult, PositionsResponse,
  TauriCommands
} from '../types';

async function callCommand<K extends keyof TauriCommands>(
  command: K,
  payload: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (isTauri()) {
    return await invoke(command, payload);
  }

  try {
    const response = await fetch('http://localhost:5000/command', {
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
      throw new Error(result.error.message || 'Unknown error');
    }

    return result.data;
  } catch (error) {
    console.error('[IPC] Echo-Bridge call failed:', error);
    throw new Error('Backend unreachable. Ensure prism_headless.py --http is running.');
  }
}

/**
 * Get engine health status
 */
export async function getEngineHealth(): Promise<EngineHealth> {
  try {
    return await callCommand('get_engine_health', {});
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
    return await callCommand('get_dashboard_data', { portfolioId });
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
    return await callCommand('get_positions', { portfolioId });
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
    return await callCommand('sync_portfolio', { portfolioId, force });
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
    return await callCommand('tr_get_auth_status', {});
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
    return await callCommand('tr_check_saved_session', {});
  } catch (error) {
    console.error('[IPC] tr_check_saved_session failed:', error);
    throw error;
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
 * Get decomposed true holdings
 */
export async function getTrueHoldings(): Promise<any> {
  try {
    return await callCommand('get_true_holdings', {});
  } catch (error) {
    console.error('[IPC] get_true_holdings failed:', error);
    throw error;
  }
}

/**
 * Get overlap analysis
 */
export async function getOverlapAnalysis(): Promise<any> {
  try {
    return await callCommand('get_overlap_analysis', {});
  } catch (error) {
    console.error('[IPC] get_overlap_analysis failed:', error);
    throw error;
  }
}

/**
 * Get the latest pipeline health report
 */
export async function getPipelineReport(): Promise<any> {
  try {
    return await callCommand('get_pipeline_report', {});
  } catch (error) {
    console.error('[IPC] get_pipeline_report failed:', error);
    throw error;
  }
}
