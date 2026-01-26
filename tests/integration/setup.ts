/**
 * Integration test setup.
 *
 * These tests run against the REAL Python sidecar (not mocked).
 * External APIs (Supabase, Trade Republic, Finnhub) are mocked via MSW.
 *
 * Usage:
 *   import { startPythonSidecar, stopPythonSidecar, server } from './setup'
 *
 *   beforeAll(async () => {
 *     server.listen({ onUnhandledRequest: 'bypass' })
 *     await startPythonSidecar()
 *   })
 *
 *   afterAll(async () => {
 *     await stopPythonSidecar()
 *     server.close()
 *   })
 */
import { spawn, ChildProcess } from 'child_process'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

let pythonProcess: ChildProcess | null = null

// MSW handlers for external APIs only
// Internal IPC is not mocked - we test the real Python sidecar
const externalApiHandlers = [
  // Mock Supabase
  http.get('https://*.supabase.co/*', () => {
    return HttpResponse.json({ data: [], error: null })
  }),

  // Mock Finnhub via Cloudflare Worker
  http.get('https://portfolio-prism-proxy.*.workers.dev/*', () => {
    return HttpResponse.json({ c: 180.5, d: 2.5, dp: 1.4 })
  }),
]

export const server = setupServer(...externalApiHandlers)

/**
 * Start the Python sidecar for integration tests.
 *
 * Spawns the Python engine in HTTP mode and waits for it to be ready.
 * Uses the test token for authentication.
 *
 * @throws {Error} If sidecar fails to start within 10 seconds
 */
export async function startPythonSidecar(): Promise<void> {
  return new Promise((resolve, reject) => {
    pythonProcess = spawn('uv', ['run', 'python', 'prism_headless.py', '--http'], {
      cwd: 'src-tauri/python',
      env: {
        ...process.env,
        PRISM_ECHO_TOKEN: 'integration-test-token',
      },
    })

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      // Echo Bridge prints this when ready
      if (output.includes('Echo Bridge listening') || output.includes('Starting HTTP server')) {
        resolve()
      }
    })

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`Python stderr: ${data.toString()}`)
    })

    pythonProcess.on('error', reject)

    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('Python sidecar startup timeout')), 10000)
  })
}

/**
 * Stop the Python sidecar gracefully.
 *
 * Sends SIGTERM to allow graceful shutdown.
 */
export async function stopPythonSidecar(): Promise<void> {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
  }
}

/**
 * Add custom MSW handlers for a specific test.
 *
 * @example
 * ```ts
 * import { addTestHandlers } from './setup'
 *
 * it('handles rate limiting', () => {
 *   addTestHandlers([
 *     http.get('https://api.finnhub.io/*', () => {
 *       return HttpResponse.json({ error: 'Rate limited' }, { status: 429 })
 *     }),
 *   ])
 *   // Test code...
 * })
 * ```
 */
export function addTestHandlers(handlers: Parameters<typeof server.use>[0][]) {
  server.use(...handlers)
}
