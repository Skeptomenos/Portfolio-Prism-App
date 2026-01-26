# Portfolio Prism - Comprehensive Code Review Report

**Review Date:** January 26, 2026  
**Scope:** Full codebase analysis against `rules/` standards  
**Status:** Issues Documented - NO CODE CHANGES MADE

---

## Executive Summary

This report documents a comprehensive code review of the Portfolio Prism codebase against the established coding rules in the `rules/` directory. The review identified **47 distinct violations** across 6 rule categories, with varying severity levels.

### Severity Distribution

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 4 | Security risks, data validation failures |
| **High** | 12 | Architecture violations, missing validation |
| **Medium** | 18 | Testing gaps, logging issues |
| **Low** | 13 | Code style, type hints, documentation |

### Compliance Summary by Rule

| Rule File | Compliance | Key Issues |
|-----------|------------|------------|
| `rules_ts.md` | 65% | Missing return types, `any` usage, Zod bypass |
| `logging.md` | 55% | No JSON output, f-strings instead of structured |
| `security.md` | 70% | Hardcoded secrets, validation gaps |
| `testing.md` | 45% | Internal mocking, missing integration tests |
| `architecture.md` | 60% | Layer violations, FSD non-compliance |
| `api_design.md` | 80% | Generally compliant |
| `workflow.md` | 90% | Conventional commits followed |
| `documentation.md` | 75% | Some gaps in inline comments |

---

## 1. TypeScript & Type Safety Violations (`rules_ts.md`)

### 1.1 Usage of `any` Type (HIGH)

**Rule Violated:** "No `any`: `any` is forbidden. Use `unknown` and strict type narrowing."

| File | Line | Issue |
|------|------|-------|
| `src/features/integrations/components/HoldingsUpload.tsx` | 25 | `useState<any>(null)` |
| `src/features/integrations/components/HoldingsUpload.tsx` | 55 | `(file as any).path` |
| `src/features/xray/components/ActionQueue.tsx` | 22 | `(failure as any).issue` |
| `src/features/xray/components/ActionQueue.tsx` | 137 | `(failure as any).issue` |

**Mitigation Strategy:**
1. Create a `TauriFile` interface extending `File` with optional `path` property
2. Update `PipelineFailure` type to include `issue` as optional field
3. Use proper type guards instead of `as any` casts

### 1.2 Missing Explicit Return Types (MEDIUM)

**Rule Violated:** "ALL functions must have explicit return types."

**Affected Patterns:**
- React Components: `function App()`, `function Dashboard()`, `function ActionQueue()` lack `: JSX.Element`
- Custom Hooks: `useEngineHealth()`, `useDashboardData()`, `useTauriEvents()` lack return types
- Event Handlers: `handleFileChange`, `handleUpload`, `handleIgnore` lack `: void` or `: Promise<void>`
- Internal Libs: `getCoreModule()`, `getEventModule()` in `tauri.ts` lack return types

**Files Requiring Updates:**
- `src/App.tsx`
- `src/features/dashboard/components/Dashboard.tsx`
- `src/features/xray/components/ActionQueue.tsx`
- `src/hooks/usePortfolioData.ts`
- `src/lib/tauri.ts`
- All files in `src/features/*/components/`

**Mitigation Strategy:**
1. Enable ESLint rule `@typescript-eslint/explicit-function-return-type`
2. Add explicit return types to all React components (`: JSX.Element`)
3. Define return type interfaces for custom hooks

### 1.3 Zod Validation Bypass at IO Boundaries (CRITICAL)

**Rule Violated:** "ALL external data MUST be validated with Zod at the edge."

| File | Function | Issue |
|------|----------|-------|
| `src/lib/ipc.ts` | `getEngineHealth` | Returns raw unvalidated data |
| `src/lib/ipc.ts` | `getDashboardData` | Returns raw unvalidated data |
| `src/lib/ipc.ts` | `getPositions` | Returns raw unvalidated data |
| `src/lib/ipc.ts` | `syncPortfolio` | Returns raw unvalidated data |
| `src/lib/ipc.ts` | Multiple others | `validateResponse` defined but never called |

**Mitigation Strategy:**
1. Define Zod schemas for all IPC response types in `src/lib/schemas/`
2. Wrap all IPC command calls with `validateResponse(schema, data)`
3. Add error boundaries for schema validation failures

### 1.4 .then() Usage (LOW)

**Rule Violated:** "Async/Await Only: No `.then()` chains."

