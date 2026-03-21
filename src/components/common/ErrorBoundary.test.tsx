import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import { ErrorBoundary } from './ErrorBoundary'
import { useAppStore } from '../../store/useAppStore'
import * as feedbackApi from '../../lib/api/feedback'

vi.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({ telemetryMode: 'ask' })),
  },
}))

vi.mock('../../lib/api/feedback', () => ({
  sendFeedback: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../lib/scrubber', () => ({
  scrubObject: vi.fn((obj) => obj),
}))

const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>Normal content</div>
}

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    vi.clearAllMocks()
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument()
  })

  it('displays error name and message', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('shows reload button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Reload Application')).toBeInTheDocument()
  })

  it('shows report button when telemetryMode is not auto', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      telemetryMode: 'ask',
    } as unknown as ReturnType<typeof useAppStore.getState>)

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Confirm & Send Report')).toBeInTheDocument()
  })

  it('shows review button when telemetryMode is not auto', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      telemetryMode: 'ask',
    } as unknown as ReturnType<typeof useAppStore.getState>)

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Review Scrubbed Data')).toBeInTheDocument()
  })

  it('sends feedback when report button is clicked', async () => {
    const sendFeedbackMock = vi.mocked(feedbackApi.sendFeedback)

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    const reportButton = screen.getByText('Confirm & Send Report')
    fireEvent.click(reportButton)

    await waitFor(() => {
      expect(sendFeedbackMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'critical',
          message: expect.stringContaining('App Crash'),
        })
      )
    })
  })

  it('shows "Report Sent" after successful report', async () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    const reportButton = screen.getByText('Confirm & Send Report')
    fireEvent.click(reportButton)

    await waitFor(() => {
      expect(screen.getByText('Report Sent')).toBeInTheDocument()
    })
  })

  it('toggles review data visibility', async () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      telemetryMode: 'ask',
    } as unknown as ReturnType<typeof useAppStore.getState>)

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    const reviewButton = screen.getByText('Review Scrubbed Data')
    fireEvent.click(reviewButton)

    await waitFor(() => {
      expect(screen.getByText(/Scrubbed Report Data/)).toBeInTheDocument()
    })
  })

  it('logs error to console', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(console.error).toHaveBeenCalled()
  })
})
