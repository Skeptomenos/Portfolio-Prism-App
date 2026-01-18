import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import { FeedbackDialog } from './FeedbackDialog'
import * as feedbackApi from '@/lib/api/feedback'

vi.mock('@/lib/api/feedback', () => ({
  sendFeedback: vi.fn(),
}))

vi.mock('@/store/useAppStore', () => ({
  useCurrentView: () => 'dashboard',
  useAppStore: {
    getState: () => ({ lastSyncTime: new Date('2026-01-18T12:00:00Z') }),
  },
}))

vi.mock('@/lib/tauri', () => ({
  isTauri: () => false,
}))

describe('FeedbackDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(<FeedbackDialog {...defaultProps} />)
      // The heading contains "Send Feedback" text
      expect(screen.getByRole('heading', { name: 'Send Feedback' })).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(<FeedbackDialog {...defaultProps} isOpen={false} />)
      expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument()
    })

    it('renders feedback type options', () => {
      render(<FeedbackDialog {...defaultProps} />)
      expect(screen.getByText('Bug Report')).toBeInTheDocument()
      expect(screen.getByText('Feature Idea')).toBeInTheDocument()
      expect(screen.getByText('UI / UX')).toBeInTheDocument()
    })

    it('renders textarea for message input', () => {
      render(<FeedbackDialog {...defaultProps} />)
      expect(
        screen.getByPlaceholderText("Tell us what happened or what you'd like to see...")
      ).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('disables submit button when message is empty', () => {
      render(<FeedbackDialog {...defaultProps} />)

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      expect(submitButton).toBeDisabled()
    })

    it('enables submit button when message has content', () => {
      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'This is my feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      expect(submitButton).not.toBeDisabled()
    })

    it('disables submit button when message is only whitespace', () => {
      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: '   ' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      expect(submitButton).toBeDisabled()
    })
  })

  describe('Submission', () => {
    it('submits feedback successfully', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockResolvedValue({ issue_url: 'https://github.com/example/issue/123' })

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'This is my feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Feedback Sent!')).toBeInTheDocument()
      })

      expect(mockSendFeedback).toHaveBeenCalledWith({
        type: 'functional',
        message: 'This is my feedback',
        metadata: {
          source: 'user_dialog',
          view: 'dashboard',
          environment: 'browser',
          lastSync: '2026-01-18T12:00:00.000Z',
        },
      })
    })

    it('shows error message on submission failure', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockRejectedValue(new Error('Network error'))

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('shows generic error for non-Error exceptions', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockRejectedValue('string error')

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to send feedback. Please try again.')).toBeInTheDocument()
      })
    })

    it('shows loading state during submission', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      // Create a promise that we can control
      let resolvePromise: (value: { issue_url: string }) => void
      mockSendFeedback.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      // Submit button should be disabled during submission
      await waitFor(() => {
        expect(submitButton).toBeDisabled()
      })

      // Resolve the promise to complete the test
      resolvePromise!({ issue_url: 'https://github.com/example/issue/123' })

      await waitFor(() => {
        expect(screen.getByText('Feedback Sent!')).toBeInTheDocument()
      })
    })
  })

  describe('Feedback Type Selection', () => {
    it('submits with selected feedback type', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockResolvedValue({ issue_url: 'https://github.com/example/issue/123' })

      render(<FeedbackDialog {...defaultProps} />)

      // Select Feature Idea type
      fireEvent.click(screen.getByText('Feature Idea'))

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'New feature request' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockSendFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'feature',
            message: 'New feature request',
          })
        )
      })
    })

    it('submits with UI/UX type when selected', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockResolvedValue({ issue_url: 'https://github.com/example/issue/123' })

      render(<FeedbackDialog {...defaultProps} />)

      // Select UI/UX type
      fireEvent.click(screen.getByText('UI / UX'))

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'UI improvement suggestion' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockSendFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ui_ux',
            message: 'UI improvement suggestion',
          })
        )
      })
    })
  })

  describe('Close Behavior', () => {
    it('calls onClose when cancel button is clicked', () => {
      const onClose = vi.fn()
      render(<FeedbackDialog {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByText('Cancel'))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when X button is clicked', () => {
      const onClose = vi.fn()
      render(<FeedbackDialog {...defaultProps} onClose={onClose} />)

      // X button is in the header
      const closeButtons = screen.getAllByRole('button')
      const xButton = closeButtons.find((btn) => btn.querySelector('svg.lucide-x'))
      expect(xButton).toBeDefined()
      fireEvent.click(xButton!)

      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(<FeedbackDialog {...defaultProps} onClose={onClose} />)

      // Click the backdrop (the overlay div)
      const backdrop = document.querySelector('.backdrop-blur-sm')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop!)

      expect(onClose).toHaveBeenCalled()
    })

    it('resets form state when closed', async () => {
      const onClose = vi.fn()
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockRejectedValue(new Error('Network error'))

      const { rerender } = render(<FeedbackDialog isOpen={true} onClose={onClose} />)

      // Trigger an error state
      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test' } })
      fireEvent.click(screen.getByRole('button', { name: /send feedback/i }))

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })

      // Close the dialog
      fireEvent.click(screen.getByText('Cancel'))

      // Reopen the dialog
      rerender(<FeedbackDialog isOpen={true} onClose={onClose} />)

      // Error should be cleared
      expect(screen.queryByText('Network error')).not.toBeInTheDocument()
    })
  })

  describe('Success State', () => {
    it('shows GitHub link when issue_url is provided', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockResolvedValue({
        issue_url: 'https://github.com/example/repo/issues/123',
      })

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('View on GitHub')).toBeInTheDocument()
      })

      const link = screen.getByRole('link', { name: /view on github/i })
      expect(link).toHaveAttribute('href', 'https://github.com/example/repo/issues/123')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('hides GitHub link when issue_url contains mock', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockResolvedValue({ issue_url: 'https://github.com/mock-issue-url' })

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Feedback Sent!')).toBeInTheDocument()
      })

      expect(screen.queryByText('View on GitHub')).not.toBeInTheDocument()
    })

    it('shows close button in success state', async () => {
      const mockSendFeedback = vi.mocked(feedbackApi.sendFeedback)
      mockSendFeedback.mockResolvedValue({ issue_url: 'https://github.com/example/issue/123' })

      render(<FeedbackDialog {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(
        "Tell us what happened or what you'd like to see..."
      )
      fireEvent.change(textarea, { target: { value: 'Test feedback' } })

      const submitButton = screen.getByRole('button', { name: /send feedback/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Feedback Sent!')).toBeInTheDocument()
      })

      // Close button in success state
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    })
  })
})
