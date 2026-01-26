# Implementation Plan

> Generated from `ralph-wiggum/specs/*` analysis  
> Last Updated: 2026-01-26  
> Scope: 2026 Mandate - Architecture & Standards Compliance

---

## Overview

This plan implements the **2026 Mandate** to bring Portfolio Prism into compliance with the strict architecture, type-safety, and observability standards defined in `rules/`. The previous `IMPLEMENTATION_PLAN.md` (65 security tasks) is **COMPLETE** (v0.1.0-v0.9.3).

### Current State

| Domain | Status | Gap |
|--------|--------|-----|
| Identity Resolution | **DONE** | Fully implemented (ISINResolver, NameNormalizer, TickerParser, HiveClient) |
| Security Fixes | **DONE** | 65/65 tasks complete per IMPLEMENTATION_PLAN.md |
| Frontend Architecture | **NOT STARTED** | Flat layer-based, needs FSD migration |
| Type Safety (Frontend) | **NOT STARTED** | 13 `any` violations, no Zod validation |
| Backend Architecture | **PARTIAL** | Handlers bypass Service layer |
| API Standards | **NOT STARTED** | Wrong envelope format (`status` vs `success`) |
| Python Tooling | **NOT STARTED** | No mypy, tach, or ruff |
| Testing | **NOT STARTED** | Tests centralized, not co-located |
| pnpm Migration | **NOT STARTED** | Still using npm |

### Task Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 0: pnpm Migration | 4 | 15 min |
| Phase 1: Frontend Architecture (FSD) | 5 | 45 min |
| Phase 2: Frontend Type Safety | 5 | 40 min |
| Phase 3: Backend Architecture | 4 | 30 min |
| Phase 4: Backend Standards | 4 | 30 min |
| Phase 5: Python Tooling | 4 | 20 min |
| Phase 6: Testing Co-location | 3 | 20 min |
| **Total** | **29** | **~3.5 hours** |

---

## Tasks

