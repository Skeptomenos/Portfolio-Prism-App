# Spec: Move Root-Level Feature Logic (FSD)

> **Goal**: Move feature-specific hooks and state from `src/hooks` and `src/store` into their respective Feature-Sliced Design (FSD) directories.
> **Estimated Time**: 20 minutes.
> **Priority**: MEDIUM

## 1. Overview

The codebase currently has "orphan" hooks and a monolithic store at the root level, which violates FSD principles. These should be co-located with the features they serve.

### Rule Reference
`rules/architecture.md` Section 2 (Feature-Sliced Design):
> "Group by Feature, not File Type. `src/features/auth/api.ts`, `src/features/auth/types.ts`"

## 2. Current Violations

| File | Feature | Target Location |
|------|---------|-----------------|
| `src/hooks/usePortfolioData.ts` | `portfolio` | `src/features/portfolio/hooks/usePortfolioData.ts` |
| `src/hooks/usePipelineProgress.ts` | `xray` | `src/features/xray/hooks/usePipelineProgress.ts` |
| `src/hooks/usePipelineDiagnostics.ts` | `xray` | `src/features/xray/hooks/usePipelineDiagnostics.ts` |
| `src/store/useAppStore.ts` | Mixed | Split into slices in `features/*/store/` |

## 3. Implementation Steps

### 3.1 Move Hooks

1. Create `hooks/` directory in each feature folder if missing.
2. Move files:
   - `mv src/hooks/usePortfolioData.ts src/features/portfolio/hooks/`
   - `mv src/hooks/usePipelineProgress.ts src/features/xray/hooks/`
   - `mv src/hooks/usePipelineDiagnostics.ts src/features/xray/hooks/`
3. Update imports in the moved files (fix relative paths).
4. Update imports in consumers (components that use these hooks).

### 3.2 Refactor Store (Zustand Slices)

The `useAppStore` is a monolith. We should split it using the slice pattern, even if we keep a central store creator for now.

**Step 1: Create Feature Slices**

`src/features/auth/store/authSlice.ts`:
```typescript
import { StateCreator } from 'zustand'

export interface AuthSlice {
  isAuthenticated: boolean
  session: Session | null
  setAuthenticated: (val: boolean) => void
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  isAuthenticated: false,
  session: null,
  setAuthenticated: (val) => set({ isAuthenticated: val }),
})
```

`src/features/dashboard/store/dashboardSlice.ts`...
`src/features/xray/store/xraySlice.ts`...

**Step 2: Assemble Root Store**

`src/store/useAppStore.ts`:
```typescript
import { create } from 'zustand'
import { createAuthSlice, AuthSlice } from '@/features/auth/store/authSlice'
import { createXRaySlice, XRaySlice } from '@/features/xray/store/xraySlice'

type AppState = AuthSlice & XRaySlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createXRaySlice(...a),
}))
```

### 3.3 What Stays in Root?

- `src/hooks/useTauriEvents.ts` (Global infrastructure)
- `src/store/` (The assembler file `useAppStore.ts` itself)

## 4. Verification

### 4.1 Check Imports
Running the build should verify that all import paths are correct.
```bash
npm run build
```

### 4.2 Verify Directory Structure
```bash
ls src/features/portfolio/hooks/
# Should show usePortfolioData.ts
```

## 5. Acceptance Criteria

- [ ] `src/hooks/` only contains global/shared hooks
- [ ] Feature-specific hooks are in `src/features/[feature]/hooks/`
- [ ] `useAppStore` is composed of slices imported from features
- [ ] No circular dependencies created
