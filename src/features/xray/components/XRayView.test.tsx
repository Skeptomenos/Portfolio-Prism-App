import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test/utils'
import XRayView from './XRayView'
import { setupTauriMock, resetTauriMocks, mockTauriInvoke } from '../../../test/mocks/tauri'

vi.mock('../hooks/usePipelineDiagnostics', () => ({
  usePipelineDiagnostics: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('../hooks/usePipelineProgress', () => ({
  usePipelineProgress: vi.fn(() => ({})),
}))

vi.mock('@/features/portfolio/hooks/usePortfolioData', () => ({
  useDashboardData: vi.fn(() => ({
    isLoading: false,
    data: { totalValue: 100000 },
  })),
}))

vi.mock('../../../store/useAppStore', () => ({
  useActivePortfolioId: vi.fn(() => 1),
}))

describe('XRayView', () => {
  beforeEach(() => {
    setupTauriMock({
      run_pipeline: () => ({ success: true, errors: [], durationMs: 1000 }),
    })
  })

  afterEach(() => {
    resetTauriMocks()
  })

  it('shows no data state when pipeline has not run', async () => {
    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByText('No Pipeline Data Available')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Run Deep Analysis/i })).toBeInTheDocument()
  })

  it('triggers analysis when clicking run button', async () => {
    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Deep Analysis/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Deep Analysis/i }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('run_pipeline', {})
    })
  })

  it('shows error message when pipeline fails', async () => {
    setupTauriMock({
      run_pipeline: () => ({
        success: false,
        errors: ['ETF decomposition failed'],
        durationMs: 500,
      }),
    })

    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Deep Analysis/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Deep Analysis/i }))

    await waitFor(() => {
      expect(screen.getByText(/ETF decomposition failed/)).toBeInTheDocument()
    })
  })

  it('shows loading state during analysis', async () => {
    setupTauriMock({
      run_pipeline: () => new Promise(() => {}),
    })

    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Deep Analysis/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Deep Analysis/i }))

    await waitFor(() => {
      expect(screen.getByText(/Analyzing/)).toBeInTheDocument()
    })
  })

  it('displays sync message in empty state', async () => {
    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByText(/Sync your portfolio/)).toBeInTheDocument()
    })
  })
})