| Status | Task | Spec Reference | Notes |
|--------|------|----------------|-------|
| | | | |
| | **PHASE 0: PNPM MIGRATION** | `specs/00-pnpm-migration.md` | |
| [x] | **0.1**: Remove `node_modules` and `package-lock.json` | `specs/00-pnpm-migration.md:L11-13` | Done - v0.10.0 |
| [ ] | **0.2**: Install deps with `pnpm install` | `specs/00-pnpm-migration.md:L19-21` | Generate pnpm-lock.yaml |
| [ ] | **0.3**: Update `tauri.conf.json` build commands (npm -> pnpm) | `specs/00-pnpm-migration.md:L25-27` | |
| [ ] | **0.4**: Update CI workflows to use pnpm | `specs/00-pnpm-migration.md:L29-32` | |
| | | | |
| | **PHASE 1: FRONTEND ARCHITECTURE (FSD)** | `specs/01-frontend-architecture.md` | |
| [ ] | **1.1**: Create feature directories (`src/features/{auth,dashboard,portfolio,xray,integrations}/components`) | `specs/01-frontend-architecture.md:L40` | Scaffold only |
| [ ] | **1.2**: Move auth components + create `features/auth/{api,types}.ts` | `specs/01-frontend-architecture.md:L43-44,66-70` | LoginForm, TwoFactorModal, SessionRestorePrompt |
| [ ] | **1.3**: Move dashboard components + create `features/dashboard/{api,types}.ts` | `specs/01-frontend-architecture.md:L47-50,66-70` | Dashboard, MetricCard, TopHoldingsCard, TrueExposureCard |
| [ ] | **1.4**: Move portfolio/xray/integrations components + create feature contracts | `specs/01-frontend-architecture.md:L53-63` | HoldingsView, XRayView, TradeRepublicView, HoldingsUpload |
| [ ] | **1.5**: Fix all imports in App.tsx and moved files | `specs/01-frontend-architecture.md:L73-76` | Verify compile |
| | | | |
| | **PHASE 2: FRONTEND TYPE SAFETY** | `specs/03-frontend-safety.md` | |
| [ ] | **2.1**: Install Zod (`pnpm add zod`) | `specs/03-frontend-safety.md:L11` | |
| [ ] | **2.2**: Create validated IPC wrapper + schemas (`src/lib/schemas/ipc.ts`) | `specs/03-frontend-safety.md:L14-29` | DashboardResponseSchema, HealthStatusSchema, LoginResponseSchema |
| [ ] | **2.3**: Remove all `any` types (13 violations) | `specs/03-frontend-safety.md:L31-39` | HealthView, HoldingsUpload, scrubber, ipc, XRayView, ActionQueue |
| [ ] | **2.4**: Refactor `.then()` chains to `async/await` | `specs/03-frontend-safety.md:L41-43` | useTauriEvents, HealthView |
| [ ] | **2.5**: Verify `npm run typecheck` passes with 0 `any` | `specs/03-frontend-safety.md:L46-48` | |
| | | | |
| | **PHASE 3: BACKEND ARCHITECTURE** | `specs/02-backend-architecture.md` | |
| [ ] | **3.1**: Create `DashboardService` in `core/services/dashboard_service.py` | `specs/02-backend-architecture.md:L24-27` | Extract P&L logic from handler |
| [ ] | **3.2**: Refactor `handlers/dashboard.py` to use DashboardService | `specs/02-backend-architecture.md:L28-31` | Handler only parses IPC, calls service |
| [ ] | **3.3**: Create `SyncService` in `core/services/sync_service.py` | `specs/02-backend-architecture.md:L34-37` | Extract TR sync logic |
| [ ] | **3.4**: Verify handlers have no direct `database.py` imports | `specs/02-backend-architecture.md:L44` | |
| | | | |
| | **PHASE 4: BACKEND STANDARDS** | `specs/04-backend-standards.md` | |
| [ ] | **4.1**: Standardize JSON envelope in `responses.py` (`success: bool` instead of `status: str`) | `specs/04-backend-standards.md:L11-20` | Match rules/api_design.md |
| [ ] | **4.2**: Update frontend IPC handler to check `response.success === true` | `specs/04-backend-standards.md:L22-24` | |
| [ ] | **4.3**: Replace `print()` with structured logger (stdin_loop, sync, tr_daemon, diag_hive) | `specs/04-backend-standards.md:L26-35` | Logs to stderr, protocol to stdout |
| [ ] | **4.4**: Verify IPC still works after envelope change | `specs/04-backend-standards.md:L38-40` | |
| | | | |
| | **PHASE 5: PYTHON TOOLING** | `specs/06-python-tooling.md` | |
| [ ] | **5.1**: Add dev deps (`uv add --dev mypy ruff tach`) | `specs/06-python-tooling.md:L11-16` | |
| [ ] | **5.2**: Configure mypy in pyproject.toml (strict mode) | `specs/06-python-tooling.md:L18-28` | Fix or suppress initial errors |
| [ ] | **5.3**: Configure ruff in pyproject.toml | `specs/06-python-tooling.md:L31-40` | E, F, I, B, UP rules |
| [ ] | **5.4**: Configure tach for 3-layer boundary enforcement | `specs/06-python-tooling.md:L43-61` | headless->core->data |
| | | | |
| | **PHASE 6: TESTING CO-LOCATION** | `specs/05-testing-organization.md` | |
| [ ] | **6.1**: Move unit tests from `tests/` to be co-located with source | `specs/05-testing-organization.md:L14-20` | test_adapters -> adapters/, etc. |
| [ ] | **6.2**: Update pytest config to discover tests in portfolio_src | `specs/05-testing-organization.md:L25-28` | |
| [ ] | **6.3**: Fix imports in moved tests and verify all pass | `specs/05-testing-organization.md:L30-32` | |

---

## Legend

- `[ ]` Pending
- `[x]` Complete  
- `[!]` Blocked

---

## Execution Priority

| Priority | Phase | Rationale |
|----------|-------|-----------|
| P0 | Phase 0 (pnpm) | Foundation - all other work uses pnpm |
| P1 | Phase 1-2 (Frontend) | User-facing quality, can parallel with backend |
| P1 | Phase 3-4 (Backend) | Architecture debt, can parallel with frontend |
| P2 | Phase 5 (Tooling) | Enforcement, depends on architecture cleanup |
| P2 | Phase 6 (Testing) | Can be done last, low risk |

---

## Verification Checklist

After all phases complete:

- [ ] `pnpm tauri dev` starts successfully
- [ ] `pnpm typecheck` passes with 0 errors
- [ ] `grep -r "any" src/ --include="*.ts" --include="*.tsx"` returns 0 matches
- [ ] `grep -r "print(" src-tauri/python/portfolio_src --include="*.py"` returns 0 matches (except protocol writes)
- [ ] `uv run mypy portfolio_src` passes
- [ ] `uv run tach check` passes
- [ ] `uv run pytest portfolio_src` discovers and runs co-located tests
- [ ] Dashboard displays real data correctly

---

## Notes

1. **Identity Resolution is COMPLETE** - The explore agents confirmed ISINResolver, NameNormalizer, TickerParser, and HiveClient are all implemented with the full cascade (Local Cache → Hive → Wikidata → Finnhub → yFinance).

2. **Previous security work preserved** - All 65 tasks from IMPLEMENTATION_PLAN.md (v0.1.0-v0.9.3) remain complete.

3. **Phases can be parallelized** - Frontend (1-2) and Backend (3-4) phases are independent.

4. **Task granularity** - Each task is scoped to ~15-30 minutes, completable in one session.
