/**
 * Portfolio Data Query Hooks
 * 
 * These hooks provide async data fetching with caching via TanStack Query.
 * Currently using mock data - will be replaced with Tauri IPC calls in TASK-302.
 */

import { useQuery } from '@tanstack/react-query';
import type { DashboardData, Holding, XRayData, OverlapData } from '../types';

// =============================================================================
// Mock Data (to be replaced with Tauri IPC calls)
// =============================================================================

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

const MOCK_HOLDINGS_DATA: Holding[] = [
  { isin: 'US0378331005', name: 'Apple Inc.', ticker: 'AAPL', value: 8420, weight: 0.068, pnl: 842, pnlPercentage: 11.1 },
  { isin: 'US5949181045', name: 'Microsoft Corp.', ticker: 'MSFT', value: 7150, weight: 0.057, pnl: 650, pnlPercentage: 10.0 },
  { isin: 'US67066G1040', name: 'NVIDIA Corp.', ticker: 'NVDA', value: 6890, weight: 0.055, pnl: 1240, pnlPercentage: 21.9 },
  { isin: 'US0231351067', name: 'Amazon.com Inc.', ticker: 'AMZN', value: 5320, weight: 0.043, pnl: 420, pnlPercentage: 8.6 },
  { isin: 'US30303M1027', name: 'Meta Platforms', ticker: 'META', value: 4280, weight: 0.034, pnl: -120, pnlPercentage: -2.7 },
  { isin: 'US02079K3059', name: 'Alphabet Inc.', ticker: 'GOOGL', value: 3950, weight: 0.032, pnl: 290, pnlPercentage: 7.9 },
  { isin: 'US88160R1014', name: 'Tesla Inc.', ticker: 'TSLA', value: 3120, weight: 0.025, pnl: -180, pnlPercentage: -5.5 },
  { isin: 'US4592001014', name: 'IBM Corp.', ticker: 'IBM', value: 2840, weight: 0.023, pnl: 140, pnlPercentage: 5.2 },
];

const MOCK_XRAY_DATA: XRayData = {
  totalUniqueStocks: 142,
  totalETFs: 8,
  underlyingHoldings: [
    {
      isin: 'US0378331005',
      name: 'Apple Inc.',
      ticker: 'AAPL',
      totalWeight: 0.068,
      sources: [
        { etf: 'VTI', weight: 0.045 },
        { etf: 'QQQ', weight: 0.023 },
      ],
    },
    {
      isin: 'US5949181045',
      name: 'Microsoft Corp.',
      ticker: 'MSFT',
      totalWeight: 0.057,
      sources: [
        { etf: 'VTI', weight: 0.038 },
        { etf: 'QQQ', weight: 0.019 },
      ],
    },
  ],
};

const MOCK_OVERLAP_DATA: OverlapData = {
  etfPairs: [
    { etf1: 'VTI', etf2: 'VOO', overlapPercentage: 82.5, sharedHoldings: 505 },
    { etf1: 'VTI', etf2: 'QQQ', overlapPercentage: 45.2, sharedHoldings: 102 },
    { etf1: 'VOO', etf2: 'QQQ', overlapPercentage: 38.7, sharedHoldings: 98 },
  ],
};

// =============================================================================
// Mock API Functions (simulate network delay)
// =============================================================================

async function fetchDashboardData(portfolioId: number): Promise<DashboardData> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
  
  // In the future, this will be:
  // return await invoke('get_dashboard_data', { portfolioId });
  
  console.log(`[Mock API] Fetching dashboard data for portfolio ${portfolioId}`);
  return MOCK_DASHBOARD_DATA;
}

async function fetchHoldingsData(portfolioId: number): Promise<Holding[]> {
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
  console.log(`[Mock API] Fetching holdings data for portfolio ${portfolioId}`);
  return MOCK_HOLDINGS_DATA;
}

async function fetchXRayData(portfolioId: number): Promise<XRayData> {
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
  console.log(`[Mock API] Fetching X-Ray data for portfolio ${portfolioId}`);
  return MOCK_XRAY_DATA;
}

async function fetchOverlapData(portfolioId: number): Promise<OverlapData> {
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
  console.log(`[Mock API] Fetching overlap data for portfolio ${portfolioId}`);
  return MOCK_OVERLAP_DATA;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch dashboard summary data
 */
export function useDashboardData(portfolioId: number) {
  return useQuery({
    queryKey: ['dashboard', portfolioId],
    queryFn: () => fetchDashboardData(portfolioId),
  });
}

/**
 * Fetch all holdings
 */
export function useHoldingsData(portfolioId: number) {
  return useQuery({
    queryKey: ['holdings', portfolioId],
    queryFn: () => fetchHoldingsData(portfolioId),
  });
}

/**
 * Fetch X-Ray (look-through) data
 */
export function useXRayData(portfolioId: number) {
  return useQuery({
    queryKey: ['xray', portfolioId],
    queryFn: () => fetchXRayData(portfolioId),
  });
}

/**
 * Fetch ETF overlap data
 */
export function useOverlapData(portfolioId: number) {
  return useQuery({
    queryKey: ['overlap', portfolioId],
    queryFn: () => fetchOverlapData(portfolioId),
  });
}

// =============================================================================
// Mutation Hooks (for actions that modify data)
// =============================================================================

// Will be added in TASK-302 when IPC is ready:
// - useSyncPortfolio()
// - useRefreshPrices()
