import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test/utils'
import { ToastContainer } from './Toast'
import type { Toast } from '../../types'

vi.mock('../../store/useAppStore', () => ({
  useToasts: vi.fn(),
  useDismissToast: vi.fn(),
  useAppStore: {
    getState: vi.fn(() => ({ telemetryMode: 'ask' })),
  },
}))

const mockUseToasts = vi.mocked(await import('../../store/useAppStore').then((m) => m.useToasts))
const mockUseDismissToast = vi.mocked(
  await import('../../store/useAppStore').then((m) => m.useDismissToast)
)

describe('ToastContainer', () => {
  const mockDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDismissToast.mockReturnValue(mockDismiss)
  })

  it('renders nothing when there are no toasts', () => {
    mockUseToasts.mockReturnValue([])

    const { container } = render(<ToastContainer />)

    expect(container.querySelector('div[style*="position: fixed"]')).not.toBeInTheDocument()
  })

  it('renders success toast correctly', () => {
    const toasts: Toast[] = [
      {
        id: '1',
        type: 'success',
        title: 'Success!',
        message: 'Operation completed',
      },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    expect(screen.getByText('Success!')).toBeInTheDocument()
    expect(screen.getByText('Operation completed')).toBeInTheDocument()
  })

  it('renders error toast correctly', () => {
    const toasts: Toast[] = [
      {
        id: '2',
        type: 'error',
        title: 'Error!',
        message: 'Something went wrong',
      },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    expect(screen.getByText('Error!')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders warning toast correctly', () => {
    const toasts: Toast[] = [
      {
        id: '3',
        type: 'warning',
        title: 'Warning!',
      },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    expect(screen.getByText('Warning!')).toBeInTheDocument()
  })

  it('renders info toast correctly', () => {
    const toasts: Toast[] = [
      {
        id: '4',
        type: 'info',
        title: 'Info',
        message: 'Just letting you know',
      },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    expect(screen.getByText('Info')).toBeInTheDocument()
    expect(screen.getByText('Just letting you know')).toBeInTheDocument()
  })

  it('renders multiple toasts', () => {
    const toasts: Toast[] = [
      { id: '1', type: 'success', title: 'First Toast' },
      { id: '2', type: 'error', title: 'Second Toast' },
      { id: '3', type: 'info', title: 'Third Toast' },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    expect(screen.getByText('First Toast')).toBeInTheDocument()
    expect(screen.getByText('Second Toast')).toBeInTheDocument()
    expect(screen.getByText('Third Toast')).toBeInTheDocument()
  })

  it('calls dismissToast when close button is clicked', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-123',
        type: 'success',
        title: 'Dismissable Toast',
      },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    const closeButton = screen.getByRole('button')
    fireEvent.click(closeButton)

    expect(mockDismiss).toHaveBeenCalledWith('toast-123')
  })

  it('renders toast without message when message is not provided', () => {
    const toasts: Toast[] = [
      {
        id: '1',
        type: 'success',
        title: 'Title Only',
      },
    ]
    mockUseToasts.mockReturnValue(toasts)

    render(<ToastContainer />)

    expect(screen.getByText('Title Only')).toBeInTheDocument()
    const container = screen.getByText('Title Only').parentElement
    expect(container?.children.length).toBe(1)
  })
})
