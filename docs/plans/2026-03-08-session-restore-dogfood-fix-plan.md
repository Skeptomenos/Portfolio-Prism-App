# Session Restore Dogfood Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Trade Republic session-restore flow truthful and stable enough that the inner-repo agent can fix it and headed-dogfood its own fix.

**Architecture:** Treat this as a debugging-first auth/runtime bug, not a blind UI patch. The implementation must preserve the Trade Republic design constraint that status checks stay cached and that real restore attempts only happen during explicit session-restore flows. Root cause must be proven first, then fixed at the narrowest layer that explains the headed dogfood failure.

**Tech Stack:** React, Zustand, Vitest, Playwright/browser dogfooding, Tauri Rust commands, Python headless handlers, TRAuthManager.

---

### Task 1: Reproduce the headed dogfood failure with explicit evidence

**Files:**
- Read: `src/App.tsx`
- Read: `src/features/integrations/components/TradeRepublicView.tsx`
- Read: `src/features/auth/components/SessionRestorePrompt.tsx`
- Read: `src/lib/ipc.ts`
- Read: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py`
- Read: `src-tauri/python/portfolio_src/core/tr_auth.py`
- Evidence: `output/playwright/dogfood/session-restore-prompt.png`
- Evidence: `output/playwright/dogfood/trade-republic-after-restore-click.png`

**Step 1: Review the existing live evidence before touching code**

Read the two dogfood screenshots and the live notes in `docs/execution/stabilization-and-self-dogfood-plan.md`.

Expected: you can state the current repro plainly: the restore prompt appears, but the post-click state is not a clearly restored authenticated state.

**Step 2: Reproduce the flow in the current runtime**

Use the persistent runtime workflow from `docs/execution/opencode-self-testing-runbook.md`.

Required runtime:

```bash
pnpm dev:engine
pnpm dev
```

Then run a headed/browser-visible restore attempt and capture:
- current route before click
- current route after click
- frontend console output
- engine log output

Expected: one of these becomes clearly true:
- backend restore returned authenticated
- backend restore returned idle/error/expired
- frontend showed the wrong state for the backend result

**Step 3: Record the exact observed result in the live plan**

Append a dated bullet to `docs/execution/stabilization-and-self-dogfood-plan.md` with:
- the route transition
- the backend outcome if known
- the current hypothesis

Expected: the next developer does not need chat history to understand the repro.

---

### Task 2: Add failing tests that pin the truthfulness gap

**Files:**
- Modify: `src/features/integrations/components/TradeRepublicView.test.tsx`
- Modify: `src/features/auth/components/SessionRestorePrompt.test.tsx`
- Modify: `src/App.test.tsx`

**Step 1: Add a failing TradeRepublicView test for successful restore state**

Add a test that models this flow:
- saved session exists
- restore succeeds with `authState: 'authenticated'`
- the view ends in authenticated content, not the login form

The test should assert for authenticated-only UI, not just callback invocation.

**Step 2: Add a failing SessionRestorePrompt orchestration test**

Add a test that proves the prompt does not own both of these responsibilities at once without intent:
- setting authenticated state
- running portfolio sync
- delegating completion back to the parent

The goal is to expose whether restore completion side effects are duplicated between child and parent.

**Step 3: Add a failing bootstrap/state test if needed**

If the repro shows that app bootstrap re-enters the wrong state after restore, add a targeted `src/App.test.tsx` case for that state transition.

**Step 4: Run the failing tests**

Run:

```bash
pnpm exec vitest run --project unit src/App.test.tsx src/features/auth/components/SessionRestorePrompt.test.tsx src/features/integrations/components/TradeRepublicView.test.tsx
```

Expected: at least one new test fails for the actual broken truth path.

---

### Task 3: Prove the root cause before fixing

**Files:**
- Inspect: `src/features/integrations/components/TradeRepublicView.tsx`
- Inspect: `src/features/auth/components/SessionRestorePrompt.tsx`
- Inspect: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py`
- Inspect: `src-tauri/python/portfolio_src/core/tr_auth.py`
- Inspect: `docs/specs/trade_republic.md`

**Step 1: Compare the live flow against the TR spec constraints**

Read `docs/specs/trade_republic.md` and verify:
- `try_restore_session` should check cached status first
- status polling must not become live API spam
- restore attempts should happen only during explicit restore/login flows

Expected: the fix does not violate Trade Republic rate-limit and daemon constraints.

**Step 2: Trace the frontend restore flow end to end**

Trace these functions in order:
- `SessionRestorePrompt.handleRestore()`
- `TradeRepublicView.handleRestoreComplete()`
- `TradeRepublicView.handleFreshLogin()`
- `TradeRepublicView.renderAuthContent()`

