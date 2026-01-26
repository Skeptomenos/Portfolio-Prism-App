# Codebase Review & Audit Report (2026 Standards)

**Date:** Jan 26, 2026
**Scope:** `src/`, `src-tauri/python/`
**Status:** ❌ Significant Deviations Found

## Executive Summary
The codebase generally functions but fails to meet the strict architecture, type-safety, and observability standards defined in `rules/`. Major refactoring is required to align with the "2026 Mandate".

---

## 1. Frontend (TypeScript/React) violations
**Rules:** `rules/rules_ts.md`, `rules/architecture.md`

### 1.1 Architecture (Feature-Sliced Design)
*   **Violation:** The project uses a flat, layer-based structure (`src/components/`, `src/lib/`, `src/types/`).
*   **Mandate:** `rules/architecture.md` requires grouping by **Feature** (`src/features/auth/`, `src/features/dashboard/`).
*   **Impact:** Low modularity; "spaghetti" dependencies between components.
*   **Mitigation:**
    1.  Create `src/features/`.
    2.  Move `src/components/auth` -> `src/features/auth/components`.
    3.  Co-locate `api.ts` and `types.ts` within each feature folder.

### 1.2 Type Safety (`any`)
*   **Violation:** 13 explicit uses of `any` found.
    *   `src/components/views/HealthView.tsx:708`
    *   `src/components/HoldingsUpload.tsx:25`
    *   `src/lib/scrubber.ts:233`
    *   `src/lib/ipc.ts:310`
*   **Mandate:** `rules/rules_ts.md`: "`any` is forbidden."
*   **Mitigation:** Replace with `unknown` + Type Guards (Zod) or explicit interfaces.

### 1.3 Validation (Zod)
*   **Violation:** **Zero** Zod usage found in `src/`. API responses in `src/lib/ipc.ts` return raw types.
*   **Mandate:** `rules/rules_ts.md`: "ALL external data ... MUST be validated with Zod at the edge."
*   **Mitigation:** Implement Zod schemas for all IPC commands and responses. Parse data before using it in React components.

### 1.4 Observability (`console.log`)
*   **Violation:** 19 instances of `console.log`.
    *   `src/hooks/useTauriEvents.ts` (multiple)
    *   `src/hooks/usePipelineProgress.ts` (multiple)
*   **Mandate:** `rules/logging.md`: "`console.log` ... forbidden in production code."
*   **Mitigation:** Replace with a structured logger wrapper (e.g., `logger.info()`) that can handle prod/dev modes.

### 1.5 Async Patterns
*   **Violation:** `.then()` chains usage.
    *   `src/hooks/useTauriEvents.ts`
    *   `src/components/views/HealthView.tsx`
*   **Mandate:** `rules/rules_ts.md`: "Async/Await Only. No `.then()` chains."
*   **Mitigation:** Refactor to `async/await`.

---

## 2. Backend (Python Sidecar) violations
**Rules:** `rules/logging.md`, `rules/architecture.md`, `rules/api_design.md`

### 2.1 Logging
*   **Violation:** `print()` statements used for protocol communication and diagnostics.
    *   `headless/transports/stdin_loop.py`
    *   `headless/handlers/sync.py`
    *   `core/tr_daemon.py`
*   **Mandate:** `rules/logging.md`: "Logs must be machine-readable (JSON)."
*   **Mitigation:** Use the project's structured logger.

### 2.2 Architecture (Layer Separation)
*   **Violation:** Presentation layer (`headless/handlers`) imports directly from Data layer (`data.database`) and contains business logic (P&L calcs in `dashboard.py`).
*   **Mandate:** `rules/architecture.md`: Presentation -> Service -> Data. Dependencies flow down.
*   **Mitigation:**
    1.  Extract logic from `handlers/dashboard.py` to `core/services/dashboard.py`.
    2.  Ensure handlers only parse input/output and call services.

### 2.3 API Design (Envelope)
*   **Violation:** Response envelope uses `status: "success"` instead of `success: true`.
    *   `headless/responses.py`
*   **Mandate:** `rules/api_design.md` defines the strict JSON contract (`success`, `data`, `error`).
*   **Mitigation:** Update `headless/responses.py` to match the spec.

### 2.4 Testing Strategy
*   **Violation:** Unit tests are centralized in `src-tauri/python/tests/`.
*   **Mandate:** `rules/testing.md`: "Unit Tests: Co-located with source code."
*   **Mitigation:** Move unit tests next to the files they test (e.g., `src-tauri/python/portfolio_src/core/pipeline.test.py`).

---

## 3. Action Plan

1.  **Phase 1: Architecture Repair**
    *   Refactor Python Handlers to use Services.
    *   Move React components to `src/features/`.
2.  **Phase 2: Safety & Contracts**
    *   Implement Zod schemas in Frontend.
    *   Fix API Envelope in Python.
    *   Eliminate `any` types.
3.  **Phase 3: Observability & Cleanup**
    *   Replace `console.log`/`print` with structured logging.
    *   Refactor tests to be co-located.
