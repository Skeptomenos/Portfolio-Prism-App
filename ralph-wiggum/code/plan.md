# Implementation Plan

> **Generated:** 2026-01-26  
> **Version:** 2.2  
> **Scope:** Remaining work from specs 03-16 plus codebase TODOs  
> **Approach:** Security first, then architecture, then testing, then polish

---

## Summary

**Phase 1 (v1.0):** 22 tasks across Tooling, Architecture, Safety - **100% COMPLETE**

This plan (v2.2) addresses **13 remaining tasks** organized into **4 phases** targeting:
- 2 Critical security vulnerabilities (**COMPLETE**)
- 5 Architecture fixes (IPC validation, IO separation, FSD compliance)
- 3 Testing improvements (mock strategy, test organization)
- 5 Enhancement tasks (TODOs, polish)

**Effort estimate:** ~6 hours (1 day)

---

## Phase Dependencies

```
Phase 1 (Security) COMPLETE ──────────────────┐
   |                                          |
Phase 2 (Backend + IPC) ──────────────────────┤──> Sequential by phase
   |                                          |
Phase 3 (Frontend) ───────────────────────────┤
   |                                          |
Phase 4 (Testing) ────────────────────────────┤
   |                                          |
Phase 5 (Polish) ─────────────────────────────┘

Within phases: Tasks can run in parallel where noted
```

---

## Phase 1: Security Hardening (CRITICAL) - COMPLETE

**Priority:** P0 - Must fix before any deployment  
**Status:** 100% COMPLETE

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 1.1**: Remove hardcoded `dev-echo-bridge-secret` fallbacks | `specs/07-security-hardcoded-secrets.md` | Done in v0.10.21 |
| [x] | **Task 1.2**: Replace custom SHA-256 with Web Crypto API | `specs/16-replace-custom-crypto.md` | Done in v0.10.22 |

---

## Phase 2: Backend & IPC Architecture

**Priority:** P1 - Data integrity  
**Status:** 100% COMPLETE

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 2.1**: Create Pydantic models for external API responses | `specs/09-pydantic-external-api-validation.md:L18-35` | Done in v0.10.23 |
| [x] | **Task 2.2**: Add Pydantic validation to enrichment external API calls | `specs/09-pydantic-external-api-validation.md:L38-52` | Done in v0.10.24 |
| [x] | **Task 2.3**: Extract file IO from `pipeline.py` to Data layer | `specs/13-backend-io-separation.md:L15-32` | Done in v0.10.25 |
| [x] | **Task 2.4**: Convert Python f-string logging to structured `extra=` | `specs/14-python-structured-logging.md:L12-28` | Done in v0.10.26 |
| [x] | **Task 2.5**: Wire Zod validation to ALL IPC functions | `specs/08-ipc-zod-validation.md` | Done in v0.10.27 |

**Verification:**
```bash
# Task 2.4: No f-strings in logging
grep -rn 'logger\.\(info\|debug\|warning\|error\)(f"' src-tauri/python/portfolio_src/ && echo "FAIL" || echo "PASS"

# Task 2.5: All IPC calls validated (MUST: validations >= calls)
CALLS=$(grep -c "await callCommand" src/lib/ipc.ts)
VALIDATIONS=$(grep -c "validateResponse" src/lib/ipc.ts)
[ "$VALIDATIONS" -ge "$CALLS" ] && echo "PASS: $VALIDATIONS validations for $CALLS calls" || echo "FAIL: Only $VALIDATIONS validations for $CALLS calls"

# Tests pass
uv run pytest src-tauri/python/portfolio_src/
pnpm test
```

---

## Phase 3: Frontend Architecture

**Priority:** P1 - Maintainability  
**Parallelizable:** 3.1 can run parallel with Phase 2; 3.2/3.3 must be sequential

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 3.1**: Add explicit `: JSX.Element` return types to React components | `specs/12-frontend-explicit-return-types.md:L11-22` | Done in v0.10.28 - ESLint rule enabled (warn), component and hook return types added |
| [x] | **Task 3.2**: Move ALL orphan hooks to feature slices | `specs/15-fsd-hooks-and-store.md:L14-25` | Done in v0.10.29 - usePortfolioData moved to features/portfolio/hooks/, usePipelineProgress + usePipelineDiagnostics moved to features/xray/hooks/. Only useTauriEvents remains in src/hooks/ |
| [x] | **Task 3.3**: Split monolithic `useAppStore.ts` into feature slices | `specs/15-fsd-hooks-and-store.md:L28-42` | Done in v0.10.30 - Extracted `authSlice.ts` (auth feature), `syncSlice.ts` (dashboard feature), `uiSlice.ts` (store). Facade pattern maintains backward compatibility |

