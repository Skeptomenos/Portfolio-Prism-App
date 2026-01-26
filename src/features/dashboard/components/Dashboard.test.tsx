import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '../../../test/utils'
import Dashboard from './Dashboard'
import {
  setupTauriMock,
  resetTauriMocks,
  mockDashboardData,
  mockTrueHoldingsData,
} from '../../../test/mocks/tauri'
import { mockTrueHoldingsResponse } from '../../../test/mocks/ipc'

describe('Dashboard', () => {
  beforeEach(() => {
    setupTauriMock({
      get_dashboard_data: () => mockDashboardData(),
      get_true_holdings: () => mockTrueHoldingsData(),
    })
  })

  afterEach(() => {
    resetTauriMocks()
  })

  it('shows loading state initially', () => {
    setupTauriMock({
      get_dashboard_data: () => new Promise(() => {}),
      get_true_holdings: () => new Promise(() => {}),
    })

    render(<Dashboard />)

    expect(screen.getByText('Portfolio Overview')).toBeInTheDocument()
    expect(screen.getByText(/Loading your portfolio data/)).toBeInTheDocument()
  })

  it('renders dashboard with data', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText(/Loading your portfolio data/)).not.toBeInTheDocument()
    })

    expect(screen.getByText('Total Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('Day Change')).toBeInTheDocument()
    expect(screen.getByText('Total P/L')).toBeInTheDocument()
  })

  it('displays total value formatted correctly', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/€125,000/)).toBeInTheDocument()
    })
  })

  it('displays top holdings section', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText(/Loading your portfolio data/)).not.toBeInTheDocument()
    })

    expect(screen.getByText('Top Holdings')).toBeInTheDocument()
    expect(screen.getAllByText('Apple Inc.').length).toBeGreaterThan(0)
  })

  it('shows error state with retry button', async () => {
    setupTauriMock({
      get_dashboard_data: () => Promise.reject(new Error('Failed to load')),
      get_true_holdings: () => mockTrueHoldingsData(),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('shows empty state when no positions', async () => {
    setupTauriMock({
      get_dashboard_data: () => ({
        ...mockDashboardData(),
        isEmpty: true,
        positionCount: 0,
      }),
      get_true_holdings: () => mockTrueHoldingsData(),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('No Portfolio Data Yet')).toBeInTheDocument()
    })

    expect(screen.getByText(/Connect to Trade Republic/)).toBeInTheDocument()
  })

  it('displays true exposure section when data available', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('True Exposure')).toBeInTheDocument()
    })
  })

  it('shows positive P/L with green styling', async () => {
    setupTauriMock({
      get_dashboard_data: () => ({
        ...mockDashboardData(),
        totalGain: 5000,
        gainPercentage: 10,
      }),
      get_true_holdings: () => mockTrueHoldingsData(),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText(/\+€5,000/)).toBeInTheDocument()
    })
  })

  it('shows negative P/L with red styling', async () => {
    setupTauriMock({
      get_dashboard_data: () => ({
        ...mockDashboardData(),
        totalGain: -2000,
        gainPercentage: -5,
      }),
      get_true_holdings: () => mockTrueHoldingsData(),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText(/Loading your portfolio data/)).not.toBeInTheDocument()
    })

    expect(screen.getByText(/€-2,000\.00/)).toBeInTheDocument()
  })

  it('displays no holdings message when topHoldings is empty', async () => {
    setupTauriMock({
      get_dashboard_data: () => ({
        ...mockDashboardData(),
        topHoldings: [],
      }),
      get_true_holdings: () => ({
        holdings: [],
        summary: mockTrueHoldingsResponse.summary,
      }),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('No holdings data available')).toBeInTheDocument()
    })
  })
})
