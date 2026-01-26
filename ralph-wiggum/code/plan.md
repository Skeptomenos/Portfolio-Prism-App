# Implementation Plan

> **Generated:** 2026-01-26  
> **Version:** 2.0  
> **Scope:** Remaining work from specs 07-16 plus codebase TODOs  
> **Approach:** Security first, then architecture, then testing, then polish

---

## Summary

**Phase 1 (v1.0):** 22 tasks across Tooling, Architecture, Safety - **100% COMPLETE**

This plan (v2.0) addresses **21 remaining tasks** organized into **5 phases** targeting:
- 2 Critical security vulnerabilities (hardcoded secrets, custom crypto)
- 6 Architecture fixes (validation, IO separation, FSD compliance)
- 4 Testing improvements (mock strategy, test organization)
- 4 Observability improvements (logging, type annotations)
- 5 Enhancement tasks (TODOs, polish)

**Effort estimate:** ~8 hours (1-2 days)

---

## Phase Dependencies

```
Phase 1 (Security) ─────────────────────┐
   ↓                                    │
Phase 2 (Backend) ──────────────────────┤──→ Sequential by phase
   ↓                                    │
Phase 3 (Frontend) ─────────────────────┤
   ↓                                    │
Phase 4 (Testing) ──────────────────────┤
   ↓                                    │
Phase 5 (Polish) ───────────────────────┘

Within phases: Tasks can run in parallel where noted
```

---

## Phase 1: Security Hardening (CRITICAL)

**Priority:** P0 - Must fix before any deployment  
**Parallelizable:** Tasks 1.1 and 1.2 are independent

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 1.1**: Remove hardcoded `dev-echo-bridge-secret` fallbacks | `specs/07-security-hardcoded-secrets.md` | Done in v0.10.21 — `ipc.ts`, `echo_bridge.py` now fail-fast if tokens missing |
| [ ] | **Task 1.2**: Replace custom SHA-256 with Web Crypto API | `specs/16-replace-custom-crypto.md` | `scrubber.ts:106-203` — 100 lines manual crypto → ~10 lines using `crypto.subtle.digest()` |

**Verification:**
```bash
# No fallback secrets
grep -r "dev-echo-bridge-secret" src/ src-tauri/ && echo "FAIL: Hardcoded secret found" || echo "PASS"
# No manual crypto
grep -c "0x428a2f98" src/lib/scrubber.ts && echo "FAIL: Custom SHA-256 found" || echo "PASS"
# Build passes
pnpm build && pnpm typecheck
```

---

## Phase 2: Backend Architecture

**Priority:** P1 - Data integrity  
**Parallelizable:** 2.1 → 2.2 sequential; 2.3 and 2.4 can run parallel after

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [ ] | **Task 2.1**: Create Pydantic models for external API responses | `specs/09-pydantic-external-api-validation.md:L18-35` | Create `data/schemas/external_api.py` with `WikidataResponse`, `YFinanceQuote`, `FinnhubProfile` models |
| [ ] | **Task 2.2**: Add Pydantic validation to enrichment external API calls | `specs/09-pydantic-external-api-validation.md:L38-52` | Update `enrichment.py` to use `model_validate(response.json())` instead of raw dict access |
| [ ] | **Task 2.3**: Extract file IO from `pipeline.py` to Data layer | `specs/13-backend-io-separation.md:L15-32` | Move `_write_reports()`, `_write_errors()`, `_write_health_report()` to `data/repositories/snapshot_repo.py` |
| [ ] | **Task 2.4**: Convert Python f-string logging to structured `extra=` | `specs/14-python-structured-logging.md:L12-28` | Replace `logger.info(f"Saved {n} items")` with `logger.info("Saved items", extra={"count": n})` |

**Verification:**
```bash
# Type check new models
uv run mypy portfolio_src/data/schemas/external_api.py --strict
# Tach boundary check
uv run tach check
# No f-strings in logging
grep -rn 'logger\.\(info\|debug\|warning\|error\)(f"' portfolio_src/ && echo "FAIL" || echo "PASS"
# Tests pass
uv run pytest portfolio_src/
```

---

## Phase 3: Frontend Architecture

**Priority:** P1 - Maintainability  
**Parallelizable:** 3.1/3.2 can run parallel; 3.3/3.4 can run parallel after

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [ ] | **Task 3.1**: Add explicit `: JSX.Element` return types to React components | `specs/12-frontend-explicit-return-types.md:L11-22` | Add ESLint rule `@typescript-eslint/explicit-function-return-type: warn` and fix 7+ components |
| [ ] | **Task 3.2**: Move orphan hooks to feature slices | `specs/15-fsd-hooks-and-store.md:L14-25` | `usePortfolioData` → `features/portfolio/hooks/`, `usePipelineProgress` → `features/xray/hooks/` |
| [ ] | **Task 3.3**: Split monolithic `useAppStore.ts` into feature slices | `specs/15-fsd-hooks-and-store.md:L28-42` | Extract `authSlice.ts`, `syncSlice.ts`, `uiSlice.ts` with Zustand `combine()` pattern |
| [ ] | **Task 3.4**: Move `usePipelineDiagnostics.ts` to xray feature | `specs/15-fsd-hooks-and-store.md:L14-25` | Final orphan hook migration |

