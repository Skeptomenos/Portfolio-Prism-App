# Spec: Add Explicit Return Types to React Components and Hooks

> **Goal**: Add explicit return type annotations to all React components and custom hooks to comply with TypeScript rules.
> **Estimated Time**: 30 minutes.
> **Priority**: MEDIUM

## 1. Overview

The codebase relies on TypeScript's type inference for React component and hook return types instead of explicit declarations. This violates the mandate for explicit return types.

### Rule Reference
`rules/rules_ts.md` Section 1 (Type Safety):
> "Return Types: ALL functions must have explicit return types."

## 2. Current Violations

### 2.1 React Components Without Return Types

| File | Component |
|------|-----------|
| `src/App.tsx` | `function App()` |
| `src/features/dashboard/components/Dashboard.tsx` | `function Dashboard()` |
| `src/features/xray/components/ActionQueue.tsx` | `export default function ActionQueue()` |
| `src/features/xray/components/XRayView.tsx` | `function XRayView()` |
| `src/features/portfolio/components/HoldingsView.tsx` | `function HoldingsView()` |
| `src/features/auth/components/LoginForm.tsx` | `function LoginForm()` |
| `src/components/SystemStatus.tsx` | `function SystemStatus()` |
| `src/components/Sidebar.tsx` | `function Sidebar()` |
| All other components... | ... |

### 2.2 Custom Hooks Without Return Types

| File | Hook |
|------|------|
| `src/hooks/usePortfolioData.ts` | `function usePortfolioData()` |
| `src/hooks/usePipelineProgress.ts` | `function usePipelineProgress()` |
| `src/hooks/usePipelineDiagnostics.ts` | `function usePipelineDiagnostics()` |
| `src/hooks/useTauriEvents.ts` | `function useTauriEvents()` |

### 2.3 Event Handlers Without Return Types

Many inline and defined event handlers lack explicit return types:
- `handleClick`, `handleSubmit`, `handleChange`, etc.

## 3. Implementation Steps

### 3.1 Pattern for React Components

```typescript
// BEFORE (BAD)
function Dashboard() {
  return <div>...</div>
}

// AFTER (GOOD) - Option 1: JSX.Element
function Dashboard(): JSX.Element {
  return <div>...</div>
}

// AFTER (GOOD) - Option 2: React.ReactElement
function Dashboard(): React.ReactElement {
  return <div>...</div>
}

// AFTER (GOOD) - Option 3: React.FC with explicit return
const Dashboard: React.FC = (): JSX.Element => {
  return <div>...</div>
}
```

**Recommendation:** Use `JSX.Element` for consistency since components always return JSX.

### 3.2 Pattern for Hooks with Object Returns

```typescript
// BEFORE (BAD)
function usePortfolioData() {
  const [data, setData] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  
  return { data, loading, refetch }
}

// AFTER (GOOD) - Define return type interface
interface UsePortfolioDataReturn {
  data: Position[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

function usePortfolioData(): UsePortfolioDataReturn {
  const [data, setData] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const refetch = async (): Promise<void> => {
    // ...
  }
  
  return { data, loading, error, refetch }
}
```

### 3.3 Pattern for Event Handlers

```typescript
// BEFORE (BAD)
const handleSubmit = async (e) => {
  e.preventDefault()
  await login()
}

// AFTER (GOOD)
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
  e.preventDefault()
  await login()
}

// BEFORE (BAD)
const handleChange = (e) => {
  setValue(e.target.value)
}

// AFTER (GOOD)
const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
  setValue(e.target.value)
}
```

### 3.4 Files to Update

#### Phase 1: Core App Components
- [ ] `src/App.tsx`
- [ ] `src/main.tsx`

#### Phase 2: Feature Components
- [ ] `src/features/auth/components/LoginForm.tsx`
- [ ] `src/features/auth/components/TwoFactorModal.tsx`
- [ ] `src/features/auth/components/SessionRestorePrompt.tsx`
- [ ] `src/features/dashboard/components/Dashboard.tsx`
- [ ] `src/features/dashboard/components/MetricCard.tsx`
- [ ] `src/features/dashboard/components/TopHoldingsCard.tsx`
- [ ] `src/features/dashboard/components/TrueExposureCard.tsx`
- [ ] `src/features/portfolio/components/HoldingsView.tsx`
- [ ] `src/features/portfolio/components/PortfolioTable.tsx`
- [ ] `src/features/portfolio/components/PortfolioChart.tsx`
- [ ] `src/features/xray/components/XRayView.tsx`
- [ ] `src/features/xray/components/ActionQueue.tsx`
- [ ] `src/features/xray/components/ResolutionTable.tsx`
- [ ] `src/features/xray/components/FilterBar.tsx`
- [ ] `src/features/integrations/components/TradeRepublicView.tsx`
- [ ] `src/features/integrations/components/HoldingsUpload.tsx`

