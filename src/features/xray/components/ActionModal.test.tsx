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

describe('ActionModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    setupTauriMock({
      upload_holdings: () => ({
        success: true,
        holdingsCount: 150,
        totalWeight: 98.5,
        contributedToHive: true,
        isin: 'IE00B4L5Y983',
      }),
      run_pipeline: () => ({ success: true, errors: [], durationMs: 1000 }),
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

  describe('view mode', () => {
    it('displays failure details in view mode', () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="view"
        />
      )

      expect(screen.getByText('Issue Details')).toBeInTheDocument()
      expect(screen.getByText('etf decomposition')).toBeInTheDocument()
      expect(screen.getByText(mockEtfFailure.item)).toBeInTheDocument()
      expect(screen.getByText(mockEtfFailure.error)).toBeInTheDocument()
    })

    it('displays fix hint when available', () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="view"
        />
      )

      expect(screen.getByText(mockEtfFailure.fix!)).toBeInTheDocument()
    })

    it('calls onClose when Close button is clicked', () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="view"
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('fix mode for ETF issues', () => {
    it('shows upload form for ETF resolution failures', () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="fix"
        />
      )

      expect(screen.getByText(/Fix: Upload Holdings for IE00B4L5Y983/)).toBeInTheDocument()
      expect(screen.getByText(/Click to select or drag and drop/)).toBeInTheDocument()
    })

    it('shows file info after selecting a file', async () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="fix"
        />
      )

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test,data'], 'holdings.csv', { type: 'text/csv' })

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('holdings.csv')).toBeInTheDocument()
      })
    })

    it('validates file size', async () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="fix"
        />
      )

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.csv', { type: 'text/csv' })
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 })

      fireEvent.change(input, { target: { files: [largeFile] } })

      await waitFor(() => {
        expect(screen.getByText(/File too large/)).toBeInTheDocument()
      })
    })

    it('validates file type', async () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="fix"
        />
      )

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const invalidFile = new File(['data'], 'file.txt', { type: 'text/plain' })

      fireEvent.change(input, { target: { files: [invalidFile] } })

      await waitFor(() => {
        expect(screen.getByText(/Invalid file type/)).toBeInTheDocument()
      })
    })

    it('uploads file and shows success', async () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="fix"
          onSuccess={mockOnSuccess}
        />
      )

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test,data'], 'holdings.csv', { type: 'text/csv' })

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('holdings.csv')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Upload & Analyze/ }))

      await waitFor(() => {
        expect(mockTauriInvoke).toHaveBeenCalledWith('upload_holdings', {
          filePath: 'holdings.csv',
          etfIsin: 'IE00B4L5Y983',
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Upload Successful')).toBeInTheDocument()
        expect(screen.getByText(/150 holdings/)).toBeInTheDocument()
      })

      expect(mockOnSuccess).toHaveBeenCalled()
    })

    it('shows error on upload failure', async () => {
      setupTauriMock({
        upload_holdings: () => {
          throw new Error('File parsing failed')
        },
      })

      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockEtfFailure}
          actionType="fix"
        />
      )

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['bad,data'], 'holdings.csv', { type: 'text/csv' })

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('holdings.csv')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Upload & Analyze/ }))

      await waitFor(() => {
        expect(screen.getByText('Upload Failed')).toBeInTheDocument()
        expect(screen.getByText(/File parsing failed/)).toBeInTheDocument()
      })
    })
  })

  describe('fix mode for non-ETF issues', () => {
    it('shows info modal for non-uploadable issues', () => {
      render(
        <ActionModal
          isOpen={true}
          onClose={mockOnClose}
          failure={mockNonEtfFailure}
          actionType="fix"
        />
      )

      expect(screen.getByText('Fix Issue')).toBeInTheDocument()
      expect(screen.getByText(/cannot be automatically fixed/)).toBeInTheDocument()
    })
  })
})
