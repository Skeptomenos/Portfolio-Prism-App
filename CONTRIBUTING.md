# Contributing to Portfolio Prism

This guide covers the development patterns, testing strategies, and architectural decisions for contributing to Portfolio Prism.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Architecture Overview](#architecture-overview)
- [Feature-Sliced Design (FSD)](#feature-sliced-design-fsd)
- [Testing Patterns](#testing-patterns)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Conventions](#commit-conventions)

---

## Development Setup

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | 18+ | Frontend build |
| pnpm | 8+ | Package manager |
| Rust | Latest stable | Tauri shell |
| Python | 3.9+ | Analytics engine |
| uv | Latest | Python package manager |

### Quick Start

```bash
# Install dependencies
pnpm install

# Development modes
pnpm tauri:dev        # Full Tauri app (frontend + backend)
pnpm dev:browser      # Browser-only (mock IPC, no Tauri)
pnpm dev:engine       # Python sidecar only (HTTP mode)
```

### Test Commands

```bash
pnpm test             # Watch mode (unit tests)
pnpm test:run         # Single run (all tests)
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests (requires Python sidecar)
pnpm test:e2e         # End-to-end tests (Playwright)
pnpm test:coverage    # Coverage report
```

---

## Architecture Overview

Portfolio Prism uses a **Tauri + Python Sidecar** architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Shell (Rust)                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌─────────────────────┐   │
│  │   React UI      │  IPC    │   Python Sidecar    │   │
│  │ (TypeScript)    │◄───────►│    (Analytics)      │   │
│  └─────────────────┘         └─────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/` | React frontend (TypeScript) |
| `src/features/` | Feature-sliced components |
| `src/lib/` | Shared utilities (IPC, logger) |
| `src/test/` | Test infrastructure |
| `src-tauri/` | Tauri/Rust shell |
| `src-tauri/python/` | Python analytics engine |
| `tests/` | Integration & E2E tests |

---

## Feature-Sliced Design (FSD)

The frontend follows **Feature-Sliced Design** — code is organized by feature, not by file type.

### Feature Structure

```
src/features/
├── auth/
│   ├── api.ts          # IPC calls for this feature
│   ├── components/     # React components
│   ├── hooks/          # Feature-specific hooks
│   ├── store/          # Zustand slice
│   ├── schemas.ts      # Zod schemas
│   ├── types.ts        # TypeScript types
│   └── index.ts        # Public exports
├── dashboard/
├── portfolio/
├── xray/
└── integrations/
```

### What Goes Where

| Item | Location | Example |
|------|----------|---------|
| Feature component | `features/{feature}/components/` | `features/auth/components/LoginForm.tsx` |
| Feature hook | `features/{feature}/hooks/` | `features/portfolio/hooks/usePortfolioData.ts` |
| Feature store | `features/{feature}/store/` | `features/auth/store/authSlice.ts` |
| Shared UI component | `components/ui/` | `components/ui/Modal.tsx` |
| Global utility | `lib/` | `lib/logger.ts` |
| Global hook | `hooks/` | `hooks/useTauriEvents.ts` |

### Adding a New Feature

1. Create the feature directory structure:
   ```bash
   mkdir -p src/features/myfeature/{components,hooks,store}
   touch src/features/myfeature/{api,schemas,types,index}.ts
   ```

2. Define types and schemas first (single source of truth):
   ```typescript
   // features/myfeature/schemas.ts
   import { z } from 'zod'

   export const MyDataSchema = z.object({
     id: z.string(),
     name: z.string(),
     value: z.number(),
   })

   export type MyData = z.infer<typeof MyDataSchema>
   ```

3. Create API layer with validation:
   ```typescript
   // features/myfeature/api.ts
   import { callCommand, validateResponse } from '@/lib/ipc'
   import { MyDataSchema, type MyData } from './schemas'

   export async function getMyData(): Promise<MyData> {
     const data = await callCommand('get_my_data', {})
     return validateResponse(MyDataSchema, data)
   }
   ```

4. Export public interface:
   ```typescript
   // features/myfeature/index.ts
   export { MyFeatureView } from './components/MyFeatureView'
   export { useMyData } from './hooks/useMyData'
   export type { MyData } from './schemas'
   ```

---

## Testing Patterns

### The Test Pyramid

| Layer | Coverage | What to Test |
|-------|----------|--------------|
| Unit | 60% | Components, hooks, utilities |
| Integration | 30% | IPC + Python sidecar |
| E2E | 10% | Critical user journeys |

### Test File Locations

| Test Type | Location | Pattern |
|-----------|----------|---------|
| Unit tests | Co-located with source | `MyComponent.test.tsx` |
| Integration tests | `tests/integration/` | `ipc.test.ts` |
| E2E tests | `tests/e2e/` | `auth.spec.ts` |

### Mocking Strategy

**Key Principle**: Mock at the transport level, not at the module level.

#### DO: Use `setupTauriMock()` (Transport Mock)

```typescript
import { setupTauriMock, mockDashboardData, mockEngineHealth } from '@/test/mocks/tauri'

describe('Dashboard', () => {
  beforeEach(() => {
    setupTauriMock({
      get_dashboard_data: () => mockDashboardData(),
      get_health: () => mockEngineHealth(),
    })
  })

  it('renders dashboard data', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('$125,000')).toBeInTheDocument()
    })
  })
})
```

#### DON'T: Mock Internal Modules

```typescript
// BAD - Don't do this!
vi.mock('../lib/ipc', () => ({
  getDashboardData: vi.fn().mockResolvedValue({ ... }),
}))
```

**Why?**
- Module mocking bypasses actual IPC logic
- Tests don't catch schema validation bugs
- Breaks when function signatures change
- Creates false confidence in untested code

### Available Mock Data Generators

All generators return fresh objects to prevent cross-test pollution:

```typescript
import {
  mockDashboardData,     // Dashboard summary
  mockEngineHealth,      // Python sidecar status
  mockPositionsData,     // Holdings list
  mockAuthStatus,        // Auth state ('idle' | 'authenticated' | 'waiting_2fa')
  mockSessionCheck,      // Saved session check
  mockTrueHoldingsData,  // X-Ray look-through data
  mockPipelineReport,    // Pipeline execution report
} from '@/test/mocks/tauri'
```

### Component Test Example

```typescript
// features/auth/components/LoginForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@/test/utils'
import { setupTauriMock, mockAuthStatus } from '@/test/mocks/tauri'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  beforeEach(() => {
    setupTauriMock({
      tr_get_auth_status: () => mockAuthStatus('idle'),
      tr_login: () => ({ success: true }),
    })
  })

  it('submits login form', async () => {
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: '+49123456789' },
    })
    fireEvent.change(screen.getByLabelText(/pin/i), {
      target: { value: '1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    await waitFor(() => {
      expect(screen.getByText(/success/i)).toBeInTheDocument()
    })
  })
})
```

### Hook Test Example

```typescript
// features/portfolio/hooks/usePortfolioData.test.tsx
import { renderHook, waitFor } from '@/test/utils'
import { setupTauriMock, mockPositionsData } from '@/test/mocks/tauri'
import { useHoldingsData } from './usePortfolioData'

