import { afterEach, expect, it, vi } from 'vitest'
import { startAutomaticRefresh } from '../server/automatic-refresh'
afterEach(() => vi.useRealTimers())
it('starts the broker and provider once, schedules periodic checks and stops them on shutdown', () => {
  vi.useFakeTimers()
  const service = { restore: vi.fn(), sync: vi.fn(), issuerRefresh: { refresh: vi.fn() } }
  const stop = startAutomaticRefresh(service, true)
  expect(service.restore).toHaveBeenCalledTimes(1)
  expect(service.issuerRefresh.refresh).toHaveBeenCalledWith(true)
  vi.advanceTimersByTime(15 * 60 * 1000)
  expect(service.sync).toHaveBeenCalledTimes(1)
  expect(service.issuerRefresh.refresh).toHaveBeenCalledTimes(2)
  stop(); vi.advanceTimersByTime(15 * 60 * 1000)
  expect(service.issuerRefresh.refresh).toHaveBeenCalledTimes(2)
})
it('offline mode suppresses startup and periodic broker and issuer requests', () => {
  vi.useFakeTimers()
  const service = { restore: vi.fn(), sync: vi.fn(), issuerRefresh: { refresh: vi.fn() } }
  const stop = startAutomaticRefresh(service, false)
  vi.advanceTimersByTime(60 * 60 * 1000)
  expect(service.restore).not.toHaveBeenCalled()
  expect(service.sync).not.toHaveBeenCalled()
  expect(service.issuerRefresh.refresh).not.toHaveBeenCalled()
  stop()
})
