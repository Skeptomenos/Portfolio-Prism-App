import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useEngineHealth,
  useDashboardData,
  useHoldingsData,
  useXRayData,
  useSyncPortfolio,
} from './usePortfolioData'
import * as ipc from '../lib/ipc'
import { mockDashboardData, mockEngineHealth, mockTrueHoldingsResponse } from '../test/mocks/ipc'

vi.mock('../lib/ipc', () => ({
  getEngineHealth: vi.fn(),
  getDashboardData: vi.fn(),
  getHoldings: vi.fn(),
  getTrueHoldings: vi.fn(),
  syncPortfolio: vi.fn(),
}))

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => {
    const state = {
      startSync: vi.fn(),
      completeSync: vi.fn(),
      failSync: vi.fn(),
      activePortfolioId: 1,
    }
    return selector(state)
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('usePortfolioData hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useEngineHealth', () => {
    it('fetches engine health data', async () => {
      vi.mocked(ipc.getEngineHealth).mockResolvedValue(mockEngineHealth)

      const { result } = renderHook(() => useEngineHealth(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockEngineHealth)
      expect(ipc.getEngineHealth).toHaveBeenCalled()
    })

    it('handles error state', async () => {
      vi.mocked(ipc.getEngineHealth).mockRejectedValue(new Error('Connection failed'))

      const { result } = renderHook(() => useEngineHealth(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })

    it('returns loading state initially', () => {
      vi.mocked(ipc.getEngineHealth).mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useEngineHealth(), { wrapper: createWrapper() })

      expect(result.current.isLoading).toBe(true)
    })
  })

  describe('useDashboardData', () => {
    it('fetches dashboard data for a portfolio', async () => {
      vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData)

      const { result } = renderHook(() => useDashboardData(1), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockDashboardData)
      expect(ipc.getDashboardData).toHaveBeenCalledWith(1)
    })

    it('uses portfolio ID in query key for caching', async () => {
      vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData)

      const { result: result1 } = renderHook(() => useDashboardData(1), {
        wrapper: createWrapper(),
      })
      const { result: result2 } = renderHook(() => useDashboardData(2), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
        expect(result2.current.isSuccess).toBe(true)
      })

      expect(ipc.getDashboardData).toHaveBeenCalledWith(1)
      expect(ipc.getDashboardData).toHaveBeenCalledWith(2)
    })

    it('handles error state', async () => {
      vi.mocked(ipc.getDashboardData).mockRejectedValue(new Error('Failed to load'))

      const { result } = renderHook(() => useDashboardData(1), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  describe('useHoldingsData', () => {
    it('fetches holdings data for a portfolio', async () => {
      const mockHoldings = mockDashboardData.topHoldings
      vi.mocked(ipc.getHoldings).mockResolvedValue(mockHoldings)

      const { result } = renderHook(() => useHoldingsData(1), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockHoldings)
      expect(ipc.getHoldings).toHaveBeenCalledWith(1)
    })

    it('handles error state', async () => {
      vi.mocked(ipc.getHoldings).mockRejectedValue(new Error('Failed to load'))

      const { result } = renderHook(() => useHoldingsData(1), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  describe('useXRayData', () => {
    it('fetches true holdings data', async () => {
      vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

      const { result } = renderHook(() => useXRayData(1), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockTrueHoldingsResponse)
      expect(ipc.getTrueHoldings).toHaveBeenCalled()
    })

    it('handles error state', async () => {
      vi.mocked(ipc.getTrueHoldings).mockRejectedValue(new Error('Failed to load'))

      const { result } = renderHook(() => useXRayData(1), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  describe('useSyncPortfolio', () => {
    it('triggers sync mutation', async () => {
      vi.mocked(ipc.syncPortfolio).mockResolvedValue({
        syncedPositions: 10,
        newPositions: 2,
        updatedPositions: 8,
        totalValue: 75000,
        durationMs: 1500,
      })

      const { result } = renderHook(() => useSyncPortfolio(), { wrapper: createWrapper() })

      result.current.mutate({})

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(ipc.syncPortfolio).toHaveBeenCalledWith(1, false)
    })

    it('passes force flag to sync', async () => {
      vi.mocked(ipc.syncPortfolio).mockResolvedValue({
        syncedPositions: 10,
        newPositions: 2,
        updatedPositions: 8,
        totalValue: 75000,
        durationMs: 1500,
      })

      const { result } = renderHook(() => useSyncPortfolio(), { wrapper: createWrapper() })

      result.current.mutate({ force: true })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(ipc.syncPortfolio).toHaveBeenCalledWith(1, true)
    })

    it('handles sync error', async () => {
      vi.mocked(ipc.syncPortfolio).mockRejectedValue(new Error('Sync failed'))

      const { result } = renderHook(() => useSyncPortfolio(), { wrapper: createWrapper() })

      result.current.mutate({})

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })

    it('returns loading state during sync', async () => {
      vi.mocked(ipc.syncPortfolio).mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useSyncPortfolio(), { wrapper: createWrapper() })

      result.current.mutate({})

      await waitFor(() => {
        expect(result.current.isPending).toBe(true)
      })
    })
  })
})
