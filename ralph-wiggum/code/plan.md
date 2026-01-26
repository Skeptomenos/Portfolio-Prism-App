# Implementation Plan

> **Generated:** 2026-01-26
> **Scope:** Codebase standards compliance from `ralph-wiggum/specs/`
> **Priority:** Architecture fixes before safety fixes before observability fixes

---

## Summary

This plan addresses 8 specification documents to bring the codebase into full compliance with 2026 standards. The work is organized into 3 phases with 22 tasks total, grouped by cohesive units of work.

**Phase Overview:**
- **Phase 1: Tooling & Infrastructure** (5 tasks) - Foundation work enabling verification
- **Phase 2: Architecture Refactors** (9 tasks) - Structural changes to frontend and backend  
- **Phase 3: Safety & Observability** (8 tasks) - Type safety, validation, logging fixes

---

## Phase 1: Tooling & Infrastructure

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 1.1**: Complete pnpm migration - update lingering `npm` references in `package.json` scripts | `specs/00-pnpm-migration.md:L23-27` | Done in v0.9.4: Fixed dev:browser script, updated CI/release workflows |
| [x] | **Task 1.2**: Install and configure Ruff linter for Python | `specs/06-python-tooling.md:L31-41` | Done in v0.10.3: Added ruff to dev deps, configured E,F,I,B,UP rules. 1073 existing issues found (914 auto-fixable) |
| [x] | **Task 1.3**: Install and configure Mypy type checker for Python | `specs/06-python-tooling.md:L18-29` | Done in v0.10.4: Added mypy 1.19.1, configured with `strict=false` (170 existing errors), `ignore_missing_imports=true` |
| [x] | **Task 1.4**: Initialize Tach for architecture boundary enforcement | `specs/06-python-tooling.md:L43-61` | Done in v0.10.5: Created `tach.toml` with 3-layer architecture (presentation->service->data). All modules validated, no violations. |
| [x] | **Task 1.5**: Update pytest configuration for test co-location discovery | `specs/05-testing-organization.md:L26-28` | Done in v0.10.6: Added `[tool.pytest.ini_options]` with testpaths, added pytest-asyncio, fixed pre-existing telemetry test mocks. |

---

## Phase 2: Architecture Refactors

### Backend Service Layer (Spec 02)

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 2.1**: Create `dashboard_service.py` and extract P&L logic from `handlers/dashboard.py` | `specs/02-backend-architecture.md:L24-31` | Done in v0.10.7: Created `models/dashboard.py` with DTOs, `core/services/dashboard_service.py` with P&L/weight logic. Handler is now thin presentation layer. |
| [x] | **Task 2.2**: Create `sync_service.py` and extract TR sync logic from `handlers/sync.py` | `specs/02-backend-architecture.md:L34-37` | Done in v0.10.8: Created `models/sync.py` with DTOs, `core/services/sync_service.py` with asset classification, TR sync, and pipeline logic. Handler is thin. Fixed pre-existing STOCK_ENTITY_TYPES undefined bug. |
| [x] | **Task 2.3**: Update `headless/state.py` to provide service accessors | `specs/02-backend-architecture.md:L39-40` | Done: Added `get_sync_service()` singleton accessor. SyncService is stateful (has AssetClassifier). DashboardService remains per-request (stateless). Updated handler tests to mock service layer. |

### Frontend Architecture (Spec 01)

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 2.4**: Create FSD directory structure and move auth feature components | `specs/01-frontend-architecture.md:L39-44` | Done in v0.10.9: Created `src/features/{auth,dashboard,portfolio,xray,integrations}`, moved auth components, tests, created api.ts and types.ts re-exports. |
| [x] | **Task 2.5**: Move dashboard feature components and create contracts | `specs/01-frontend-architecture.md:L47-50` | Done in v0.10.10: Moved Dashboard, MetricCard, TopHoldingsCard, TrueExposureCard to `src/features/dashboard/components/`. Created api.ts, types.ts, index.ts barrel exports. |
| [x] | **Task 2.6**: Move portfolio feature components and create contracts | `specs/01-frontend-architecture.md:L53-55` | Done in v0.10.11: Moved HoldingsView, PortfolioTable, PortfolioChart to `src/features/portfolio/components/`. Created api.ts, types.ts, index.ts barrel exports. Updated consumers (App.tsx, TradeRepublicView, Dashboard). |
| [x] | **Task 2.7**: Move xray feature components and create contracts | `specs/01-frontend-architecture.md:L58-59` | Done in v0.10.12: Moved XRayView + 14 xray subcomponents to `src/features/xray/components/`. Created api.ts, types.ts, index.ts barrel exports. Updated all consumers. |
| [x] | **Task 2.8**: Move integrations feature components and create contracts | `specs/01-frontend-architecture.md:L62-63` | Done in v0.10.13: Moved TradeRepublicView, HoldingsUpload to `src/features/integrations/components/`. Created api.ts, types.ts, index.ts barrel exports. |
| [x] | **Task 2.9**: Update App.tsx and fix all import paths across codebase | `specs/01-frontend-architecture.md:L73-75` | Done in v0.10.14: Verified all feature imports use barrels, no circular deps (madge check passed). HealthView remains in components/views/ as system view. |

