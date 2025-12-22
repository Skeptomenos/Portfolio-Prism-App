/**
 * Portfolio Data Query Hooks
 * 
 * These hooks provide async data fetching with caching via TanStack Query.
 * Uses the IPC layer which falls back to mock data when not in Tauri.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getDashboardData, 
  getHoldings, 
  syncPortfolio, 
  getEngineHealth,
  getTrueHoldings,
  getOverlapAnalysis
} from '../lib/ipc';
import { useAppStore } from '../store/useAppStore';

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
 */
export function useXRayData(portfolioId: number) {
  return useQuery({
    queryKey: ['xray', portfolioId],
    queryFn: getTrueHoldings,
  });
}

/**
 * Fetch ETF overlap data
 */
export function useOverlapData(portfolioId: number) {
  return useQuery({
    queryKey: ['overlap', portfolioId],
    queryFn: getOverlapAnalysis,
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
    onSuccess: () => {
      // If sync completed successfully, it will have syncedPositions > 0
      completeSync();
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    },
    onError: (error) => {
      failSync(error instanceof Error ? error.message : 'Unknown error');
    },
  });
}
