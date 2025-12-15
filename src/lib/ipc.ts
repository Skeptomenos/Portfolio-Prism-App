/**
 * IPC Commands Module
 * 
 * High-level functions for communicating with the Rust backend.
 * Falls back to mock data when not running in Tauri.
 */

import { invoke, isTauri } from './tauri';
import type { 
  DashboardData, EngineHealth, Holding, AuthStatus, SessionCheck, 
  AuthResponse, LogoutResponse, PortfolioSyncResult, PositionsResponse, Position
} from '../types';

// =============================================================================
// Mock Data (for browser development)
// =============================================================================

const MOCK_ENGINE_HEALTH: EngineHealth = {
  version: '0.1.0',
  memoryUsageMb: 45.2,
};

const MOCK_DASHBOARD_DATA: DashboardData = {
  totalValue: 124592,
  totalGain: 12459,
  gainPercentage: 11.1,
  allocations: {
    sector: {
      Technology: 0.35,
      Healthcare: 0.18,
      Financials: 0.15,
      'Consumer Discretionary': 0.12,
      Industrials: 0.10,
      Other: 0.10,
    },
    region: {
      'North America': 0.62,
      Europe: 0.22,
      'Asia Pacific': 0.12,
      'Emerging Markets': 0.04,
    },
  },
  topHoldings: [
    { isin: 'US0378331005', name: 'Apple Inc.', ticker: 'AAPL', value: 8420, weight: 0.068, pnl: 842, pnlPercentage: 11.1 },
    { isin: 'US5949181045', name: 'Microsoft Corp.', ticker: 'MSFT', value: 7150, weight: 0.057, pnl: 650, pnlPercentage: 10.0 },
    { isin: 'US67066G1040', name: 'NVIDIA Corp.', ticker: 'NVDA', value: 6890, weight: 0.055, pnl: 1240, pnlPercentage: 21.9 },
    { isin: 'US0231351067', name: 'Amazon.com Inc.', ticker: 'AMZN', value: 5320, weight: 0.043, pnl: 420, pnlPercentage: 8.6 },
    { isin: 'US30303M1027', name: 'Meta Platforms', ticker: 'META', value: 4280, weight: 0.034, pnl: -120, pnlPercentage: -2.7 },
  ],
  lastUpdated: new Date().toISOString(),
};

const MOCK_HOLDINGS: Holding[] = [
  { isin: 'US0378331005', name: 'Apple Inc.', ticker: 'AAPL', value: 8420, weight: 0.068, pnl: 842, pnlPercentage: 11.1 },
  { isin: 'US5949181045', name: 'Microsoft Corp.', ticker: 'MSFT', value: 7150, weight: 0.057, pnl: 650, pnlPercentage: 10.0 },
  { isin: 'US67066G1040', name: 'NVIDIA Corp.', ticker: 'NVDA', value: 6890, weight: 0.055, pnl: 1240, pnlPercentage: 21.9 },
  { isin: 'US0231351067', name: 'Amazon.com Inc.', ticker: 'AMZN', value: 5320, weight: 0.043, pnl: 420, pnlPercentage: 8.6 },
  { isin: 'US30303M1027', name: 'Meta Platforms', ticker: 'META', value: 4280, weight: 0.034, pnl: -120, pnlPercentage: -2.7 },
];