---

## Phase 3: Safety & Observability

### Backend Standards (Spec 04)

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 3.1**: Update `responses.py` envelope from `status` to `success` boolean | `specs/04-backend-standards.md:L11-20` | Done in v0.10.15: Updated `responses.py`, `contracts.py`, `dispatcher.py`, `stdin_loop.py`, `echo_bridge.py`. Also updated Rust `EngineResponse.success: bool` and `commands.rs`. |
| [x] | **Task 3.2**: Replace `print()` with structured logging in Python sidecar | `specs/04-backend-standards.md:L26-35` | Done: Created `protocol.py` with `write_protocol()` for IPC output. Updated `stdin_loop.py`, `sync.py` to use it. `tr_daemon.py` already correct (uses `protocol_stdout`). Converted `diag_hive.py` to use logger. |
| [x] | **Task 3.3**: Update frontend IPC handler to expect `success` boolean | `specs/04-backend-standards.md:L22-24` | Done in v0.10.15: Updated `ipc.ts` to check `!result.success` instead of `result.status === 'error'`. Updated all frontend mocks and tests. |

### Frontend Type Safety (Spec 03)

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 3.4**: Install Zod and create IPC validation wrapper | `specs/03-frontend-safety.md:L11-18` | Done: Zod 4.3.6 already installed. Created `validateResponse<T>()` helper and `IPCValidationError` class in `ipc.ts`. |
| [x] | **Task 3.5**: Define Zod schemas for all IPC responses | `specs/03-frontend-safety.md:L21-29` | Done in v0.10.16: Created `DashboardDataSchema`, `EngineHealthSchema`, `AuthResponseSchema` etc. in feature/lib schemas. Types now inferred from Zod via z.infer. |
| [x] | **Task 3.6**: Remove all `any` types (16 violations in 7 files) | `specs/03-frontend-safety.md:L31-39` | Done in v0.10.16: Replaced all `any` with `unknown` or proper types. Updated scrubber.ts, ipc.ts, HealthView.tsx, XRayView.tsx, feedback.ts, ErrorBoundary.tsx, and all related tests. |
| [x] | **Task 3.7**: Replace `console.log` with structured logger (19 instances) | `specs/03-frontend-safety.md#review-fixes` | Done in v0.10.18: Created `src/lib/logger.ts` with level-based logging. Replaced 65 console.* calls across 14 files. Production mode suppresses debug/info. |
| [x] | **Task 3.8**: Refactor `.then()` chains to async/await (5 instances) | `specs/03-frontend-safety.md:L41-43` | Done in v0.10.19: Converted 4 `.then()` chains in useTauriEvents.ts (2) and HealthView.tsx (1) to async/await with IIFE pattern. Test file .then() chains kept as-is per spec. |

### Test Co-location (Spec 05)

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| [x] | **Task 3.9**: Move Python unit tests to co-located positions | `specs/05-testing-organization.md:L12-21` | Done in v0.10.20: Moved 19 unit test files to co-located positions in portfolio_src/. Created portfolio_src/conftest.py fixture bridge. 357 unit tests pass. Integration/E2E tests remain in tests/. |

---

## Legend

- `[ ]` Pending
- `[x]` Complete  
- `[!]` Blocked

---

## Dependencies

```
Phase 1 (Tooling) → unlocks verification for all phases
                 ↓
Phase 2 (Architecture) → can run in parallel: Backend (2.1-2.3) || Frontend (2.4-2.9)
                 ↓
Phase 3 (Safety) → depends on 2.9 for import paths; 3.1-3.3 must be done together
```

---

## Verification Checklist

After each task:
- [ ] `pnpm dev` - App starts without errors
- [ ] `pnpm typecheck` - No TypeScript errors
- [ ] `uv run pytest` - All tests pass
- [ ] `uv run ruff check .` - No lint errors (after Task 1.2)
- [ ] `uv run mypy portfolio_src` - Type check passes (after Task 1.3)
- [ ] `uv run tach check` - No architecture violations (after Task 1.4)

---

## Notes

1. **Task Granularity**: Tasks are scoped to ~30 min each. FSD migration is grouped by feature, not by file type.
2. **Backend/Frontend Parallel**: Tasks 2.1-2.3 (backend) can run in parallel with 2.4-2.9 (frontend).
3. **Envelope Coordination**: Tasks 3.1 and 3.3 MUST be deployed together to avoid IPC breakage.
4. **Test Movement**: Task 3.9 can be done incrementally per module without blocking other work.
