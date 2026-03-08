import { vi } from 'vitest'

// =============================================================================
// Types
// =============================================================================

type CommandHandler<T = unknown> = (args?: Record<string, unknown>) => T | Promise<T>
type CommandHandlers = Record<string, CommandHandler>
type ListenHandler = (event: string, handler: (payload: unknown) => void) => () => void

// =============================================================================
// Internal State
// =============================================================================

let commandHandlers: CommandHandlers = {}
let listenHandler: ListenHandler = () => () => {}

// =============================================================================
// Mock Tauri Invoke & Listen
// =============================================================================

export const mockTauriInvoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd in commandHandlers) {
    return commandHandlers[cmd](args)
  }
  throw new Error(`Unhandled Tauri command: ${cmd}`)
})

export const mockTauriListen = vi.fn((event: string, handler: (payload: unknown) => void) => {
  return listenHandler(event, handler)
})

// =============================================================================
// Module Mocks (auto-registered on import)
// =============================================================================

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockTauriInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockTauriListen,
  once: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}))

// =============================================================================
// Public API: setupTauriMock
// =============================================================================

/**
 * Set up Tauri mock with command handlers for a test.
 *
 * This is the primary API for test files. Use this in beforeEach to configure
 * what commands return for your test case.
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   setupTauriMock({
 *     get_dashboard_data: () => mockDashboardData(),
 *     get_health: () => mockEngineHealth(),
 *   })
 * })
 * ```
 *
 * @param handlers - Map of command name to handler function
 * @returns The mockTauriInvoke spy for assertions
 */
export function setupTauriMock(handlers: CommandHandlers) {
  commandHandlers = handlers
  mockTauriInvoke.mockClear()
  mockTauriListen.mockClear()

  // Enable Tauri environment detection
  window.__TAURI_INTERNALS__ = {}

  return mockTauriInvoke
}

/**
 * Set up a custom listener handler for Tauri events.
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   setListenHandler((event, handler) => {
 *     if (event === 'sync_progress') {
 *       // Can emit events during test
 *       handler({ progress: 50 })
 *     }
 *     return () => {}
 *   })
 * })
 * ```
 */
export function setListenHandler(handler: ListenHandler) {
  listenHandler = handler
}

/**
 * Reset all Tauri mocks to initial state.
 * Called automatically in afterEach if using setupTauriMock.
 */
export function resetTauriMocks() {
  commandHandlers = {}
  listenHandler = () => () => {}
  mockTauriInvoke.mockClear()
  mockTauriListen.mockClear()
}

// =============================================================================
// Mock Data Generators
// =============================================================================

/**
 * Generate mock dashboard data for tests.
 * Returns a fresh object each time to prevent cross-test pollution.
 */
export function mockDashboardData() {
  return {
    totalValue: 125000,
    totalGain: 15000,
    gainPercentage: 13.6,
    dayChange: 250,
    dayChangePercent: 0.2,
    history: [
      { date: '2026-01-24', value: 120000 },
      { date: '2026-01-25', value: 122000 },
      { date: '2026-01-26', value: 125000 },
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
    ],
    lastUpdated: '2026-01-26T10:00:00Z',
    isEmpty: false,
    positionCount: 25,
  }
}

/**
 * Generate mock engine health data for tests.
 */
export function mockEngineHealth() {
  return {
    version: '1.0.0-test',
    memoryUsageMb: 128.5,
    uptime: 3600,
    sessionId: 'test-session-123',
  }
}

/**
 * Generate mock positions response for tests.
 */
export function mockPositionsData() {
  return {
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
        lastUpdated: '2026-01-26T12:00:00Z',
      },
    ],
    totalValue: 75000,
    totalCost: 65000,
    totalPnl: 10000,
    totalPnlPercent: 15.4,
    lastSyncTime: '2026-01-26T12:00:00Z',
  }
}

/**
 * Generate mock auth status for tests.
 */
export function mockAuthStatus(state: 'idle' | 'authenticated' | 'waiting_2fa' = 'idle') {
  return {
    authState: state,
    hasStoredCredentials: state === 'authenticated',
  }
}

/**
 * Generate mock session check result for tests.
 */
export function mockSessionCheck(hasSession = false) {
  return hasSession
    ? { hasSession: true, phoneNumber: '+49***1234', prompt: 'restore_session' }
    : { hasSession: false, prompt: 'login_required' }
}

/**
 * Generate mock true holdings response for tests.
 */
export function mockTrueHoldingsData() {
  return {
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
}

/**
 * Generate mock pipeline report for tests.
 */
export function mockPipelineReport() {
  return {
    status: 'ready',
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    report: {
      timestamp: new Date().toISOString(),
      metrics: {
        direct_holdings: 5,
        etf_positions: 3,
        etfs_processed: 3,
        tier1_resolved: 10,
        tier1_failed: 0,
      },
      performance: {
        execution_time_seconds: 1.5,
        hive_hit_rate: 85,
        api_fallback_rate: 15,
        total_assets_processed: 15,
        phase_durations: {},
      },
      failures: [],
    },
    validationErrors: [],
  }
}

// =============================================================================
// Tauri Environment Mock
// =============================================================================

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

/**
 * Explicitly set whether the test should simulate running in Tauri.
 */
export function mockTauriEnvironment(isTauri: boolean) {
  if (isTauri) {
    window.__TAURI_INTERNALS__ = {}
  } else {
    delete window.__TAURI_INTERNALS__
  }
}

// =============================================================================
// Legacy API (Deprecated - use setupTauriMock instead)
// =============================================================================

/**
 * @deprecated Use setupTauriMock() instead
 */
export function setInvokeHandler(
  handler: (cmd: string, args?: Record<string, unknown>) => unknown
) {
  commandHandlers = {
    // Convert single handler to multi-command handler
    __legacy__: (args) => handler('__legacy__', args),
  }
  // Override invoke to use legacy single-handler pattern
  mockTauriInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    return handler(cmd, args)
  })
}
