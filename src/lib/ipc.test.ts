import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as tauri from './tauri'
import {
  getEngineHealth,
  getDashboardData,
  getHoldings,
  getPositions,
  syncPortfolio,
  runPipeline,
  trGetAuthStatus,
  trCheckSavedSession,
  trGetStoredCredentials,
  trLogin,
  trSubmit2FA,
  trLogout,
  checkConnection,
  getEnvironment,
  getTrueHoldings,
  logEvent,
  getRecentReports,
  getPendingReviews,
  getPipelineReport,
  setHiveContribution,
  getHiveContribution,
} from './ipc'

vi.mock('./tauri', () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('IPC Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('Browser mode (Echo-Bridge)', () => {
    beforeEach(() => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
    })

    it('getEngineHealth calls Echo-Bridge endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { version: '1.0.0', memoryUsageMb: 100, sessionId: 'test' },
          }),
      })

      const result = await getEngineHealth()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:5001/command',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Echo-Bridge-Token': 'dev-echo-bridge-secret',
          }),
        })
      )
      expect(result).toEqual({ version: '1.0.0', memoryUsageMb: 100, sessionId: 'test' })
    })

    it('getDashboardData sends portfolioId in payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { totalValue: 10000, isEmpty: false },
          }),
      })

      await getDashboardData(1)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.command).toBe('get_dashboard_data')
      expect(callBody.payload).toEqual({ portfolioId: 1 })
    })

    it('getHoldings returns topHoldings from dashboard', async () => {
      const mockHoldings = [{ isin: 'US123', name: 'Test Stock' }]
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { topHoldings: mockHoldings },
          }),
      })

      const result = await getHoldings(1)
      expect(result).toEqual(mockHoldings)
    })

    it('getPositions calls get_positions command', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { positions: [], totalValue: 0 },
          }),
      })

      await getPositions(1)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.command).toBe('get_positions')
    })

    it('syncPortfolio sends force parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { syncedPositions: 5 },
          }),
      })

      await syncPortfolio(1, true)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.payload).toEqual({ portfolioId: 1, force: true })
    })

    it('runPipeline calls run_pipeline command', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { success: true, errors: [], durationMs: 100 },
          }),
      })

      const result = await runPipeline()

      expect(result).toEqual({ success: true, errors: [], durationMs: 100 })
    })

    it('trLogin sends credentials', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { authState: 'waiting_2fa' },
          }),
      })

      await trLogin('+4917612345678', '1234', true)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.command).toBe('tr_login')
      expect(callBody.payload).toEqual({
        phone: '+4917612345678',
        pin: '1234',
        remember: true,
      })
    })

    it('trSubmit2FA sends code', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { authState: 'authenticated' },
          }),
      })

      await trSubmit2FA('1234')

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.command).toBe('tr_submit_2fa')
      expect(callBody.payload).toEqual({ code: '1234' })
    })

    it('throws error when Echo-Bridge returns error status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'error',
            error: { message: 'Something went wrong', code: 'TEST_ERROR' },
          }),
      })

      await expect(getEngineHealth()).rejects.toThrow('Backend Error: Something went wrong')
    })

    it('throws error when fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(getEngineHealth()).rejects.toThrow('Echo-Bridge unreachable')
    })

    it('throws error when network fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(getEngineHealth()).rejects.toThrow('Echo-Bridge unreachable')
    })
  })

  describe('Tauri mode', () => {
    beforeEach(() => {
      vi.mocked(tauri.isTauri).mockReturnValue(true)
    })

    it('getEngineHealth calls Tauri invoke', async () => {
      vi.mocked(tauri.invoke).mockResolvedValue({ version: '1.0.0' })

      const result = await getEngineHealth()

      expect(tauri.invoke).toHaveBeenCalledWith('get_engine_health', {})
      expect(result).toEqual({ version: '1.0.0' })
    })

    it('getDashboardData calls Tauri invoke with portfolioId', async () => {
      vi.mocked(tauri.invoke).mockResolvedValue({ totalValue: 10000 })

      await getDashboardData(1)

      expect(tauri.invoke).toHaveBeenCalledWith('get_dashboard_data', { portfolioId: 1 })
    })
  })

  describe('Utility functions', () => {
    it('checkConnection returns true when engine is healthy', async () => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { version: '1.0.0' },
          }),
      })

      const result = await checkConnection()
      expect(result).toBe(true)
    })

    it('checkConnection returns false when engine is unreachable', async () => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await checkConnection()
      expect(result).toBe(false)
    })

    it('getEnvironment returns browser when not in Tauri', () => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
      expect(getEnvironment()).toBe('browser')
    })

    it('getEnvironment returns tauri when in Tauri', () => {
      vi.mocked(tauri.isTauri).mockReturnValue(true)
      expect(getEnvironment()).toBe('tauri')
    })
  })

  describe('Auth functions', () => {
    beforeEach(() => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
    })

    it('trGetAuthStatus returns auth status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { authState: 'idle', hasStoredCredentials: false },
          }),
      })

      const result = await trGetAuthStatus()
      expect(result).toEqual({ authState: 'idle', hasStoredCredentials: false })
    })

    it('trCheckSavedSession returns session check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { hasSession: true, prompt: 'restore' },
          }),
      })

      const result = await trCheckSavedSession()
      expect(result).toEqual({ hasSession: true, prompt: 'restore' })
    })

    it('trGetStoredCredentials returns default on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await trGetStoredCredentials()
      expect(result).toEqual({ hasCredentials: false, maskedPhone: null })
    })

    it('trLogout calls tr_logout command', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { authState: 'idle', message: 'Logged out' },
          }),
      })

      const result = await trLogout()
      expect(result).toEqual({ authState: 'idle', message: 'Logged out' })
    })
  })

  describe('Data functions', () => {
    beforeEach(() => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
    })

    it('getTrueHoldings returns holdings data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { holdings: [], summary: { total: 0 } },
          }),
      })

      const result = await getTrueHoldings()
      expect(result).toEqual({ holdings: [], summary: { total: 0 } })
    })

    it('getPipelineReport returns report data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { status: 'healthy' },
          }),
      })

      const result = await getPipelineReport()
      expect(result).toEqual({ status: 'healthy' })
    })

    it('getRecentReports returns empty array on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await getRecentReports()
      expect(result).toEqual([])
    })

    it('getPendingReviews returns empty array on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await getPendingReviews()
      expect(result).toEqual([])
    })
  })

  describe('Hive functions', () => {
    beforeEach(() => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
    })

    it('setHiveContribution sends enabled flag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: null }),
      })

      await setHiveContribution(true)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.command).toBe('set_hive_contribution')
      expect(callBody.payload).toEqual({ enabled: true })
    })

    it('getHiveContribution returns enabled status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: { enabled: true },
          }),
      })

      const result = await getHiveContribution()
      expect(result).toBe(true)
    })

    it('getHiveContribution returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await getHiveContribution()
      expect(result).toBe(false)
    })
  })

  describe('Logging', () => {
    beforeEach(() => {
      vi.mocked(tauri.isTauri).mockReturnValue(false)
    })

    it('logEvent sends log data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: null }),
      })

      await logEvent('INFO', 'Test message', { key: 'value' }, 'test', 'general')

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.command).toBe('log_event')
      expect(callBody.payload).toEqual({
        level: 'INFO',
        message: 'Test message',
        context: { key: 'value' },
        component: 'test',
        category: 'general',
      })
    })

    it('logEvent silently fails on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(logEvent('ERROR', 'Test')).resolves.toBeUndefined()
    })
  })
})
