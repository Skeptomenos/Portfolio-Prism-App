import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import { LoginForm } from './LoginForm'
import * as ipc from '../../lib/ipc'

vi.mock('../../lib/ipc', () => ({
  trLogin: vi.fn(),
  trGetStoredCredentials: vi.fn(() => Promise.resolve({ hasCredentials: false })),
}))

vi.mock('../../store/useAppStore', () => ({
  useAppStore: () => ({
    setAuthState: vi.fn(),
    setAuthError: vi.fn(),
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.trGetStoredCredentials).mockResolvedValue({
      hasCredentials: false,
      phone: null,
      pin: null,
    })
  })

  it('renders the form with all fields', () => {
    render(<LoginForm />)

    expect(screen.getByText('Connect to Trade Republic')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument()
    expect(screen.getByLabelText('PIN')).toBeInTheDocument()
    expect(screen.getByLabelText('Remember this device')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })

  it('formats phone number with +49 prefix', () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    fireEvent.change(phoneInput, { target: { value: '17612345678' } })

    expect(phoneInput).toHaveValue('+4917612345678')
  })

  it('converts 0 prefix to +49', () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    fireEvent.change(phoneInput, { target: { value: '017612345678' } })

    expect(phoneInput).toHaveValue('+4917612345678')
  })

  it('limits PIN to 4 digits', () => {
    render(<LoginForm />)

    const pinInput = screen.getByLabelText('PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })

    expect(pinInput).toHaveValue('1234')
  })

  it('only allows numeric input for PIN', () => {
    render(<LoginForm />)

    const pinInput = screen.getByLabelText('PIN')
    fireEvent.change(pinInput, { target: { value: 'abc123' } })

    expect(pinInput).toHaveValue('123')
  })

  it('disables submit button when phone is too short', () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+49123' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()
  })

  it('disables submit button when PIN is incomplete', () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '12' } })

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()
  })

  it('enables submit button with valid phone and PIN', () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    expect(screen.getByRole('button', { name: 'Connect' })).not.toBeDisabled()
  })

  it('shows validation error for invalid phone format', async () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+1234567890' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(screen.getByText(/valid German phone number/)).toBeInTheDocument()
    })
  })

  it('calls trLogin on valid form submission', async () => {
    const mockLogin = vi.mocked(ipc.trLogin)
    mockLogin.mockResolvedValue({ authState: 'waiting_2fa', message: 'Enter 2FA' })

    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('+4917612345678', '1234', false)
    })
  })

  it('calls onLoginSuccess when login returns waiting_2fa', async () => {
    const mockLogin = vi.mocked(ipc.trLogin)
    mockLogin.mockResolvedValue({ authState: 'waiting_2fa', message: 'Enter 2FA' })
    const onLoginSuccess = vi.fn()

    render(<LoginForm onLoginSuccess={onLoginSuccess} />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalled()
    })
  })

  it('shows error message on login failure', async () => {
    const mockLogin = vi.mocked(ipc.trLogin)
    mockLogin.mockResolvedValue({ authState: 'error', message: 'Invalid credentials' })

    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    const mockLogin = vi.mocked(ipc.trLogin)
    mockLogin.mockImplementation(() => new Promise(() => {}))

    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connecting...' })).toBeInTheDocument()
    })
  })

  it('loads stored credentials on mount', async () => {
    vi.mocked(ipc.trGetStoredCredentials).mockResolvedValue({
      hasCredentials: true,
      phone: '+4917612345678',
      pin: '1234',
    })

    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByLabelText('Phone Number')).toHaveValue('+4917612345678')
      expect(screen.getByLabelText('PIN')).toHaveValue('1234')
      expect(screen.getByLabelText('Remember this device')).toBeChecked()
    })
  })

  it('toggles remember checkbox', () => {
    render(<LoginForm />)

    const checkbox = screen.getByLabelText('Remember this device')
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })
})