**Verification:**
```bash
# Only shared hooks remain in root
ls src/hooks/ | grep -v "useTauriEvents" | wc -l  # Should be 0

# Feature hooks exist
ls src/features/portfolio/hooks/ src/features/xray/hooks/

# Build + type check
pnpm typecheck && pnpm build && pnpm lint
```

---

## Phase 4: Testing Infrastructure

**Priority:** P2 - Developer experience  
**Parallelizable:** 4.1 must complete first; 4.2 can run parallel with 4.1

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 4.1**: Set up Tauri transport mocking for tests | `specs/10-testing-mocking-refactor.md:L18-32` | Done in v0.10.31 - Added `setupTauriMock()` with command handlers, mock data generators (mockDashboardData, mockEngineHealth, etc.), opt-in MSW server in `server.ts` |
| [x] | **Task 4.2**: Reorganize test directories + integration setup | `specs/11-testing-e2e-location-integration.md:L12-18` | Done in v0.10.32 - Moved `/e2e/` to `/tests/e2e/`, updated `playwright.config.ts`. Created `/tests/integration/setup.ts` with Python sidecar spawn, added `test:integration` and `test:unit` scripts. Updated vitest.config.ts with projects API |
| [x] | **Task 4.3**: Refactor 3 high-impact tests to use transport mocks | `specs/10-testing-mocking-refactor.md:L35-48` | Done in v0.10.33 - Converted `Dashboard.test.tsx`, `LoginForm.test.tsx`, `XRayView.test.tsx` to use `setupTauriMock()`. Removed all `vi.mock('../lib/ipc')` calls. All 357 tests pass |

**Verification:**
```bash
# MSW configured
grep "setupTauriMock" src/test/mocks/tauri.ts

# E2E moved (old dir gone)
ls tests/e2e/*.spec.ts && ! ls e2e/ 2>/dev/null

# No internal mocks in converted tests
grep -c "vi.mock.*lib/ipc" src/features/*/components/*.test.tsx && echo "FAIL" || echo "PASS"

# Tests pass
pnpm test && pnpm test:e2e
```

---

## Phase 5: Polish & TODOs

**Priority:** P3 - Complete features  
**Parallelizable:** All tasks are independent

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 5.1**: Implement X-Ray action modals (Upload CSV, Ignore list) | `src/features/xray/components/XRayView.tsx:92` | Done in v0.10.34 - Created `ActionModal.tsx` with upload form for ETF resolution failures, wired to Fix button. Updated UploadHoldingsResultSchema with totalWeight and contributedToHive fields. |
| [ ] | **Task 5.2**: Implement Rust event listening from Python engine | `src-tauri/src/commands.rs:536` | Complete `engine.listen_events()` for real-time sync progress via Tauri events |
| [ ] | **Task 5.3**: Add feature-specific ErrorBoundary to X-Ray | `CODE_REVIEW_REPORT.md` | Wrap XRayView in ErrorBoundary with graceful fallback UI |
| [ ] | **Task 5.4**: Create `CONTRIBUTING.md` with testing patterns | `CODE_REVIEW_REPORT.md` | Document MSW usage, test organization, FSD patterns for contributors |
| [ ] | **Task 5.5**: Address remaining low-severity code review items | `CODE_REVIEW_REPORT.md:L509-514` | **INCLUDES:** MD5->SHA256 in Python (`logging_config.py`, `telemetry.py`), default exports, etc. |

**Verification:**
```bash
# Modal exists
ls src/features/xray/components/ActionModal.tsx

# Event listening implemented
grep -v "^//" src-tauri/src/commands.rs | grep "listen_events" || echo "TODO: Implement"

# No MD5 remaining
grep -r "hashlib.md5" src-tauri/python/ && echo "FAIL" || echo "PASS"

# Docs exist
ls CONTRIBUTING.md

# Full verification
pnpm build && pnpm lint && uv run pytest && uv run ruff check . && uv run tach check
```

---

## Legend

- `[ ]` Pending
- `[x]` Complete  
- `[!]` Blocked

---

## Task Sizing

| Phase | Tasks Total | Tasks Remaining | Estimated Time | Parallelizable |
|-------|-------------|-----------------|----------------|----------------|
| Phase 1: Security | 2 | 0 | COMPLETE | - |
| Phase 2: Backend | 5 | 0 | COMPLETE | - |
| Phase 3: Frontend | 3 | 0 | COMPLETE | - |
| Phase 4: Testing | 3 | 0 | COMPLETE | - |
| Phase 5: Polish | 5 | 4 | 1.5 hours | All parallel |
| **Total** | **18** | **4** | **~1.5 hours** | |

