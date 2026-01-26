# Spec: Fix E2E Test Location and Create Integration Tests

> **Goal**: Move E2E tests to correct location and create missing integration test infrastructure.
> **Estimated Time**: 25 minutes.
> **Priority**: MEDIUM

## 1. Overview

The E2E tests are located in `/e2e/` instead of `/tests/e2e/` as mandated. Additionally, the integration test layer (30% of the test pyramid) is completely missing.

### Rule Reference
`rules/testing.md` Section 2 (The Pyramid):
> "Integration (30%): Services + Database. Mocking: External APIs ONLY. Use REAL SQLite/Docker DB."

`rules/testing.md` Section 4 (Test Organization):
> "Integration/E2E: Top-level `tests/` folder. `tests/integration/api.test.ts`, `tests/e2e/login.spec.ts`"

## 2. Current Violations

### 2.1 E2E Tests in Wrong Location

| Current Path | Required Path |
|--------------|---------------|
| `/e2e/auth.spec.ts` | `/tests/e2e/auth.spec.ts` |
| `/e2e/dashboard.spec.ts` | `/tests/e2e/dashboard.spec.ts` |
| `/e2e/*.spec.ts` | `/tests/e2e/*.spec.ts` |

### 2.2 Missing Integration Tests

The `/tests/` directory exists but is empty. Required:
- `/tests/integration/` - For IPC + Python sidecar tests
- `/tests/e2e/` - For Playwright end-to-end tests

## 3. Implementation Steps

### 3.1 Create Directory Structure

```bash
mkdir -p tests/integration
mkdir -p tests/e2e
```

### 3.2 Move E2E Tests

```bash
# Move all spec files from /e2e to /tests/e2e
mv e2e/*.spec.ts tests/e2e/
mv e2e/fixtures tests/e2e/fixtures  # If exists
mv e2e/support tests/e2e/support    # If exists

# Remove empty /e2e directory
rmdir e2e
```

### 3.3 Update Playwright Configuration

**File to modify:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // BEFORE
  // testDir: './e2e',
  
  // AFTER
  testDir: './tests/e2e',
  
  // Rest of config...
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run tauri dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
  },
})
```

### 3.4 Create Integration Test Infrastructure

**Create file:** `tests/integration/setup.ts`

```typescript
/**
 * Integration test setup.
 * 
 * These tests run against the REAL Python sidecar (not mocked).
 * External APIs (Supabase, Trade Republic, Finnhub) are mocked via MSW.
 */
import { spawn, ChildProcess } from 'child_process'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

let pythonProcess: ChildProcess | null = null

// MSW handlers for external APIs only
const externalApiHandlers = [
  // Mock Supabase
  http.get('https://*.supabase.co/*', () => {
    return HttpResponse.json({ data: [], error: null })
  }),
  
  // Mock Finnhub via Cloudflare Worker
  http.get('https://portfolio-prism-proxy.*.workers.dev/*', () => {
    return HttpResponse.json({ c: 180.50, d: 2.50, dp: 1.4 })
  }),
]

export const server = setupServer(...externalApiHandlers)

export async function startPythonSidecar(): Promise<void> {
  return new Promise((resolve, reject) => {
    pythonProcess = spawn('uv', ['run', 'python', 'prism_headless.py', '--http'], {
      cwd: 'src-tauri/python',
      env: {
        ...process.env,
        PRISM_ECHO_TOKEN: 'integration-test-token',
      },
    })
    
    pythonProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('Echo Bridge listening')) {
        resolve()
      }
    })
    
    pythonProcess.stderr?.on('data', (data) => {
      console.error(`Python stderr: ${data}`)
    })
    
    pythonProcess.on('error', reject)
    
    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('Python sidecar startup timeout')), 10000)
  })
}