const MOCK_POSITIONS: Position[] = [
  { isin: 'US0378331005', name: 'Apple Inc.', ticker: 'AAPL', instrumentType: 'stock', quantity: 50, avgBuyPrice: 150.0, currentPrice: 168.4, currentValue: 8420, totalCost: 7500, pnlEur: 920, pnlPercent: 12.27, weight: 6.8, currency: 'EUR', notes: '', lastUpdated: new Date().toISOString() },
  { isin: 'US5949181045', name: 'Microsoft Corp.', ticker: 'MSFT', instrumentType: 'stock', quantity: 20, avgBuyPrice: 325.0, currentPrice: 357.5, currentValue: 7150, totalCost: 6500, pnlEur: 650, pnlPercent: 10.0, weight: 5.7, currency: 'EUR', notes: '', lastUpdated: new Date().toISOString() },
  { isin: 'US67066G1040', name: 'NVIDIA Corp.', ticker: 'NVDA', instrumentType: 'stock', quantity: 15, avgBuyPrice: 376.67, currentPrice: 459.33, currentValue: 6890, totalCost: 5650, pnlEur: 1240, pnlPercent: 21.9, weight: 5.5, currency: 'EUR', notes: '', lastUpdated: new Date().toISOString() },
  { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', ticker: 'SWDA', instrumentType: 'etf', quantity: 100, avgBuyPrice: 75.0, currentPrice: 82.5, currentValue: 8250, totalCost: 7500, pnlEur: 750, pnlPercent: 10.0, weight: 6.6, currency: 'EUR', notes: '', lastUpdated: new Date().toISOString() },
  { isin: 'IE00B5BMR087', name: 'iShares S&P 500', ticker: 'CSPX', instrumentType: 'etf', quantity: 50, avgBuyPrice: 420.0, currentPrice: 462.0, currentValue: 23100, totalCost: 21000, pnlEur: 2100, pnlPercent: 10.0, weight: 18.5, currency: 'EUR', notes: '', lastUpdated: new Date().toISOString() },
];

const MOCK_POSITIONS_RESPONSE: PositionsResponse = {
  positions: MOCK_POSITIONS,
  totalValue: 53810,
  totalCost: 48150,
  totalPnl: 5660,
  totalPnlPercent: 11.75,
  lastSyncTime: new Date().toISOString(),
};

// =============================================================================
// Helper: Simulate Network Delay (for mock data)
// =============================================================================

async function simulateDelay(ms: number = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 200));
}

// =============================================================================
// IPC Command Functions
// =============================================================================

/**
 * Get engine health status
 */
export async function getEngineHealth(): Promise<EngineHealth> {
  if (isTauri()) {
    try {
      return await invoke('get_engine_health');
    } catch (error) {
      console.error('[IPC] get_engine_health failed:', error);
      throw error;
    }
  }

  // Mock fallback for browser development
  console.log('[IPC Mock] get_engine_health');
  await simulateDelay();
  return MOCK_ENGINE_HEALTH;
}

/**
 * Get dashboard data for a portfolio
 */
export async function getDashboardData(portfolioId: number): Promise<DashboardData> {
  if (isTauri()) {
    try {
      return await invoke('get_dashboard_data', { portfolioId });
    } catch (error) {
      console.error('[IPC] get_dashboard_data failed:', error);
      throw error;
    }
  }

  // Mock fallback for browser development
  console.log(`[IPC Mock] get_dashboard_data(portfolioId: ${portfolioId})`);
  await simulateDelay();
  return MOCK_DASHBOARD_DATA;
}

/**
 * Get all holdings for a portfolio
 */
export async function getHoldings(portfolioId: number): Promise<Holding[]> {
  if (isTauri()) {
    try {
      // This command will be added to Rust later
      // For now, extract from dashboard data
      const dashboard = await invoke('get_dashboard_data', { portfolioId });
      return dashboard.topHoldings;
    } catch (error) {
      console.error('[IPC] getHoldings failed:', error);
      throw error;
    }
  }

  // Mock fallback
  console.log(`[IPC Mock] getHoldings(portfolioId: ${portfolioId})`);
  await simulateDelay();
  return MOCK_HOLDINGS;
}

/**
 * Get all positions for a portfolio (full data for table)
 */
export async function getPositions(portfolioId: number): Promise<PositionsResponse> {
  if (isTauri()) {
    try {
      return await invoke('get_positions', { portfolioId });
    } catch (error) {
      console.error('[IPC] get_positions failed:', error);
      throw error;
    }
  }

  // Mock fallback
  console.log(`[IPC Mock] getPositions(portfolioId: ${portfolioId})`);
  await simulateDelay();
  return MOCK_POSITIONS_RESPONSE;
}

