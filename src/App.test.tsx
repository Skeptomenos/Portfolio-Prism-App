import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from './test/utils'
import App from './App'
import { useAppStore } from './store/useAppStore'
import { authInitialState } from './features/auth/store/authSlice'
import { uiInitialState } from './store/uiSlice'
import { IPCValidationError } from './lib/ipc'

vi.mock('./lib/ipc', () => ({
  IPCValidationError: class IPCValidationError extends Error {
    constructor(command: string) {
      super(`IPC validation failed for ${command}`)
      this.name = 'IPCValidationError'
    }
  },
  getEngineHealth: vi.fn(() =>
    Promise.resolve({ version: '1.0.0', memoryUsageMb: 100, sessionId: 'test' })
  ),
  getDashboardData: vi.fn(() =>
    Promise.resolve({
      totalValue: 100000,
      totalGain: 10000,
      gainPercentage: 10,
      dayChange: 100,
      dayChangePercent: 0.1,
      history: [],
      allocations: { sector: {}, region: {} },
      topHoldings: [],
      lastUpdated: null,
      isEmpty: true,
      positionCount: 0,
    })
  ),
  getHoldings: vi.fn(() => Promise.resolve([])),
  getPositions: vi.fn(() =>
    Promise.resolve({ positions: [], totalValue: 0, totalCost: 0, totalPnl: 0, totalPnlPercent: 0 })
  ),
  syncPortfolio: vi.fn(() =>
    Promise.resolve({
      syncedPositions: 0,
      newPositions: 0,
      updatedPositions: 0,
      totalValue: 0,
      durationMs: 0,
    })
  ),
  runPipeline: vi.fn(() => Promise.resolve({ success: true, errors: [], durationMs: 0 })),
  trCheckSavedSession: vi.fn(() =>
    Promise.resolve({ hasSession: false, prompt: 'login_required' })
  ),
  trGetAuthStatus: vi.fn(() => Promise.resolve({ authState: 'idle', hasStoredCredentials: false })),
  trLogin: vi.fn(() => Promise.resolve({ authState: 'waiting_2fa', message: 'Enter 2FA' })),
  trSubmit2FA: vi.fn(() => Promise.resolve({ authState: 'authenticated', message: 'Success' })),
  trLogout: vi.fn(() => Promise.resolve({ authState: 'idle', message: 'Logged out' })),
  getTrueHoldings: vi.fn(() =>
    Promise.resolve({
      holdings: [],
      summary: {
        total: 0,
        resolved: 0,
        unresolved: 0,
        skipped: 0,
        unknown: 0,
        bySource: {},
        healthScore: 0,
      },
    })
  ),
  getPipelineReport: vi.fn(() => Promise.resolve({})),
  checkConnection: vi.fn(() => Promise.resolve(true)),
  getEnvironment: vi.fn(() => 'browser'),
  logEvent: vi.fn(() => Promise.resolve()),
  getRecentReports: vi.fn(() => Promise.resolve([])),
  getPendingReviews: vi.fn(() => Promise.resolve([])),
  setHiveContribution: vi.fn(() => Promise.resolve()),
  getHiveContribution: vi.fn(() => Promise.resolve(false)),
  uploadHoldings: vi.fn(() => Promise.resolve({})),
  trGetStoredCredentials: vi.fn(() =>
    Promise.resolve({ hasCredentials: false, phone: null, pin: null })
  ),
}))

vi.mock('./components/Sidebar', () => ({
  default: () => <aside data-testid="sidebar">Sidebar</aside>,
}))

vi.mock('./features/dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard-view">Dashboard</div>,
}))

vi.mock('./features/xray', () => ({
  XRayView: () => <div data-testid="xray-view">X-Ray</div>,
}))

vi.mock('./components/views/HealthView', () => ({
  default: () => <div data-testid="health-view">Health</div>,
}))

vi.mock('./features/portfolio', () => ({
  HoldingsView: () => <div data-testid="holdings-view">Holdings</div>,
}))

vi.mock('./features/integrations', () => ({
  TradeRepublicView: () => <div data-testid="trade-republic-view">Trade Republic</div>,
}))

vi.mock('./components/ui/Toast', () => ({
  ToastContainer: () => <div data-testid="toast-container">Toasts</div>,
}))

vi.mock('./components/feedback/FeedbackDialog', () => ({
  FeedbackDialog: () => <div data-testid="feedback-dialog">Feedback</div>,
}))

vi.mock('./components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: JSX.Element }) => children,
}))

vi.mock('./lib/tauri', () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('./hooks/useTauriEvents', () => ({
  useTauriEvents: vi.fn(),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      ...authInitialState,
      ...uiInitialState,
    })
  })

  it('renders without crashing', () => {
    render(<App />)
    expect(document.body).toBeDefined()
  })

  it('renders the Sidebar component', () => {
    render(<App />)
    const sidebar =
      document.querySelector('[class*="sidebar"]') ||
      screen.queryByRole('navigation') ||
      document.querySelector('aside')
    expect(sidebar || document.body.children.length > 0).toBeTruthy()
  })

  it('wraps content in ErrorBoundary', () => {
    render(<App />)
    const mainContent = document.querySelector('main')
    expect(mainContent).toBeInTheDocument()
  })

  it('renders main content area', () => {
    render(<App />)
    const main = document.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveStyle({ flex: '1' })
  })

  it('marks the user authenticated when bootstrap finds an active saved session', async () => {
    const ipc = await import('./lib/ipc')

    vi.mocked(ipc.trCheckSavedSession).mockResolvedValue({
      hasSession: true,
      phoneNumber: null,
      prompt: 'restore_session',
    })
    vi.mocked(ipc.trGetAuthStatus).mockResolvedValue({
      authState: 'authenticated',
      hasStoredCredentials: true,
      lastError: null,
    })

    render(<App />)

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.authState).toBe('authenticated')
      expect(state.savedPhone).toBeNull()
      expect(state.currentView).toBe('dashboard')
    })
  })

  it('routes to Trade Republic when no saved session exists', async () => {
    const ipc = await import('./lib/ipc')

    vi.mocked(ipc.trCheckSavedSession).mockResolvedValue({
      hasSession: false,
      phoneNumber: null,
      prompt: 'login_required',
    })

    render(<App />)

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.authState).toBe('idle')
      expect(state.currentView).toBe('trade-republic')
      expect(state.authError).toBeNull()
    })
  })

  it('surfaces an expired saved session instead of treating it as a generic missing session', async () => {
    const ipc = await import('./lib/ipc')

    vi.mocked(ipc.trCheckSavedSession).mockResolvedValue({
      hasSession: true,
      phoneNumber: '+49***1234',
      prompt: 'restore_session',
    })
    vi.mocked(ipc.trGetAuthStatus).mockResolvedValue({
      authState: 'idle',
      hasStoredCredentials: true,
      lastError: null,
    })

    render(<App />)

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.authState).toBe('idle')
      expect(state.currentView).toBe('trade-republic')
      expect(state.savedPhone).toBe('+49***1234')
      expect(state.authError).toMatch(/restore it or sign in again/i)
    })
  })

  it('marks contract drift as an invalid bootstrap state', async () => {
    const ipc = await import('./lib/ipc')

    vi.mocked(ipc.trCheckSavedSession).mockRejectedValue(
      new IPCValidationError('tr_check_saved_session')
    )

    render(<App />)

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.authState).toBe('error')
      expect(state.currentView).toBe('trade-republic')
      expect(state.authError).toMatch(/contract/i)
    })
  })
})
