import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test/utils'
import ActionModal from './ActionModal'
import { setupTauriMock, resetTauriMocks, mockTauriInvoke } from '../../../test/mocks/tauri'
import type { PipelineFailure } from '../types'

const mockEtfFailure: PipelineFailure = {
  severity: 'ERROR',
  stage: 'etf_decomposition',
  item: 'IE00B4L5Y983 - iShares Core MSCI World',
  error: 'Holdings data not found',
  fix: 'Upload holdings CSV from provider website',
}

const mockNonEtfFailure: PipelineFailure = {
  severity: 'WARNING',
  stage: 'enrichment',
  item: 'AAPL',
  error: 'Price data unavailable',
  fix: 'Check API connectivity',
}

const mockPreview = {
  isin: 'IE00B4L5Y983',
  filePath: '/Users/test/holdings.csv',
  fileName: 'holdings.csv',
  holdingsCount: 2,
  totalWeight: 98.5,
  warnings: ['Total weight is 98.5%, which differs from the expected 100%.'],
  rows: [
    { rowId: 0, isin: 'US0378331005', name: 'Apple Inc.', ticker: 'AAPL', weight: 4.5 },
    { rowId: 1, isin: 'US5949181045', name: 'Microsoft Corp.', ticker: 'MSFT', weight: 94.0 },
  ],
}

describe('ActionModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    setupTauriMock({
      pick_holdings_file: () => '/Users/test/holdings.csv',
      preview_holdings_upload: () => mockPreview,
      commit_holdings_upload: () => ({
        success: true,
        holdingsCount: 2,
        totalWeight: 98.5,
        contributedToHive: true,
        isin: 'IE00B4L5Y983',
        message: 'Holdings saved successfully.',
      }),
    })
  })

  afterEach(() => {
    resetTauriMocks()
    vi.clearAllMocks()
  })

  it('renders nothing when failure is null', () => {
    const { container } = render(
      <ActionModal isOpen={true} onClose={mockOnClose} failure={null} actionType="fix" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when modal is closed', () => {
    const { container } = render(
      <ActionModal isOpen={false} onClose={mockOnClose} failure={mockEtfFailure} actionType="fix" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('displays failure details in view mode', () => {
    render(
      <ActionModal isOpen={true} onClose={mockOnClose} failure={mockEtfFailure} actionType="view" />
    )

    expect(screen.getByText('Issue Details')).toBeInTheDocument()
    expect(screen.getByText('etf decomposition')).toBeInTheDocument()
    expect(screen.getByText(mockEtfFailure.item)).toBeInTheDocument()
    expect(screen.getByText(mockEtfFailure.error)).toBeInTheDocument()
    expect(screen.getByText(mockEtfFailure.fix!)).toBeInTheDocument()
  })

  it('shows the review-first upload flow for ETF failures', () => {
    render(
      <ActionModal isOpen={true} onClose={mockOnClose} failure={mockEtfFailure} actionType="fix" />
    )

    expect(screen.getByText(/Review Holdings for IE00B4L5Y983/)).toBeInTheDocument()
    expect(screen.getByText(/Review-first import/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose File' })).toBeInTheDocument()
  })

  it('loads a preview after choosing a native file', async () => {
    render(
      <ActionModal isOpen={true} onClose={mockOnClose} failure={mockEtfFailure} actionType="fix" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose File' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('pick_holdings_file', {})
      expect(mockTauriInvoke).toHaveBeenCalledWith('preview_holdings_upload', {
        filePath: '/Users/test/holdings.csv',
        etfIsin: 'IE00B4L5Y983',
      })
    })

    expect(screen.getByDisplayValue('Apple Inc.')).toBeInTheDocument()
    expect(screen.getByText(/Total weight is 98.5%/)).toBeInTheDocument()
  })

  it('saves reviewed holdings without auto-running the pipeline', async () => {
    render(
      <ActionModal
        isOpen={true}
        onClose={mockOnClose}
        failure={mockEtfFailure}
        actionType="fix"
        onSuccess={mockOnSuccess}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose File' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Apple Inc.')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('Apple Inc.'), {
      target: { value: 'Apple Inc. Class A' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Reviewed Holdings' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('commit_holdings_upload', {
        etfIsin: 'IE00B4L5Y983',
        holdings: [
          {
            rowId: 0,
            isin: 'US0378331005',
            name: 'Apple Inc. Class A',
            ticker: 'AAPL',
            weight: 4.5,
          },
          { rowId: 1, isin: 'US5949181045', name: 'Microsoft Corp.', ticker: 'MSFT', weight: 94 },
        ],
      })
    })

    expect(mockOnSuccess).toHaveBeenCalled()
    expect(mockTauriInvoke).not.toHaveBeenCalledWith('run_pipeline', {})
    expect(screen.getByText(/Re-run analysis when you are ready/)).toBeInTheDocument()
  })

  it('shows a close-only modal for non-ETF issues', () => {
    render(
      <ActionModal
        isOpen={true}
        onClose={mockOnClose}
        failure={mockNonEtfFailure}
        actionType="fix"
      />
    )

    expect(screen.getByText('Fix Issue')).toBeInTheDocument()
    expect(screen.getByText(/cannot be fixed automatically/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