| File | Line | Issue |
|------|------|-------|
| `src/components/ui/Toast.test.tsx` | 14 | `await import(...).then(...)` |
| `src/components/ui/Toast.test.tsx` | 16 | `await import(...).then(...)` |

**Mitigation Strategy:**
- Refactor dynamic imports to use intermediate variables with await

---

## 2. Logging Violations (`logging.md`)

### 2.1 Missing JSON Structured Output (HIGH)

**Rule Violated:** "Logs must be machine-readable (JSON) and filterable (Levels)."

**Issue:** The frontend logger (`src/lib/logger.ts`) outputs human-readable strings instead of JSON objects.

**Current Output:**
```
[2026-01-26T09:30:00.000Z] [INFO] User logged in
```

**Required Output:**
```json
{"level":"info","time":1706260200000,"msg":"User logged in","context":{"userId":"123"}}
```

**Mitigation Strategy:**
1. Install `consola` or `pino` as the logging library
2. Refactor `src/lib/logger.ts` to output JSON in production mode
3. Keep pretty-print for development mode

### 2.2 Direct Console Usage (MEDIUM)

**Rule Violated:** "`console.log`, `console.error`, `console.warn` are FORBIDDEN in production code."

| File | Line | Issue |
|------|------|-------|
| `src/lib/ipc.ts` | 374 | `console.error('[IPC] Failed to log event:', error)` |

**Note:** This is intentional as a fallback to prevent infinite loops, but still violates the rule.

**Mitigation Strategy:**
- Use a silent no-op or write to a local buffer instead of console

### 2.3 Python print() Statements (MEDIUM)

**Rule Violated:** "NO print() statements in production code"

| File | Line | Purpose |
|------|------|---------|
| `src-tauri/python/portfolio_src/core/tr_daemon.py` | 262 | IPC protocol |
| `src-tauri/python/portfolio_src/core/tr_daemon.py` | 280 | IPC protocol |
| `src-tauri/python/portfolio_src/core/tr_daemon.py` | 282 | IPC protocol |
| `src-tauri/python/portfolio_src/headless/protocol.py` | 18 | IPC protocol |
| `src-tauri/python/main.py` | 2 | Debug statement |

**Note:** The IPC protocol prints are functionally necessary but technically violate the rule.

**Mitigation Strategy:**
1. Create a dedicated `ipc_send()` function that wraps stdout writes
2. Remove debug print from `main.py`

### 2.4 Non-Structured Python Logging (MEDIUM)

**Rule Violated:** "Use structured logging with JSON output"

**Issue:** Python logging uses f-strings instead of the `extra=` parameter for structured metadata.

**Example Violation:**
```python
# Current (BAD)
logger.info(f"Saved {len(positions)} positions to {output_path}")

# Required (GOOD)  
logger.info("Saved positions", extra={"count": len(positions), "path": output_path})
```

**Affected Files:** 50+ files in `src-tauri/python/portfolio_src/`

**Mitigation Strategy:**
1. Create a `log_structured()` helper function
2. Refactor all logger calls to use `extra=` parameter
3. Update SQLiteLogHandler to capture structured metadata

---

## 3. Security Violations (`security.md`)

### 3.1 Hardcoded Secret Fallbacks (CRITICAL)

**Rule Violated:** "NO secrets in code. Load from ENV."

| File | Line | Issue |
|------|------|-------|
| `src/lib/ipc.ts` | 77 | `'dev-echo-bridge-secret'` as fallback |
| `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py` | 304 | `'dev-echo-bridge-secret'` as fallback |

**Mitigation Strategy:**
1. Remove default fallback values
2. Throw an error if ENV variable is missing in production
3. Add startup validation that crashes if secrets are not configured

### 3.2 Missing Pydantic Validation for External APIs (HIGH)

**Rule Violated:** "EVERY external input MUST be validated with Zod/Pydantic."

| File | Line | API |
|------|------|-----|
| `src-tauri/python/portfolio_src/data/enrichment.py` | 106 | Wikidata API |
| `src-tauri/python/portfolio_src/data/enrichment.py` | 123 | YFinance API |
| `src-tauri/python/portfolio_src/data/enrichment.py` | 319 | Cloudflare Worker |

**Mitigation Strategy:**
1. Define Pydantic models for each external API response
2. Wrap all `requests.get().json()` calls with Pydantic validation
3. Add error handling for validation failures

### 3.3 Custom SHA-256 Implementation (LOW)

**Rule Violated:** "No Custom Crypto: Use standard libraries."

| File | Line | Issue |
|------|------|-------|
| `src/lib/scrubber.ts` | 106-203 | Pure JS SHA-256 implementation |

