# Comprehensive Refactoring Plan (Granular Verified Remaining Work V5)

## Context
This plan addresses the **final 7 remaining violations** identified in the Code Review Report.
**Verification Status**: FSD structure, Python tooling, Service layer, Security (secrets), Backend IO, and Backend API validation are **ALREADY COMPLETE**. This plan focuses strictly on the work that remains undone.

## Work Objectives
- **Architecture**: Move orphan hooks into Features; Enforce IPC contracts.
- **Testing**: Fix brittle internal mocking and establish the integration test layer.
- **Quality**: Strict type safety (no `any`), structured logging (JSON).

---

## Phase 1: Architecture & Contracts (Sequential)

- [ ] 1. **Implement IPC Zod Validation (Frontend)**
  - **Context**: `validateResponse` is defined in `src/lib/ipc.ts` but **NEVER CALLED**.
  - [ ] **Action**: Create `src/lib/schemas/ipc.ts` defining Zod schemas for `EngineHealth`, `DashboardData`, `PipelineResult`.
  - [ ] **Action**: Update `src/lib/ipc.ts` to wrap ALL `callCommand` returns with `validateResponse(command, data, Schema)`.
  - **Verification**: `grep "validateResponse(" src/lib/ipc.ts` returns >1 result.

- [ ] 2. **Move Feature Hooks & Store (FSD)**
  - **Context**: `src/hooks/` contains feature-specific hooks. Target directories do not exist.
  - [ ] **Action**: Create directories `src/features/portfolio/hooks/` and `src/features/xray/hooks/`.
  - [ ] **Action**: Move `src/hooks/usePortfolioData.ts` -> `src/features/portfolio/hooks/`.
  - [ ] **Action**: Move `src/hooks/usePipelineProgress.ts` -> `src/features/xray/hooks/`.
  - [ ] **Action**: Create `src/features/auth/store/authSlice.ts` (Zustand slice).
  - [ ] **Action**: Refactor `src/store/useAppStore.ts` to compose slices instead of monolithic definition.
  - **Verification**: `ls src/hooks/` only contains generic hooks (e.g., `useTauriEvents`).

---

## Phase 2: Testing Infrastructure (Sequential)

- [ ] 3. **Refactor Internal Mocking (Frontend)**
  - **Context**: Tests mock `lib/ipc.ts` directly. This is brittle.
  - [ ] **Action**: Create `src/test/mocks/tauri.ts` using **Window Stub Pattern**:
    ```typescript
    import { vi } from 'vitest'
    export function setupTauriMock(handlers: Record<string, any>) {
      vi.stubGlobal('__TAURI__', {
        core: { invoke: vi.fn((cmd) => handlers[cmd]?.() || Promise.resolve()) }
      })
    }
    ```
  - [ ] **Action**: Refactor `usePortfolioData.test.tsx` to use `setupTauriMock()`.
  - [ ] **Action**: Refactor `LoginForm.test.tsx` to use `setupTauriMock()`.
  - **Verification**: `grep "vi.mock.*ipc" src/` returns 0 results.

- [ ] 4. **Fix E2E Location & Add Integration Tests**
  - **Context**: `/e2e` exists (wrong place), `/tests` does not exist.
  - [ ] **Action**: `mkdir -p tests/integration` and `mv e2e tests/e2e`.
  - [ ] **Action**: Update `playwright.config.ts` (`testDir: './tests/e2e'`).
  - [ ] **Action**: Add script to `package.json`: `"test:integration": "vitest run tests/integration"`.
  - [ ] **Action**: Create `tests/integration/setup.ts` to spawn Python sidecar:
    ```typescript
    // Command from package.json "dev:engine"
    const sidecar = spawn('uv', ['run', 'python', 'prism_headless.py', '--http'], {
      cwd: 'src-tauri/python',
      env: { ...process.env, PRISM_ECHO_TOKEN: 'test-token' }
    })
    // Wait for "Echo Bridge listening" on stdout
    ```
  - [ ] **Action**: Create 1 integration test (`ipc.test.ts`) verifying `getEngineHealth` against real backend.
  - **Verification**: `pnpm test:integration` passes.

---

## Phase 3: Quality & Observability (Parallelizable)

- [ ] 5. **Frontend Type Safety**
  - **Context**: `HoldingsUpload.tsx` uses `any`. Components lack return types.
  - [ ] **Action**: Define `TauriFile` interface in `src/types/tauri.ts`.
  - [ ] **Action**: Remove `any` from `src/features/integrations/components/HoldingsUpload.tsx` using `TauriFile`.
  - [ ] **Action**: Add `: JSX.Element` return type to components in `src/features/auth`.
  - [ ] **Action**: Add `: JSX.Element` return type to components in `src/features/dashboard`.
  - [ ] **Action**: Add `: JSX.Element` return type to components in `src/features/portfolio`.
  - [ ] **Action**: Add `: JSX.Element` return type to components in `src/features/xray`.
  - [ ] **Action**: Add ESLint rule to `eslint.config.js`:
    ```javascript
    rules: { '@typescript-eslint/explicit-function-return-type': 'warn' }
    ```
  - **Verification**: `pnpm lint` catches missing return types.

- [ ] 6. **Frontend Structured Logger**
  - **Context**: `src/lib/logger.ts` outputs strings.
  - [ ] **Action**: Install `consola`.
  - [ ] **Action**: Update `logger.ts` to use `consola` with JSON reporter in production.
  - **Verification**: Run `npm run build && npm run preview`. Open devtools console -> logs should be JSON objects.

- [ ] 7. **Python Structured Logging & MD5 Replacement**
  - **Context**: Python uses f-strings for logging (~180 occurrences) and MD5 for IDs (4 occurrences).
  - [ ] **Action**: Replace `hashlib.md5` with `hashlib.sha256` in `logging_config.py` and `telemetry.py`.
  - [ ] **Action**: Refactor `logger.info(f"...")` in `src-tauri/python/portfolio_src/core/`.
  - [ ] **Action**: Refactor `logger.info(f"...")` in `src-tauri/python/portfolio_src/data/`.
  - [ ] **Action**: Refactor `logger.info(f"...")` in `src-tauri/python/portfolio_src/adapters/`.
  - [ ] **Action**: Refactor `logger.info(f"...")` in `src-tauri/python/portfolio_src/headless/`.
  - [ ] **Action**: Refactor `logger.info(f"...")` in `src-tauri/python/portfolio_src/prism_utils/`.
  - [ ] **Action**: Refactor `logger.info(f"...")` in `src-tauri/python/portfolio_src/pdf_parser/`.
    - **Strategy**: Convert string interpolation to `extra` dict keys.
    - **Example**: `f"Found {count} items"` -> `msg="Found items", extra={"count": count}`
  - **Verification**: `grep "hashlib.md5" src-tauri/python/` returns 0 results. `grep "logger.*f\"" src-tauri/python/` returns 0 results.

---

## Final Verification Checklist

- [ ] `pnpm test:integration` passes with real sidecar (Testing)
- [ ] `grep -r "any" src/features` returns 0 matches (Type Safety)
- [ ] `grep "validateResponse(" src/lib/ipc.ts` returns >1 matches (Contracts)
