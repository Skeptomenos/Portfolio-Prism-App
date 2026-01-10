import { vi } from 'vitest'
import type {
  DashboardData,
  EngineHealth,
  AuthStatus,
  SessionCheck,
  AuthResponse,
  PositionsResponse,
  TrueHoldingsResponse,
} from '../../types'

export const mockEngineHealth: EngineHealth = {
  version: '1.0.0-test',
  memoryUsageMb: 128.5,
  uptime: 3600,
  sessionId: 'test-session-123',
}

export const mockDashboardData: DashboardData = {
  totalValue: 125000,
  totalGain: 15000,
  gainPercentage: 13.6,
  dayChange: 250,
  dayChangePercent: 0.2,
  history: [
    { date: '2025-01-01', value: 120000 },
    { date: '2025-01-02', value: 122000 },
    { date: '2025-01-03', value: 125000 },
  ],
  allocations: {
    sector: { Technology: 0.35, Healthcare: 0.2, Financials: 0.15 },
    region: { 'North America': 0.6, Europe: 0.25, Asia: 0.15 },
  },
  topHoldings: [
    {
      isin: 'US0378331005',
      name: 'Apple Inc.',
      ticker: 'AAPL',
      value: 15000,
      weight: 0.12,
      pnl: 2000,
      pnlPercentage: 15.4,
    },
    {
      isin: 'US5949181045',
      name: 'Microsoft Corp.',
      ticker: 'MSFT',
      value: 12000,
      weight: 0.096,
      pnl: 1500,
      pnlPercentage: 14.3,
    },
  ],
  lastUpdated: '2025-01-10T12:00:00Z',
  isEmpty: false,
  positionCount: 25,
}

export const mockAuthStatusIdle: AuthStatus = {
  authState: 'idle',
  hasStoredCredentials: false,
}

export const mockAuthStatusAuthenticated: AuthStatus = {
  authState: 'authenticated',
  hasStoredCredentials: true,
}

export const mockSessionCheck: SessionCheck = {
  hasSession: false,
  prompt: 'login_required',
}

export const mockSessionCheckWithSession: SessionCheck = {
  hasSession: true,
  phoneNumber: '+49***1234',
  prompt: 'restore_session',
}

export const mockAuthResponseWaiting2FA: AuthResponse = {
  authState: 'waiting_2fa',
  message: 'Please enter the 2FA code sent to your device',
  countdown: 60,
}

export const mockAuthResponseAuthenticated: AuthResponse = {
  authState: 'authenticated',
  message: 'Successfully authenticated',
}

export const mockPositionsResponse: PositionsResponse = {
  positions: [
    {
      isin: 'US0378331005',
      name: 'Apple Inc.',
      ticker: 'AAPL',
      instrumentType: 'stock',
      quantity: 50,
      avgBuyPrice: 150,
      currentPrice: 180,
      currentValue: 9000,
      totalCost: 7500,
      pnlEur: 1500,
      pnlPercent: 20,
      weight: 0.12,
      currency: 'USD',
      lastUpdated: '2025-01-10T12:00:00Z',
    },
  ],
  totalValue: 75000,
  totalCost: 65000,
  totalPnl: 10000,
  totalPnlPercent: 15.4,
  lastSyncTime: '2025-01-10T12:00:00Z',
}

export const mockTrueHoldingsResponse: TrueHoldingsResponse = {
  holdings: [
    {
      stock: 'Apple Inc.',
      ticker: 'AAPL',
      isin: 'US0378331005',
      totalValue: 15000,
      sector: 'Technology',
      geography: 'United States',
      sources: [{ etf: 'VWCE', value: 10000, weight: 0.05 }],
      resolutionStatus: 'resolved',
      resolutionSource: 'provider',
      resolutionConfidence: 1.0,
    },
  ],
  summary: {
    total: 100,
    resolved: 95,
    unresolved: 3,
    skipped: 2,
    unknown: 0,
    bySource: { provider: 80, hive: 10, api_finnhub: 5 },
    healthScore: 0.95,
  },
}

export const mockIpcFunctions = {
  getEngineHealth: vi.fn(() => Promise.resolve(mockEngineHealth)),
  getDashboardData: vi.fn(() => Promise.resolve(mockDashboardData)),
  getHoldings: vi.fn(() => Promise.resolve(mockDashboardData.topHoldings)),
  getPositions: vi.fn(() => Promise.resolve(mockPositionsResponse)),
  syncPortfolio: vi.fn(() =>
    Promise.resolve({
      syncedPositions: 10,
      newPositions: 2,
      updatedPositions: 8,
      totalValue: 75000,
      durationMs: 1500,
    })
  ),
  runPipeline: vi.fn(() => Promise.resolve({ success: true, errors: [], durationMs: 2000 })),
  trGetAuthStatus: vi.fn(() => Promise.resolve(mockAuthStatusIdle)),
  trCheckSavedSession: vi.fn(() => Promise.resolve(mockSessionCheck)),
  trLogin: vi.fn(() => Promise.resolve(mockAuthResponseWaiting2FA)),
  trSubmit2FA: vi.fn(() => Promise.resolve(mockAuthResponseAuthenticated)),
  trLogout: vi.fn(() => Promise.resolve({ authState: 'idle', message: 'Logged out' })),
  getTrueHoldings: vi.fn(() => Promise.resolve(mockTrueHoldingsResponse)),
  getPipelineReport: vi.fn(() => Promise.resolve({})),
  checkConnection: vi.fn(() => Promise.resolve(true)),
  getEnvironment: vi.fn(() => 'browser' as const),
}

export function resetIpcMocks() {
  Object.values(mockIpcFunctions).forEach((mock) => mock.mockClear())
}

vi.mock('../../lib/ipc', () => mockIpcFunctions)
