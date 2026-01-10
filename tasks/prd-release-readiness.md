# PRD: Release Readiness - Quality & Developer Experience

## Introduction

Portfolio Prism has achieved exceptional code quality (9.2/10) with a mature architecture and 160+ Python tests. However, the project has **zero frontend tests**, **no linting configuration**, and minor UX polish items that should be addressed before public release.

This PRD defines a 3-4 week "Release Readiness" initiative focused on:
1. Comprehensive frontend testing (the biggest quality gap)
2. Developer experience tooling (ESLint, Prettier, Git hooks)
3. UX polish (graceful error handling, styling consistency)

**Target**: macOS only (cross-platform deferred)
**Executor**: AI agents via Ralph/Keystone framework
**Constraint**: Each phase must be completable within a single LLM context window (~160k tokens)

---

## Goals

- Achieve frontend test coverage for all critical paths and components
- Establish automated code quality enforcement (lint, format, hooks)
- Eliminate UX rough edges (panic dialogs, styling inconsistencies)
- Maintain the existing 9.2/10 quality bar while closing gaps
- Create a reproducible, self-documenting development workflow

---

## Phase Overview

| Phase | Name                        | Duration | Token Budget |
| ----- | --------------------------- | -------- | ------------ |
| 1     | Testing Infrastructure      | 3-4 days | ~80k tokens  |
| 2     | Component & Integration Tests | 5-6 days | ~120k tokens |
| 3     | E2E Testing with Playwright | 3-4 days | ~100k tokens |
| 4     | Developer Experience Tooling | 2-3 days | ~60k tokens  |
| 5     | UX Polish & Hardening       | 3-4 days | ~80k tokens  |

**Total: 16-21 days (~3-4 weeks)**

---

## Phase 1: Testing Infrastructure

### US-101: Initialize Vitest Configuration
**Description:** As a developer, I need Vitest configured so I can write and run frontend tests.

**Acceptance Criteria:**
- [ ] Install vitest, @testing-library/react, @testing-library/jest-dom, jsdom
- [ ] Create `vitest.config.ts` with React plugin and jsdom environment
- [ ] Add `test` and `test:coverage` scripts to package.json
- [ ] Create `src/test/setup.ts` with jest-dom matchers
- [ ] Verify `npm run test` executes successfully (even with 0 tests)
- [ ] Typecheck passes

### US-102: Create Test Utilities and Mocks
**Description:** As a developer, I need shared test utilities so tests are consistent and DRY.

**Acceptance Criteria:**
- [ ] Create `src/test/utils.tsx` with custom render function (wraps providers)
- [ ] Create `src/test/mocks/tauri.ts` mocking @tauri-apps/api invoke/listen
- [ ] Create `src/test/mocks/ipc.ts` mocking all IPC functions with realistic data
- [ ] Create `src/test/mocks/store.ts` for Zustand store mocking
- [ ] Add MSW (Mock Service Worker) for Echo-Bridge HTTP mocking
- [ ] Document mock usage in `src/test/README.md`
- [ ] Typecheck passes

### US-103: Add First Smoke Test
**Description:** As a developer, I need a working smoke test to validate the testing setup.

**Acceptance Criteria:**
- [ ] Create `src/App.test.tsx` that renders App without crashing
- [ ] Test verifies Sidebar is present
- [ ] Test verifies ErrorBoundary wraps content
- [ ] `npm run test` passes
- [ ] `npm run test:coverage` generates report
- [ ] Typecheck passes

**Functional Requirements (Phase 1):**
- FR-101: Vitest must use jsdom environment for DOM testing
- FR-102: Test utilities must wrap components with QueryClientProvider and Zustand store
- FR-103: Tauri mocks must simulate both connected and disconnected engine states
- FR-104: Coverage reports must be generated in `coverage/` directory

**Non-Goals (Phase 1):**
- No E2E tests yet (Phase 3)
- No visual regression testing
- No performance benchmarks

---

## Phase 2: Component & Integration Tests

### US-201: Test Core UI Components
**Description:** As a developer, I need tests for shared UI components to prevent regressions.

**Acceptance Criteria:**
- [ ] Test `GlassCard` - renders children, handles click, keyboard accessibility
- [ ] Test `MetricCard` - displays value, label, trend indicator
- [ ] Test `Modal` - opens/closes, traps focus, handles escape key
- [ ] Test `Toast` - renders message, auto-dismisses, manual dismiss works
- [ ] Test `ErrorBoundary` - catches errors, displays fallback UI
- [ ] All tests pass with `npm run test`
- [ ] Typecheck passes

### US-202: Test Authentication Flow Components
**Description:** As a developer, I need tests for the Trade Republic auth flow to ensure login works.

