import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isTauri, invoke, listen, once, emit } from './tauri'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
}))

describe('tauri.ts', () => {
  const originalWindow = global.window

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.window = originalWindow
  })

  describe('isTauri', () => {
    it('returns false when window is undefined', () => {
      const windowBackup = global.window
      // @ts-expect-error - Testing undefined window
      delete global.window
      expect(isTauri()).toBe(false)
      global.window = windowBackup
    })

    it('returns false when __TAURI_INTERNALS__ is not present', () => {
      global.window = {} as Window & typeof globalThis
      expect(isTauri()).toBe(false)
    })

    it('returns true when __TAURI_INTERNALS__ is present', () => {
      global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis
      expect(isTauri()).toBe(true)
    })
  })

  describe('invoke', () => {
    it('throws error when not in Tauri environment', async () => {
      global.window = {} as Window & typeof globalThis

      await expect(invoke('get_engine_health')).rejects.toThrow(
        'Tauri not available. Cannot invoke command: get_engine_health'
      )
    })

    it('calls Tauri invoke when in Tauri environment', async () => {
      global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis

      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
      vi.mocked(tauriInvoke).mockResolvedValue({ version: '1.0.0' })

      const result = await invoke('get_engine_health')

      expect(tauriInvoke).toHaveBeenCalledWith('get_engine_health', undefined)
      expect(result).toEqual({ version: '1.0.0' })
    })

    it('passes arguments to Tauri invoke', async () => {
      global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis

      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
      vi.mocked(tauriInvoke).mockResolvedValue({ totalValue: 100000 })

      await invoke('get_dashboard_data', { portfolioId: 1 })

      expect(tauriInvoke).toHaveBeenCalledWith('get_dashboard_data', { portfolioId: 1 })
    })
  })

  describe('listen', () => {
    it('returns no-op function when not in Tauri environment', async () => {
      global.window = {} as Window & typeof globalThis
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const handler = vi.fn()
      const unlisten = await listen('sync-progress', handler)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Tauri not available. Cannot listen for event: sync-progress'
      )
      expect(typeof unlisten).toBe('function')
      unlisten()

      consoleSpy.mockRestore()
    })

    it('calls Tauri listen when in Tauri environment', async () => {
      global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis

      const { listen: tauriListen } = await import('@tauri-apps/api/event')
      const mockUnlisten = vi.fn()
      vi.mocked(tauriListen).mockResolvedValue(mockUnlisten)

      const handler = vi.fn()
      const unlisten = await listen('sync-progress', handler)

      expect(tauriListen).toHaveBeenCalled()
      expect(unlisten).toBe(mockUnlisten)
    })
  })

  describe('once', () => {
    it('returns no-op function when not in Tauri environment', async () => {
      global.window = {} as Window & typeof globalThis
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const handler = vi.fn()
      const unlisten = await once('python-ready', handler)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Tauri not available. Cannot listen for event: python-ready'
      )
      expect(typeof unlisten).toBe('function')

      consoleSpy.mockRestore()
    })

    it('calls Tauri once when in Tauri environment', async () => {
      global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis

      const { once: tauriOnce } = await import('@tauri-apps/api/event')
      const mockUnlisten = vi.fn()
      vi.mocked(tauriOnce).mockResolvedValue(mockUnlisten)

      const handler = vi.fn()
      await once('python-ready', handler)

      expect(tauriOnce).toHaveBeenCalled()
    })
  })

  describe('emit', () => {
    it('does nothing when not in Tauri environment', async () => {
      global.window = {} as Window & typeof globalThis
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await emit('sync-progress', { status: 'syncing', progress: 50, message: 'Testing' })

      expect(consoleSpy).toHaveBeenCalledWith(
        'Tauri not available. Cannot emit event: sync-progress'
      )

      consoleSpy.mockRestore()
    })

    it('calls Tauri emit when in Tauri environment', async () => {
      global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis

      const { emit: tauriEmit } = await import('@tauri-apps/api/event')
      vi.mocked(tauriEmit).mockResolvedValue(undefined)

      await emit('sync-progress', { status: 'syncing', progress: 50, message: 'Testing' })

      expect(tauriEmit).toHaveBeenCalledWith('sync-progress', {
        status: 'syncing',
        progress: 50,
        message: 'Testing',
      })
    })
  })
})