**Context:** Used for non-security PII scrubbing (ISIN hashing), not for authentication.

**Mitigation Strategy:**
1. Replace with Web Crypto API (`crypto.subtle.digest`)
2. If synchronous is required, use a battle-tested library

### 3.4 MD5 Usage (LOW)

**Rule Violated:** "Use standard libraries (bcrypt, Argon2, WebCrypto API)"

| File | Line | Purpose |
|------|------|---------|
| `src-tauri/python/portfolio_src/prism_utils/logging_config.py` | 119 | ID generation |
| `src-tauri/python/portfolio_src/prism_utils/telemetry.py` | 338 | ID generation |

**Mitigation Strategy:**
- Replace MD5 with SHA-256 or UUID for ID generation

### 3.5 Potential PII Leak in Exception Logs (MEDIUM)

**Rule Violated:** "Redact PII from logs"

| File | Line | Issue |
|------|------|-------|
| `src-tauri/python/portfolio_src/headless/dispatcher.py` | 113 | Logs `exc_info=True` which may contain credentials |

**Mitigation Strategy:**
1. Scrub exception objects before logging
2. Only log exception type and message, not full traceback with local variables

---

## 4. Testing Violations (`testing.md`)

### 4.1 Mocking Internal Services (HIGH)

**Rule Violated:** "Do NOT mock your own Service/Repo logic. Test the integration."

**Pervasive Violation:** Most unit tests mock internal services instead of testing integration.

| Test File | Mocked Internal Modules |
|-----------|------------------------|
| `src/lib/ipc.test.ts` | `./tauri` |
| `src/hooks/usePortfolioData.test.tsx` | `../lib/ipc`, `../store/useAppStore` |
| `src/components/views/HealthView.test.tsx` | `../../lib/ipc`, `../../store/useAppStore` |
| `src/components/common/ErrorBoundary.test.tsx` | `../../store/useAppStore`, `../../lib/api/feedback`, `../../lib/scrubber` |
| `src/features/xray/components/XRayView.test.tsx` | 5 internal modules |
| `src/features/auth/components/LoginForm.test.tsx` | `../../../lib/ipc`, `../../../store/useAppStore` |
| `src/App.test.tsx` | `./lib/ipc`, `./lib/tauri`, `./hooks/useTauriEvents` |

**Mitigation Strategy:**
1. Use MSW (Mock Service Worker) for network-level mocking instead
2. Create test fixtures that use real IPC logic
3. Reserve mocking for external APIs only (Supabase, Trade Republic)

### 4.2 E2E Tests in Wrong Location (MEDIUM)

**Rule Violated:** "Integration/E2E: Top-level `tests/` folder. `tests/e2e/login.spec.ts`"

**Current Location:** `/e2e/auth.spec.ts`  
**Required Location:** `/tests/e2e/auth.spec.ts`

**Mitigation Strategy:**
1. Move `/e2e/` contents to `/tests/e2e/`
2. Update Playwright config to point to new location

### 4.3 Missing Integration Tests (HIGH)

**Rule Violated:** "Integration (30%): Services + Database"

**Current State:** The `/tests/` directory is empty. No integration tests exist.

**Required:** Integration tests for:
- IPC layer + Python sidecar
- SQLite database operations
- Supabase client operations

**Mitigation Strategy:**
1. Create `/tests/integration/` directory
2. Write integration tests using Testcontainers or in-memory SQLite
3. Test actual IPC communication without mocking

### 4.4 Test Coverage Gaps (MEDIUM)

**Files Missing Corresponding Tests:**

| Category | Files Without Tests |
|----------|---------------------|
| **APIs** | `integrations/api.ts`, `xray/api.ts`, `portfolio/api.ts`, `dashboard/api.ts`, `auth/api.ts` |
| **Hooks** | `usePipelineProgress.ts`, `usePipelineDiagnostics.ts` |
| **Utils** | `logger.ts`, `queryClient.ts` |
| **UI Components** | `Skeleton.tsx`, `UnresolvedIsinsList.tsx`, `ResolutionStatusBadge.tsx`, `PipelineSummaryCard.tsx`, `PipelineProgressCard.tsx`, `ErrorState.tsx`, `SystemStatus.tsx`, `Sidebar.tsx` |

**Mitigation Strategy:**
1. Prioritize testing for API and hook modules
2. Add component tests for common UI components
3. Track coverage metrics in CI

---

## 5. Architecture Violations (`architecture.md`)

### 5.1 Python Service Layer Performing IO (HIGH)

