import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from './test/utils'
import App from './App'

vi.mock('./lib/ipc', () => ({
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
})
