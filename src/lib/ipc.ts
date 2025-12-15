/**
 * IPC Commands Module
 * 
 * High-level functions for communicating with the Rust backend.
 * Falls back to mock data when not running in Tauri.
 */

import { invoke, isTauri } from './tauri';
import type { DashboardData, EngineHealth, Holding } from '../types';

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
 * Trigger portfolio sync
 */
export async function syncPortfolio(
  portfolioId: number, 
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
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
  return { success: true, message: 'Mock sync completed' };
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