/**
 * Trigger portfolio sync with real Trade Republic data
 */
export async function syncPortfolio(
  portfolioId: number, 
  force: boolean = false
): Promise<PortfolioSyncResult> {
  if (isTauri()) {
    try {
      return await invoke('sync_portfolio', { portfolioId, force });
    } catch (error) {
      console.error('[IPC] sync_portfolio failed:', error);
      throw error;
    }
  }

// Mock fallback - simulate sync process
  console.log(`[IPC Mock] sync_portfolio(portfolioId: ${portfolioId}, force: ${force})`);
  await simulateDelay(2000); // Longer delay for sync
  return {
    syncedPositions: 15,
    newPositions: 2,
    updatedPositions: 13,
    totalValue: 124592,
    durationMs: 1500,
  };
}

// =============================================================================
// Trade Republic Auth Commands
// =============================================================================

/**
 * Get current Trade Republic authentication status
 */
export async function trGetAuthStatus(): Promise<AuthStatus> {
  if (isTauri()) {
    try {
      return await invoke('tr_get_auth_status');
    } catch (error) {
      console.error('[IPC] tr_get_auth_status failed:', error);
      throw error;
    }
  }

  // Mock fallback
  console.log('[IPC Mock] tr_get_auth_status');
  await simulateDelay();
  return {
    authState: 'idle',
    hasStoredCredentials: false,
  };
}

/**
 * Check for saved Trade Republic session
 */
export async function trCheckSavedSession(): Promise<SessionCheck> {
  if (isTauri()) {
    try {
      return await invoke('tr_check_saved_session');
    } catch (error) {
      console.error('[IPC] tr_check_saved_session failed:', error);
      throw error;
    }
  }

  // Mock fallback
  console.log('[IPC Mock] tr_check_saved_session');
  await simulateDelay();
  return {
    hasSession: false,
    prompt: 'login_required',
  };
}

/**
 * Start Trade Republic login process
 */
export async function trLogin(
  phone: string,
  pin: string,
  remember: boolean = true
): Promise<AuthResponse> {
  if (isTauri()) {
    try {
      return await invoke('tr_login', { phone, pin, remember });
    } catch (error) {
      console.error('[IPC] tr_login failed:', error);
      throw error;
    }
  }

  // Mock fallback - simulate 2FA flow
  console.log(`[IPC Mock] tr_login(phone: ${phone.replace(/\d(?=\d{4})/g, '*')}, pin: ***)`);
  await simulateDelay();
  
  // Simulate 2FA required
  return {
    authState: 'waiting_2fa',
    message: 'Enter the 4-digit code from your Trade Republic app',
    countdown: 30,
  };
}

/**
 * Submit 2FA code for Trade Republic
 */
export async function trSubmit2FA(code: string): Promise<AuthResponse> {
  if (isTauri()) {
    try {
      return await invoke('tr_submit_2fa', { code });
    } catch (error) {
      console.error('[IPC] tr_submit_2fa failed:', error);
      throw error;
    }
  }

  // Mock fallback - simulate successful auth
  console.log(`[IPC Mock] tr_submit_2fa(code: ****)`);
  await simulateDelay();
  
  return {
    authState: 'authenticated',
    message: 'Successfully authenticated with Trade Republic',
  };
}

/**
 * Logout from Trade Republic
 */
export async function trLogout(): Promise<LogoutResponse> {
  if (isTauri()) {
    try {
      return await invoke('tr_logout');
    } catch (error) {
      console.error('[IPC] tr_logout failed:', error);
      throw error;
    }
  }

  // Mock fallback
  console.log('[IPC Mock] tr_logout');
  await simulateDelay();
  
  return {
    authState: 'idle',
    message: 'Logged out and session cleared',
  };
}

// =============================================================================
// Connection Status
// =============================================================================

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
 * Get the current runtime environment
 */
export function getEnvironment(): 'tauri' | 'browser' {
  return isTauri() ? 'tauri' : 'browser';
}
