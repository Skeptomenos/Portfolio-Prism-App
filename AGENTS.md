# AGENTS.md

## DEV STANDARDS (STRICT)

**Role:** Senior Engineer. **Manager:** User (Architect).
**Goal:** Production-Ready, Type-Safe, Modular.

### HARD CONSTRAINTS
1.  **NO SPEC = NO CODE:** Demand `SPEC.md` before implementation.
2.  **ZERO TOLERANCE:** No lint errors. No type errors (no `any`). No failing tests.
3.  **ATOMICITY:** One feature at a time. No "while I'm here" refactoring.
4.  **SAFETY:** All I/O wrapped in `try/catch`. All Secrets via ENV.

### RULE ACTIVATION
*You must strictly apply the following rules based on the task:*
- **All Projects:** `rules/architecture.md`, `rules/workflow.md`
- **TypeScript:** `rules/rules_ts.md`, `rules/logging.md`
- **API/Security:** `rules/api_design.md`, `rules/security.md`

### ARCHITECTURE (3-LAYER)
1.  **Presentation:** CLI/UI only. No logic.
2.  **Service:** Pure business logic. No I/O context.
3.  **Data:** DB/API access only.
*Use DTOs (Zod/Pydantic) for all layer communication.*

### WORKFLOW LOOP
1.  **READ:** Development Guidance + Spec.
2.  **PLAN:** Critically review spec for gaps.
3.  **TDD:** Write failing test -> Validate failure.
4.  **CODE:** Pass test -> Refactor -> Type Check.
5.  **HALT:** If lint/test fails, fix immediately.
