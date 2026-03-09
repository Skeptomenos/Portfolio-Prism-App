# AGENTS.md — Portfolio Prism

## OVERVIEW

Privacy-first desktop portfolio analyzer. **Tauri v2** shell (Rust) + **React/Vite/TS** frontend + **Python sidecar** analytics engine. Local-first SQLite (`prism.db`). Community data via Supabase Hive. No bundled Chromium.

### Domain Philosophy: ISIN-First Strategy
The primary value proposition of Portfolio Prism is **ISIN-level aggregation**. 
- **The Problem:** ETF providers provide tickers, which are market-specific (e.g., `AAPL` on NASDAQ vs `APC` on Xetra). Tickers are NOT unique global identifiers.
- **The Solution:** The pipeline MUST resolve every ticker/name to its **ISIN** (International Securities Identification Number). This is Stage 0 of the pipeline (`ISINResolver`).
- **The Engine:** Decompose ETF → Resolve Ticker-to-ISIN → Enrich metadata (Sector/Geo) → Aggregate by ISIN for "True Holding Exposure."
- **The Hive:** Because external API resolution is slow and rate-limited, every successful Ticker → ISIN resolution is auto-contributed to the Supabase **HIVE** database. This community-driven data sharing is the key to scaling performance for all users.

## STRUCTURE

```
src/                    # React frontend (TS/TSX, Zustand, Zod, Recharts)
src-tauri/
  src/                  # Rust IPC shell (commands.rs, lib.rs)
  python/
    portfolio_src/      # Python analytics engine
      core/             # Pipeline, sync, services
      headless/handlers # IPC command handlers
      adapters/         # ETF provider adapters
      data/             # SQLite schema, repos
supabase/               # Hive (community ISIN resolution)
scripts/selftest/       # Dogfood + selftest harness
tests/                  # Vitest unit/integration + Playwright E2E
docs/
  architecture/         # System design docs
  specs/                # IPC API, data model, pipeline specs
  execution/            # Live plans, runbooks, QA reports
rules/                  # Dev-handbook coding rules (auto-loaded)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| IPC contracts (frontend) | `src/lib/schemas/ipc.ts` | Zod schemas, single source of truth |
| IPC dispatch (frontend) | `src/lib/ipc.ts` | All Tauri invoke wrappers |
| IPC commands (Rust) | `src-tauri/src/commands.rs` | Thin shell, delegates to Python |
| IPC handlers (Python) | `src-tauri/python/portfolio_src/headless/handlers/` | Business logic entry |
| Analytics pipeline | `src-tauri/python/portfolio_src/core/pipeline.py` | Run orchestration |
| Auth flow | `src/features/auth/`, `src-tauri/python/.../tr_auth.py` | TR auth + session restore |
| Feature routes | `src/features/{dashboard,xray,holdings}/` | React feature modules |
| Dogfood plan | `docs/execution/stabilization-and-self-dogfood-plan.md` | Canonical dogfood spec |
| Selftest scripts | `scripts/selftest/` | Shell harness for dogfood loops |

## DEV STANDARDS (STRICT)

**Role:** Senior Engineer. **Manager:** User (Architect).
**Goal:** Production-Ready, Type-Safe, Modular.

### HARD CONSTRAINTS
1. **NO SPEC = NO CODE:** Demand spec in `docs/specs/` or `docs/plans/` before implementation.
2. **ZERO TOLERANCE:** No lint errors. No type errors (no `any`). No failing tests.
3. **ATOMICITY:** One feature at a time. No "while I'm here" refactoring.
4. **SAFETY:** All I/O wrapped in `try/catch`. All Secrets via ENV.
5. **NO FEATURE WITHOUT DOGFOOD:** See Definition of Done below.

### RULE ACTIVATION
*You MUST read the relevant rule files before writing any code. Do not proceed to PLAN without loading them.*
- **All Tasks:** `rules/architecture.md`, `rules/workflow.md`
- **TypeScript/React:** `rules/rules_ts.md`, `rules/logging.md`
- **Python:** `rules/logging.md` (structured logging, no print)
- **API/Security:** `rules/api_design.md`, `rules/security.md`
- **Testing:** `rules/testing.md`
- **DevOps:** `rules/devops.md`

### ARCHITECTURE (3-LAYER)
1. **Presentation:** React UI only. No business logic.
2. **Service:** Pure business logic (Python core/, TS hooks). No I/O context.
3. **Data:** SQLite repos, IPC handlers, API calls only.

*Use DTOs (Zod frontend, Pydantic backend) for all layer communication.*
*IPC handlers are thin transport — no business logic in handlers.*

### WORKFLOW LOOP
1. **READ:** This file → activated rule files for task type → spec + relevant `docs/`.
2. **PLAN:** Critically review spec for gaps. Write plan in `docs/plans/` if non-trivial.
3. **PRE-CODE GATE:** Confirm before writing implementation:
   - Relevant rule files loaded for this task type
   - Spec exists and has been read
   - Dogfood procedure identified for the feature area
   - Proceed only after all three are true.
4. **TDD:** Write failing test → Validate failure.
5. **CODE:** Pass test → Refactor → Type Check.
6. **DOGFOOD:** Run dogfood procedure for the feature area (see below).
7. **HALT:** If lint/test/dogfood fails, fix immediately before proceeding.

## DEFINITION OF DONE (HARD GATE)

**No feature is done unless ALL of these are true:**

1. A dogfood workflow exists for the feature (prompt-driven or scripted).
2. The workflow has at least one successful recorded run with evidence.
3. Evidence artifacts exist at stable paths for regression comparison.
4. All tests pass: `pnpm test:run` + relevant E2E.
5. No lint/type errors: `pnpm lint` + `tsc --noEmit`.

**If dogfood coverage does not exist for a feature area, you must create it before marking the feature done.** This is non-negotiable.

## DOGFOOD WORKFLOW

The dogfood suite validates that the app works as a real product, not just as passing tests. The canonical spec is `docs/execution/stabilization-and-self-dogfood-plan.md`. Read it before any feature work.

### Runtime Setup
```bash
pnpm dev:engine          # Python sidecar (HTTP mode)
pnpm dev                 # Vite frontend
# App at http://localhost:1420
```

### Dogfood Procedures

**Procedure A — Session Restore & Credential Lifecycle:**
1. Launch app, observe initial route.
2. If saved session exists, verify UI offers restore (not forced sign-in).
3. Trigger restore, verify truthful end state (authenticated → dashboard, expired → recovery path).
4. Inspect console + engine logs for `IPCValidationError` or contract drift.
5. Evidence: route screenshot, console excerpt, engine log excerpt.

**Procedure B — X-Ray Pipeline Run:**
1. Confirm portfolio data present on Dashboard.
2. Navigate to X-Ray, trigger analysis pipeline.
3. Verify explicit result: `success`, `degraded`, or `failed` (never silent success on bad data).
4. Inspect report envelope + backend output.
5. Evidence: before/after screenshots, pipeline result state, report/log evidence.

**Procedure C — Health Diagnostics Review:**
1. Open Health route.
2. Verify route renders `missing`, `invalid`, `ready`, or `degraded` states intentionally.
3. Inspect console for contract failures.
4. Compare UI state against served report envelope.
5. Evidence: Health screenshot, console log, envelope excerpt.

**Procedure D — Hive Contribution Visibility:**
1. After sync/analysis that touches Hive data, check freshness/trust/coverage state.
2. Confirm contribution succeeded, queued for retry, or failed visibly.
3. Inspect local logs for retry or failure state.
4. Evidence: screenshot, log evidence, no silent-loss path.

### Quality Thresholds (Hard Fails)
- 0 unexpected uncaught frontend console errors on dogfood routes
- 0 `IPCValidationError` occurrences
- 0 blank-screen or navigation-dead-end failures
- 0 silent backend failure paths (failures must be visible in UI or logs)
- Pipeline `is_trustworthy=false` must not be reported as `success`

### Scripted Dogfood (Replay-Based)
```bash
pnpm selftest:record-sync-snapshot    # Capture real portfolio snapshot
pnpm selftest:replay-sync-snapshot    # Replay into temp PRISM_DATA_DIR
pnpm selftest:dogfood:real-snapshot   # Full dogfood loop + backpressure check
```

## COMMANDS

```bash
# Dev
pnpm dev                    # Vite frontend
pnpm dev:engine             # Python sidecar (HTTP)
pnpm dev:browser            # Both concurrently