---

## Critical Path

```
Security (1.1, 1.2) COMPLETE
        |
        v
IPC Validation (2.5) ──────> Test Mocks (4.1) ──────> Test Refactor (4.3)
        |                           
        |                    Frontend Types (3.1) ────> Store Split (3.3)
        |                           |
        v                           v
   Py Logging (2.4)           Hook Migration (3.2)
```

**Minimum viable path:** Task 2.5 (IPC Validation) -> Task 4.1 (Transport Mocks) -> Task 4.3 (Test Refactor)

---

## Verification Checklist (Run After Each Phase)

```bash
# Quick check (after each task)
pnpm dev  # App starts

# Phase completion check
pnpm typecheck              # No TS errors
pnpm build                  # Production build works
pnpm lint                   # ESLint clean
uv run pytest src-tauri/python/portfolio_src/  # Python tests pass
uv run ruff check .         # Ruff clean
uv run tach check           # No architecture violations
```

---

## Completed Work (v1.0 Plan)

<details>
<summary>Phase 1: Tooling & Infrastructure (5/5 Complete)</summary>

| Status | Task | Notes |
|--------|------|-------|
| [x] | **Task 1.1**: Complete pnpm migration | Done in v0.9.4 |
| [x] | **Task 1.2**: Install Ruff linter | Done in v0.10.3 |
| [x] | **Task 1.3**: Install Mypy type checker | Done in v0.10.4 |
| [x] | **Task 1.4**: Initialize Tach | Done in v0.10.5 |
| [x] | **Task 1.5**: Update pytest config | Done in v0.10.6 |

</details>

<details>
<summary>Phase 2: Architecture Refactors (9/9 Complete)</summary>

| Status | Task | Notes |
|--------|------|-------|
| [x] | **Task 2.1**: Create dashboard_service.py | Done in v0.10.7 |
| [x] | **Task 2.2**: Create sync_service.py | Done in v0.10.8 |
| [x] | **Task 2.3**: Update state.py accessors | Done |
| [x] | **Task 2.4**: Create FSD structure + auth | Done in v0.10.9 |
| [x] | **Task 2.5**: Move dashboard feature | Done in v0.10.10 |
| [x] | **Task 2.6**: Move portfolio feature | Done in v0.10.11 |
| [x] | **Task 2.7**: Move xray feature | Done in v0.10.12 |
| [x] | **Task 2.8**: Move integrations feature | Done in v0.10.13 |
| [x] | **Task 2.9**: Fix all import paths | Done in v0.10.14 |

</details>

<details>
<summary>Phase 3: Safety & Observability (9/9 Complete)</summary>

| Status | Task | Notes |
|--------|------|-------|
| [x] | **Task 3.1**: Update response envelope | Done in v0.10.15 |
| [x] | **Task 3.2**: Replace print() with logging | Done |
| [x] | **Task 3.3**: Update frontend IPC handler | Done in v0.10.15 |
| [x] | **Task 3.4**: Install Zod + validation wrapper | Done |
| [x] | **Task 3.5**: Define Zod schemas | Done in v0.10.16 |
| [x] | **Task 3.6**: Remove all `any` types | Done in v0.10.16 |
| [x] | **Task 3.7**: Replace console.log with logger | Done in v0.10.18 |
| [x] | **Task 3.8**: Refactor .then() to async/await | Done in v0.10.19 |
| [x] | **Task 3.9**: Co-locate Python unit tests | Done in v0.10.20 |

</details>

---

## Notes

1. **IPC Validation Critical**: Task 2.5 addresses the biggest type-safety gap - 12 IPC calls with only 1 validation
2. **Hook Migration Consolidated**: Tasks 3.2+3.4 merged - all 3 orphan hooks moved in single task
3. **Test Reorg Consolidated**: Tasks 4.2+4.4 merged - directory restructure + integration setup together
4. **Store Split API**: Task 3.3 maintains same public API via barrel re-exports (facade pattern)
5. **ESLint Rule**: Task 3.1 now explicitly includes enabling the TypeScript return type rule

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v2.2 | 2026-01-26 | Consolidated 3.2+3.4 (hooks) and 4.2+4.4 (tests). Added ESLint rule to 3.1. Added MD5 note to 5.5. Reduced to 13 tasks. |
| v2.1 | 2026-01-26 | Added Task 2.5 (IPC Zod Validation) from spec 08 - was CRITICAL but missing from plan |
| v2.0 | 2026-01-26 | Initial v2.0 plan addressing remaining 21 tasks from code review |
| v1.0 | 2026-01-25 | Original 22-task plan (Tooling, Architecture, Safety) - 100% complete |
