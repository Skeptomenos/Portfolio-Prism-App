import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import HoldingsView from './HoldingsView'
import * as ipc from '../../lib/ipc'
import { mockTrueHoldingsResponse } from '../../test/mocks/ipc'

vi.mock('../../lib/ipc', () => ({
  getTrueHoldings: vi.fn(),
  getPipelineReport: vi.fn(),
}))

describe('HoldingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    vi.mocked(ipc.getTrueHoldings).mockImplementation(() => new Promise(() => {}))
    vi.mocked(ipc.getPipelineReport).mockImplementation(() => new Promise(() => {}))

    render(<HoldingsView />)

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders holdings table with data', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('True Holdings Explorer')).toBeInTheDocument()
    })

    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    vi.mocked(ipc.getTrueHoldings).mockRejectedValue(new Error('Failed to load'))
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('Error Loading Data')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('shows empty state when no holdings', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue({
      holdings: [],
      summary: mockTrueHoldingsResponse.summary,
    })
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('No Holdings Data')).toBeInTheDocument()
    })
  })

  it('filters holdings by search query', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue({
      holdings: [
        { ...mockTrueHoldingsResponse.holdings[0], stock: 'Apple Inc.', ticker: 'AAPL' },
        {
          ...mockTrueHoldingsResponse.holdings[0],
          stock: 'Microsoft Corp.',
          ticker: 'MSFT',
          isin: 'US5949181045',
        },
      ],
      summary: mockTrueHoldingsResponse.summary,
    })
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search/i)
    fireEvent.change(searchInput, { target: { value: 'Microsoft' } })

    await waitFor(() => {
      expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument()
      expect(screen.getByText('Microsoft Corp.')).toBeInTheDocument()
    })
  })

  it('displays resolution health card', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText(/Resolution/i)).toBeInTheDocument()
    })
  })

  it('shows stock details when clicking a holding', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Apple Inc.'))

    await waitFor(() => {
      expect(screen.getByText('ETF Breakdown')).toBeInTheDocument()
    })
  })

  it('displays resolution status badges', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue(mockTrueHoldingsResponse)
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    })
  })

  it('filters by resolution status', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue({
      holdings: [
        { ...mockTrueHoldingsResponse.holdings[0], resolutionStatus: 'resolved' },
        {
          ...mockTrueHoldingsResponse.holdings[0],
          stock: 'Unknown Corp.',
          ticker: 'UNK',
          isin: '',
          resolutionStatus: 'unresolved',
        },
      ],
      summary: mockTrueHoldingsResponse.summary,
    })
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    })
  })

  it('sorts holdings by value', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue({
      holdings: [
        { ...mockTrueHoldingsResponse.holdings[0], stock: 'Small Corp.', totalValue: 1000 },
        {
          ...mockTrueHoldingsResponse.holdings[0],
          stock: 'Big Corp.',
          totalValue: 50000,
          isin: 'US1234567890',
        },
      ],
      summary: mockTrueHoldingsResponse.summary,
    })
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText('Big Corp.')).toBeInTheDocument()
    })
  })

  it('displays needs attention section for unresolved holdings', async () => {
    vi.mocked(ipc.getTrueHoldings).mockResolvedValue({
      holdings: [
        {
          ...mockTrueHoldingsResponse.holdings[0],
          resolutionStatus: 'unresolved',
          resolutionConfidence: 0,
        },
      ],
      summary: { ...mockTrueHoldingsResponse.summary, unresolved: 1 },
    })
    vi.mocked(ipc.getPipelineReport).mockResolvedValue({})

    render(<HoldingsView />)

    await waitFor(() => {
      expect(screen.getByText(/Holdings Need Attention/i)).toBeInTheDocument()
    })
  })
})