#### Phase 3: Common Components
- [ ] `src/components/SystemStatus.tsx`
- [ ] `src/components/Sidebar.tsx`
- [ ] `src/components/GlassCard.tsx`
- [ ] `src/components/common/ErrorBoundary.tsx`
- [ ] `src/components/common/ErrorState.tsx`
- [ ] `src/components/ui/Modal.tsx`
- [ ] `src/components/ui/Toast.tsx`
- [ ] `src/components/ui/Skeleton.tsx`
- [ ] `src/components/feedback/FeedbackDialog.tsx`

#### Phase 4: Custom Hooks
- [ ] `src/hooks/usePortfolioData.ts`
- [ ] `src/hooks/usePipelineProgress.ts`
- [ ] `src/hooks/usePipelineDiagnostics.ts`
- [ ] `src/hooks/useTauriEvents.ts`

#### Phase 5: Utility Functions
- [ ] `src/lib/tauri.ts`
- [ ] `src/lib/logger.ts`
- [ ] `src/lib/scrubber.ts`

### 3.5 ESLint Rule Configuration

**File to modify:** `eslint.config.js` or `.eslintrc.js`

Add rule to enforce explicit return types going forward:

```javascript
{
  rules: {
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true,
      // Allow concise arrow functions that return JSX
      allowConciseArrowFunctionExpressionsStartingWithVoid: false,
    }],
  }
}
```

## 4. Example Transformations

### 4.1 App.tsx

```typescript
// BEFORE
function App() {
  const { isLoading, isAuthenticated } = useAppStore()
  
  if (isLoading) {
    return <LoadingScreen />
  }
  
  return (
    <div className="app">
      {isAuthenticated ? <Dashboard /> : <LoginForm />}
    </div>
  )
}

// AFTER
function App(): JSX.Element {
  const { isLoading, isAuthenticated } = useAppStore()
  
  if (isLoading) {
    return <LoadingScreen />
  }
  
  return (
    <div className="app">
      {isAuthenticated ? <Dashboard /> : <LoginForm />}
    </div>
  )
}
```

### 4.2 usePortfolioData.ts

```typescript
// BEFORE
export function usePortfolioData() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPositions,
  })
  
  return { data, isLoading, error, refetch }
}

// AFTER
import type { UseQueryResult } from '@tanstack/react-query'

interface PortfolioData {
  positions: Position[]
  totalValue: number
  totalPnl: number
}

export function usePortfolioData(): UseQueryResult<PortfolioData, Error> {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: getPositions,
  })
}

// OR with custom return type
interface UsePortfolioDataReturn {
  data: PortfolioData | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function usePortfolioData(): UsePortfolioDataReturn {
  const query = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPositions,
  })
  
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async (): Promise<void> => { await query.refetch() },
  }
}
```

## 5. Verification

### 5.1 TypeScript Check
```bash
pnpm tsc --noEmit
# Should pass with no errors
```

### 5.2 ESLint Check
```bash
pnpm lint
# After adding ESLint rule, should catch any missing return types
```

### 5.3 Grep for Violations
```bash
# Find functions without return types (rough check)
grep -rn "function [A-Z][a-zA-Z]*(" src/ | grep -v ":"
grep -rn "const [a-z][a-zA-Z]* = (" src/ | grep -v ":" | grep -v "=>"
```

## 6. Acceptance Criteria

- [ ] All React components have explicit return types (`: JSX.Element`)
- [ ] All custom hooks have explicit return type interfaces
- [ ] All event handlers have explicit return types (`: void` or `: Promise<void>`)
- [ ] ESLint rule `@typescript-eslint/explicit-function-return-type` is enabled
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

## 7. Notes

- **JSX.Element vs React.ReactNode**: Use `JSX.Element` for components that always return JSX. Use `React.ReactNode` for components that might return null, undefined, or other primitives.
- **React.FC**: Avoid using `React.FC` as it was deprecated in favor of plain functions with explicit props and return types.
- **Async handlers**: Always return `Promise<void>` for async event handlers, not just `void`.