describe('useHoldingsData', () => {
  beforeEach(() => {
    setupTauriMock({
      get_holdings: () => mockPositionsData(),
    })
  })

  it('fetches holdings via IPC', async () => {
    const { result } = renderHook(() => useHoldingsData(1))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.positions).toHaveLength(1)
    expect(result.current.data?.positions[0].ticker).toBe('AAPL')
  })
})
```

### MSW for HTTP Mocking (Echo Bridge)

For tests that need HTTP-level mocking (integration tests):

```typescript
import { server, startMswServer, stopMswServer } from '@/test/mocks/server'

beforeAll(() => startMswServer())
afterEach(() => server.resetHandlers())
afterAll(() => stopMswServer())
```

### Integration Tests

Integration tests run against the **real Python sidecar**:

```typescript
// tests/integration/ipc.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startPythonSidecar, stopPythonSidecar, server } from './setup'
import { getEngineHealth } from '../../src/lib/ipc'

describe('IPC Integration', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' })
    await startPythonSidecar()
  })

  afterAll(async () => {
    await stopPythonSidecar()
    server.close()
  })

  it('returns engine health from real backend', async () => {
    const health = await getEngineHealth()

    expect(health.version).toBeDefined()
    expect(typeof health.memoryUsageMb).toBe('number')
  })
})
```

### E2E Tests (Playwright)

E2E tests verify complete user journeys:

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('user can log in', async ({ page }) => {
  await page.goto('/')

  await page.fill('[data-testid="phone-input"]', '+49123456789')
  await page.fill('[data-testid="pin-input"]', '1234')
  await page.click('button[type="submit"]')

  await expect(page.getByText('Dashboard')).toBeVisible()
})
```

---

## Code Style Guidelines

### TypeScript Rules

1. **No `any`** — Use `unknown` with type guards
2. **Explicit return types** — All functions must have return types
3. **Zod at IO boundaries** — Validate all IPC responses
4. **Named exports only** — No default exports

### React Rules

1. **Functional components** with explicit `JSX.Element` return type
2. **Custom hooks** with explicit return type interfaces
3. **Error boundaries** for feature-level error handling
4. **Prefer composition** over prop drilling

### Example Component

```typescript
import type { JSX } from 'react'

interface MyComponentProps {
  title: string
  onAction: () => void
}

export function MyComponent({ title, onAction }: MyComponentProps): JSX.Element {
  const handleClick = (): void => {
    onAction()
  }

  return (
    <div>
      <h1>{title}</h1>
      <button onClick={handleClick}>Action</button>
    </div>
  )
}
```

### Example Hook

```typescript
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getMyData } from '../api'
import type { MyData } from '../schemas'

export function useMyData(): UseQueryResult<MyData, Error> {
  return useQuery({
    queryKey: ['myData'],
    queryFn: getMyData,
  })
}
```

---

## Commit Conventions

We use **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, etc. |

### Examples

```bash
feat(auth): add 2FA support for Trade Republic login
fix(dashboard): correct percentage calculation for negative PnL
docs: update testing patterns in CONTRIBUTING.md
refactor(xray): extract resolution logic to separate hook
test(portfolio): add integration tests for sync flow
```

---

## Getting Help

- Check existing issues before creating new ones
- Use the `question` label for general questions
- Include reproduction steps for bug reports
- Reference specs in `ralph-wiggum/specs/` for feature context

---

**Happy Contributing!**