**Acceptance Criteria:**
- [ ] Test `LoginForm` - validates phone/PIN input, submits correctly
- [ ] Test `TwoFactorModal` - accepts 4-digit code, handles countdown
- [ ] Test `SessionRestorePrompt` - shows saved phone, restore/logout options
- [ ] Test auth state transitions: idle -> waiting_2fa -> authenticated
- [ ] Test error states: invalid credentials, expired 2FA, network error
- [ ] All tests pass
- [ ] Typecheck passes

### US-203: Test IPC Layer
**Description:** As a developer, I need tests for the IPC layer to ensure Tauri communication works.

**Acceptance Criteria:**
- [ ] Test `ipc.ts` - all exported functions call correct Tauri commands
- [ ] Test request deduplication - concurrent calls return same promise
- [ ] Test error handling - backend errors propagate correctly
- [ ] Test browser fallback - Echo-Bridge HTTP calls work when not in Tauri
- [ ] Test `tauri.ts` - isTauri() detection works correctly
- [ ] Mock both success and error responses
- [ ] All tests pass
- [ ] Typecheck passes

### US-204: Test State Management
**Description:** As a developer, I need tests for Zustand store to ensure state logic is correct.

**Acceptance Criteria:**
- [ ] Test `useAppStore` - all actions update state correctly
- [ ] Test navigation: setCurrentView changes view
- [ ] Test auth flow: setAuthState, setAuthError, setSavedPhone
- [ ] Test sync flow: startSync, completeSync, failSync
- [ ] Test toast management: addToast, dismissToast, auto-dismiss
- [ ] Test selectors return correct slices
- [ ] All tests pass
- [ ] Typecheck passes

### US-205: Test React Query Hooks
**Description:** As a developer, I need tests for data fetching hooks to ensure caching works.

**Acceptance Criteria:**
- [ ] Test `useEngineHealth` - fetches health, refetches on interval
- [ ] Test `useDashboardData` - fetches dashboard, caches by portfolioId
- [ ] Test `useXRayData` - fetches true holdings
- [ ] Test `useSyncPortfolio` - mutation triggers sync, invalidates queries
- [ ] Test loading/error/success states
- [ ] All tests pass
- [ ] Typecheck passes

### US-206: Test View Components
**Description:** As a developer, I need tests for main view components to ensure pages render correctly.

**Acceptance Criteria:**
- [ ] Test `Dashboard` - renders metrics, charts, top holdings
- [ ] Test `HoldingsView` - renders table, filters, resolution badges
- [ ] Test `XRayView` - renders pipeline stepper, resolution table
- [ ] Test `HealthView` - renders system logs, telemetry
- [ ] Test `TradeRepublicView` - renders auth form or authenticated state
- [ ] Test empty states and loading states
- [ ] All tests pass
- [ ] Typecheck passes
- [ ] Verify in browser using browser tools

**Functional Requirements (Phase 2):**
- FR-201: Each component test file must be co-located with component (e.g., `Modal.test.tsx`)
- FR-202: Tests must not depend on network calls (all mocked)
- FR-203: Tests must cover both happy path and error states
- FR-204: Coverage target: 80% for `src/components/`, `src/lib/`, `src/store/`, `src/hooks/`

**Non-Goals (Phase 2):**
- No testing of Python backend (already covered)
- No testing of Rust shell
- No snapshot testing (prefer explicit assertions)

---

## Phase 3: E2E Testing with Playwright

### US-301: Initialize Playwright Configuration
**Description:** As a developer, I need Playwright configured for E2E testing against the dev server.

