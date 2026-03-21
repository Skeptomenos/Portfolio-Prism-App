import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test/utils'
import { XRayErrorBoundary } from './XRayErrorBoundary'
import { useAppStore } from '../../../store/useAppStore'
import * as feedbackApi from '../../../lib/api/feedback'

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({ telemetryMode: 'ask' })),
  },
}))

vi.mock('../../../lib/api/feedback', () => ({
  sendFeedback: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../../lib/scrubber', () => ({
  scrubObject: vi.fn((obj) => obj),
}))

const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }): JSX.Element => {
  if (shouldThrow) {
    throw new Error('Pipeline processing failed')
  }
  return <div>XRay content</div>
}

describe('XRayErrorBoundary', () => {
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
      <XRayErrorBoundary>
        <div>Child content</div>
      </XRayErrorBoundary>
    )

    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders feature-specific error UI when child throws', () => {
    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(screen.getByText('Pipeline View Error')).toBeInTheDocument()
    expect(screen.getByText(/Something went wrong while loading the pipeline/)).toBeInTheDocument()
  })

  it('displays error name and message', () => {
    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('Pipeline processing failed')).toBeInTheDocument()
  })

  it('shows Try Again button for retry', () => {
    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(screen.getByText('Try Again')).toBeInTheDocument()
  })

  it('resets error state when Try Again is clicked', () => {
    const { rerender } = render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(screen.getByText('Pipeline View Error')).toBeInTheDocument()

    rerender(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </XRayErrorBoundary>
    )

    const tryAgainButton = screen.getByText('Try Again')
    fireEvent.click(tryAgainButton)

    expect(screen.getByText('XRay content')).toBeInTheDocument()
  })

  it('shows report button', () => {
    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(screen.getByText('Report Issue')).toBeInTheDocument()
  })

  it('sends feedback with xray context when report button is clicked', async () => {
    const sendFeedbackMock = vi.mocked(feedbackApi.sendFeedback)

    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    const reportButton = screen.getByText('Report Issue')
    fireEvent.click(reportButton)

    await waitFor(() => {
      expect(sendFeedbackMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'critical',
          message: expect.stringContaining('X-Ray Error'),
        })
      )
    })
  })

  it('shows confirmation after successful report', async () => {
    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    const reportButton = screen.getByText('Report Issue')
    fireEvent.click(reportButton)

    await waitFor(() => {
      expect(screen.getByText(/Issue reported/)).toBeInTheDocument()
    })
  })

  it('auto-reports when telemetry mode is auto', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      telemetryMode: 'auto',
    } as unknown as ReturnType<typeof useAppStore.getState>)

    const sendFeedbackMock = vi.mocked(feedbackApi.sendFeedback)

    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(sendFeedbackMock).toHaveBeenCalled()
  })

  it('logs error with xray feature context', () => {
    render(
      <XRayErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </XRayErrorBoundary>
    )

    expect(console.error).toHaveBeenCalled()
  })
})