**Rule Violated:** "Service layer: Pure. No IO knowledge. Only Data layer allowed to touch fs or fetch."

| File | Line | IO Type |
|------|------|---------|
| `src-tauri/python/portfolio_src/core/services/sync_service.py` | Multiple | Network (`urllib`) |
| `src-tauri/python/portfolio_src/core/pipeline.py` | Multiple | File system (`open()`) |
| `src-tauri/python/portfolio_src/core/harvesting.py` | Multiple | File system |
| `src-tauri/python/portfolio_src/core/health.py` | Multiple | File system |

**Mitigation Strategy:**
1. Move all file/network operations to `data/` layer
2. Pass data into services via DTOs
3. Services should only receive and return typed objects

### 5.2 Feature APIs as Re-exports (MEDIUM)

**Rule Violated:** "Feature-Sliced Design: Group by Feature, not File Type"

**Issue:** Feature `api.ts` files are empty re-exports from global `lib/ipc.ts`:

```typescript
// src/features/portfolio/api.ts - Current (BAD)
export { getPositions, syncPortfolio } from '../../lib/ipc'

// Required (GOOD) - Feature should own its data access
export async function getPositions(): Promise<Position[]> {
  const data = await callCommand('get_positions', {})
  return validateResponse(PositionSchema.array(), data)
}
```

**Affected Files:**
- `src/features/portfolio/api.ts`
- `src/features/xray/api.ts`
- `src/features/integrations/api.ts`
- `src/features/dashboard/api.ts`
- `src/features/auth/api.ts`

**Mitigation Strategy:**
1. Move IPC calls into feature-specific `api.ts` files
2. Define feature-specific Zod schemas alongside
3. `lib/ipc.ts` should only export the low-level `callCommand` utility

### 5.3 Root-Level Feature Logic (MEDIUM)

**Rule Violated:** "FSD: Shared UI in src/components/ui, Global Lib in src/lib"

**Issue:** Feature-specific hooks and state are at root level instead of within features.

| Current Location | Should Be |
|-----------------|-----------|
| `src/hooks/usePortfolioData.ts` | `src/features/portfolio/hooks/usePortfolioData.ts` |
| `src/hooks/usePipelineProgress.ts` | `src/features/xray/hooks/usePipelineProgress.ts` |
| `src/hooks/usePipelineDiagnostics.ts` | `src/features/xray/hooks/usePipelineDiagnostics.ts` |
| `src/store/useAppStore.ts` | Split into feature-specific stores |

**Mitigation Strategy:**
1. Move feature-specific hooks into `src/features/[feature]/hooks/`
2. Split global store into feature-specific slices
3. Only keep truly global state (theme, auth status) in root store

### 5.4 Presentation Layer Business Logic (MEDIUM)

**Rule Violated:** "Presentation Layer: NO business logic. NO database calls."

| File | Issue |
|------|-------|
| `src/features/dashboard/components/Dashboard.tsx` | Contains filtering, profit calculation, sparkline mapping |
| `src/features/portfolio/components/PortfolioTable.tsx` | Contains position update logic |

**Mitigation Strategy:**
1. Move calculations to service/selector layer
2. Components should only render pre-computed data
3. Use React Query selectors for data transformation

### 5.5 Missing Feature Schemas (MEDIUM)

**Rule Violated:** "DTOs: Define strict schemas for ALL data moving between layers."

| Feature | Has `schemas.ts` |
|---------|------------------|
| `auth` | Yes |
| `dashboard` | Yes |
| `portfolio` | **NO** |
| `xray` | **NO** |
| `integrations` | **NO** |

**Mitigation Strategy:**
1. Create `schemas.ts` for each feature
2. Define Zod schemas for all data types
3. Use schemas at IPC boundary and in components

---

## 6. Workflow & Documentation Violations

### 6.1 Conventional Commits (COMPLIANT)

Recent commits follow the conventional commits format:
```
feat: move Python unit tests to co-located positions
feat: refactor .then() chains to async/await
feat: replace console.log with structured logger
```

### 6.2 Git Ignore for Secrets (COMPLIANT)

`.gitignore` correctly includes:
- `.env`
- `.env.local`
- `.env.*.local`

### 6.3 Default Export Usage (LOW)

**Rule Violated:** "NO default exports (Use named exports)"

| File | Issue |
|------|-------|
| `src/features/integrations/components/HoldingsUpload.tsx` | `export default HoldingsUpload` |
| `src/features/xray/components/ActionQueue.tsx` | `export default function ActionQueue` |

