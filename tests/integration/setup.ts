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
import { existsSync } from 'fs'
import { mkdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

let pythonProcess: ChildProcess | null = null

const TEST_ECHO_TOKEN = 'integration-test-token'
const TEST_STARTUP_TIMEOUT_MS = 15000
const TEST_POLL_INTERVAL_MS = 250
const PYTHON_WORKDIR = path.resolve(process.cwd(), 'src-tauri', 'python')
const TEST_DATA_DIR = path.resolve(process.cwd(), '.tmp', 'integration-data')
const TEST_OUTPUTS_DIR = path.join(TEST_DATA_DIR, 'outputs')
const TEST_UV_CACHE_DIR = path.resolve(process.cwd(), '.tmp', 'uv-cache')
const LOCAL_PYTHON_PATH =
  process.platform === 'win32'
    ? path.join(PYTHON_WORKDIR, '.venv', 'Scripts', 'python.exe')
    : path.join(PYTHON_WORKDIR, '.venv', 'bin', 'python')

let testEchoBridgePort = 5001
let testEchoBridgeUrl = `http://127.0.0.1:${testEchoBridgePort}`

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

async function allocateEchoBridgePort(): Promise<number> {
  const basePort = 20000
  const portRange = 20000
  return basePort + Math.floor(Math.random() * portRange)
}

async function prepareIntegrationEnvironment(): Promise<void> {
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
  await mkdir(TEST_OUTPUTS_DIR, { recursive: true })
  await mkdir(TEST_UV_CACHE_DIR, { recursive: true })
  testEchoBridgePort = await allocateEchoBridgePort()
  testEchoBridgeUrl = `http://127.0.0.1:${testEchoBridgePort}`
  process.env.VITE_ECHO_BRIDGE_TOKEN = TEST_ECHO_TOKEN
  process.env.VITE_ECHO_BRIDGE_URL = testEchoBridgeUrl
}

async function waitForSidecarReady(): Promise<void> {
  const deadline = Date.now() + TEST_STARTUP_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${testEchoBridgeUrl}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // Sidecar is still starting up.
    }

    await new Promise((resolve) => setTimeout(resolve, TEST_POLL_INTERVAL_MS))
  }

  throw new Error(`Python sidecar startup timeout after ${TEST_STARTUP_TIMEOUT_MS}ms`)
}

function getPythonCommand(): { command: string; args: string[] } {
  if (existsSync(LOCAL_PYTHON_PATH)) {
    return {
      command: LOCAL_PYTHON_PATH,
      args: [
        'prism_headless.py',
        '--http',
        '--host',
        '127.0.0.1',
        '--port',
        String(testEchoBridgePort),
      ],
    }
  }

  return {
    command: 'uv',
    args: [
      'run',
      'python',
      'prism_headless.py',
      '--http',
      '--host',
      '127.0.0.1',
      '--port',
      String(testEchoBridgePort),
    ],
  }
}

/**
 * Start the Python sidecar for integration tests.
 *
 * Spawns the Python engine in HTTP mode and waits for it to be ready.
 * Uses the test token for authentication.
 *
 * @throws {Error} If sidecar fails to start within 10 seconds
 */
export async function startPythonSidecar(): Promise<void> {
  await prepareIntegrationEnvironment()

  return new Promise((resolve, reject) => {
    const { command, args } = getPythonCommand()
    let settled = false
    let stderrOutput = ''

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true

      if (error) {
        void stopPythonSidecar().finally(() => reject(error))
        return
      }

      resolve()
    }

    pythonProcess = spawn(command, args, {
      cwd: PYTHON_WORKDIR,
      env: {
        ...process.env,
        PRISM_ECHO_TOKEN: TEST_ECHO_TOKEN,
        PRISM_DATA_DIR: TEST_DATA_DIR,
        UV_CACHE_DIR: TEST_UV_CACHE_DIR,
      },
    })

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderrOutput += chunk
      console.error(`Python stderr: ${chunk}`)
    })

    pythonProcess.on('error', (error) => finish(error))
    pythonProcess.on('exit', (code, signal) => {
      if (settled) {
        return
      }

      const details = stderrOutput.trim()
      const suffix = details ? `\n${details}` : ''
      finish(
        new Error(`Python sidecar exited before ready (code=${code}, signal=${signal})${suffix}`)
      )
    })

    void waitForSidecarReady()
      .then(() => finish())
      .catch((error: Error) => {
        const details = stderrOutput.trim()
        const suffix = details ? `\n${details}` : ''
        finish(new Error(`${error.message}${suffix}`))
      })
  })
}

/**
 * Stop the Python sidecar gracefully.
 *
 * Sends SIGTERM to allow graceful shutdown.
 */
export async function stopPythonSidecar(): Promise<void> {
  if (pythonProcess) {
    const runningProcess = pythonProcess
    pythonProcess = null

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        runningProcess.kill('SIGKILL')
        resolve()
      }, 2000)

      runningProcess.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      runningProcess.kill('SIGTERM')
    })
  }
}

export async function writePipelineHealthReport(reportPayload: unknown): Promise<void> {
  await mkdir(TEST_OUTPUTS_DIR, { recursive: true })
  await writeFile(
    path.join(TEST_OUTPUTS_DIR, 'pipeline_health.json'),
    JSON.stringify(reportPayload),
    'utf8'
  )
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
