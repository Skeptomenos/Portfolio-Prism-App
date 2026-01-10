import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import Dashboard from './Dashboard'
import * as ipc from '../../lib/ipc'
import { mockDashboardData, mockTrueHoldingsResponse } from '../../test/mocks/ipc'

vi.mock('../../lib/ipc', () => ({
  getDashboardData: vi.fn(),
  getTrueHoldings: vi.fn(),
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    vi.mocked(ipc.getDashboardData).mockImplementation(() => new Promise(() => {}))
    vi.mocked(ipc.getTrueHoldings).mockImplementation(() => new Promise(() => {}))

    render(<Dashboard />)

    expect(screen.getByText('Portfolio Overview')).toBeInTheDocument()
    expect(screen.getByText(/Loading your portfolio data/)).toBeInTheDocument()
  })

  it('renders dashboard with data', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData)
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    // Wait for data to load (loading state disappears)
    await waitFor(() => {
      expect(screen.queryByText(/Loading your portfolio data/)).not.toBeInTheDocument()
    })

    expect(screen.getByText('Total Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('Day Change')).toBeInTheDocument()
    expect(screen.getByText('Total P/L')).toBeInTheDocument()
  })

  it('displays total value formatted correctly', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData)
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/€125,000/)).toBeInTheDocument()
    })
  })

  it('displays top holdings section', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData)
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText(/Loading your portfolio data/)).not.toBeInTheDocument()
    })

    expect(screen.getByText('Top Holdings')).toBeInTheDocument()
    expect(screen.getAllByText('Apple Inc.').length).toBeGreaterThan(0)
    expect(screen.getByText('Microsoft Corp.')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    vi.mocked(ipc.getDashboardData).mockRejectedValue(new Error('Failed to load'))
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('shows empty state when no positions', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      isEmpty: true,
      positionCount: 0,
    })
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('No Portfolio Data Yet')).toBeInTheDocument()
    })

    expect(screen.getByText(/Connect to Trade Republic/)).toBeInTheDocument()
  })

  it('displays true exposure section when data available', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue(mockDashboardData)
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('True Exposure')).toBeInTheDocument()
    })
  })

  it('shows positive P/L with green styling', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      totalGain: 5000,
      gainPercentage: 10,
    })
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/\+€5,000/)).toBeInTheDocument()
    })
  })

  it('shows negative P/L with red styling', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      totalGain: -2000,
      gainPercentage: -5,
    })
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText(/Loading your portfolio data/)).not.toBeInTheDocument()
    })

    expect(screen.getByText(/€-2,000\.00/)).toBeInTheDocument()
  })

  it('displays no holdings message when topHoldings is empty', async () => {
    vi.mocked(ipc.getDashboardData).mockResolvedValue({
      ...mockDashboardData,
      topHoldings: [],
    })
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue({
      holdings: [],
      summary: mockTrueHoldingsResponse.summary,
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('No holdings data available')).toBeInTheDocument()
    })
  })
})