# Test
pnpm test:run               # All Vitest tests
pnpm test:unit              # Unit tests only
pnpm test:integration       # Integration tests only
pnpm test:e2e               # Playwright E2E

# Selftest / Dogfood
pnpm selftest:dev-up        # Boot engine + frontend for selftest
pnpm selftest:dev-down      # Tear down selftest runtime
pnpm selftest:health        # Healthcheck
pnpm selftest:smoke         # Browser smoke gate
pnpm selftest:changed       # Test only changed files
pnpm selftest:dogfood:real-snapshot  # Full replay-based dogfood

# Quality
pnpm lint                   # ESLint
pnpm format:check           # Prettier check
pnpm build                  # tsc + Vite build
```

## ANTI-PATTERNS (THIS PROJECT)

| Pattern | Why it breaks | Do instead |
|---------|--------------|------------|
| Business logic in IPC handlers | Violates thin-transport design | Keep handlers as dispatch; logic in `core/` |
| Duplicate pipeline report types | Contract drift between features | Single source: `src/lib/schemas/ipc.ts` |
| `get_pipeline_report` returning raw `None` | Frontend Zod parse fails | Return versioned envelope: `missing/ready/invalid` |
| Silent `success` on untrustworthy analytics | User trusts wrong data | Enforce `success/degraded/failed` run status |
| Auth schemas rejecting backend `null` | Backend legitimately returns `null` | Make Zod schemas explicitly nullable |
| `Connected` status from store-only timestamps | Contradicts actual auth state | Derive from backend truth, not volatile store |
| Skipping dogfood for "small" changes | Regressions compound silently | Every feature change gets dogfood verification |

## NOTES

- **IPC transport vs domain status:** Transport success/error is separate from analytics truth (`runStatus`). Never conflate them.
- **Tauri dev vs browser dev:** `pnpm dev` runs Vite only (browser mode). `pnpm tauri:dev` runs the full Tauri shell. Dogfood procedures work in browser mode.
- **Python env:** Python sidecar uses `uv` for dependency management. Run from `src-tauri/python/`.
- **Shared skills:** Agent skills installed at `$HOME/.agents/skills`. See `scripts/selftest/verify-shared-skills.sh`.
- **Execution docs:** Live plans and runbooks live in `docs/execution/`. Update them during implementation — they are the durable context, not chat history.
