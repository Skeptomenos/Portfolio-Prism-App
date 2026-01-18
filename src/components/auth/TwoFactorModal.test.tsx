import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import { TwoFactorModal } from './TwoFactorModal'
import * as ipc from '../../lib/ipc'

vi.mock('../../lib/ipc', () => ({
  trSubmit2FA: vi.fn(),
}))

vi.mock('../../store/useAppStore', () => ({
  useAppStore: () => ({
    setAuthState: vi.fn(),
    addToast: vi.fn(),
  }),
}))

describe('TwoFactorModal', () => {
  // SECURITY: Credentials are no longer passed as props - use onResendRequest callback
  const mockResendRequest = vi.fn()

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    onResendRequest: mockResendRequest,
    initialCountdown: 0,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    render(<TwoFactorModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Verification Code')).not.toBeInTheDocument()
  })

  it('renders modal when isOpen is true', () => {
    render(<TwoFactorModal {...defaultProps} />)
    expect(screen.getByText('Verification Code')).toBeInTheDocument()
    expect(screen.getByText(/Enter the 4-digit code/)).toBeInTheDocument()
  })

  it('renders 4 code input fields', () => {
    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(4)
  })

  it('shows countdown timer when countdown > 0', () => {
    render(<TwoFactorModal {...defaultProps} initialCountdown={30} />)
    expect(screen.getByText(/Code expires in/)).toBeInTheDocument()
  })

  it('shows expired message when countdown is 0', () => {
    render(<TwoFactorModal {...defaultProps} initialCountdown={0} />)
    expect(screen.getByText('Code expired')).toBeInTheDocument()
  })

  it('moves focus to next input on digit entry', () => {
    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.change(inputs[0], { target: { value: '1' } })
    expect(document.activeElement).toBe(inputs[1])
  })

  it('handles backspace key navigation', () => {
    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.change(inputs[0], { target: { value: '1' } })
    fireEvent.change(inputs[1], { target: { value: '2' } })

    expect(inputs[0]).toHaveValue('1')
    expect(inputs[1]).toHaveValue('2')
  })

  it('handles paste of full code', () => {
    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')

    const pasteEvent = {
      clipboardData: { getData: () => '1234' },
      preventDefault: vi.fn(),
    }
    fireEvent.paste(inputs[0], pasteEvent)

    expect(inputs[0]).toHaveValue('1')
    expect(inputs[1]).toHaveValue('2')
    expect(inputs[2]).toHaveValue('3')
    expect(inputs[3]).toHaveValue('4')
  })

  it('calls trSubmit2FA when all digits entered', async () => {
    const mockSubmit = vi.mocked(ipc.trSubmit2FA)
    mockSubmit.mockResolvedValue({ authState: 'authenticated', message: 'Success' })

    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.change(inputs[0], { target: { value: '1' } })
    fireEvent.change(inputs[1], { target: { value: '2' } })
    fireEvent.change(inputs[2], { target: { value: '3' } })
    fireEvent.change(inputs[3], { target: { value: '4' } })

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith('1234')
    })
  })

  it('calls onSuccess when verification succeeds', async () => {
    const mockSubmit = vi.mocked(ipc.trSubmit2FA)
    mockSubmit.mockResolvedValue({ authState: 'authenticated', message: 'Success' })
    const onSuccess = vi.fn()

    render(<TwoFactorModal {...defaultProps} onSuccess={onSuccess} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.change(inputs[0], { target: { value: '1' } })
    fireEvent.change(inputs[1], { target: { value: '2' } })
    fireEvent.change(inputs[2], { target: { value: '3' } })
    fireEvent.change(inputs[3], { target: { value: '4' } })

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error on verification failure', async () => {
    const mockSubmit = vi.mocked(ipc.trSubmit2FA)
    mockSubmit.mockResolvedValue({ authState: 'error', message: 'Invalid code' })

    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.change(inputs[0], { target: { value: '1' } })
    fireEvent.change(inputs[1], { target: { value: '2' } })
    fireEvent.change(inputs[2], { target: { value: '3' } })
    fireEvent.change(inputs[3], { target: { value: '4' } })

    await waitFor(() => {
      expect(screen.getByText('Invalid code')).toBeInTheDocument()
    })
  })

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn()
    render(<TwoFactorModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows resend button when onResendRequest is provided', () => {
    render(<TwoFactorModal {...defaultProps} />)
    expect(screen.getByText('Resend code')).toBeInTheDocument()
  })

  it('hides resend button when onResendRequest is not provided', () => {
    render(<TwoFactorModal {...defaultProps} onResendRequest={undefined} />)
    expect(screen.queryByText('Resend code')).not.toBeInTheDocument()
  })

  it('disables resend button while countdown is active', () => {
    render(<TwoFactorModal {...defaultProps} initialCountdown={30} />)
    const resendButton = screen.getByText('Resend code')
    expect(resendButton).toBeDisabled()
  })

  it('enables resend button when countdown is 0', () => {
    render(<TwoFactorModal {...defaultProps} initialCountdown={0} />)
    const resendButton = screen.getByText('Resend code')
    expect(resendButton).not.toBeDisabled()
  })

  it('disables verify button when code is incomplete', () => {
    render(<TwoFactorModal {...defaultProps} />)
    const inputs = screen.getAllByRole('textbox')

    fireEvent.change(inputs[0], { target: { value: '1' } })
    fireEvent.change(inputs[1], { target: { value: '2' } })

    expect(screen.getByText('Verify')).toBeDisabled()
  })
})
