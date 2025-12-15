/**
 * Portfolio Data Query Hooks
 * 
 * These hooks provide async data fetching with caching via TanStack Query.
 * Uses the IPC layer which falls back to mock data when not in Tauri.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDashboardData, getHoldings, syncPortfolio, getEngineHealth } from '../lib/ipc';
import { useAppStore } from '../store/useAppStore';
import type { XRayData, OverlapData } from '../types';

// =============================================================================
// Mock Data for X-Ray and Overlap (not yet in Rust backend)
// =============================================================================

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

// Simulate delay for mock data
async function simulateDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch engine health status
 * Uses IPC layer (Tauri or mock fallback)
 */
export function useEngineHealth() {
  return useQuery({
    queryKey: ['engineHealth'],
    queryFn: getEngineHealth,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds
  });
}

/**
 * Fetch dashboard summary data
 * Uses IPC layer (Tauri or mock fallback)
 */
export function useDashboardData(portfolioId: number) {
  return useQuery({
    queryKey: ['dashboard', portfolioId],
    queryFn: () => getDashboardData(portfolioId),
  });
}

/**
 * Fetch all holdings
 * Uses IPC layer (Tauri or mock fallback)
 */
export function useHoldingsData(portfolioId: number) {
  return useQuery({
    queryKey: ['holdings', portfolioId],
    queryFn: () => getHoldings(portfolioId),
  });
}

/**
 * Fetch X-Ray (look-through) data
 * Currently mock only - will be added to Rust backend later
 */
export function useXRayData(portfolioId: number) {
  return useQuery({
    queryKey: ['xray', portfolioId],
    queryFn: async () => {
      console.log(`[Mock] Fetching X-Ray data for portfolio ${portfolioId}`);
      await simulateDelay();
      return MOCK_XRAY_DATA;
    },
  });
}

/**
 * Fetch ETF overlap data
 * Currently mock only - will be added to Rust backend later
 */
export function useOverlapData(portfolioId: number) {
  return useQuery({
    queryKey: ['overlap', portfolioId],
    queryFn: async () => {
      console.log(`[Mock] Fetching overlap data for portfolio ${portfolioId}`);
      await simulateDelay();
      return MOCK_OVERLAP_DATA;
    },
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Trigger portfolio sync
 * Uses IPC layer to communicate with Rust/Python backend
 */
export function useSyncPortfolio() {
  const queryClient = useQueryClient();
  const startSync = useAppStore((state) => state.startSync);
  const completeSync = useAppStore((state) => state.completeSync);
  const failSync = useAppStore((state) => state.failSync);
  const activePortfolioId = useAppStore((state) => state.activePortfolioId);

  return useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      startSync();
      return syncPortfolio(activePortfolioId, force);
    },
    onSuccess: (result) => {
      if (result.success) {
        completeSync();
        // Invalidate queries to refetch fresh data
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['holdings'] });
      } else {
        failSync(result.message);
      }
    },
    onError: (error) => {
      failSync(error instanceof Error ? error.message : 'Unknown error');
    },
  });
}
