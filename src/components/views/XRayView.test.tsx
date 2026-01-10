import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import XRayView from './XRayView'
import * as ipc from '../../lib/ipc'

vi.mock('../../lib/ipc', () => ({
  runPipeline: vi.fn(),
  getDashboardData: vi.fn(),
}))

vi.mock('../../hooks/usePipelineDiagnostics', () => ({
  usePipelineDiagnostics: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../hooks/usePipelineProgress', () => ({
  usePipelineProgress: vi.fn(() => ({})),
}))

vi.mock('../../hooks/usePortfolioData', () => ({
  useDashboardData: vi.fn(() => ({
    isLoading: false,
    data: { totalValue: 100000 },
  })),
}))

vi.mock('../../store/useAppStore', () => ({
  useActivePortfolioId: vi.fn(() => 1),
}))

describe('XRayView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows no data state when pipeline has not run', async () => {
    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByText('No Pipeline Data Available')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Run Deep Analysis/i })).toBeInTheDocument()
  })

  it('triggers analysis when clicking run button', async () => {
    vi.mocked(ipc.runPipeline).mockResolvedValue({ success: true, errors: [], durationMs: 1000 })

    render(<XRayView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Deep Analysis/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Deep Analysis/i }))

    await waitFor(() => {
      expect(ipc.runPipeline).toHaveBeenCalled()
    })
  })

  it('shows error message when pipeline fails', async () => {
    vi.mocked(ipc.runPipeline).mockResolvedValue({
      success: false,
      errors: ['ETF decomposition failed'],
      durationMs: 500,
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
    vi.mocked(ipc.runPipeline).mockImplementation(() => new Promise(() => {}))

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
