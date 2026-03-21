# Testing & QA Standards (2026)

> **Mandate:** The Ratchet. No regression allowed.

## 1. TDD Workflow
1.  **Write Failing Test:** Prove the feature is missing or the bug exists.
2.  **Verify Failure:** Run test -> Red.
3.  **Implement:** Minimal code to pass.
4.  **Verify Success:** Run test -> Green.

## 2. The Pyramid
- **Unit (60%):** Pure functions, Zod schemas, Utils.
  - *Mocking:* None.
  - *Tool:* Vitest/Pytest.
- **Integration (30%):** Services + Database.
  - *Mocking:* External APIs (Stripe, AI) ONLY. Use REAL SQLite/Docker DB.
  - *Tool:* Vitest + Testcontainers.
- **E2E (10%):** Critical User Flows (Login -> Success).
  - *Tool:* Playwright.

## 3. Mocking Rules
- **Internal:** Do NOT mock your own Service/Repo logic. Test the integration.
- **External:** ALWAYS mock 3rd party APIs (Network calls).
- **Time:** Mock `Date.now()` for deterministic tests.

## 4. Test Organization
- **Unit Tests:** Co-located with source code.
  - `src/features/auth/user.ts` → `src/features/auth/user.test.ts`
- **Integration/E2E:** Top-level `tests/` folder.
  - `tests/integration/api.test.ts`
  - `tests/e2e/login.spec.ts`
- **Naming:** Use `*.test.ts` for Vitest, `*.spec.ts` for Playwright.

## 5. Back Pressure Gates
Code is **REJECTED** if:
- [ ] Any test fails.
- [ ] Linting fails (ESLint/Ruff).
- [ ] Type Check fails (TSC/Mypy).