**Verification:**
```bash
# Only shared hooks remain
ls src/hooks/ | wc -l  # Should be 1 (useTauriEvents only)
# Build + type check
pnpm typecheck && pnpm build && pnpm lint
```

---

## Phase 4: Testing Infrastructure

**Priority:** P2 - Developer experience  
**Parallelizable:** 4.1/4.2 can run parallel; 4.3 depends on 4.1

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [ ] | **Task 4.1**: Set up MSW for transport-layer mocking | `specs/10-testing-mocking-refactor.md:L18-32` | Install `msw`, create `src/test/mocks/handlers.ts` with Tauri IPC mocks |
| [ ] | **Task 4.2**: Move `/e2e/` to `/tests/e2e/` | `specs/11-testing-e2e-location-integration.md:L12-18` | Rename directory, update `playwright.config.ts` testDir, verify CI paths |
| [ ] | **Task 4.3**: Refactor 3 high-impact tests to use MSW | `specs/10-testing-mocking-refactor.md:L35-48` | Convert `Dashboard.test.tsx`, `LoginForm.test.tsx`, `XRayView.test.tsx` to use `setupTauriMock()` |
| [ ] | **Task 4.4**: Create integration test directory with setup | `specs/11-testing-e2e-location-integration.md:L22-35` | Create `/tests/integration/setup.ts` spawning real Python sidecar, add `test:integration` script |

**Verification:**
```bash
# MSW installed
grep "msw" package.json
# E2E moved
ls tests/e2e/*.spec.ts && ! ls e2e/ 2>/dev/null
# No internal mocks in converted tests
grep -c "vi.mock.*ipc" src/features/*/components/*.test.tsx && echo "FAIL" || echo "PASS"
# Tests pass
pnpm test
```

---

## Phase 5: Polish & TODOs

**Priority:** P3 - Complete features  
**Parallelizable:** All tasks are independent

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [ ] | **Task 5.1**: Implement X-Ray action modals (Upload CSV, Ignore list) | `src/features/xray/components/XRayView.tsx:92` | Create `ActionModal.tsx` component with upload/ignore forms, wire to existing buttons |
| [ ] | **Task 5.2**: Implement Rust event listening from Python engine | `src-tauri/src/commands.rs:536` | Complete `engine.listen_events()` for real-time sync progress via Tauri events |
| [ ] | **Task 5.3**: Add feature-specific ErrorBoundary to X-Ray | `CODE_REVIEW_REPORT.md` | Wrap XRayView in ErrorBoundary with graceful fallback UI |
| [ ] | **Task 5.4**: Create `CONTRIBUTING.md` with testing patterns | `CODE_REVIEW_REPORT.md` | Document MSW usage, test organization, FSD patterns for contributors |
| [ ] | **Task 5.5**: Address remaining Low-severity code review items | `CODE_REVIEW_REPORT.md:L509-514` | 13 low-priority fixes: default exports, MD5 replacement, etc. |

**Verification:**
```bash
# Modal exists
ls src/features/xray/components/ActionModal.tsx
# Event listening implemented
grep -v "^//" src-tauri/src/commands.rs | grep "listen_events" || echo "TODO: Implement"
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

| Phase | Tasks | Estimated Time | Parallelizable |
|-------|-------|----------------|----------------|
| Phase 1: Security | 2 | 45 min | Both parallel |
| Phase 2: Backend | 4 | 2 hours | Partial |
| Phase 3: Frontend | 4 | 1.5 hours | Partial |
| Phase 4: Testing | 4 | 1.5 hours | Partial |
| Phase 5: Polish | 5 | 2 hours | All parallel |
| **Total** | **21** | **~8 hours** | |

---

## Critical Path

```
Security (1.1, 1.2) → Backend Validation (2.1-2.2) → Testing (4.1, 4.3)
                   ↘                              ↗
                     Frontend (3.1-3.4) ─────────
```

**Minimum viable: 6 tasks (Phase 1 + Tasks 2.1-2.2)** — Fixes all P0/P1 security issues

---

## Verification Checklist (Run After Each Phase)

```bash
# Quick check (after each task)
pnpm dev  # App starts

# Phase completion check
pnpm typecheck              # No TS errors
pnpm build                  # Production build works
pnpm lint                   # ESLint clean
uv run pytest portfolio_src # Python tests pass
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
<summary>Phase 3: Safety & Observability (8/8 Complete)</summary>

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

1. **Security First**: Phase 1 must complete before any production deployment
2. **Backend/Frontend Parallel**: After Phase 1, Phases 2 and 3 can run in parallel by different developers
3. **Testing Last**: Phase 4 depends on Phase 3 (hook locations) for test paths
4. **Web Crypto is Async**: Task 1.2 requires caller to be async or use Promise handling
5. **Store Split API**: Task 3.3 maintains same public API via barrel re-exports