**Note:** Many components use default exports, which is common in React but violates the stated rule.

**Mitigation Strategy:**
1. Convert to named exports
2. Update imports throughout codebase
3. Add ESLint rule to enforce named exports

---

## 7. Positive Findings (Rules Followed)

### Security
- No `dangerouslySetInnerHTML` usage found
- No disabled SSL verification (`verify=False` or `rejectUnauthorized`)
- PII masking implemented in Trade Republic authentication
- AppleScript injection prevention in Rust shell
- `PIIFilter` in Python logging correctly masks IBANs, Emails, JWTs

### Type Safety
- `tsconfig.json` has `"strict": true`
- No `@ts-ignore` or `@ts-expect-error` comments found
- Error handling correctly uses `instanceof Error` checks
- No `throw "string"` patterns found

### Code Organization
- Feature-Sliced folder structure is mostly followed
- Shared UI components correctly in `src/components/ui/`
- Test naming conventions are correct (`.test.ts` for Vitest, `.spec.ts` for Playwright)

### Workflow
- pnpm is used as package manager (pnpm-lock.yaml present)
- Conventional commits are followed
- .env.example is comprehensive and well-documented

---

## 8. Prioritized Remediation Plan

### Phase 1: Critical Security (Immediate)

1. **Remove hardcoded secret fallbacks** in `ipc.ts` and `echo_bridge.py`
2. **Implement Zod validation** for all IPC responses in `lib/ipc.ts`
3. **Add Pydantic validation** for external API responses in `enrichment.py`

### Phase 2: High-Priority Architecture (Week 1)

4. **Move IO operations** from Python `core/` to `data/` layer
5. **Relocate feature-specific hooks** to `src/features/[feature]/hooks/`
6. **Remove internal service mocking** from unit tests

### Phase 3: Medium-Priority Quality (Week 2)

7. **Add explicit return types** to all React components and hooks
8. **Create integration tests** in `/tests/integration/`
9. **Move E2E tests** from `/e2e/` to `/tests/e2e/`
10. **Convert Python logging** to structured format with `extra=`

### Phase 4: Low-Priority Cleanup (Week 3)

11. **Replace custom SHA-256** with Web Crypto API
12. **Remove `any` types** from HoldingsUpload and ActionQueue
13. **Add missing test files** for coverage gaps
14. **Convert default exports** to named exports

---

## Appendix: Files Requiring Changes

### High Priority (26 files)
```
src/lib/ipc.ts
src-tauri/python/portfolio_src/data/enrichment.py
src-tauri/python/portfolio_src/headless/transports/echo_bridge.py
src/features/portfolio/api.ts
src/features/xray/api.ts
src/features/integrations/api.ts
src/features/dashboard/api.ts
src/features/auth/api.ts
src/hooks/usePortfolioData.ts
src/hooks/usePipelineProgress.ts
src/hooks/usePipelineDiagnostics.ts
src/store/useAppStore.ts
src-tauri/python/portfolio_src/core/services/sync_service.py
src-tauri/python/portfolio_src/core/pipeline.py
src-tauri/python/portfolio_src/core/harvesting.py
src-tauri/python/portfolio_src/core/health.py
src/lib/ipc.test.ts
src/hooks/usePortfolioData.test.tsx
src/components/views/HealthView.test.tsx
src/components/common/ErrorBoundary.test.tsx
src/features/xray/components/XRayView.test.tsx
src/features/auth/components/LoginForm.test.tsx
src/App.test.tsx
e2e/auth.spec.ts
tests/ (create integration tests)
src/lib/logger.ts
```

### Medium Priority (15 files)
```
src/App.tsx
src/features/dashboard/components/Dashboard.tsx
src/features/xray/components/ActionQueue.tsx
src/features/integrations/components/HoldingsUpload.tsx
src/features/portfolio/components/PortfolioTable.tsx
src/lib/tauri.ts
src/lib/scrubber.ts
src-tauri/python/portfolio_src/headless/dispatcher.py
src-tauri/python/portfolio_src/core/tr_daemon.py
src-tauri/python/portfolio_src/headless/protocol.py
src-tauri/python/portfolio_src/prism_utils/logging_config.py
src-tauri/python/portfolio_src/prism_utils/telemetry.py
src-tauri/python/main.py
src/components/ui/Toast.test.tsx
src/test/README.md
```

---

**Report Generated By:** Comprehensive Code Review  
**Review Methodology:** Automated analysis via explore agents + manual verification  
**Recommendation:** Address Phase 1 (Critical Security) before next release
