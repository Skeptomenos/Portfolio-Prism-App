# Testing Infrastructure

This directory contains the testing infrastructure for Portfolio Prism's React frontend.

## Stack

- **Vitest** - Test runner (fast, Vite-native)
- **React Testing Library** - Component testing utilities
- **MSW** - Mock Service Worker for HTTP mocking

## Directory Structure

```
src/test/
├── setup.ts          # Global test setup (jest-dom, browser API mocks)
├── utils.tsx         # Custom render with providers
├── mocks/
│   ├── tauri.ts      # Tauri API mocks (invoke, listen) - PRIMARY
│   ├── server.ts     # MSW server (opt-in for HTTP tests)
│   ├── handlers.ts   # MSW handlers for Echo-Bridge
│   ├── ipc.ts        # Mock data constants and functions
│   └── store.ts      # Zustand store mocks
└── README.md         # This file
```

## Usage

### Basic Component Test

```tsx
import { render, screen } from '@/test/utils'
import { MyComponent } from './MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Mocking Tauri Commands (Preferred)

Use `setupTauriMock()` to mock Tauri invoke calls at the transport level:

```tsx
import { setupTauriMock, mockDashboardData, mockEngineHealth } from '@/test/mocks/tauri'

beforeEach(() => {
  setupTauriMock({
    get_dashboard_data: () => mockDashboardData(),
    get_health: () => mockEngineHealth(),
  })
})
```

This approach:
- Tests actual IPC logic (not just mocked modules)
- Automatically enables Tauri environment detection
- Provides realistic mock data generators

### Mock Data Generators

```tsx
import {
  mockDashboardData,
  mockEngineHealth,
  mockPositionsData,
  mockAuthStatus,
  mockSessionCheck,
  mockTrueHoldingsData,
  mockPipelineReport,
} from '@/test/mocks/tauri'

// Each returns a fresh object to prevent cross-test pollution
const data = mockDashboardData()
const auth = mockAuthStatus('authenticated')
```

### MSW for HTTP Mocking (Echo-Bridge)

For tests that need HTTP-level mocking:

```tsx
import { server, startMswServer, stopMswServer } from '@/test/mocks/server'

beforeAll(() => startMswServer())
afterAll(() => stopMswServer())
```

### Mocking Store State

```tsx
import { setMockStoreState, resetMockStoreState } from '@/test/mocks/store'

beforeEach(() => {
  setMockStoreState({ authState: 'authenticated' })
})

afterEach(() => {
  resetMockStoreState()
})
```

## Running Tests

```bash
npm run test          # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report
```

## Coverage

Coverage reports are generated in the `coverage/` directory. Target: 80% for core modules.
