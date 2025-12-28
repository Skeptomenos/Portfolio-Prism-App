/**
 * TanStack Query Client Configuration
 * 
 * Configured for a desktop application (Tauri):
 * - Longer stale times (data doesn't change as frequently as web)
 * - No refetch on window focus (desktop behavior differs from browser)
 * - Single retry on failure
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      
      // Keep unused data in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      
      // Desktop app - don't refetch when window regains focus
      refetchOnWindowFocus: false,
      
      // Don't refetch when reconnecting (we handle this via Tauri events)
      refetchOnReconnect: false,
      
      // Single retry with exponential backoff
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
});

/**
 * Invalidate all portfolio-related queries
 * Called when we receive a `portfolio-updated` event from Tauri
 */
export function invalidatePortfolioQueries(portfolioId?: number) {
  if (portfolioId !== undefined) {
    // Invalidate specific portfolio
    queryClient.invalidateQueries({ queryKey: ['dashboard', portfolioId] });
    queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] });
    queryClient.invalidateQueries({ queryKey: ['xray', portfolioId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['holdings'] });
    queryClient.invalidateQueries({ queryKey: ['xray'] });
  }
}

/**
 * Clear all cached data
 * Useful for logout or major state reset
 */
export function clearQueryCache() {
  queryClient.clear();
}
