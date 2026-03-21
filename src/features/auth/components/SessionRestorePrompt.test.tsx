import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../test/utils'
import { SessionRestorePrompt } from './SessionRestorePrompt'
import * as ipc from '../../../lib/ipc'
import type { SessionCheck } from '../../../types'

vi.mock('../../../lib/ipc', () => ({
  trRestoreSession: vi.fn(),
  syncPortfolio: vi.fn(),
}))

const mockSetAuthState = vi.fn()
const mockAddToast = vi.fn()

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: () => ({
    setAuthState: mockSetAuthState,
    addToast: mockAddToast,
    activePortfolioId: 1,
  }),
}))

describe('SessionRestorePrompt', () => {
  const mockSessionData: SessionCheck = {
    hasSession: true,
    phoneNumber: '+49***1234',
    prompt: 'restore_session',
  }

  const mockOnFreshLogin = vi.fn()
  const mockOnRestoreComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders welcome message', () => {
    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    expect(screen.getByText('Welcome back!')).toBeInTheDocument()
    expect(screen.getByText(/saved session/)).toBeInTheDocument()
  })

  it('displays masked phone number', () => {
    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    expect(screen.getByText(/\+49.*1234/)).toBeInTheDocument()
  })

  it('shows restore session button', () => {
    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    expect(screen.getByRole('button', { name: 'Restore Session' })).toBeInTheDocument()
  })

  it('shows fresh login button', () => {
    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    expect(screen.getByRole('button', { name: /different credentials/ })).toBeInTheDocument()
  })

  it('calls onFreshLogin when clicking fresh login button', () => {
    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /different credentials/ }))
    expect(mockOnFreshLogin).toHaveBeenCalled()
  })

  it('shows loading state when restoring session', async () => {
    vi.mocked(ipc.trRestoreSession).mockImplementation(() => new Promise(() => {}))

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(screen.getByText('Restoring...')).toBeInTheDocument()
    })
  })

  it('calls restore session IPC and completes on successful restore', async () => {
    vi.mocked(ipc.trRestoreSession).mockResolvedValue({
      authState: 'authenticated',
      message: 'Session restored.',
    })
    vi.mocked(ipc.syncPortfolio).mockResolvedValue({
      syncedPositions: 10,
      newPositions: 2,
      updatedPositions: 8,
      totalValue: 75000,
      durationMs: 1500,
    })

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(ipc.trRestoreSession).toHaveBeenCalledTimes(1)
      expect(mockOnRestoreComplete).toHaveBeenCalled()
    })
  })

  it('shows error when session has expired', async () => {
    vi.mocked(ipc.trRestoreSession).mockResolvedValue({
      authState: 'idle',
      message: 'Session expired. Please log in again.',
    })

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(screen.getByText(/expired/i)).toBeInTheDocument()
    })
  })

  it('shows error on restore failure', async () => {
    vi.mocked(ipc.trRestoreSession).mockRejectedValue(new Error('Network error'))

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('disables buttons during loading', async () => {
    vi.mocked(ipc.trRestoreSession).mockImplementation(() => new Promise(() => {}))

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Restoring/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /different credentials/ })).toBeDisabled()
    })
  })

  it('shows info box with session restore details', () => {
    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    expect(screen.getByText('Session Restore')).toBeInTheDocument()
    expect(screen.getByText(/without 2FA/)).toBeInTheDocument()
  })

  it('handles session data without phone number', () => {
    const sessionWithoutPhone: SessionCheck = {
      hasSession: true,
      prompt: 'restore_session',
    }

    render(
      <SessionRestorePrompt
        sessionData={sessionWithoutPhone}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    // Should not crash and still show the welcome message
    expect(screen.getByText('Welcome back!')).toBeInTheDocument()
  })

  it('still calls onRestoreComplete even if sync fails', async () => {
    vi.mocked(ipc.trRestoreSession).mockResolvedValue({
      authState: 'authenticated',
      message: 'Session restored.',
    })
    vi.mocked(ipc.syncPortfolio).mockRejectedValue(new Error('Sync failed'))

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(mockOnRestoreComplete).toHaveBeenCalled()
    })
  })

  it('does not duplicate sync — child should not call syncPortfolio since parent will', async () => {
    vi.mocked(ipc.trRestoreSession).mockResolvedValue({
      authState: 'authenticated',
      message: 'Session restored.',
    })

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(mockOnRestoreComplete).toHaveBeenCalled()
    })

    // The child should NOT call syncPortfolio — the parent owns post-restore sync
    expect(ipc.syncPortfolio).not.toHaveBeenCalled()
  })

  it('does not duplicate auth state — child should not call setAuthState since parent will', async () => {
    vi.mocked(ipc.trRestoreSession).mockResolvedValue({
      authState: 'authenticated',
      message: 'Session restored.',
    })
    vi.mocked(ipc.syncPortfolio).mockResolvedValue({
      syncedPositions: 10,
      newPositions: 2,
      updatedPositions: 8,
      totalValue: 75000,
      durationMs: 1500,
    })

    render(
      <SessionRestorePrompt
        sessionData={mockSessionData}
        onFreshLogin={mockOnFreshLogin}
        onRestoreComplete={mockOnRestoreComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Session' }))

    await waitFor(() => {
      expect(mockOnRestoreComplete).toHaveBeenCalled()
    })

    // The child should NOT call setAuthState — the parent owns auth state truth
    expect(mockSetAuthState).not.toHaveBeenCalled()
  })
})
