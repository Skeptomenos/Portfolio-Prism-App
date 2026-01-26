# Spec: Refactor Tests to Remove Internal Service Mocking

> **Goal**: Replace mocks of internal services (IPC, Store, Hooks) with proper test patterns to comply with testing rules.
> **Estimated Time**: 45 minutes.
> **Priority**: HIGH

## 1. Overview

The current test suite extensively mocks internal modules (`lib/ipc.ts`, `store/useAppStore.ts`, custom hooks), which violates the testing mandate. This creates brittle tests that don't verify actual integration behavior.

### Rule Reference
`rules/testing.md` Section 3 (Mocking Rules):
> "Internal: Do NOT mock your own Service/Repo logic. Test the integration."
> "External: ALWAYS mock 3rd party APIs (Network calls)."

## 2. Current Violations

### 2.1 Files Mocking Internal Services

| Test File | Mocked Internal Modules |
|-----------|------------------------|
| `src/lib/ipc.test.ts` | `./tauri` |
| `src/hooks/usePortfolioData.test.tsx` | `../lib/ipc`, `../store/useAppStore` |
| `src/components/views/HealthView.test.tsx` | `../../lib/ipc`, `../../store/useAppStore` |
| `src/components/common/ErrorBoundary.test.tsx` | `../../store/useAppStore`, `../../lib/api/feedback`, `../../lib/scrubber` |
| `src/features/xray/components/XRayView.test.tsx` | `../../../lib/ipc`, 4 hooks, `../../../store/useAppStore` |
| `src/features/auth/components/LoginForm.test.tsx` | `../../../lib/ipc`, `../../../store/useAppStore` |
| `src/App.test.tsx` | `./lib/ipc`, `./lib/tauri`, `./hooks/useTauriEvents` |

### 2.2 Anti-Pattern Example

```typescript
// CURRENT (BAD) - src/hooks/usePortfolioData.test.tsx
vi.mock('../lib/ipc', () => ({
  getPositions: vi.fn().mockResolvedValue([...]),
  getDashboardData: vi.fn().mockResolvedValue({...}),
}))

vi.mock('../store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({ isAuthenticated: true })),
}))
```

This approach:
- Doesn't test actual IPC logic
- Breaks when IPC function signatures change
- Creates false confidence in code that may not work

## 3. Implementation Strategy

### 3.1 Use MSW for Network-Level Mocking

Install Mock Service Worker to intercept at the network layer instead of module level:

```bash
pnpm add -D msw
```

### 3.2 Create MSW Handlers

**Create file:** `src/test/mocks/handlers.ts`

```typescript
import { http, HttpResponse } from 'msw'

// Mock the Tauri IPC at the transport level
// Note: For Tauri, we need to mock the invoke call, not HTTP

export const handlers = [
  // If using Echo Bridge HTTP transport in tests
  http.post('http://localhost:8765/ipc', async ({ request }) => {
    const body = await request.json() as { command: string; payload: unknown }
    
    switch (body.command) {
      case 'get_dashboard_data':
        return HttpResponse.json({
          success: true,
          data: {
            total_value: 100000,
            total_pnl: 5000,
            positions: [],
            last_updated: new Date().toISOString(),
          }
        })
      
      case 'get_engine_health':
        return HttpResponse.json({
          success: true,
          data: {
            status: 'healthy',
            python_version: '3.12.0',
            uptime_seconds: 1000,
            last_sync: null,
          }
        })
      
      default:
        return HttpResponse.json({
          success: false,
          error: { code: 'UNKNOWN_COMMAND', message: `Unknown: ${body.command}` }
        })
    }
  }),
]
```

### 3.3 Setup MSW in Test Config

**Modify file:** `src/test/setup.ts`

```typescript
import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers'

export const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### 3.4 Create Tauri Mock for IPC

Since Tauri uses a different transport than HTTP, create a proper mock:

**Create file:** `src/test/mocks/tauri.ts`

```typescript
import { vi } from 'vitest'

/**
 * Mock Tauri's invoke function at the window level.
 * This is more accurate than mocking the ipc.ts module.
 */
export function setupTauriMock(commandHandlers: Record<string, (args: unknown) => unknown>) {
  const mockInvoke = vi.fn(async (cmd: string, args?: unknown) => {
    if (cmd in commandHandlers) {
      return commandHandlers[cmd](args)
    }
    throw new Error(`Unhandled Tauri command: ${cmd}`)
  })

  // Mock the Tauri API
  vi.stubGlobal('__TAURI__', {
    core: {
      invoke: mockInvoke,
    },
    event: {
      listen: vi.fn(() => Promise.resolve(() => {})),
      emit: vi.fn(),
    },
  })

  return mockInvoke
}

