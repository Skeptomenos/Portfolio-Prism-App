import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the scrubber module to verify it's being called
vi.mock('@/lib/scrubber', () => ({
  scrubText: vi.fn((text: string) => text.replace(/test@example\.com/g, '[EMAIL]')),
  scrubObject: vi.fn((obj: unknown) => obj),
}))

import { scrubText, scrubObject } from '@/lib/scrubber'

describe('sendFeedback', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('PII Scrubbing', () => {
    it('scrubs PII from message before sending', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      // Re-import to get fresh module with new env
      const { sendFeedback } = await import('./feedback')

      const mockResponse = { issue_url: 'https://github.com/test/issue/1' }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      await sendFeedback({
        type: 'functional',
        message: 'Please contact me at test@example.com',
        metadata: { view: 'dashboard' },
      })

      expect(scrubText).toHaveBeenCalledWith('Please contact me at test@example.com')
    })

    it('scrubs PII from metadata before sending', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      const { sendFeedback } = await import('./feedback')

      const mockResponse = { issue_url: 'https://github.com/test/issue/1' }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const metadata = { error: 'Error at /Users/john/secret/path.ts' }

      await sendFeedback({
        type: 'critical',
        message: 'An error occurred',
        metadata,
      })

      expect(scrubObject).toHaveBeenCalledWith(metadata)
    })

    it('handles missing metadata gracefully', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      const { sendFeedback } = await import('./feedback')

      const mockResponse = { issue_url: 'https://github.com/test/issue/1' }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      await sendFeedback({
        type: 'functional',
        message: 'Test message',
      })

      // scrubObject should not be called when metadata is undefined
      expect(scrubObject).not.toHaveBeenCalled()
    })
  })

  describe('Request Timeout', () => {
    it('throws timeout error when request is aborted', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      const { sendFeedback } = await import('./feedback')

      // Simulate AbortController abort
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      vi.mocked(global.fetch).mockRejectedValue(abortError)

      await expect(
        sendFeedback({
          type: 'functional',
          message: 'Test message',
        })
      ).rejects.toThrow('Request timed out. Please check your connection and try again.')
    })

    it('passes AbortSignal to fetch', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      const { sendFeedback } = await import('./feedback')

      const mockResponse = { issue_url: 'https://github.com/test/issue/1' }
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      await sendFeedback({
        type: 'functional',
        message: 'Test message',
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })
  })

  describe('Mock Response', () => {
    it('returns mock response when VITE_WORKER_URL is not set', async () => {
      vi.stubEnv('VITE_WORKER_URL', '')

      const { sendFeedback } = await import('./feedback')

      const result = await sendFeedback({
        type: 'functional',
        message: 'Test message',
      })

      expect(result).toEqual({ issue_url: 'https://github.com/mock-issue-url' })
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('throws error with status code on server error', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      const { sendFeedback } = await import('./feedback')

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server Error'),
      } as unknown as Response)

      await expect(
        sendFeedback({
          type: 'functional',
          message: 'Test message',
        })
      ).rejects.toThrow('Server error (500): Server Error')
    })

    it('rethrows non-timeout errors', async () => {
      vi.stubEnv('VITE_WORKER_URL', 'https://test-worker.com')

      const { sendFeedback } = await import('./feedback')

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network failure'))

      await expect(
        sendFeedback({
          type: 'functional',
          message: 'Test message',
        })
      ).rejects.toThrow('Network failure')
    })
  })
})
