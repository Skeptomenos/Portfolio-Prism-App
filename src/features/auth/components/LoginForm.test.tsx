import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test/utils'
import { LoginForm } from './LoginForm'
import { setupTauriMock, resetTauriMocks, mockTauriInvoke } from '../../../test/mocks/tauri'
import { createMockStore, resetMockStoreState } from '../../../test/mocks/store'

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: () => createMockStore(),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    setupTauriMock({
      tr_get_stored_credentials: () => ({ hasCredentials: false, maskedPhone: null }),
      tr_login: () => ({ authState: 'waiting_2fa', message: 'Enter 2FA' }),
    })
  })

  afterEach(() => {
    resetTauriMocks()
    resetMockStoreState()
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
      expect(screen.getByText(/valid phone number for a Trade Republic market/)).toBeInTheDocument()
    })
  })

  it('calls tr_login on valid form submission', async () => {
    render(<LoginForm />)

    const phoneInput = screen.getByLabelText('Phone Number')
    const pinInput = screen.getByLabelText('PIN')

    fireEvent.change(phoneInput, { target: { value: '+4917612345678' } })
    fireEvent.change(pinInput, { target: { value: '1234' } })

    const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', {
        phone: '+4917612345678',
        pin: '1234',
        remember: false,
      })
    })
  })

  it('calls onLoginSuccess when login returns waiting_2fa', async () => {
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
    setupTauriMock({
      tr_get_stored_credentials: () => ({ hasCredentials: false, maskedPhone: null }),
      tr_login: () => ({ authState: 'error', message: 'Invalid credentials' }),
    })

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
    setupTauriMock({
      tr_get_stored_credentials: () => ({ hasCredentials: false, maskedPhone: null }),
      tr_login: () => new Promise(() => {}),
    })

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

  it('shows quick login button when stored credentials exist', async () => {
    setupTauriMock({
      tr_get_stored_credentials: () => ({
        hasCredentials: true,
        maskedPhone: '***5678',
      }),
      tr_login: () => ({ authState: 'waiting_2fa', message: 'Enter 2FA' }),
    })

    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByText(/Saved credentials for \*\*\*5678/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quick Login' })).toBeInTheDocument()
      expect(screen.getByLabelText('Phone Number')).toHaveValue('')
      expect(screen.getByLabelText('PIN')).toHaveValue('')
      expect(screen.getByLabelText('Remember this device')).toBeChecked()
    })
  })

  it('uses stored credentials on quick login', async () => {
    setupTauriMock({
      tr_get_stored_credentials: () => ({
        hasCredentials: true,
        maskedPhone: '***5678',
      }),
      tr_login: () => ({
        authState: 'waiting_2fa',
        countdown: 30,
        message: '2FA code sent',
      }),
    })

    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Quick Login' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Quick Login' }))

    await waitFor(() => {
      expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', { useStoredCredentials: true })
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

  describe('Trade Republic market phone validation', () => {
    it('accepts Austrian phone number (+43)', async () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      const pinInput = screen.getByLabelText('PIN')

      fireEvent.change(phoneInput, { target: { value: '+436641234567' } })
      fireEvent.change(pinInput, { target: { value: '1234' } })

      const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
      fireEvent.submit(form!)

      await waitFor(() => {
        expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', {
          phone: '+436641234567',
          pin: '1234',
          remember: false,
        })
      })
    })

    it('accepts French phone number (+33)', async () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      const pinInput = screen.getByLabelText('PIN')

      fireEvent.change(phoneInput, { target: { value: '+33612345678' } })
      fireEvent.change(pinInput, { target: { value: '1234' } })

      const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
      fireEvent.submit(form!)

      await waitFor(() => {
        expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', {
          phone: '+33612345678',
          pin: '1234',
          remember: false,
        })
      })
    })

    it('accepts Dutch phone number (+31)', async () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      const pinInput = screen.getByLabelText('PIN')

      fireEvent.change(phoneInput, { target: { value: '+31612345678' } })
      fireEvent.change(pinInput, { target: { value: '1234' } })

      const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
      fireEvent.submit(form!)

      await waitFor(() => {
        expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', {
          phone: '+31612345678',
          pin: '1234',
          remember: false,
        })
      })
    })

    it('accepts Spanish phone number (+34)', async () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      const pinInput = screen.getByLabelText('PIN')

      fireEvent.change(phoneInput, { target: { value: '+34612345678' } })
      fireEvent.change(pinInput, { target: { value: '1234' } })

      const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
      fireEvent.submit(form!)

      await waitFor(() => {
        expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', {
          phone: '+34612345678',
          pin: '1234',
          remember: false,
        })
      })
    })

    it('accepts Italian phone number (+39)', async () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      const pinInput = screen.getByLabelText('PIN')

      fireEvent.change(phoneInput, { target: { value: '+39612345678' } })
      fireEvent.change(pinInput, { target: { value: '1234' } })

      const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
      fireEvent.submit(form!)

      await waitFor(() => {
        expect(mockTauriInvoke).toHaveBeenCalledWith('tr_login', {
          phone: '+39612345678',
          pin: '1234',
          remember: false,
        })
      })
    })

    it('rejects unsupported country code (+1 US)', async () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      const pinInput = screen.getByLabelText('PIN')

      fireEvent.change(phoneInput, { target: { value: '+12025551234' } })
      fireEvent.change(pinInput, { target: { value: '1234' } })

      const form = screen.getByRole('button', { name: 'Connect' }).closest('form')
      fireEvent.submit(form!)

      await waitFor(() => {
        expect(
          screen.getByText(/valid phone number for a Trade Republic market/)
        ).toBeInTheDocument()
      })
    })

    it('formats Austrian number without + prefix', () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      fireEvent.change(phoneInput, { target: { value: '436641234567' } })

      expect(phoneInput).toHaveValue('+436641234567')
    })

    it('formats French number without + prefix', () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      fireEvent.change(phoneInput, { target: { value: '33612345678' } })

      expect(phoneInput).toHaveValue('+33612345678')
    })

    it('preserves user-entered + prefix for any number', () => {
      render(<LoginForm />)

      const phoneInput = screen.getByLabelText('Phone Number')
      fireEvent.change(phoneInput, { target: { value: '+43664' } })

      expect(phoneInput).toHaveValue('+43664')
    })
  })
})