// Default mock data generators
export const mockDashboardData = () => ({
  total_value: 100000,
  total_cost: 95000,
  total_pnl: 5000,
  total_pnl_percent: 5.26,
  positions: [
    {
      isin: 'US0378331005',
      ticker: 'AAPL',
      name: 'Apple Inc.',
      quantity: 10,
      current_price: 180.50,
      current_value: 1805,
      cost_basis: 1500,
      pnl: 305,
      pnl_percent: 20.33,
      weight: 1.805,
    },
  ],
  last_updated: '2026-01-26T10:00:00Z',
})

export const mockEngineHealth = () => ({
  status: 'healthy',
  python_version: '3.12.0',
  uptime_seconds: 3600,
  memory_mb: 256,
  last_sync: '2026-01-26T09:00:00Z',
})
```

### 3.5 Refactor Test Files

#### Example: usePortfolioData.test.tsx

```typescript
// BEFORE (BAD)
vi.mock('../lib/ipc', () => ({
  getPositions: vi.fn().mockResolvedValue([...]),
}))

describe('usePortfolioData', () => {
  it('fetches positions', async () => {
    // Test with mocked module - doesn't test actual IPC
  })
})

// AFTER (GOOD)
import { setupTauriMock, mockDashboardData } from '../test/mocks/tauri'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '../test/utils'

describe('usePortfolioData', () => {
  beforeEach(() => {
    setupTauriMock({
      get_dashboard_data: () => mockDashboardData(),
      get_positions: () => mockDashboardData().positions,
    })
  })

  it('fetches positions via actual IPC layer', async () => {
    const wrapper = ({ children }) => (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    )
    
    const { result } = renderHook(() => usePortfolioData(), { wrapper })
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    
    expect(result.current.data?.positions).toHaveLength(1)
    expect(result.current.data?.positions[0].ticker).toBe('AAPL')
  })
})
```

#### Example: LoginForm.test.tsx

```typescript
// BEFORE (BAD)
vi.mock('../../../lib/ipc', () => ({
  trLogin: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({ setAuthenticated: vi.fn() })),
}))

// AFTER (GOOD)
import { setupTauriMock } from '../../../test/mocks/tauri'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('submits credentials and updates auth state', async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      success: true,
      data: { session_token: 'abc123' }
    })
    
    setupTauriMock({
      tr_login: mockLogin,
    })
    
    render(<LoginForm />)
    
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+49123456789' } })
    fireEvent.change(screen.getByLabelText(/pin/i), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        phone_number: '+49123456789',
        pin: '1234',
      })
    })
  })
})
```

## 4. Files to Modify

| File | Action |
|------|--------|
| `src/test/mocks/tauri.ts` | CREATE - Tauri invoke mock |
| `src/test/mocks/handlers.ts` | MODIFY - Add IPC handlers for MSW |
| `src/test/setup.ts` | MODIFY - Setup Tauri mock globally |
| `src/lib/ipc.test.ts` | REFACTOR - Remove tauri mock |
| `src/hooks/usePortfolioData.test.tsx` | REFACTOR - Use Tauri mock |
| `src/components/views/HealthView.test.tsx` | REFACTOR - Use Tauri mock |
| `src/components/common/ErrorBoundary.test.tsx` | REFACTOR - Use Tauri mock |
| `src/features/xray/components/XRayView.test.tsx` | REFACTOR - Use Tauri mock |
| `src/features/auth/components/LoginForm.test.tsx` | REFACTOR - Use Tauri mock |
| `src/App.test.tsx` | REFACTOR - Use Tauri mock |

## 5. What CAN Be Mocked

| Type | Can Mock? | Example |
|------|-----------|---------|
| Network transport (Tauri invoke) | YES | `setupTauriMock()` |
| External APIs (Supabase, Trade Republic) | YES | MSW handlers |
| Date/Time | YES | `vi.useFakeTimers()` |
| Internal modules (ipc.ts, store) | NO | Test the real code |
| Custom hooks | NO | Test via component |

## 6. Testing Verification

### 6.1 Run All Tests
```bash
pnpm test:run
```

### 6.2 Verify No Internal Mocks
```bash
# Should return 0 matches after refactor
grep -r "vi.mock.*lib/ipc" src/
grep -r "vi.mock.*store/useAppStore" src/
```

### 6.3 Verify Tests Still Pass
All existing test assertions should still pass with the new mock approach.

## 7. Acceptance Criteria

- [ ] MSW is installed and configured
- [ ] `src/test/mocks/tauri.ts` provides Tauri invoke mock
- [ ] No `vi.mock('../lib/ipc')` calls remain in test files
- [ ] No `vi.mock('../store/useAppStore')` calls remain in test files
- [ ] All tests pass with the new approach
- [ ] Test coverage remains at or above previous levels

## 8. Dependencies

```bash
pnpm add -D msw
```
