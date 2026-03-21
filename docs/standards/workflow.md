# Workflow & Ops Standards (2026)

> **Mandate:** Clean History, Reproducible Builds.

## 1. Git Discipline
- **Branches:** `feat/xyz`, `fix/abc`. Short-lived (<24h).
- **Commits:** Conventional Commits required.
  - `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `test: ...`
- **Atomic PRs:** One feature per PR. No "while I'm here" changes.

## 2. Configuration
- **Secrets:** NEVER in git. Use `.env`.
- **Validation:** Crash app on startup if `ENV` is missing/invalid (use Zod/Pydantic).
- **Defaults:** `.env.example` must contain all keys with dummy values.

## 3. Docker Strategy
- **Determinism:** Always copy `lock` files (`pnpm-lock.yaml`) first. Use `pnpm install --frozen-lockfile`.
- **Multi-Stage:**
  1.  `builder`: Install full deps, compile.
  2.  `runner`: Alpine/Distroless image. Copy ONLY binary/dist.
- **User:** Run as non-root `USER node` / `USER app`.

## 4. CI/CD Triggers
- Run **Testing & Linting** on every Push.
- Block Merge if CI fails.
