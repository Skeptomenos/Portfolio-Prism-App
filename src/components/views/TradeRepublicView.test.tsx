import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import { TradeRepublicView } from './TradeRepublicView'
import * as ipc from '../../lib/ipc'
import {
  mockPositionsResponse,
  mockSessionCheck,
  mockSessionCheckWithSession,
} from '../../test/mocks/ipc'

vi.mock('../../lib/ipc', () => ({
  trCheckSavedSession: vi.fn(),
  trLogout: vi.fn(),
  syncPortfolio: vi.fn(),
  getPositions: vi.fn(),
}))

const mockSetAuthState = vi.fn()
const mockAddToast = vi.fn()
const mockSetHasUnsavedChanges = vi.fn()

vi.mock('../../store/useAppStore', () => ({
  useAppStore: () => ({
    authState: 'idle',
    setAuthState: mockSetAuthState,
    activePortfolioId: 1,
    addToast: mockAddToast,
    hasUnsavedChanges: false,
    setHasUnsavedChanges: mockSetHasUnsavedChanges,
  }),
}))

describe('TradeRepublicView - Unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.trCheckSavedSession).mockResolvedValue(mockSessionCheck)
  })

  it('renders Trade Republic header', async () => {
    render(<TradeRepublicView />)

    await waitFor(() => {
      expect(screen.getByText('Trade Republic')).toBeInTheDocument()
    })
  })

  it('shows login form when no saved session', async () => {
    render(<TradeRepublicView />)

    await waitFor(() => {
      expect(screen.getByText('Connect to Trade Republic')).toBeInTheDocument()
    })
  })

  it('shows session restore prompt when saved session exists', async () => {
    vi.mocked(ipc.trCheckSavedSession).mockResolvedValue(mockSessionCheckWithSession)

    render(<TradeRepublicView />)

    await waitFor(() => {
      expect(screen.getByText('Welcome back!')).toBeInTheDocument()
    })
  })
})

describe('TradeRepublicView - Authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.getPositions).mockResolvedValue(mockPositionsResponse)
    vi.mocked(ipc.trCheckSavedSession).mockResolvedValue(mockSessionCheck)
  })

  it('shows connected status when authenticated', async () => {
    vi.doMock('../../store/useAppStore', () => ({
      useAppStore: () => ({
        authState: 'authenticated',
        setAuthState: mockSetAuthState,
        activePortfolioId: 1,
        addToast: mockAddToast,
        hasUnsavedChanges: false,
        setHasUnsavedChanges: mockSetHasUnsavedChanges,
      }),
    }))

    const { TradeRepublicView: AuthenticatedView } = await import('./TradeRepublicView')
    render(<AuthenticatedView />)

    await waitFor(() => {
      expect(screen.getByText('Trade Republic')).toBeInTheDocument()
    })
  })
})

describe('TradeRepublicView - Sync functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.getPositions).mockResolvedValue(mockPositionsResponse)
    vi.mocked(ipc.syncPortfolio).mockResolvedValue({
      syncedPositions: 10,
      newPositions: 2,
      updatedPositions: 8,
      totalValue: 75000,
      durationMs: 1500,
    })
  })

  it('displays portfolio summary when authenticated', async () => {
    vi.doMock('../../store/useAppStore', () => ({
      useAppStore: () => ({
        authState: 'authenticated',
        setAuthState: mockSetAuthState,
        activePortfolioId: 1,
        addToast: mockAddToast,
        hasUnsavedChanges: false,
        setHasUnsavedChanges: mockSetHasUnsavedChanges,
      }),
    }))

    const { TradeRepublicView: AuthenticatedView } = await import('./TradeRepublicView')
    render(<AuthenticatedView />)

    await waitFor(() => {
      expect(screen.getByText('Trade Republic')).toBeInTheDocument()
    })
  })
})

describe('TradeRepublicView - Logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.trLogout).mockResolvedValue({ authState: 'idle', message: 'Logged out' })
  })

  it('handles logout correctly', async () => {
    vi.doMock('../../store/useAppStore', () => ({
      useAppStore: () => ({
        authState: 'authenticated',
        setAuthState: mockSetAuthState,
        activePortfolioId: 1,
        addToast: mockAddToast,
        hasUnsavedChanges: false,
        setHasUnsavedChanges: mockSetHasUnsavedChanges,
      }),
    }))

    const { TradeRepublicView: AuthenticatedView } = await import('./TradeRepublicView')
    render(<AuthenticatedView />)

    await waitFor(() => {
      expect(screen.getByText('Trade Republic')).toBeInTheDocument()
    })
  })
})