export async function stopPythonSidecar(): Promise<void> {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
  }
}
```

### 3.5 Create First Integration Test

**Create file:** `tests/integration/ipc.test.ts`

```typescript
/**
 * Integration tests for IPC layer.
 * 
 * Tests the REAL TypeScript IPC functions against the REAL Python sidecar.
 * Only external APIs are mocked (Supabase, Finnhub).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { startPythonSidecar, stopPythonSidecar, server } from './setup'

// Import the REAL IPC functions (not mocked)
import { getEngineHealth, getDashboardData } from '../../src/lib/ipc'

describe('IPC Integration', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' })
    await startPythonSidecar()
  })
  
  afterAll(async () => {
    await stopPythonSidecar()
    server.close()
  })
  
  afterEach(() => {
    server.resetHandlers()
  })
  
  describe('getEngineHealth', () => {
    it('returns valid health status from Python sidecar', async () => {
      const health = await getEngineHealth()
      
      expect(health).toBeDefined()
      expect(health.status).toMatch(/healthy|degraded|unhealthy/)
      expect(health.python_version).toMatch(/^3\.\d+\.\d+/)
      expect(typeof health.uptime_seconds).toBe('number')
    })
  })
  
  describe('getDashboardData', () => {
    it('returns dashboard data with proper structure', async () => {
      const data = await getDashboardData()
      
      expect(data).toBeDefined()
      expect(typeof data.total_value).toBe('number')
      expect(typeof data.total_pnl).toBe('number')
      expect(Array.isArray(data.positions)).toBe(true)
      expect(data.last_updated).toBeDefined()
    })
  })
})
```

### 3.6 Update package.json Scripts

**File to modify:** `package.json`

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:unit": "vitest run src/",
    "test:integration": "vitest run tests/integration/",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### 3.7 Update Vitest Configuration

**File to modify:** `vitest.config.ts` (or vite.config.ts)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Include both unit tests (src/) and integration tests (tests/)
    include: [
      'src/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.ts',
    ],
    // Exclude E2E tests (run by Playwright)
    exclude: [
      'tests/e2e/**',
      'node_modules/**',
    ],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Separate setup for integration tests
    environmentMatchGlobs: [
      ['tests/integration/**', 'node'],
    ],
  },
})
```

## 4. Files to Modify

| File | Action |
|------|--------|
| `e2e/*.spec.ts` | MOVE to `tests/e2e/` |
| `playwright.config.ts` | MODIFY - Update testDir |
| `tests/integration/setup.ts` | CREATE - Integration test setup |
| `tests/integration/ipc.test.ts` | CREATE - First integration test |
| `package.json` | MODIFY - Add test scripts |
| `vitest.config.ts` | MODIFY - Include integration tests |

## 5. Directory Structure After Implementation

```
tests/
  integration/
    setup.ts           # Python sidecar + MSW setup
    ipc.test.ts        # IPC layer integration tests
    pipeline.test.ts   # Pipeline integration tests (future)
  e2e/
    auth.spec.ts       # Moved from /e2e/
    dashboard.spec.ts  # Moved from /e2e/
    fixtures/          # Moved from /e2e/ (if exists)
```

## 6. Testing Verification

### 6.1 Verify E2E Tests Still Work
```bash
pnpm test:e2e
# All tests should pass with new path
```

### 6.2 Run Integration Tests
```bash
pnpm test:integration
# Should start Python sidecar and run tests
```

### 6.3 Verify Directory Structure
```bash
ls tests/
# Should show: integration/ e2e/

ls e2e/
# Should fail: directory should not exist
```

## 7. Acceptance Criteria

- [ ] `/e2e/` directory no longer exists
- [ ] All E2E tests are in `/tests/e2e/`
- [ ] `playwright.config.ts` points to `./tests/e2e`
- [ ] `/tests/integration/` contains at least one test file
- [ ] `pnpm test:e2e` runs E2E tests successfully
- [ ] `pnpm test:integration` runs integration tests successfully
- [ ] Integration tests use REAL Python sidecar, not mocks

## 8. Future Integration Tests to Add

Once infrastructure is in place, create integration tests for:

1. `tests/integration/pipeline.test.ts` - Pipeline execution
2. `tests/integration/auth.test.ts` - TR authentication flow
3. `tests/integration/sync.test.ts` - Portfolio sync
4. `tests/integration/hive.test.ts` - Hive contribution

This will build toward the 30% integration test coverage required by the pyramid.