Write down whether sync/auth state is being applied once or twice.

Expected: you can answer whether duplicate post-restore sync/auth side effects exist.

**Step 3: Trace the backend restore flow end to end**

Trace these functions in order:
- `trRestoreSession()` in `src/lib/ipc.ts`
- `tr_restore_session` command in Rust
- `handle_tr_restore_session()` in Python
- `TRAuthManager.try_restore_session()` in Python core

Expected: you can answer whether the backend is truthfully returning an expired/idle state or whether transport/handler mapping is wrong.

**Step 4: Write the root-cause statement before changing code**

Use this format in your notes:

```md
Root cause hypothesis: <specific cause>
Evidence:
- <test or runtime fact>
- <test or runtime fact>
Non-causes ruled out:
- <thing you checked>
```

Do not implement a fix until this statement is written.

---

### Task 4: Implement the narrowest fix at the correct layer

**Files:**
- Modify: `src/features/integrations/components/TradeRepublicView.tsx`
- Modify: `src/features/auth/components/SessionRestorePrompt.tsx`
- Modify if needed: `src/lib/ipc.ts`
- Modify if needed: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py`
- Modify if needed: `src-tauri/python/portfolio_src/core/tr_auth.py`

**Step 1: If the bug is frontend orchestration, simplify ownership**

Possible acceptable direction:
- child component performs restore attempt
- parent owns post-restore sync/navigation truth

Do not leave duplicate sync/auth side effects in both layers unless the duplication is explicitly justified by tests.

**Step 2: If the bug is backend restore truth, fix backend return semantics**

Possible acceptable direction:
- preserve explicit `authenticated` vs `idle/expired` return
- keep restore behavior compliant with `docs/specs/trade_republic.md`
- do not add extra status polling that would risk rate limits

**Step 3: Keep expired-session behavior truthful**

If the saved session is genuinely unusable, the UI must show an explicit recovery path, not a misleading restore-success state.

**Step 4: Run the focused tests**

Run:

```bash
pnpm exec vitest run --project unit src/App.test.tsx src/features/auth/components/SessionRestorePrompt.test.tsx src/features/integrations/components/TradeRepublicView.test.tsx
```

If backend code changed, also run:

```bash
cd src-tauri/python && UV_CACHE_DIR="$PWD/../../.tmp/uv-cache" uv run pytest portfolio_src/headless/handlers/test_handlers_tr_auth.py portfolio_src/core/test_tr_auth.py
```

Expected: the new failing tests now pass.

---

### Task 5: Headed-dogfood the fix and record the evidence

**Files:**
- Update: `docs/execution/stabilization-and-self-dogfood-plan.md`
- Update: `report.md`
- Evidence dir: `output/playwright/dogfood/`

**Step 1: Restart the runtime before browser validation**

Do not trust stale sidecars.

Restart:

```bash
pnpm dev:engine
pnpm dev
```

**Step 2: Run the headed restore flow again**

Capture:
- screenshot before restore click
- screenshot after restore click
- final route/state
- frontend console excerpt
- engine log excerpt

Expected pass conditions:
- valid saved session -> authenticated state is explicit and stable
- expired session -> explicit recovery/login state with clear messaging
- no contradictory restore-success UI followed by login fallback

**Step 3: Validate the narrow changed-file loop**

Run:

```bash
./scripts/selftest/test-changed.sh src/App.tsx src/features/auth/components/SessionRestorePrompt.tsx src/features/integrations/components/TradeRepublicView.tsx src/lib/ipc.ts
```

Expected: the changed-file loop passes, or any unrelated harness failure is documented explicitly.

**Step 4: Record the result in the live docs**

Update both:
- `docs/execution/stabilization-and-self-dogfood-plan.md`
- `report.md`

Include:
- what changed
- what passed
- what still blocks inner-repo full dogfood ownership

---

### Task 6: State the handoff boundary clearly

**Files:**
- Update: `docs/execution/stabilization-and-self-dogfood-plan.md`
- Update: `report.md`

**Step 1: Record the post-fix readiness judgment**

Use one of these exact outcomes:
- `ready for inner-repo live dogfood ownership of session restore`
- `partially ready; live dogfood works but replay-based ownership still blocked`
- `not ready; root cause still unresolved`

**Step 2: Record the remaining blocker honestly**

Even if session restore is fixed, call out that replay-based full-suite self-dogfooding is still blocked until these exist:
- `scripts/selftest/record-sync-snapshot.sh`
- `scripts/selftest/replay-sync-snapshot.sh`
- `scripts/selftest/dogfood-real-snapshot.sh`

Expected: the next agent knows exactly what the inner repo can own now and what still depends on the broader dogfood infrastructure.