**Acceptance Criteria:**
- [ ] Install @playwright/test
- [ ] Create `playwright.config.ts` targeting localhost:1420
- [ ] Configure for Chromium only (WebKit matches Tauri's WebView)
- [ ] Add `test:e2e` script to package.json
- [ ] Create `e2e/` directory structure
- [ ] Verify Playwright can launch and navigate to dev server
- [ ] Typecheck passes

### US-302: E2E Test Authentication Flow
**Description:** As a user, I need the login flow to work end-to-end in the browser.

**Acceptance Criteria:**
- [ ] Test: Navigate to app, see login form
- [ ] Test: Enter phone/PIN, submit, see 2FA modal
- [ ] Test: Enter 2FA code, see authenticated dashboard
- [ ] Test: Logout returns to login form
- [ ] Test: Invalid credentials show error message
- [ ] Tests run against Echo-Bridge (Python in HTTP mode)
- [ ] All E2E tests pass
- [ ] Verify in browser using browser tools

### US-303: E2E Test Dashboard Interactions
**Description:** As a user, I need dashboard interactions to work end-to-end.

**Acceptance Criteria:**
- [ ] Test: Dashboard loads with metrics and charts
- [ ] Test: Click on holding navigates to details
- [ ] Test: Sync button triggers sync and shows progress
- [ ] Test: Navigation between views works (sidebar clicks)
- [ ] Test: Toast notifications appear and dismiss
- [ ] All E2E tests pass
- [ ] Verify in browser using browser tools

### US-304: E2E Test X-Ray View
**Description:** As a user, I need the X-Ray analysis view to work end-to-end.

**Acceptance Criteria:**
- [ ] Test: X-Ray view loads with resolution table
- [ ] Test: Filter by resolution status works
- [ ] Test: Search filters holdings correctly
- [ ] Test: Sort by column works
- [ ] Test: Resolution badges show correct status/color
- [ ] All E2E tests pass
- [ ] Verify in browser using browser tools

**Functional Requirements (Phase 3):**
- FR-301: E2E tests must run against `npm run dev:browser` (Echo-Bridge mode)
- FR-302: Tests must be independent (no shared state between tests)
- FR-303: Tests must include visual assertions (element visibility, text content)
- FR-304: CI must run E2E tests in headless mode

**Non-Goals (Phase 3):**
- No testing inside Tauri shell (browser-only E2E)
- No mobile viewport testing
- No accessibility audits (future phase)

---

## Phase 4: Developer Experience Tooling

### US-401: Configure ESLint
**Description:** As a developer, I need ESLint configured to catch code quality issues.

**Acceptance Criteria:**
- [ ] Install eslint, @typescript-eslint/*, eslint-plugin-react, eslint-plugin-react-hooks
- [ ] Create `.eslintrc.cjs` with TypeScript and React rules
- [ ] Enable strict rules: no-explicit-any, no-unused-vars, react-hooks/exhaustive-deps
- [ ] Add `lint` and `lint:fix` scripts to package.json
- [ ] Fix all existing lint errors (should be minimal given clean codebase)
- [ ] `npm run lint` passes with 0 errors
- [ ] Typecheck passes

### US-402: Configure Prettier
**Description:** As a developer, I need Prettier configured for consistent code formatting.

**Acceptance Criteria:**
- [ ] Install prettier, eslint-config-prettier
- [ ] Create `.prettierrc` with project conventions (single quotes, no semi, etc.)
- [ ] Create `.prettierignore` excluding dist, node_modules, coverage
- [ ] Add `format` and `format:check` scripts to package.json
- [ ] Format entire codebase with Prettier
- [ ] `npm run format:check` passes
- [ ] Typecheck passes

### US-403: Configure Git Hooks with Husky
**Description:** As a developer, I need Git hooks to enforce quality before commits.

**Acceptance Criteria:**
- [ ] Install husky, lint-staged
- [ ] Initialize husky with `npx husky init`
- [ ] Create pre-commit hook running lint-staged
- [ ] Configure lint-staged to run ESLint + Prettier on staged files
- [ ] Create pre-push hook running `npm run test`
- [ ] Verify hooks trigger on commit/push
- [ ] Document hook behavior in README

### US-404: Update CI Workflow
**Description:** As a developer, I need CI to run all quality checks.

**Acceptance Criteria:**
- [ ] Update `.github/workflows/release.yml` to run lint, format:check, test, test:e2e
- [ ] Add separate `ci.yml` workflow for PRs (not just tags)
- [ ] CI fails if any check fails
- [ ] CI uploads coverage report as artifact
- [ ] CI runs E2E tests in headless mode
- [ ] All CI checks pass on current codebase

**Functional Requirements (Phase 4):**
- FR-401: ESLint must extend recommended configs for TypeScript and React
- FR-402: Prettier must be integrated with ESLint (no conflicts)
- FR-403: Git hooks must not block commits for warnings (only errors)
- FR-404: CI must complete in under 10 minutes

**Non-Goals (Phase 4):**
- No Rust linting (rustfmt/clippy already standard)
- No Python linting changes (existing setup sufficient)
- No commit message linting (conventional commits)

---

## Phase 5: UX Polish & Hardening

### US-501: Graceful Sidecar Spawn Error Handling
**Description:** As a user, I need a friendly error dialog if the Python engine fails to start.

**Acceptance Criteria:**
- [ ] Replace `expect()` in `lib.rs` sidecar spawn with `match` + error handling
- [ ] On spawn failure, show native macOS dialog with error message
- [ ] Dialog offers "Retry" and "Quit" options
- [ ] Log spawn failure to console with full error details
- [ ] App exits gracefully if user chooses "Quit"
- [ ] Typecheck passes (Rust)
- [ ] Test manually by renaming sidecar binary

### US-502: Add Cargo Release Profile
**Description:** As a developer, I need optimized release builds for smaller binary size.

**Acceptance Criteria:**
- [ ] Add `[profile.release]` section to `Cargo.toml`
- [ ] Enable LTO: `lto = true`
- [ ] Set `codegen-units = 1` for better optimization
- [ ] Set `panic = "abort"` to reduce binary size
- [ ] Set `strip = true` to remove debug symbols
- [ ] Verify release build completes successfully
- [ ] Compare binary size before/after (document reduction)

### US-503: Standardize Styling to Tailwind
**Description:** As a developer, I need consistent styling approach across all components.

**Acceptance Criteria:**
- [ ] Audit `App.tsx` for inline styles, migrate to Tailwind classes
- [ ] Audit `Dashboard.tsx` for inline styles, migrate to Tailwind classes
- [ ] Audit `Sidebar.tsx` for inline styles, migrate to Tailwind classes
- [ ] Ensure no `style={{}}` props remain in core layout components
- [ ] Verify visual appearance unchanged after migration
- [ ] Typecheck passes
- [ ] Verify in browser using browser tools

### US-504: Add Loading Skeletons
**Description:** As a user, I need visual feedback while data is loading.

**Acceptance Criteria:**
- [ ] Create `Skeleton` component with pulse animation
- [ ] Add skeleton to Dashboard while loading
- [ ] Add skeleton to HoldingsView table while loading
- [ ] Add skeleton to XRayView while loading
- [ ] Skeletons match approximate layout of loaded content
- [ ] Typecheck passes
- [ ] Verify in browser using browser tools

### US-505: Improve Error States
**Description:** As a user, I need clear error messages when things go wrong.

**Acceptance Criteria:**
- [ ] Create `ErrorState` component with icon, message, retry button
- [ ] Replace generic error text in Dashboard with ErrorState
- [ ] Replace generic error text in HoldingsView with ErrorState
- [ ] Replace generic error text in XRayView with ErrorState
- [ ] ErrorState includes "Contact Support" link to feedback dialog
- [ ] Typecheck passes
- [ ] Verify in browser using browser tools

**Functional Requirements (Phase 5):**
- FR-501: Native dialogs must use `osascript` on macOS (existing pattern)
- FR-502: Tailwind migration must not change visual appearance
- FR-503: Skeleton components must use Tailwind's `animate-pulse`
- FR-504: Error states must offer actionable next steps

**Non-Goals (Phase 5):**
- No dark mode implementation
- No accessibility audit (WCAG compliance)
- No internationalization (i18n)

---

## Technical Considerations

### Testing Stack
- **Unit/Integration**: Vitest + React Testing Library + jsdom
- **E2E**: Playwright (Chromium)
- **Mocking**: MSW for HTTP, custom mocks for Tauri IPC

### Dependencies to Add
```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "jsdom": "^24.0.0",
    "msw": "^2.0.0",
    "@playwright/test": "^1.45.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint-plugin-react": "^7.35.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-config-prettier": "^9.0.0",
    "prettier": "^3.3.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

### File Structure Additions
```
src/
├── test/
│   ├── setup.ts           # Jest-DOM matchers
│   ├── utils.tsx          # Custom render with providers
│   ├── mocks/
│   │   ├── tauri.ts       # Tauri API mocks
│   │   ├── ipc.ts         # IPC function mocks
│   │   └── handlers.ts    # MSW handlers
│   └── README.md          # Testing documentation
e2e/
├── auth.spec.ts           # Authentication E2E tests
├── dashboard.spec.ts      # Dashboard E2E tests
├── xray.spec.ts           # X-Ray view E2E tests
└── fixtures/              # Test data fixtures
```

---

## Success Metrics

| Metric                    | Target           | Measurement                  |
| ------------------------- | ---------------- | ---------------------------- |
| Frontend test coverage    | >80%             | `npm run test:coverage`        |
| E2E test pass rate        | 100%             | Playwright report            |
| Lint errors               | 0                | `npm run lint`                 |
| Format violations         | 0                | `npm run format:check`         |
| CI pipeline duration      | <10 minutes      | GitHub Actions timing        |
| Release binary size       | <15MB reduction  | Before/after comparison      |
| Inline styles remaining   | 0 in core layout | Manual audit                 |

---

## Open Questions

1. **Test data fixtures**: Should we use the existing mock data from `commands.rs` or create separate fixtures?
2. **E2E authentication**: How to handle Trade Republic 2FA in E2E tests? (Mock the entire auth flow?)
3. **Coverage thresholds**: Should CI fail if coverage drops below 80%?
4. **Playwright browsers**: Test only Chromium (matches WebKit) or add Firefox/Safari?

---

## Appendix: Phase Token Estimates

| Phase | Files to Create/Modify | Estimated Tokens |
| ----- | ---------------------- | ---------------- |
| 1     | 8-10 files             | ~80k             |
| 2     | 15-20 test files       | ~120k            |
| 3     | 5-8 E2E specs          | ~100k            |
| 4     | 6-8 config files       | ~60k             |
| 5     | 10-12 component files  | ~80k             |

Each phase is designed to be completable within a single LLM context window with room for iteration and debugging.
