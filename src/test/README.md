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
│   ├── tauri.ts      # Tauri API mocks (invoke, listen)
│   ├── ipc.ts        # IPC function mocks with realistic data
│   ├── store.ts      # Zustand store mocks
│   └── handlers.ts   # MSW handlers for Echo-Bridge
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

### Mocking IPC Calls

```tsx
import { render, screen } from '@/test/utils'
import { mockIpcFunctions } from '@/test/mocks/ipc'

beforeEach(() => {
  mockIpcFunctions.getDashboardData.mockResolvedValue({
    totalValue: 100000,
    // ... custom mock data
  })
})
```

### Mocking Tauri Environment

```tsx
import { mockTauriEnvironment } from '@/test/mocks/tauri'

beforeEach(() => {
  mockTauriEnvironment(true)  // Simulate running in Tauri
})

afterEach(() => {
  mockTauriEnvironment(false) // Reset to browser mode
})
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
